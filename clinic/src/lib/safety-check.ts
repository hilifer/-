// 十八反 - Eighteen Incompatibilities
const EIGHTEEN_INCOMPATIBLES: [string, string[]][] = [
  ["甘草", ["甘遂", "大戟", "海藻", "芫花"]],
  ["乌头", ["贝母", "瓜蒌", "半夏", "白蔹", "白及"]],
  ["藜芦", ["人参", "沙参", "丹参", "玄参", "苦参", "细辛", "芍药"]],
];

// 十九畏 - Nineteen Antagonisms
const NINETEEN_ANTAGONISMS: [string, string][] = [
  ["硫黄", "朴硝"],
  ["水银", "砒霜"],
  ["狼毒", "密陀僧"],
  ["巴豆", "牵牛"],
  ["丁香", "郁金"],
  ["川乌", "犀角"],
  ["牙硝", "三棱"],
  ["官桂", "赤石脂"],
  ["人参", "五灵脂"],
];

export interface SafetyWarning {
  type: "EIGHTEEN_INCOMPATIBLES" | "NINETEEN_ANTAGONISMS" | "DOSAGE_EXCEEDED";
  severity: "ERROR" | "WARNING";
  herbA: string;
  herbB?: string;
  message: string;
}

export interface HerbItem {
  name: string;
  dosage: number;
  unit: string;
}

// Standard dosage limits (g)
const DOSAGE_LIMITS: Record<string, number> = {
  "附子": 15, "川乌": 10, "草乌": 10, "细辛": 3,
  "马钱子": 0.9, "雄黄": 0.3, "朱砂": 1, "蟾酥": 0.03,
  "斑蝥": 0.06, "全蝎": 5, "蜈蚣": 3, "半夏": 12,
  "甘遂": 1.5, "大戟": 3, "芫花": 3, "巴豆": 0.3,
};

export function checkPrescriptionSafety(herbs: HerbItem[]): SafetyWarning[] {
  const warnings: SafetyWarning[] = [];
  const herbNames = herbs.map((h) => h.name);

  // Check 十八反
  for (const [main, incompatibles] of EIGHTEEN_INCOMPATIBLES) {
    if (herbNames.includes(main)) {
      for (const inc of incompatibles) {
        if (herbNames.includes(inc)) {
          warnings.push({
            type: "EIGHTEEN_INCOMPATIBLES",
            severity: "ERROR",
            herbA: main,
            herbB: inc,
            message: `十八反：${main} 与 ${inc} 不可同用`,
          });
        }
      }
    }
  }

  // Check 十九畏
  for (const [a, b] of NINETEEN_ANTAGONISMS) {
    if (herbNames.includes(a) && herbNames.includes(b)) {
      warnings.push({
        type: "NINETEEN_ANTAGONISMS",
        severity: "WARNING",
        herbA: a,
        herbB: b,
        message: `十九畏：${a} 畏 ${b}，需谨慎配伍`,
      });
    }
  }

  // Check dosage limits
  for (const herb of herbs) {
    const limit = DOSAGE_LIMITS[herb.name];
    if (limit && herb.dosage > limit) {
      warnings.push({
        type: "DOSAGE_EXCEEDED",
        severity: "ERROR",
        herbA: herb.name,
        message: `${herb.name} 剂量 ${herb.dosage}${herb.unit} 超过安全上限 ${limit}g`,
      });
    }
  }

  return warnings;
}
