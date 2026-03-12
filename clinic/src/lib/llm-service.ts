// LLM service layer - multi-provider support with per-provider API adapters
import { prisma } from "./prisma";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface AiConfigData {
  enabled: boolean;
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
}

// Per-provider API configuration
interface ProviderSpec {
  defaultBaseUrl: string;
  chatPath: string; // path appended to baseUrl, e.g. "/chat/completions"
  authType: "bearer" | "x-api-key" | "bearer-custom";
  extraHeaders?: Record<string, string>;
  // How to build the request body and parse the response
  apiFormat: "openai" | "anthropic";
}

// Provider-specific API configurations
const PROVIDER_SPECS: Record<string, ProviderSpec> = {
  openai: {
    defaultBaseUrl: "https://api.openai.com/v1",
    chatPath: "/chat/completions",
    authType: "bearer",
    apiFormat: "openai",
  },
  anthropic: {
    defaultBaseUrl: "https://api.anthropic.com",
    chatPath: "/v1/messages",
    authType: "x-api-key",
    extraHeaders: { "anthropic-version": "2023-06-01" },
    apiFormat: "anthropic",
  },
  deepseek: {
    defaultBaseUrl: "https://api.deepseek.com/v1",
    chatPath: "/chat/completions",
    authType: "bearer",
    apiFormat: "openai",
  },
  kimi: {
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    chatPath: "/chat/completions",
    authType: "bearer",
    apiFormat: "openai",
  },
  qwen: {
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    chatPath: "/chat/completions",
    authType: "bearer",
    apiFormat: "openai",
  },
  zhipu: {
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    chatPath: "/chat/completions",
    authType: "bearer",
    apiFormat: "openai",
  },
  baichuan: {
    defaultBaseUrl: "https://api.baichuan-ai.com/v1",
    chatPath: "/chat/completions",
    authType: "bearer",
    apiFormat: "openai",
  },
  spark: {
    defaultBaseUrl: "https://spark-api-open.xf-yun.com/v1",
    chatPath: "/chat/completions",
    authType: "bearer",
    apiFormat: "openai",
  },
  custom: {
    defaultBaseUrl: "",
    chatPath: "/chat/completions",
    authType: "bearer",
    apiFormat: "openai",
  },
};

let configCache: AiConfigData | null = null;
let configCacheTime = 0;
const CACHE_TTL = 30_000; // 30 seconds

export async function getAiConfig(): Promise<AiConfigData> {
  if (configCache && Date.now() - configCacheTime < CACHE_TTL) {
    return configCache;
  }

  let config = await prisma.aiConfig.findUnique({ where: { id: "singleton" } });
  if (!config) {
    config = await prisma.aiConfig.create({ data: { id: "singleton" } });
  }

  configCache = config;
  configCacheTime = Date.now();
  return config;
}

export function clearConfigCache() {
  configCache = null;
}

function getProviderSpec(provider: string): ProviderSpec {
  return PROVIDER_SPECS[provider] || PROVIDER_SPECS.custom;
}

function getBaseUrl(config: AiConfigData): string {
  if (config.baseUrl) return config.baseUrl.replace(/\/+$/, ""); // trim trailing slash
  const spec = getProviderSpec(config.provider);
  return spec.defaultBaseUrl;
}

function buildHeaders(config: AiConfigData, spec: ProviderSpec): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  switch (spec.authType) {
    case "bearer":
    case "bearer-custom":
      headers["Authorization"] = `Bearer ${config.apiKey}`;
      break;
    case "x-api-key":
      headers["x-api-key"] = config.apiKey;
      break;
  }

  if (spec.extraHeaders) {
    Object.assign(headers, spec.extraHeaders);
  }

  return headers;
}

// OpenAI-compatible chat completions
async function callOpenAIFormat(
  messages: ChatMessage[],
  config: AiConfigData,
  spec: ProviderSpec
): Promise<string> {
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}${spec.chatPath}`;
  const headers = buildHeaders(config, spec);

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(
      `[${config.provider}] API 调用失败 (${res.status})\n` +
      `请求地址: ${url}\n` +
      `模型: ${config.model}\n` +
      `响应: ${errBody}`
    );
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// Anthropic Messages API
async function callAnthropicFormat(
  messages: ChatMessage[],
  config: AiConfigData,
  spec: ProviderSpec
): Promise<string> {
  const systemMsg = messages.find((m) => m.role === "system")?.content || "";
  const chatMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}${spec.chatPath}`;
  const headers = buildHeaders(config, spec);

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens,
      system: systemMsg,
      messages: chatMessages,
      temperature: config.temperature,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(
      `[${config.provider}] Anthropic API 调用失败 (${res.status})\n` +
      `请求地址: ${url}\n` +
      `模型: ${config.model}\n` +
      `响应: ${errBody}`
    );
  }

  const data = await res.json();
  return data.content?.[0]?.text || "";
}

// Main entry point - call LLM with current config
export async function callLLM(messages: ChatMessage[]): Promise<string> {
  const config = await getAiConfig();

  if (!config.enabled) {
    throw new Error("AI 大模型未启用");
  }

  if (!config.apiKey) {
    throw new Error("未配置 API Key");
  }

  // Add system prompt if configured and not already present
  if (config.systemPrompt && !messages.some((m) => m.role === "system")) {
    messages = [{ role: "system", content: config.systemPrompt }, ...messages];
  }

  const spec = getProviderSpec(config.provider);

  switch (spec.apiFormat) {
    case "anthropic":
      return callAnthropicFormat(messages, config, spec);
    case "openai":
    default:
      return callOpenAIFormat(messages, config, spec);
  }
}

// Check if LLM is enabled and configured
export async function isLLMEnabled(): Promise<boolean> {
  const config = await getAiConfig();
  return config.enabled && !!config.apiKey;
}
