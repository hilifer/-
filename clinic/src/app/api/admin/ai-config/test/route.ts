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
    const fullMessage = err instanceof Error ? err.message : "未知错误";

    // Split multi-line error into summary + details
    const lines = fullMessage.split("\n");
    const summary = lines[0]; // First line is the summary
    const errorDetails = lines.slice(1).filter((l) => l.trim()); // Remaining lines are details

    // Parse common API errors for friendlier messages
    let hint = "";
    if (fullMessage.includes("401") || fullMessage.includes("Unauthorized") || fullMessage.includes("invalid_authentication")) {
      hint =
        "API Key 无效或已过期。请检查：\n" +
        "1. 密钥是否正确复制（无多余空格）\n" +
        "2. 密钥是否属于当前选择的提供商\n" +
        "3. 密钥是否已过期或被禁用";
    } else if (fullMessage.includes("403") || fullMessage.includes("Forbidden")) {
      hint =
        "API Key 权限不足。请确认：\n" +
        "1. 密钥有访问该模型的权限\n" +
        "2. 账户已完成实名认证（部分国内厂商要求）\n" +
        "3. 账户余额充足";
    } else if (fullMessage.includes("404") || fullMessage.includes("Not Found")) {
      hint =
        "API 地址或模型名称错误。请检查：\n" +
        "1. API 地址（Base URL）是否正确\n" +
        "2. 模型名称是否拼写正确\n" +
        "3. 该模型是否已上线（部分模型需要申请开通）";
    } else if (fullMessage.includes("429") || fullMessage.includes("Rate")) {
      hint = "请求频率超限或账户额度不足，请稍后重试或充值";
    } else if (fullMessage.includes("500") || fullMessage.includes("Internal")) {
      hint = "API 服务端错误，请稍后重试。如持续出现请联系对应厂商客服";
    } else if (
      fullMessage.includes("ENOTFOUND") ||
      fullMessage.includes("ECONNREFUSED") ||
      fullMessage.includes("fetch failed")
    ) {
      hint =
        "无法连接到 API 服务器。请检查：\n" +
        "1. API 地址是否正确\n" +
        "2. 服务器网络是否能访问该地址\n" +
        "3. 是否需要配置代理";
    } else if (fullMessage.includes("timeout") || fullMessage.includes("ETIMEDOUT")) {
      hint = "连接超时，请检查网络或 API 地址是否可达";
    } else if (fullMessage.includes("invalid_request") || fullMessage.includes("model")) {
      hint = "请求参数错误，请检查模型名称是否正确";
    }

    return NextResponse.json({
      success: false,
      error: summary,
      errorDetails,
      hint,
      config: {
        provider: config.provider,
        model: config.model,
        baseUrl: config.baseUrl || "(默认)",
      },
    });
  }
}
