import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateDiagnosis } from "@/lib/ai-consultation";
import { checkPrescriptionSafety } from "@/lib/safety-check";

export async function POST(
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
    include: { messages: { orderBy: { roundNumber: "asc" } } },
  });

  if (!consultation) {
    return NextResponse.json({ error: "问诊不存在" }, { status: 404 });
  }

  if (consultation.status === "IN_PROGRESS") {
    return NextResponse.json({ error: "问诊尚未完成" }, { status: 400 });
  }

  // Generate AI diagnosis
  const messages = consultation.messages.map((m) => ({
    role: m.role as "USER" | "ASSISTANT",
    content: m.content,
    extractedInfo: m.extractedInfo ? JSON.parse(m.extractedInfo) : undefined,
  }));

  const result = generateDiagnosis(messages);

  // Save diagnosis
  const diagnosis = await prisma.diagnosis.create({
    data: {
      consultationId: id,
      syndromeType: result.syndromeType,
      confidence: result.confidence,
      reasoning: result.reasoning,
      recommendedFormula: result.recommendedFormula,
      formulaHerbs: JSON.stringify(result.formulaHerbs),
    },
  });

  // Run safety check on recommended herbs
  const safetyWarnings = checkPrescriptionSafety(result.formulaHerbs);

  // Create draft prescription
  await prisma.prescription.create({
    data: {
      consultationId: id,
      patientId: consultation.patientId,
      herbs: JSON.stringify(result.formulaHerbs),
      safetyWarnings: JSON.stringify(safetyWarnings),
    },
  });

  // Update consultation status
  await prisma.consultation.update({
    where: { id },
    data: { status: "DIAGNOSED" },
  });

  return NextResponse.json({
    diagnosis,
    safetyWarnings,
    recommendedHerbs: result.formulaHerbs,
  });
}
