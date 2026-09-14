// tests/unit/duration-estimate.test.ts
import { describe, it, expect } from "vitest";
import {
  estimateDurationMinutesForStrength,
  ESTIMATED_SECONDS_PER_REP,
  ESTIMATED_REST_SECONDS_BETWEEN_SETS,
} from "@/lib/calorie";

describe("estimateDurationMinutesForStrength", () => {
  it("正常系: 3セット×10レップ → 3.5分（(3*10*3 + 2*60)/60 = 3.5）", () => {
    expect(estimateDurationMinutesForStrength(3, 10)).toBe(3.5);
  });

  it("正常系: 5セット×10レップ → 6.5分", () => {
    expect(estimateDurationMinutesForStrength(5, 10)).toBe(6.5);
  });

  it("境界値: セット数1の場合、休憩は加算されない（0.5分 = 10レップ×3秒/60）", () => {
    expect(estimateDurationMinutesForStrength(1, 10)).toBe(0.5);
  });

  it("定数確認: ESTIMATED_SECONDS_PER_REPは3秒である", () => {
    expect(ESTIMATED_SECONDS_PER_REP).toBe(3);
  });

  it("定数確認: ESTIMATED_REST_SECONDS_BETWEEN_SETSは60秒である", () => {
    expect(ESTIMATED_REST_SECONDS_BETWEEN_SETS).toBe(60);
  });

  it("境界値: 上限相当（50セット×200レップ）でも例外を起こさず有限の正の数値を返す", () => {
    const result = estimateDurationMinutesForStrength(50, 200);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThan(0);
  });

  it("異常系(防御的): setCount=0の場合は0を返す", () => {
    expect(estimateDurationMinutesForStrength(0, 10)).toBe(0);
  });

  it("異常系(防御的): repsPerSet=0の場合は0を返す", () => {
    expect(estimateDurationMinutesForStrength(3, 0)).toBe(0);
  });

  it("異常系(防御的): 負数の場合は0を返す", () => {
    expect(estimateDurationMinutesForStrength(-3, 10)).toBe(0);
    expect(estimateDurationMinutesForStrength(3, -10)).toBe(0);
  });

  it("異常系(防御的): 非整数の場合は0を返す", () => {
    expect(estimateDurationMinutesForStrength(3.5, 10)).toBe(0);
    expect(estimateDurationMinutesForStrength(3, 10.5)).toBe(0);
  });

  it("異常系(防御的): NaNの場合は0を返す", () => {
    expect(estimateDurationMinutesForStrength(NaN, 10)).toBe(0);
    expect(estimateDurationMinutesForStrength(3, NaN)).toBe(0);
  });

  it("異常系(防御的): Infinityの場合は0を返す", () => {
    expect(estimateDurationMinutesForStrength(Infinity, 10)).toBe(0);
    expect(estimateDurationMinutesForStrength(3, Infinity)).toBe(0);
  });
});
