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

export function extractSymptoms(
  userInput: string,
  roundNumber: number
): Record<string, string> {
  // Simplified extraction - in production use NLP/LLM
  const flow = QUESTION_FLOW.find((q) => q.round === roundNumber);
  if (!flow) return {};

  const extracted: Record<string, string> = {};
  for (const key of flow.extractKeys) {
    extracted[key] = userInput.trim();
  }
  return extracted;
}

export function generateDiagnosis(messages: ConversationMessage[]): {
  syndromeType: string;
  confidence: number;
  reasoning: string;
  recommendedFormula: string;
  formulaHerbs: { name: string; dosage: number; unit: string }[];
} {
  // Collect all symptoms from conversation
  const allInfo: Record<string, string> = {};
  for (const msg of messages) {
    if (msg.extractedInfo) {
      Object.assign(allInfo, msg.extractedInfo);
    }
  }

  const fullText = messages
    .filter((m) => m.role === "USER")
    .map((m) => m.content)
    .join(" ");

  // Pattern matching for common syndromes (simplified)
  if (
    fullText.includes("怕冷") ||
    fullText.includes("手脚冰凉") ||
    fullText.includes("腰酸")
  ) {
    return {
      syndromeType: "肾阳虚证",
      confidence: 0.78,
      reasoning:
        "患者表现为畏寒肢冷、腰膝酸软，结合四诊信息，辨证为肾阳虚证。肾阳不足，温煦失职，故见畏寒肢冷；腰为肾之府，肾虚则腰膝酸软。",
      recommendedFormula: "金匮肾气丸",
      formulaHerbs: [
        { name: "熟地黄", dosage: 24, unit: "g" },
        { name: "山药", dosage: 12, unit: "g" },
        { name: "山茱萸", dosage: 12, unit: "g" },
        { name: "泽泻", dosage: 9, unit: "g" },
        { name: "茯苓", dosage: 9, unit: "g" },
        { name: "牡丹皮", dosage: 9, unit: "g" },
        { name: "桂枝", dosage: 3, unit: "g" },
        { name: "附子", dosage: 3, unit: "g" },
      ],
    };
  }

  if (
    fullText.includes("失眠") ||
    fullText.includes("心烦") ||
    fullText.includes("口干")
  ) {
    return {
      syndromeType: "心阴虚证",
      confidence: 0.82,
      reasoning:
        "患者以失眠心烦、口干为主要表现，辨证为心阴虚证。心阴不足，虚火内扰心神，故见失眠多梦、心烦不安；阴虚津少，故口干。",
      recommendedFormula: "天王补心丹",
      formulaHerbs: [
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
    };
  }

  if (
    fullText.includes("头痛") ||
    fullText.includes("鼻塞") ||
    fullText.includes("咳嗽") ||
    fullText.includes("发热")
  ) {
    return {
      syndromeType: "风寒表证",
      confidence: 0.85,
      reasoning:
        "患者以头痛、恶寒、鼻塞等为主诉，辨证为风寒表证。风寒外袭，卫阳被遏，故见恶寒发热、头痛；肺气失宣，故鼻塞咳嗽。",
      recommendedFormula: "麻黄汤",
      formulaHerbs: [
        { name: "麻黄", dosage: 9, unit: "g" },
        { name: "桂枝", dosage: 6, unit: "g" },
        { name: "杏仁", dosage: 9, unit: "g" },
        { name: "甘草", dosage: 3, unit: "g" },
      ],
    };
  }

  if (
    fullText.includes("胃痛") ||
    fullText.includes("腹胀") ||
    fullText.includes("食欲不振")
  ) {
    return {
      syndromeType: "脾胃气虚证",
      confidence: 0.80,
      reasoning:
        "患者以胃脘不适、食欲不振、腹胀为主诉，辨证为脾胃气虚证。脾胃气虚，运化失常，故见食欲不振、腹胀；中气不足，故倦怠乏力。",
      recommendedFormula: "四君子汤",
      formulaHerbs: [
        { name: "人参", dosage: 9, unit: "g" },
        { name: "白术", dosage: 9, unit: "g" },
        { name: "茯苓", dosage: 9, unit: "g" },
        { name: "甘草", dosage: 6, unit: "g" },
      ],
    };
  }

  // Default fallback
  return {
    syndromeType: "气血两虚证",
    confidence: 0.65,
    reasoning:
      "根据患者描述的综合症状，初步辨证为气血两虚证。建议进一步面诊确认。气血不足，脏腑失养，可见多种不适症状。",
    recommendedFormula: "八珍汤",
    formulaHerbs: [
      { name: "人参", dosage: 9, unit: "g" },
      { name: "白术", dosage: 9, unit: "g" },
      { name: "茯苓", dosage: 9, unit: "g" },
      { name: "甘草", dosage: 6, unit: "g" },
      { name: "当归", dosage: 9, unit: "g" },
      { name: "川芎", dosage: 6, unit: "g" },
      { name: "白芍", dosage: 9, unit: "g" },
      { name: "熟地黄", dosage: 12, unit: "g" },
    ],
  };
}

export const MAX_ROUNDS = 8;
