import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNextQuestion } from "@/lib/ai-consultation";

// Create new consultation
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const patientName = typeof body.patientName === "string" ? body.patientName.trim() : "";
  const patientGender = body.patientGender === "MALE" || body.patientGender === "FEMALE" ? body.patientGender : "";
  const patientAge = typeof body.patientAge === "number" && body.patientAge > 0 && body.patientAge <= 150 ? Math.floor(body.patientAge) : null;
  const patientWeight = typeof body.patientWeight === "number" && body.patientWeight > 0 && body.patientWeight <= 500 ? body.patientWeight : null;

  if (!patientName) {
    return NextResponse.json({ error: "请填写姓名" }, { status: 400 });
  }

  const consultation = await prisma.consultation.create({
    data: {
      patientId: session.user.id,
      patientName,
      patientGender,
      patientAge,
      patientWeight,
    },
  });

  // Create first AI message
  const firstQuestion = getNextQuestion(1);
  await prisma.message.create({
    data: {
      consultationId: consultation.id,
      role: "ASSISTANT",
      content: firstQuestion,
      roundNumber: 1,
    },
  });

  return NextResponse.json({ id: consultation.id });
}

// List consultations for current user
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const where =
    session.user.role === "DOCTOR"
      ? { status: { in: ["COMPLETED", "DIAGNOSED"] } }
      : { patientId: session.user.id };

  const consultations = await prisma.consultation.findMany({
    where,
    include: {
      patient: { select: { name: true, phone: true } },
      diagnosis: true,
      prescription: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(consultations);
}
