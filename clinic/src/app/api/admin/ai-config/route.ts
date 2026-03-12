import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clearConfigCache } from "@/lib/llm-service";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return null;
  }
  return session;
}

function maskApiKey(key: string): string {
  if (!key) return "";
  return "sk-****" + key.slice(-4);
}

// Validate config before enabling
function validateForEnable(
  config: { provider: string; model: string; apiKey: string; baseUrl: string },
  newApiKey?: string
): string[] {
  const errors: string[] = [];

  if (!config.provider) {
    errors.push("请选择模型提供商");
  }

  if (!config.model || config.model.trim() === "") {
    errors.push("请选择或输入模型名称");
  }

  const hasKey = newApiKey
    ? newApiKey.trim().length > 0
    : config.apiKey && !config.apiKey.startsWith("sk-****") && config.apiKey.trim().length > 0;
  if (!hasKey) {
    errors.push("请配置 API Key");
  }

  const builtInNoUrl = ["openai", "anthropic"];
  if (
    !builtInNoUrl.includes(config.provider) &&
    (!config.baseUrl || config.baseUrl.trim() === "")
  ) {
    errors.push("该提供商需要填写 API 地址");
  }

  if (config.baseUrl && config.baseUrl.trim() !== "") {
    try {
      new URL(config.baseUrl);
    } catch {
      errors.push("API 地址格式不正确，请输入完整URL（如 https://api.example.com/v1）");
    }
  }

  return errors;
}

// GET: return active config + all provider configs
export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  let config = await prisma.aiConfig.findUnique({ where: { id: "singleton" } });
  if (!config) {
    config = await prisma.aiConfig.create({ data: { id: "singleton" } });
  }

  // Load all saved provider configs
  const providerConfigs = await prisma.providerConfig.findMany();

  // Build provider config map (masked keys)
  const providers: Record<string, {
    model: string;
    apiKey: string;
    hasApiKey: boolean;
    baseUrl: string;
    temperature: number;
    maxTokens: number;
    systemPrompt: string;
    tested: boolean;
  }> = {};

  for (const pc of providerConfigs) {
    providers[pc.id] = {
      model: pc.model,
      apiKey: maskApiKey(pc.apiKey),
      hasApiKey: !!pc.apiKey,
      baseUrl: pc.baseUrl,
      temperature: pc.temperature,
      maxTokens: pc.maxTokens,
      systemPrompt: pc.systemPrompt,
      tested: pc.tested,
    };
  }

  return NextResponse.json({
    ...config,
    apiKey: maskApiKey(config.apiKey),
    hasApiKey: !!config.apiKey,
    providers,
  });
}

// PUT: save config — also persists per-provider config
export async function PUT(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  const body = await req.json();
  const {
    enabled,
    provider,
    model,
    apiKey,
    baseUrl,
    temperature,
    maxTokens,
    systemPrompt,
  } = body;

  // Resolve actual apiKey (if user didn't change, use stored)
  const newApiKey =
    typeof apiKey === "string" && !apiKey.startsWith("sk-****") ? apiKey : undefined;

  // If trying to enable, validate all required fields
  if (enabled === true) {
    const existing = await prisma.aiConfig.findUnique({ where: { id: "singleton" } });

    const configToCheck = {
      provider: provider || existing?.provider || "",
      model: model || existing?.model || "",
      apiKey: existing?.apiKey || "",
      baseUrl: typeof baseUrl === "string" ? baseUrl : existing?.baseUrl || "",
    };

    const errors = validateForEnable(configToCheck, newApiKey);
    if (errors.length > 0) {
      return NextResponse.json(
        { error: "启用大模型前请完成以下配置", details: errors },
        { status: 400 }
      );
    }
  }

  // Build main config update
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {};
  if (typeof enabled === "boolean") updateData.enabled = enabled;
  if (provider) updateData.provider = provider;
  if (model) updateData.model = model;
  if (newApiKey) updateData.apiKey = newApiKey;
  if (typeof baseUrl === "string") updateData.baseUrl = baseUrl;
  if (typeof temperature === "number") {
    updateData.temperature = Math.min(2, Math.max(0, temperature));
  }
  if (typeof maxTokens === "number") {
    updateData.maxTokens = Math.min(32768, Math.max(256, maxTokens));
  }
  if (typeof systemPrompt === "string") updateData.systemPrompt = systemPrompt;

  const config = await prisma.aiConfig.upsert({
    where: { id: "singleton" },
    update: updateData,
    create: { id: "singleton", ...updateData },
  });

  // Also save per-provider config for the current provider
  if (provider) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const providerData: Record<string, any> = {};
    if (model) providerData.model = model;
    if (newApiKey) providerData.apiKey = newApiKey;
    if (typeof baseUrl === "string") providerData.baseUrl = baseUrl;
    if (typeof temperature === "number") {
      providerData.temperature = Math.min(2, Math.max(0, temperature));
    }
    if (typeof maxTokens === "number") {
      providerData.maxTokens = Math.min(32768, Math.max(256, maxTokens));
    }
    if (typeof systemPrompt === "string") providerData.systemPrompt = systemPrompt;

    // If no new API key provided, try to keep existing provider key
    if (!newApiKey) {
      const existingProvider = await prisma.providerConfig.findUnique({
        where: { id: provider },
      });
      if (existingProvider?.apiKey) {
        // keep existing key, just update other fields
      }
    }

    await prisma.providerConfig.upsert({
      where: { id: provider },
      update: providerData,
      create: { id: provider, ...providerData },
    });
  }

  clearConfigCache();

  // Re-fetch all provider configs
  const providerConfigs = await prisma.providerConfig.findMany();
  const providers: Record<string, {
    model: string;
    apiKey: string;
    hasApiKey: boolean;
    baseUrl: string;
    temperature: number;
    maxTokens: number;
    systemPrompt: string;
    tested: boolean;
  }> = {};

  for (const pc of providerConfigs) {
    providers[pc.id] = {
      model: pc.model,
      apiKey: maskApiKey(pc.apiKey),
      hasApiKey: !!pc.apiKey,
      baseUrl: pc.baseUrl,
      temperature: pc.temperature,
      maxTokens: pc.maxTokens,
      systemPrompt: pc.systemPrompt,
      tested: pc.tested,
    };
  }

  return NextResponse.json({
    ...config,
    apiKey: maskApiKey(config.apiKey),
    hasApiKey: !!config.apiKey,
    providers,
  });
}
