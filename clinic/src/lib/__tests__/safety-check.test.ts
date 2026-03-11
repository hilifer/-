import { checkPrescriptionSafety, HerbItem } from "../safety-check";

describe("checkPrescriptionSafety", () => {
  it("should return no warnings for safe prescription", () => {
    const herbs: HerbItem[] = [
      { name: "人参", dosage: 9, unit: "g" },
      { name: "白术", dosage: 9, unit: "g" },
      { name: "茯苓", dosage: 9, unit: "g" },
      { name: "甘草", dosage: 6, unit: "g" },
    ];
    const warnings = checkPrescriptionSafety(herbs);
    expect(warnings).toHaveLength(0);
  });

  it("should detect 十八反: 甘草 vs 甘遂", () => {
    const herbs: HerbItem[] = [
      { name: "甘草", dosage: 6, unit: "g" },
      { name: "甘遂", dosage: 1, unit: "g" },
    ];
    const warnings = checkPrescriptionSafety(herbs);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe("EIGHTEEN_INCOMPATIBLES");
    expect(warnings[0].severity).toBe("ERROR");
    expect(warnings[0].message).toContain("甘草");
    expect(warnings[0].message).toContain("甘遂");
  });

  it("should detect 十八反: 乌头 vs 半夏", () => {
    const herbs: HerbItem[] = [
      { name: "乌头", dosage: 3, unit: "g" },
      { name: "半夏", dosage: 9, unit: "g" },
    ];
    const warnings = checkPrescriptionSafety(herbs);
    expect(warnings.some((w) => w.type === "EIGHTEEN_INCOMPATIBLES")).toBe(true);
  });

  it("should detect 十九畏: 丁香 vs 郁金", () => {
    const herbs: HerbItem[] = [
      { name: "丁香", dosage: 3, unit: "g" },
      { name: "郁金", dosage: 9, unit: "g" },
    ];
    const warnings = checkPrescriptionSafety(herbs);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe("NINETEEN_ANTAGONISMS");
    expect(warnings[0].severity).toBe("WARNING");
  });

  it("should detect 十九畏: 人参 vs 五灵脂", () => {
    const herbs: HerbItem[] = [
      { name: "人参", dosage: 9, unit: "g" },
      { name: "五灵脂", dosage: 6, unit: "g" },
    ];
    const warnings = checkPrescriptionSafety(herbs);
    expect(warnings.some((w) => w.type === "NINETEEN_ANTAGONISMS")).toBe(true);
  });

  it("should detect dosage exceeded for 附子", () => {
    const herbs: HerbItem[] = [
      { name: "附子", dosage: 20, unit: "g" },
    ];
    const warnings = checkPrescriptionSafety(herbs);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe("DOSAGE_EXCEEDED");
    expect(warnings[0].severity).toBe("ERROR");
    expect(warnings[0].message).toContain("15");
  });

  it("should detect dosage exceeded for 细辛", () => {
    const herbs: HerbItem[] = [
      { name: "细辛", dosage: 5, unit: "g" },
    ];
    const warnings = checkPrescriptionSafety(herbs);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe("DOSAGE_EXCEEDED");
    expect(warnings[0].message).toContain("3");
  });

  it("should detect multiple warnings simultaneously", () => {
    const herbs: HerbItem[] = [
      { name: "甘草", dosage: 6, unit: "g" },
      { name: "海藻", dosage: 9, unit: "g" },
      { name: "丁香", dosage: 3, unit: "g" },
      { name: "郁金", dosage: 9, unit: "g" },
      { name: "附子", dosage: 20, unit: "g" },
    ];
    const warnings = checkPrescriptionSafety(herbs);
    expect(warnings.length).toBeGreaterThanOrEqual(3);
    const types = warnings.map((w) => w.type);
    expect(types).toContain("EIGHTEEN_INCOMPATIBLES");
    expect(types).toContain("NINETEEN_ANTAGONISMS");
    expect(types).toContain("DOSAGE_EXCEEDED");
  });

  it("should allow herbs within safe dosage", () => {
    const herbs: HerbItem[] = [
      { name: "附子", dosage: 10, unit: "g" },
      { name: "细辛", dosage: 2, unit: "g" },
    ];
    const warnings = checkPrescriptionSafety(herbs);
    expect(warnings).toHaveLength(0);
  });
});
