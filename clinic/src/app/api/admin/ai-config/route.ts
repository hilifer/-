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

// Get current AI config
export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  let config = await prisma.aiConfig.findUnique({ where: { id: "singleton" } });

  if (!config) {
    config = await prisma.aiConfig.create({
      data: { id: "singleton" },
    });
  }

  // Mask API key for security
  return NextResponse.json({
    ...config,
    apiKey: config.apiKey ? "sk-****" + config.apiKey.slice(-4) : "",
    hasApiKey: !!config.apiKey,
  });
}

// Update AI config
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

  // If trying to enable, validate all required fields
  if (enabled === true) {
    // Get existing config to check stored apiKey
    const existing = await prisma.aiConfig.findUnique({ where: { id: "singleton" } });

    const configToCheck = {
      provider: provider || existing?.provider || "",
      model: model || existing?.model || "",
      apiKey: existing?.apiKey || "",
      baseUrl: typeof baseUrl === "string" ? baseUrl : existing?.baseUrl || "",
    };

    // If a new apiKey is provided (not masked), use it for validation
    const newApiKey =
      typeof apiKey === "string" && !apiKey.startsWith("sk-****") ? apiKey : undefined;

    const errors = validateForEnable(configToCheck, newApiKey);
    if (errors.length > 0) {
      return NextResponse.json(
        { error: "启用大模型前请完成以下配置", details: errors },
        { status: 400 }
      );
    }
  }

  // Build update data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {};
  if (typeof enabled === "boolean") updateData.enabled = enabled;
  if (provider) updateData.provider = provider;
  if (model) updateData.model = model;
  if (typeof apiKey === "string" && !apiKey.startsWith("sk-****")) {
    updateData.apiKey = apiKey;
  }
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

  // Clear cache so new config takes effect immediately
  clearConfigCache();

  return NextResponse.json({
    ...config,
    apiKey: config.apiKey ? "sk-****" + config.apiKey.slice(-4) : "",
    hasApiKey: !!config.apiKey,
  });
}
