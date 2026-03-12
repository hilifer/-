import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getNextQuestion,
  extractSymptoms,
  MAX_ROUNDS,
} from "@/lib/ai-consultation";
import { isLLMEnabled, callLLM, getAiConfig } from "@/lib/llm-service";

const DEFAULT_SYSTEM_PROMPT = `你是一位经验丰富的中医师AI助手，正在进行中医问诊。

严格规则（必须遵守）：
- 每轮只问1个问题，简洁明了，不要一次问多个问题
- 回复控制在2-3句话以内，不要长篇大论
- 当前是第{round}轮，共{maxRounds}轮，{remainingHint}
- 不要重复问已经问过的内容

问诊顺序：主诉 → 症状性质 → 饮食 → 睡眠 → 二便 → 情志 → 既往史 → 寒热汗出
语气：专业、亲切、简短`;

async function generateLLMResponse(
  consultationId: string,
  currentRound: number
): Promise<{ content: string; isComplete: boolean }> {
  const config = await getAiConfig();
  const remaining = MAX_ROUNDS - currentRound;
  const remainingHint =
    remaining <= 0
      ? "问诊已结束，请总结收集到的信息"
      : remaining === 1
        ? "这是最后一个问题，请简短收尾"
        : `还剩${remaining}轮`;

  const systemPrompt = (config.systemPrompt || DEFAULT_SYSTEM_PROMPT)
    .replace("{round}", String(currentRound))
    .replace("{maxRounds}", String(MAX_ROUNDS))
    .replace("{remainingHint}", remainingHint);

  // Load full conversation history
  const allMessages = await prisma.message.findMany({
    where: { consultationId },
    orderBy: { roundNumber: "asc" },
  });

  const chatMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of allMessages) {
    chatMessages.push({
      role: msg.role === "USER" ? "user" : "assistant",
      content: msg.content,
    });
  }

  const isComplete = currentRound >= MAX_ROUNDS;

  if (isComplete) {
    return {
      content: "感谢您的详细描述，我已收集到足够的四诊信息。现在为您进行辨证分析，请稍候...",
      isComplete: true,
    };
  }

  const reply = await callLLM(chatMessages);
  return { content: reply, isComplete: false };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const { content, skip } = await req.json();

  const consultation = await prisma.consultation.findUnique({
    where: { id },
    include: { messages: { orderBy: { roundNumber: "desc" }, take: 1 } },
  });

  if (!consultation || consultation.patientId !== session.user.id) {
    return NextResponse.json({ error: "问诊不存在" }, { status: 404 });
  }

  if (consultation.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "问诊已结束" }, { status: 400 });
  }

  // Handle skip: mark consultation as completed and return immediately
  if (skip) {
    const lastRound = consultation.messages[0]?.roundNumber || 0;
    const completedRound = Math.ceil((lastRound + 1) / 2);

    await prisma.consultation.update({
      where: { id },
      data: { status: "COMPLETED" },
    });

    return NextResponse.json({
      aiMessage: "已跳过剩余问诊，您可以直接获取辨证结果。",
      isComplete: true,
      currentRound: completedRound,
    });
  }

  const lastRound = consultation.messages[0]?.roundNumber || 0;
  const currentRound = Math.ceil((lastRound + 1) / 2);
  const userRound = lastRound + 1;

  // Save user message
  const extracted = extractSymptoms(content, currentRound);
  await prisma.message.create({
    data: {
      consultationId: id,
      role: "USER",
      content,
      extractedInfo: JSON.stringify(extracted),
      roundNumber: userRound,
    },
  });

  // Generate AI response - use LLM if enabled, otherwise fall back to rules
  const llmEnabled = await isLLMEnabled();
  let aiContent: string;
  let isComplete: boolean;

  if (llmEnabled) {
    try {
      const result = await generateLLMResponse(id, currentRound + 1);
      aiContent = result.content;
      isComplete = result.isComplete;
    } catch (err) {
      console.error("LLM call failed, falling back to rules:", err);
      const nextRound = currentRound + 1;
      isComplete = nextRound > MAX_ROUNDS;
      aiContent = isComplete
        ? "感谢您的详细描述，我已收集到足够的四诊信息。现在为您进行辨证分析，请稍候..."
        : getNextQuestion(nextRound);
    }
  } else {
    const nextRound = currentRound + 1;
    isComplete = nextRound > MAX_ROUNDS;
    aiContent = isComplete
      ? "感谢您的详细描述，我已收集到足够的四诊信息。现在为您进行辨证分析，请稍候..."
      : getNextQuestion(nextRound);
  }

  await prisma.message.create({
    data: {
      consultationId: id,
      role: "ASSISTANT",
      content: aiContent,
      roundNumber: userRound + 1,
    },
  });

  if (isComplete) {
    await prisma.consultation.update({
      where: { id },
      data: { status: "COMPLETED" },
    });
  }

  return NextResponse.json({
    aiMessage: aiContent,
    isComplete,
    currentRound: currentRound + 1,
  });
}

// Get all messages for a consultation
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const consultation = await prisma.consultation.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { roundNumber: "asc" } },
      diagnosis: true,
      prescription: true,
    },
  });

  if (!consultation) {
    return NextResponse.json({ error: "问诊不存在" }, { status: 404 });
  }

  // Patients can only see their own; doctors can see all
  if (
    session.user.role === "PATIENT" &&
    consultation.patientId !== session.user.id
  ) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }

  return NextResponse.json(consultation);
}
