// tests/unit/calorie.test.ts
import { describe, it, expect } from "vitest";
import { calculateCalories, CALORIE_CORRECTION_FACTOR } from "@/lib/calorie";

describe("calculateCalories", () => {
  it("正常系: MET3.0, 体重70kg, 30分 → 110.3kcal", () => {
    // 3.0 × 70 × 0.5 × 1.05 = 110.25 → Math.round(1102.5)/10 = 110.3
    expect(calculateCalories({ metValue: 3.0, weightKg: 70, durationMinutes: 30 })).toBe(110.3);
  });

  it("補正係数はCALORIE_CORRECTION_FACTOR(1.05)である", () => {
    expect(CALORIE_CORRECTION_FACTOR).toBe(1.05);
  });

  it("非常に大きい値でも例外を起こさず数値を返す", () => {
    const result = calculateCalories({ metValue: 11, weightKg: 200, durationMinutes: 600 });
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThan(0);
  });

  it("metValue=0の場合は0を返す", () => {
    expect(calculateCalories({ metValue: 0, weightKg: 70, durationMinutes: 30 })).toBe(0);
  });

  it("weightKg=0の場合は0を返す", () => {
    expect(calculateCalories({ metValue: 3, weightKg: 0, durationMinutes: 30 })).toBe(0);
  });

  it("durationMinutes=0の場合は0を返す", () => {
    expect(calculateCalories({ metValue: 3, weightKg: 70, durationMinutes: 0 })).toBe(0);
  });

  it("負数の場合は0を返す", () => {
    expect(calculateCalories({ metValue: -3, weightKg: 70, durationMinutes: 30 })).toBe(0);
    expect(calculateCalories({ metValue: 3, weightKg: -70, durationMinutes: 30 })).toBe(0);
    expect(calculateCalories({ metValue: 3, weightKg: 70, durationMinutes: -30 })).toBe(0);
  });

  it("NaNの場合は0を返す", () => {
    expect(calculateCalories({ metValue: NaN, weightKg: 70, durationMinutes: 30 })).toBe(0);
  });

  it("Infinityの場合は0を返す", () => {
    expect(calculateCalories({ metValue: Infinity, weightKg: 70, durationMinutes: 30 })).toBe(0);
  });
});
