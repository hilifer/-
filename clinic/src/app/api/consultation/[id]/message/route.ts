import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getNextQuestion,
  extractSymptoms,
  MAX_ROUNDS,
} from "@/lib/ai-consultation";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const { content } = await req.json();

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

  // Generate AI response
  const nextRound = currentRound + 1;
  const isComplete = nextRound > MAX_ROUNDS;
  const aiContent = isComplete
    ? "感谢您的详细描述，我已收集到足够的四诊信息。现在为您进行辨证分析，请稍候..."
    : getNextQuestion(nextRound);

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
    currentRound: nextRound,
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
