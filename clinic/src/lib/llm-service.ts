// LLM service layer - supports OpenAI, Anthropic, DeepSeek, and OpenAI-compatible APIs
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

function getBaseUrl(config: AiConfigData): string {
  if (config.baseUrl) return config.baseUrl;

  switch (config.provider) {
    case "openai":
      return "https://api.openai.com/v1";
    case "anthropic":
      return "https://api.anthropic.com";
    case "deepseek":
      return "https://api.deepseek.com/v1";
    default:
      return "https://api.openai.com/v1";
  }
}

// OpenAI-compatible API call (works for OpenAI, DeepSeek, and custom providers)
async function callOpenAICompatible(
  messages: ChatMessage[],
  config: AiConfigData
): Promise<string> {
  const baseUrl = getBaseUrl(config);

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API 调用失败 (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// Anthropic Messages API
async function callAnthropic(
  messages: ChatMessage[],
  config: AiConfigData
): Promise<string> {
  const systemMsg = messages.find((m) => m.role === "system")?.content || "";
  const chatMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const baseUrl = getBaseUrl(config);

  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens,
      system: systemMsg,
      messages: chatMessages,
      temperature: config.temperature,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API 调用失败 (${res.status}): ${err}`);
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

  switch (config.provider) {
    case "anthropic":
      return callAnthropic(messages, config);
    case "openai":
    case "deepseek":
    case "custom":
    default:
      return callOpenAICompatible(messages, config);
  }
}

// Check if LLM is enabled and configured
export async function isLLMEnabled(): Promise<boolean> {
  const config = await getAiConfig();
  return config.enabled && !!config.apiKey;
}
