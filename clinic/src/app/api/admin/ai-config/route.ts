import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return null;
  }
  return session;
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

  // Build update data - only include fields that are provided
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {};
  if (typeof enabled === "boolean") updateData.enabled = enabled;
  if (provider) updateData.provider = provider;
  if (model) updateData.model = model;
  if (typeof apiKey === "string" && !apiKey.startsWith("sk-****")) {
    updateData.apiKey = apiKey;
  }
  if (typeof baseUrl === "string") updateData.baseUrl = baseUrl;
  if (typeof temperature === "number") updateData.temperature = temperature;
  if (typeof maxTokens === "number") updateData.maxTokens = maxTokens;
  if (typeof systemPrompt === "string") updateData.systemPrompt = systemPrompt;

  const config = await prisma.aiConfig.upsert({
    where: { id: "singleton" },
    update: updateData,
    create: { id: "singleton", ...updateData },
  });

  return NextResponse.json({
    ...config,
    apiKey: config.apiKey ? "sk-****" + config.apiKey.slice(-4) : "",
    hasApiKey: !!config.apiKey,
  });
}
