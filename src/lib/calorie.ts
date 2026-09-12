// src/lib/calorie.ts

/** 厚生労働省の実務基準に基づく補正係数。将来変更する場合はここのみ変更する。 */
export const CALORIE_CORRECTION_FACTOR = 1.05;

export interface CalorieCalcInput {
  metValue: number;       // > 0
  weightKg: number;       // > 0
  durationMinutes: number; // > 0
}

/**
 * kcal = MET × 体重(kg) × 時間(h) × CALORIE_CORRECTION_FACTOR
 * 入力値が不正（0以下、NaN、Infinity）な場合は 0 を返す（呼び出し側は事前にZodで検証済みである前提だが、防御的に実装する）。
 * 戻り値は小数第1位に四捨五入する。
 */
export function calculateCalories(input: CalorieCalcInput): number {
  const { metValue, weightKg, durationMinutes } = input;
  if (
    !Number.isFinite(metValue) || metValue <= 0 ||
    !Number.isFinite(weightKg) || weightKg <= 0 ||
    !Number.isFinite(durationMinutes) || durationMinutes <= 0
  ) {
    return 0;
  }
  const hours = durationMinutes / 60;
  const raw = metValue * weightKg * hours * CALORIE_CORRECTION_FACTOR;
  return Math.round(raw * 10) / 10;
}

/**
 * セット数×1セットあたり想定秒数から運動時間(分)を逆算する任意の補助関数。
 * 必須機能ではない（FR-15）。UIの「時間を自動入力」ボタン用。
 */
export function estimateDurationMinutes(setCount: number, secondsPerSet: number): number {
  if (!Number.isFinite(setCount) || setCount <= 0) return 0;
  if (!Number.isFinite(secondsPerSet) || secondsPerSet <= 0) return 0;
  return Math.round(((setCount * secondsPerSet) / 60) * 10) / 10;
}
