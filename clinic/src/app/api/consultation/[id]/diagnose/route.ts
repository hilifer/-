import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateDiagnosis } from "@/lib/ai-consultation";
import { checkPrescriptionSafety } from "@/lib/safety-check";
import { isLLMEnabled, callLLM, getAiConfig } from "@/lib/llm-service";

const DIAGNOSIS_PROMPT = `你是一位经验丰富的中医师。请根据以下问诊对话记录，进行辨证分析并开具处方。

请严格按照以下JSON格式返回结果（不要包含其他文字）：
{
  "syndromeType": "证型名称",
  "confidence": 0.85,
  "reasoning": "辨证推理过程",
  "recommendedFormula": "方剂名称",
  "formulaHerbs": [
    {"name": "药材名", "dosage": 9, "unit": "g"},
    ...
  ]
}

要求：
- confidence 为0-1之间的浮点数
- 药材剂量必须合理，符合《中国药典》规定
- formulaHerbs 中每味药必须包含 name、dosage、unit 三个字段
- 只返回JSON，不要有其他内容`;

interface DiagnosisResult {
  syndromeType: string;
  confidence: number;
  reasoning: string;
  recommendedFormula: string;
  formulaHerbs: { name: string; dosage: number; unit: string }[];
}

async function generateLLMDiagnosis(
  conversationMessages: { role: string; content: string }[]
): Promise<DiagnosisResult> {
  const config = await getAiConfig();

  const conversationText = conversationMessages
    .map((m) => `${m.role === "USER" ? "患者" : "医师"}：${m.content}`)
    .join("\n");

  const messages: { role: "system" | "user"; content: string }[] = [
    { role: "system", content: DIAGNOSIS_PROMPT },
    {
      role: "user",
      content: config.systemPrompt
        ? `${config.systemPrompt}\n\n以下是问诊记录：\n\n${conversationText}\n\n请进行辨证分析并开具处方，严格按JSON格式返回。`
        : `以下是问诊记录：\n\n${conversationText}\n\n请进行辨证分析并开具处方，严格按JSON格式返回。`,
    },
  ];

  const reply = await callLLM(messages);

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = reply.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("LLM 返回格式不正确，无法解析JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]) as DiagnosisResult;

  if (!parsed.syndromeType || !parsed.formulaHerbs || !Array.isArray(parsed.formulaHerbs)) {
    throw new Error("LLM 返回数据缺少必要字段");
  }

  // Normalize herb data
  parsed.formulaHerbs = parsed.formulaHerbs.map((h) => ({
    name: h.name || "",
    dosage: Number(h.dosage) || 9,
    unit: h.unit || "g",
  }));

  parsed.confidence = Math.min(1, Math.max(0, Number(parsed.confidence) || 0.7));

  return parsed;
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

  const messages = consultation.messages.map((m) => ({
    role: m.role as "USER" | "ASSISTANT",
    content: m.content,
    extractedInfo: m.extractedInfo ? JSON.parse(m.extractedInfo) : undefined,
  }));

  // Use LLM if enabled, otherwise fall back to rule-based engine
  let result: DiagnosisResult;
  const llmEnabled = await isLLMEnabled();

  if (llmEnabled) {
    try {
      result = await generateLLMDiagnosis(messages);
    } catch (err) {
      console.error("LLM diagnosis failed, falling back to rules:", err);
      result = generateDiagnosis(messages);
    }
  } else {
    result = generateDiagnosis(messages);
  }

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
