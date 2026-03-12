import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { callLLM } from "@/lib/llm-service";

// POST: test chat with the configured LLM
// Body: { messages: [{ role, content }] }
// If no messages, sends a default test prompt
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
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
      // Chat test mode - send conversation and return response
      const chatMessages = messages.map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      }));

      const reply = await callLLM(chatMessages);
      return NextResponse.json({ success: true, reply });
    } else {
      // Connection test mode - simple ping with TCM context
      const reply = await callLLM([
        {
          role: "user",
          content:
            "你好，请用一句话介绍你在中医问诊方面的能力，以验证连接正常。",
        },
      ]);
      return NextResponse.json({ success: true, message: reply });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return NextResponse.json({ success: false, error: message });
  }
}
