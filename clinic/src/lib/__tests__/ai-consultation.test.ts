import {
  getNextQuestion,
  extractSymptoms,
  generateDiagnosis,
  isValidMedicalInput,
  MAX_ROUNDS,
} from "../ai-consultation";

describe("getNextQuestion", () => {
  it("should return first question for round 1", () => {
    const q = getNextQuestion(1);
    expect(q).toContain("不舒服");
  });

  it("should return questions for rounds 1-8", () => {
    for (let i = 1; i <= 8; i++) {
      const q = getNextQuestion(i);
      expect(q.length).toBeGreaterThan(0);
    }
  });

  it("should return completion message for round > 8", () => {
    const q = getNextQuestion(9);
    expect(q).toContain("足够");
  });
});

describe("isValidMedicalInput", () => {
  it("should reject pure numbers", () => {
    expect(isValidMedicalInput("123")).toBe(false);
    expect(isValidMedicalInput("1")).toBe(false);
  });

  it("should reject single characters", () => {
    expect(isValidMedicalInput("a")).toBe(false);
    expect(isValidMedicalInput("好")).toBe(false);
  });

  it("should reject repeated characters", () => {
    expect(isValidMedicalInput("aaa")).toBe(false);
  });

  it("should accept valid symptom descriptions", () => {
    expect(isValidMedicalInput("我头痛三天了")).toBe(true);
    expect(isValidMedicalInput("失眠多梦")).toBe(true);
    expect(isValidMedicalInput("没有过敏")).toBe(true);
    expect(isValidMedicalInput("睡眠不好")).toBe(true);
  });
});

describe("extractSymptoms", () => {
  it("should extract keys for given round with valid input", () => {
    const result = extractSymptoms("我头痛三天了", 1);
    expect(result).toHaveProperty("主诉");
    expect(result).toHaveProperty("病程");
  });

  it("should return empty for invalid input", () => {
    const result = extractSymptoms("123", 1);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("should return empty for invalid round", () => {
    const result = extractSymptoms("test", 99);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe("generateDiagnosis", () => {
  it("should return 风寒表证 for cold symptoms", () => {
    const messages = [
      { role: "USER" as const, content: "我头痛发热鼻塞" },
      { role: "USER" as const, content: "咳嗽流涕怕冷" },
    ];
    const result = generateDiagnosis(messages);
    expect(result.syndromeType).toBe("风寒表证");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.formulaHerbs.length).toBeGreaterThan(0);
  });

  it("should return 心阴虚证 for insomnia symptoms", () => {
    const messages = [
      { role: "USER" as const, content: "我失眠心烦口干" },
      { role: "USER" as const, content: "多梦容易醒" },
    ];
    const result = generateDiagnosis(messages);
    expect(result.syndromeType).toBe("心阴虚证");
    expect(result.recommendedFormula).toBe("天王补心丹");
  });

  it("should return 脾胃气虚证 for stomach symptoms", () => {
    const messages = [
      { role: "USER" as const, content: "胃痛腹胀食欲不振" },
      { role: "USER" as const, content: "吃不下饭乏力" },
    ];
    const result = generateDiagnosis(messages);
    expect(result.syndromeType).toBe("脾胃气虚证");
  });

  it("should return 肾阳虚证 for cold constitution", () => {
    const messages = [
      { role: "USER" as const, content: "怕冷手脚冰凉腰酸" },
      { role: "USER" as const, content: "夜尿多" },
    ];
    const result = generateDiagnosis(messages);
    expect(result.syndromeType).toBe("肾阳虚证");
  });

  it("should refuse diagnosis for garbage input", () => {
    const messages = [
      { role: "USER" as const, content: "1" },
      { role: "USER" as const, content: "3" },
      { role: "USER" as const, content: "4" },
      { role: "USER" as const, content: "5" },
    ];
    const result = generateDiagnosis(messages);
    expect(result.syndromeType).toContain("信息不足");
    expect(result.confidence).toBe(0);
    expect(result.formulaHerbs).toHaveLength(0);
  });

  it("should return low confidence for vague valid input", () => {
    const messages = [
      { role: "USER" as const, content: "有点不舒服" },
      { role: "USER" as const, content: "还行吧正常" },
    ];
    const result = generateDiagnosis(messages);
    // Should either refuse or give low confidence
    expect(result.confidence).toBeLessThan(0.5);
  });

  it("should always return valid herb entries when herbs exist", () => {
    const messages = [
      { role: "USER" as const, content: "我头痛发热鼻塞咳嗽" },
      { role: "USER" as const, content: "流涕打喷嚏" },
    ];
    const result = generateDiagnosis(messages);
    for (const herb of result.formulaHerbs) {
      expect(herb.name).toBeTruthy();
      expect(herb.dosage).toBeGreaterThan(0);
      expect(herb.unit).toBe("g");
    }
  });
});

describe("MAX_ROUNDS", () => {
  it("should be 8", () => {
    expect(MAX_ROUNDS).toBe(8);
  });
});
