// AI consultation engine - simulates multi-round TCM consultation
// In production, replace with actual LLM API calls

interface ConversationMessage {
  role: "USER" | "ASSISTANT";
  content: string;
  extractedInfo?: Record<string, string>;
}

const QUESTION_FLOW = [
  {
    round: 1,
    question: "您好，我是您的中医问诊助手。请问您今天主要哪里不舒服？症状持续多久了？",
    extractKeys: ["主诉", "病程"],
  },
  {
    round: 2,
    question: "请详细描述一下您的不适感，比如疼痛的性质（胀痛、刺痛、隐痛）、程度、发作频率？有没有什么诱因会加重或缓解？",
    extractKeys: ["症状性质", "诱因"],
  },
  {
    round: 3,
    question: "您的饮食情况如何？胃口好不好？有没有口干口苦？喜欢喝热水还是凉水？",
    extractKeys: ["饮食", "口感"],
  },
  {
    round: 4,
    question: "您的睡眠质量怎样？容不容易入睡？会不会半夜醒来？做梦多吗？",
    extractKeys: ["睡眠"],
  },
  {
    round: 5,
    question: "大便情况如何？每天几次？成形吗？小便颜色、次数正常吗？",
    extractKeys: ["大便", "小便"],
  },
  {
    round: 6,
    question: "您的情绪状态怎样？最近有没有压力大、容易烦躁或情绪低落的情况？",
    extractKeys: ["情志"],
  },
  {
    round: 7,
    question: "请问您之前有没有得过什么疾病？目前有没有在服用其他药物？有没有药物过敏？",
    extractKeys: ["既往史", "用药史", "过敏史"],
  },
  {
    round: 8,
    question: "最后请问：您怕冷还是怕热？出汗多吗？女性的话月经情况如何？",
    extractKeys: ["寒热", "汗出", "月经"],
  },
];

export function getNextQuestion(roundNumber: number): string {
  const flow = QUESTION_FLOW.find((q) => q.round === roundNumber);
  if (!flow) {
    return "感谢您的配合，我已经收集到足够的信息。现在为您进行辨证分析...";
  }
  return flow.question;
}

// Common TCM symptom keywords for validating patient responses
const SYMPTOM_KEYWORDS = [
  // Pain & discomfort
  "痛", "疼", "酸", "胀", "麻", "痒", "不适", "难受", "不舒服",
  // Body parts
  "头", "胸", "胃", "腹", "腰", "背", "腿", "肩", "颈", "眼", "耳", "鼻", "喉", "咽",
  // Common symptoms
  "咳嗽", "发热", "发烧", "恶寒", "怕冷", "怕热", "出汗", "盗汗",
  "失眠", "多梦", "乏力", "疲倦", "头晕", "恶心", "呕吐",
  "腹泻", "便秘", "食欲", "口干", "口苦", "口渴",
  "鼻塞", "流涕", "气短", "心悸", "浮肿", "尿频",
  // Descriptions
  "好", "不好", "正常", "还行", "差", "多", "少", "没有",
  "经常", "偶尔", "有时", "总是", "一直", "最近",
  "冷", "热", "凉", "温", "干", "湿",
  // Food & sleep & mood
  "睡", "吃", "喝", "梦", "醒", "烦", "躁", "焦虑", "抑郁", "压力",
  // History
  "过敏", "高血压", "糖尿", "心脏", "手术", "药",
  // Basic affirmation/negation
  "是", "对", "没", "无", "不",
  // Time
  "天", "周", "月", "年", "小时",
];

/**
 * Check if patient input contains meaningful medical content
 * Returns true if the input seems valid enough to proceed
 */
export function isValidMedicalInput(input: string): boolean {
  const trimmed = input.trim();
  // Too short (less than 2 chars) — likely garbage
  if (trimmed.length < 2) return false;
  // Pure numbers — not useful
  if (/^\d+$/.test(trimmed)) return false;
  // Single repeated character
  if (/^(.)\1+$/.test(trimmed)) return false;
  // Check if it contains at least one symptom keyword
  return SYMPTOM_KEYWORDS.some((kw) => trimmed.includes(kw));
}

export function extractSymptoms(
  userInput: string,
  roundNumber: number
): Record<string, string> {
  // Simplified extraction - in production use NLP/LLM
  const flow = QUESTION_FLOW.find((q) => q.round === roundNumber);
  if (!flow) return {};

  const extracted: Record<string, string> = {};
  // Only extract if the input seems medically meaningful
  if (isValidMedicalInput(userInput)) {
    for (const key of flow.extractKeys) {
      extracted[key] = userInput.trim();
    }
  }
  return extracted;
}

export interface PatientInfo {
  name?: string;
  gender?: string; // MALE | FEMALE
  age?: number | null;
  weight?: number | null;
}

