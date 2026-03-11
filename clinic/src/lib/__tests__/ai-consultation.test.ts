import {
  getNextQuestion,
  extractSymptoms,
  generateDiagnosis,
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

describe("extractSymptoms", () => {
  it("should extract keys for given round", () => {
    const result = extractSymptoms("我头痛三天了", 1);
    expect(result).toHaveProperty("主诉");
    expect(result).toHaveProperty("病程");
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
    ];
    const result = generateDiagnosis(messages);
    expect(result.syndromeType).toBe("风寒表证");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.formulaHerbs.length).toBeGreaterThan(0);
  });

  it("should return 心阴虚证 for insomnia symptoms", () => {
    const messages = [
      { role: "USER" as const, content: "我失眠心烦口干" },
    ];
    const result = generateDiagnosis(messages);
    expect(result.syndromeType).toBe("心阴虚证");
    expect(result.recommendedFormula).toBe("天王补心丹");
  });

  it("should return 脾胃气虚证 for stomach symptoms", () => {
    const messages = [
      { role: "USER" as const, content: "胃痛腹胀食欲不振" },
    ];
    const result = generateDiagnosis(messages);
    expect(result.syndromeType).toBe("脾胃气虚证");
  });

  it("should return 肾阳虚证 for cold constitution", () => {
    const messages = [
      { role: "USER" as const, content: "怕冷手脚冰凉腰酸" },
    ];
    const result = generateDiagnosis(messages);
    expect(result.syndromeType).toBe("肾阳虚证");
  });

  it("should return default diagnosis for unknown symptoms", () => {
    const messages = [
      { role: "USER" as const, content: "一般性不适" },
    ];
    const result = generateDiagnosis(messages);
    expect(result.syndromeType).toBe("气血两虚证");
    expect(result.confidence).toBeLessThan(0.7);
  });

  it("should always return valid herb entries", () => {
    const messages = [
      { role: "USER" as const, content: "test symptoms" },
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
