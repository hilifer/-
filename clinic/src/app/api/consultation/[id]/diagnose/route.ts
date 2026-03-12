import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateDiagnosis, PatientInfo } from "@/lib/ai-consultation";
import { checkPrescriptionSafety } from "@/lib/safety-check";
import { isLLMEnabled, callLLM, callLLMWithImages, getAiConfig } from "@/lib/llm-service";
import type { ImageInput } from "@/lib/llm-service";

const IMAGE_TYPE_LABELS: Record<string, string> = {
  TONGUE: "舌诊",
  FACE: "面诊",
  FINGER: "指纹诊",
};

const DIAGNOSIS_PROMPT = `你是一位经验丰富的中医师。请根据以下问诊对话记录和望诊照片（如有），进行辨证分析并开具处方。

重要规则：
1. 首先判断患者回答是否有效。如果患者的回答大部分是无意义内容（如数字、乱码、单字符、与症状无关的文字），则拒绝开方。
2. 如果患者信息不足以做出可靠辨证，请如实说明，不要强行开方。
3. 只有在收集到足够的症状信息时，才给出处方建议。

如果信息不足或回答无效，返回：
{
  "syndromeType": "信息不足，无法辨证",
  "confidence": 0,
  "reasoning": "说明为什么无法辨证",
  "recommendedFormula": "无",
  "formulaHerbs": []
}

如果信息充分，按以下格式返回：
{
  "syndromeType": "证型名称",
  "confidence": 0.85,
  "reasoning": "辨证推理过程",
  "recommendedFormula": "方剂名称",
  "formulaHerbs": [
    {"name": "药材名", "dosage": 9, "unit": "g"}
  ]
}

如果提供了舌诊照片，请分析舌质（颜色、形态）和舌苔（厚薄、颜色、润燥）。
如果提供了面诊照片，请分析面色（红润/苍白/萎黄/晦暗等）。
如果提供了指纹照片，请分析指纹颜色和形态。

要求：
- confidence 为0-1之间的浮点数，信息越不足应越低
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
  conversationMessages: { role: string; content: string }[],
  imageInputs: ImageInput[]
): Promise<DiagnosisResult> {
  const config = await getAiConfig();

  const conversationText = conversationMessages
    .map((m) => `${m.role === "USER" ? "患者" : "医师"}：${m.content}`)
    .join("\n");

  const imageDesc = imageInputs.length > 0
    ? `\n\n附带望诊照片：${imageInputs.map((i) => IMAGE_TYPE_LABELS[i.type] || i.type).join("、")}，请结合照片分析。`
    : "";

  const messages: { role: "system" | "user"; content: string }[] = [
    { role: "system", content: DIAGNOSIS_PROMPT },
    {
      role: "user",
      content: config.systemPrompt
        ? `${config.systemPrompt}\n\n以下是问诊记录：\n\n${conversationText}${imageDesc}\n\n请进行辨证分析并开具处方，严格按JSON格式返回。`
        : `以下是问诊记录：\n\n${conversationText}${imageDesc}\n\n请进行辨证分析并开具处方，严格按JSON格式返回。`,
    },
  ];

  // Use vision API if images are available, otherwise regular text API
  const reply = imageInputs.length > 0
    ? await callLLMWithImages(messages, imageInputs)
    : await callLLM(messages);

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
    include: {
      messages: { orderBy: { roundNumber: "asc" } },
      images: true,
    },
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

  // Load uploaded images for vision analysis
  const imageInputs: ImageInput[] = (consultation.images || []).map((img) => ({
    type: img.type,
    data: img.data,
    mimeType: img.mimeType,
  }));

  // Build patient info for dosage adjustment
  const patientInfo: PatientInfo = {
    name: consultation.patientName || undefined,
    gender: consultation.patientGender || undefined,
    age: consultation.patientAge,
    weight: consultation.patientWeight,
  };

  // Use LLM if enabled, otherwise fall back to rule-based engine
  let result: DiagnosisResult;
  const llmEnabled = await isLLMEnabled();

  if (llmEnabled) {
    try {
      result = await generateLLMDiagnosis(messages, imageInputs);
    } catch (err) {
      console.error("LLM diagnosis failed, falling back to rules:", err);
      result = generateDiagnosis(messages, patientInfo);
    }
  } else {
    result = generateDiagnosis(messages, patientInfo);
  }

  const hasValidPrescription = result.formulaHerbs.length > 0 && result.confidence > 0;

  // Save diagnosis (upsert: allow re-diagnosis for same consultation)
  const diagnosisData = {
    syndromeType: result.syndromeType,
    confidence: result.confidence,
    reasoning: result.reasoning,
    recommendedFormula: result.recommendedFormula,
    formulaHerbs: JSON.stringify(result.formulaHerbs),
  };
  const diagnosis = await prisma.diagnosis.upsert({
    where: { consultationId: id },
    create: { consultationId: id, ...diagnosisData },
    update: diagnosisData,
  });

  let safetyWarnings: { severity: string; message: string }[] = [];

  if (hasValidPrescription) {
    // Run safety check on recommended herbs
    safetyWarnings = checkPrescriptionSafety(result.formulaHerbs);

    // Save draft prescription (upsert: allow re-diagnosis)
    const prescriptionData = {
      herbs: JSON.stringify(result.formulaHerbs),
      safetyWarnings: JSON.stringify(safetyWarnings),
      status: "DRAFT",
    };
    await prisma.prescription.upsert({
      where: { consultationId: id },
      create: {
        consultationId: id,
        patientId: consultation.patientId,
        ...prescriptionData,
      },
      update: prescriptionData,
    });
  }

  // Update consultation status
  await prisma.consultation.update({
    where: { id },
    data: { status: "DIAGNOSED" },
  });

  return NextResponse.json({
    diagnosis,
    safetyWarnings,
    recommendedHerbs: result.formulaHerbs,
    insufficient: !hasValidPrescription,
  });
}