// Adjust herb dosage based on patient age and weight
// Standard dosage is for adults (18-60 years, ~60kg)
function adjustDosage(
  baseDosage: number,
  patient?: PatientInfo
): number {
  let ratio = 1.0;

  if (patient?.age) {
    if (patient.age <= 3) ratio *= 0.25;
    else if (patient.age <= 6) ratio *= 0.33;
    else if (patient.age <= 9) ratio *= 0.5;
    else if (patient.age <= 14) ratio *= 0.67;
    else if (patient.age <= 17) ratio *= 0.83;
    else if (patient.age >= 70) ratio *= 0.75;
    // 18-69: standard dose (1.0)
  }

  if (patient?.weight) {
    // Adjust relative to 60kg standard
    const weightRatio = patient.weight / 60;
    // Clamp between 0.7x and 1.3x to avoid extreme adjustments
    ratio *= Math.max(0.7, Math.min(1.3, weightRatio));
  }

  // Round to 1 decimal place
  return Math.round(baseDosage * ratio * 10) / 10;
}

export function generateDiagnosis(
  messages: ConversationMessage[],
  patient?: PatientInfo
): {
  syndromeType: string;
  confidence: number;
  reasoning: string;
  recommendedFormula: string;
  formulaHerbs: { name: string; dosage: number; unit: string }[];
} {
  // Collect all extracted symptoms from conversation
  const allInfo: Record<string, string> = {};
  for (const msg of messages) {
    if (msg.extractedInfo) {
      Object.assign(allInfo, msg.extractedInfo);
    }
  }

  // Count how many rounds had valid medical input
  const userMessages = messages.filter((m) => m.role === "USER");
  const validAnswers = userMessages.filter((m) => isValidMedicalInput(m.content));
  const validRatio = userMessages.length > 0 ? validAnswers.length / userMessages.length : 0;

  // If less than 30% of answers are valid, refuse to diagnose
  if (validRatio < 0.3 || validAnswers.length < 2) {
    return {
      syndromeType: "信息不足，无法辨证",
      confidence: 0,
      reasoning:
        "患者提供的问诊信息不足或无效，无法进行可靠的辨证分析。" +
        `共${userMessages.length}轮回答中仅${validAnswers.length}轮包含有效症状描述。` +
        "建议重新问诊，请患者详细描述症状。",
      recommendedFormula: "无",
      formulaHerbs: [],
    };
  }

  const fullText = validAnswers.map((m) => m.content).join(" ");

  // Count matching symptom patterns for confidence scoring
  const patterns: {
    name: string;
    keywords: string[];
    syndrome: string;
    confidence: number;
    reasoning: string;
    formula: string;
    herbs: { name: string; dosage: number; unit: string }[];
  }[] = [
    {
      name: "kidney_yang",
      keywords: ["怕冷", "手脚冰凉", "腰酸", "腰痛", "夜尿", "畏寒", "肢冷"],
      syndrome: "肾阳虚证",
      confidence: 0.78,
      reasoning: "患者表现为畏寒肢冷、腰膝酸软，结合四诊信息，辨证为肾阳虚证。肾阳不足，温煦失职，故见畏寒肢冷；腰为肾之府，肾虚则腰膝酸软。",
      formula: "金匮肾气丸",
      herbs: [
        { name: "熟地黄", dosage: 24, unit: "g" },
        { name: "山药", dosage: 12, unit: "g" },
        { name: "山茱萸", dosage: 12, unit: "g" },
        { name: "泽泻", dosage: 9, unit: "g" },
        { name: "茯苓", dosage: 9, unit: "g" },
        { name: "牡丹皮", dosage: 9, unit: "g" },
        { name: "桂枝", dosage: 3, unit: "g" },
        { name: "附子", dosage: 3, unit: "g" },
      ],
    },
    {
      name: "heart_yin",
      keywords: ["失眠", "心烦", "口干", "多梦", "盗汗", "心悸", "健忘"],
      syndrome: "心阴虚证",
      confidence: 0.82,
      reasoning: "患者以失眠心烦、口干为主要表现，辨证为心阴虚证。心阴不足，虚火内扰心神，故见失眠多梦、心烦不安；阴虚津少，故口干。",
      formula: "天王补心丹",
      herbs: [
        { name: "生地黄", dosage: 15, unit: "g" },
        { name: "人参", dosage: 6, unit: "g" },
        { name: "丹参", dosage: 6, unit: "g" },
        { name: "玄参", dosage: 6, unit: "g" },
        { name: "茯苓", dosage: 6, unit: "g" },
        { name: "远志", dosage: 6, unit: "g" },
        { name: "桔梗", dosage: 6, unit: "g" },
        { name: "酸枣仁", dosage: 12, unit: "g" },
        { name: "柏子仁", dosage: 12, unit: "g" },
        { name: "天冬", dosage: 12, unit: "g" },
        { name: "麦冬", dosage: 12, unit: "g" },
        { name: "当归", dosage: 9, unit: "g" },
        { name: "五味子", dosage: 6, unit: "g" },
      ],
    },
    {
      name: "wind_cold",
      keywords: ["头痛", "鼻塞", "咳嗽", "发热", "发烧", "恶寒", "流涕", "打喷嚏"],
      syndrome: "风寒表证",
      confidence: 0.85,
      reasoning: "患者以头痛、恶寒、鼻塞等为主诉，辨证为风寒表证。风寒外袭，卫阳被遏，故见恶寒发热、头痛；肺气失宣，故鼻塞咳嗽。",
      formula: "麻黄汤",
      herbs: [
        { name: "麻黄", dosage: 9, unit: "g" },
        { name: "桂枝", dosage: 6, unit: "g" },
        { name: "杏仁", dosage: 9, unit: "g" },
        { name: "甘草", dosage: 3, unit: "g" },
      ],
    },
    {
      name: "spleen_qi",
      keywords: ["胃痛", "腹胀", "食欲不振", "不想吃", "消化不良", "腹泻", "便溏", "乏力"],
      syndrome: "脾胃气虚证",
      confidence: 0.80,
      reasoning: "患者以胃脘不适、食欲不振、腹胀为主诉，辨证为脾胃气虚证。脾胃气虚，运化失常，故见食欲不振、腹胀；中气不足，故倦怠乏力。",
      formula: "四君子汤",
      herbs: [
        { name: "人参", dosage: 9, unit: "g" },
        { name: "白术", dosage: 9, unit: "g" },
        { name: "茯苓", dosage: 9, unit: "g" },
        { name: "甘草", dosage: 6, unit: "g" },
      ],
    },
    {
      name: "liver_qi",
      keywords: ["烦躁", "易怒", "胁痛", "胸闷", "叹气", "压力大", "焦虑", "抑郁", "情绪"],
      syndrome: "肝气郁结证",
      confidence: 0.77,
      reasoning: "患者以情志不畅、胸胁胀闷为主诉，辨证为肝气郁结证。肝失疏泄，气机郁滞，故见胸胁胀痛、烦躁易怒；气郁日久，可致脾胃不和。",
      formula: "逍遥散",
      herbs: [
        { name: "柴胡", dosage: 9, unit: "g" },
        { name: "当归", dosage: 9, unit: "g" },
        { name: "白芍", dosage: 12, unit: "g" },
        { name: "白术", dosage: 9, unit: "g" },
        { name: "茯苓", dosage: 9, unit: "g" },
        { name: "甘草", dosage: 6, unit: "g" },
        { name: "薄荷", dosage: 3, unit: "g" },
        { name: "生姜", dosage: 3, unit: "g" },
      ],
    },
  ];

  // Score each pattern by number of matching keywords
  let bestMatch: typeof patterns[0] | null = null;
  let bestScore = 0;

  for (const p of patterns) {
    const score = p.keywords.filter((kw) => fullText.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = p;
    }
  }

  // Need at least 2 keyword matches for a credible diagnosis
  if (bestMatch && bestScore >= 2) {
    // Adjust confidence based on match quality and valid answer ratio
    const adjustedConfidence = Math.min(
      bestMatch.confidence,
      bestMatch.confidence * (0.5 + 0.5 * validRatio) * Math.min(1, bestScore / 3)
    );
    // Build patient info note for reasoning
    const genderLabel = patient?.gender === "MALE" ? "男" : patient?.gender === "FEMALE" ? "女" : "";
    const patientNote = patient?.age || patient?.weight || patient?.gender
      ? `（患者${patient.name || ""}${genderLabel ? `，${genderLabel}` : ""}${patient.age ? `，${patient.age}岁` : ""}${patient.weight ? `，体重${patient.weight}kg` : ""}，剂量已根据年龄体重调整。）`
      : "";
    return {
      syndromeType: bestMatch.syndrome,
      confidence: Math.round(adjustedConfidence * 100) / 100,
      reasoning: bestMatch.reasoning + patientNote,
      recommendedFormula: bestMatch.formula,
      formulaHerbs: bestMatch.herbs.map((h) => ({
        ...h,
        dosage: adjustDosage(h.dosage, patient),
      })),
    };
  }

  // Single keyword match — low confidence, provide tentative result with warning
  if (bestMatch && bestScore === 1) {
    return {
      syndromeType: bestMatch.syndrome + "（待确认）",
      confidence: 0.35,
      reasoning:
        `仅匹配到少量症状特征，辨证把握度较低。${bestMatch.reasoning} ` +
        "建议医生结合面诊进一步确认，必要时重新问诊收集更多四诊信息。",
      recommendedFormula: bestMatch.formula,
      formulaHerbs: bestMatch.herbs.map((h) => ({
        ...h,
        dosage: adjustDosage(h.dosage, patient),
      })),
    };
  }

  // No pattern match at all — refuse to prescribe
  return {
    syndromeType: "信息不足，无法辨证",
    confidence: 0,
    reasoning:
      "根据患者提供的信息，未能识别出明确的证型特征，无法进行可靠的辨证分析。" +
      "建议重新进行详细问诊，请患者具体描述不适症状、部位、时间等信息。",
    recommendedFormula: "无",
    formulaHerbs: [],
  };
}

export const MAX_ROUNDS = 8;
