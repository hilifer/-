import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAiConfig, callLLM } from "@/lib/llm-service";
import { prisma } from "@/lib/prisma";

// Diagnose config issues and return detailed error list
function diagnoseConfig(config: {
  enabled: boolean;
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
}): string[] {
  const issues: string[] = [];

  if (!config.enabled) {
    issues.push("AI 大模型未启用 — 请先在上方点击「启用大模型」并保存设置");
  }

  if (!config.provider || config.provider.trim() === "") {
    issues.push("未选择模型提供商 — 请选择 OpenAI / DeepSeek / Kimi 等提供商");
  }

  if (!config.model || config.model.trim() === "") {
    issues.push("未选择模型 — 请选择具体的模型（如 gpt-4o、deepseek-chat）");
  }

  if (!config.apiKey || config.apiKey.trim() === "") {
    issues.push("未配置 API Key — 请填写有效的 API Key 并保存");
  }

  const builtInNoUrl = ["openai", "anthropic"];
  if (
    config.provider &&
    !builtInNoUrl.includes(config.provider) &&
    (!config.baseUrl || config.baseUrl.trim() === "")
  ) {
    issues.push(
      `提供商 "${config.provider}" 需要配置 API 地址 — 请填写 Base URL`
    );
  }

  if (config.baseUrl && config.baseUrl.trim() !== "") {
    try {
      new URL(config.baseUrl);
    } catch {
      issues.push(
        `API 地址格式错误: "${config.baseUrl}" — 请输入完整URL（如 https://api.example.com/v1）`
      );
    }
  }

  return issues;
}

// POST: test connection or chat with the configured LLM
// Body: { messages: [{ role, content }] }
// If no messages, sends a default test prompt
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  // First, diagnose config
  const config = await getAiConfig();
  const issues = diagnoseConfig(config);

  if (issues.length > 0) {
    return NextResponse.json({
      success: false,
      error: "配置检查未通过",
      details: issues,
      config: {
        enabled: config.enabled,
        provider: config.provider || "(未设置)",
        model: config.model || "(未设置)",
        hasApiKey: !!config.apiKey,
        baseUrl: config.baseUrl || "(未设置)",
      },
    });
  }

  let body: { messages?: { role: string; content: string }[] } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine, will use default test
  }

  const messages = body.messages;

  try {
    if (messages && messages.length > 0) {
      // Chat test mode
      const chatMessages = messages.map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      }));

      const reply = await callLLM(chatMessages);
      return NextResponse.json({ success: true, reply });
    } else {
      // Connection test mode
      const startTime = Date.now();
      const reply = await callLLM([
        {
          role: "user",
          content:
            "你好，请用一句话介绍你在中医问诊方面的能力，以验证连接正常。",
        },
      ]);
      const elapsed = Date.now() - startTime;

      // Mark provider as tested
      await prisma.providerConfig.upsert({
        where: { id: config.provider },
        update: { tested: true },
        create: { id: config.provider, tested: true },
      });

      return NextResponse.json({
        success: true,
        message: reply,
        latency: `${elapsed}ms`,
        config: {
          provider: config.provider,
          model: config.model,
          baseUrl: config.baseUrl || "(默认)",
        },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";

    // Parse common API errors for friendlier messages
    let hint = "";
    if (message.includes("401") || message.includes("Unauthorized")) {
      hint = "API Key 无效或已过期，请检查密钥是否正确";
    } else if (message.includes("403") || message.includes("Forbidden")) {
      hint = "API Key 权限不足，请确认密钥有访问该模型的权限";
    } else if (message.includes("404") || message.includes("Not Found")) {
      hint = "API 地址或模型名称错误，请检查 Base URL 和模型名称是否正确";
    } else if (message.includes("429") || message.includes("Rate")) {
      hint = "请求频率超限，请稍后重试或检查账户额度";
    } else if (message.includes("500") || message.includes("Internal")) {
      hint = "API 服务端错误，请稍后重试";
    } else if (
      message.includes("ENOTFOUND") ||
      message.includes("ECONNREFUSED") ||
      message.includes("fetch failed")
    ) {
      hint = "无法连接到 API 服务器，请检查 API 地址是否正确、网络是否通畅";
    } else if (message.includes("timeout") || message.includes("ETIMEDOUT")) {
      hint = "连接超时，请检查网络或 API 地址是否可达";
    }

    return NextResponse.json({
      success: false,
      error: message,
      hint,
      config: {
        provider: config.provider,
        model: config.model,
        baseUrl: config.baseUrl || "(默认)",
      },
    });
  }
}
