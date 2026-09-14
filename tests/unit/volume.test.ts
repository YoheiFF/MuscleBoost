// tests/unit/volume.test.ts
import { describe, it, expect } from "vitest";
import { calculateVolumeKg, LB_TO_KG_FACTOR } from "@/lib/volume";

describe("calculateVolumeKg", () => {
  it("正常系(KG): 80kg×3セット×10レップ = 2400kg", () => {
    expect(
      calculateVolumeKg({ setCount: 3, repsPerSet: 10, weightValue: 80, weightUnit: "KG" })
    ).toBe(2400);
  });

  it("正常系(LB): 100lb×3セット×10レップ → kg換算後に算出される", () => {
    // 100 × 0.45359237 = 45.359237kg → ×3×10 = 1360.77711 → 小数第1位丸め = 1360.8
    expect(
      calculateVolumeKg({ setCount: 3, repsPerSet: 10, weightValue: 100, weightUnit: "LB" })
    ).toBe(1360.8);
  });

  it("換算係数はLB_TO_KG_FACTOR(0.45359237)である", () => {
    expect(LB_TO_KG_FACTOR).toBe(0.45359237);
  });

  it("weightValueがnullの場合は0を返す(重さ未入力)", () => {
    expect(
      calculateVolumeKg({ setCount: 3, repsPerSet: 10, weightValue: null, weightUnit: null })
    ).toBe(0);
  });

  it("weightUnitがnullの場合(weightValueのみnullでない不整合入力)も0を返す", () => {
    expect(
      calculateVolumeKg({ setCount: 3, repsPerSet: 10, weightValue: 80, weightUnit: null })
    ).toBe(0);
  });

  it("setCount=0の場合は0を返す", () => {
    expect(
      calculateVolumeKg({ setCount: 0, repsPerSet: 10, weightValue: 80, weightUnit: "KG" })
    ).toBe(0);
  });

  it("repsPerSet=0の場合は0を返す", () => {
    expect(
      calculateVolumeKg({ setCount: 3, repsPerSet: 0, weightValue: 80, weightUnit: "KG" })
    ).toBe(0);
  });

  it("weightValue=0の場合は0を返す", () => {
    expect(
      calculateVolumeKg({ setCount: 3, repsPerSet: 10, weightValue: 0, weightUnit: "KG" })
    ).toBe(0);
  });

  it("負数の場合は0を返す", () => {
    expect(calculateVolumeKg({ setCount: -3, repsPerSet: 10, weightValue: 80, weightUnit: "KG" })).toBe(0);
    expect(calculateVolumeKg({ setCount: 3, repsPerSet: -10, weightValue: 80, weightUnit: "KG" })).toBe(0);
    expect(calculateVolumeKg({ setCount: 3, repsPerSet: 10, weightValue: -80, weightUnit: "KG" })).toBe(0);
  });

  it("NaNの場合は0を返す", () => {
    expect(calculateVolumeKg({ setCount: NaN, repsPerSet: 10, weightValue: 80, weightUnit: "KG" })).toBe(0);
    expect(calculateVolumeKg({ setCount: 3, repsPerSet: 10, weightValue: NaN, weightUnit: "KG" })).toBe(0);
  });

  it("Infinityの場合は0を返す", () => {
    expect(calculateVolumeKg({ setCount: Infinity, repsPerSet: 10, weightValue: 80, weightUnit: "KG" })).toBe(0);
    expect(calculateVolumeKg({ setCount: 3, repsPerSet: 10, weightValue: Infinity, weightUnit: "KG" })).toBe(0);
  });

  it("非常に大きい値でも例外を起こさず有限の数値を返す", () => {
    const result = calculateVolumeKg({ setCount: 50, repsPerSet: 200, weightValue: 1000, weightUnit: "KG" });
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThan(0);
  });
});
