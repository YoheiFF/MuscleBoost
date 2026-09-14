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
 * 筋トレ系種目（muscleGroup !== "CARDIO"）の運動時間を内部推定するための想定値。
 *
 * 【重要】厚生労働省等が本用途（1repあたりの所要秒数・セット間休憩秒数）向けに定めた
 * 公式な一次情報は存在しない（確認済み。厚労省メッツ表はMET値の出典であり、この秒数の
 * 出典ではない）。以下は NSCA/ACSM 等で一般的に紹介される「8〜15レップのハイパートロフィー
 * 領域」のトレーニング指導目安を参考にした【暫定的な想定値】であり、公式基準ではない。
 * 将来より精緻な値へ更新する場合は、この2定数のみを変更すればよい。
 */
/** 1repあたりの想定秒数（コンセントリック+エキセントリック動作の一般的な目安テンポ）。 */
export const ESTIMATED_SECONDS_PER_REP = 3;
/** セット間休憩の想定秒数（8〜15レップ帯のハイパートロフィートレーニングにおける一般的な休憩目安）。 */
export const ESTIMATED_REST_SECONDS_BETWEEN_SETS = 60;

/**
 * 筋トレ系種目の運動時間(分)を、セット数・レップ数から内部推定する純粋関数。
 * 有酸素系（CARDIO）には使用しない（有酸素系は引き続きユーザー入力の運動時間を必須とする。
 * 判定は src/types/index.ts の isCardioMuscleGroup() を参照）。
 *
 * 推定式:
 *   推定秒数 = setCount × repsPerSet × ESTIMATED_SECONDS_PER_REP
 *            + (setCount - 1) × ESTIMATED_REST_SECONDS_BETWEEN_SETS
 *   推定分数 = 推定秒数 / 60
 * 境界条件: 最終セット後の休憩は含めない（休憩回数は「セット数-1」回。setCount=1のとき休憩は0秒）。
 *
 * 処理ロジック:
 * 1. setCount, repsPerSetが不正（NaN, Infinity, 0以下, 非整数）な場合は 0 を返す
 *    （防御的処理。呼び出し側はZodのint().positive()で検証済みの値を渡す前提だが、
 *    calculateCalories/calculateVolumeKgと同じ防御方針を踏襲する）。
 * 2. 上記の推定式で秒数を計算し、60で割って分に変換する。
 * 3. 小数第1位に四捨五入して返す（calculateCalories/calculateVolumeKgと同じ丸め規則:
 *    Math.round(x * 10) / 10）。
 */
export function estimateDurationMinutesForStrength(setCount: number, repsPerSet: number): number {
  if (!Number.isFinite(setCount) || setCount <= 0 || !Number.isInteger(setCount)) return 0;
  if (!Number.isFinite(repsPerSet) || repsPerSet <= 0 || !Number.isInteger(repsPerSet)) return 0;

  const estimatedSeconds =
    setCount * repsPerSet * ESTIMATED_SECONDS_PER_REP +
    (setCount - 1) * ESTIMATED_REST_SECONDS_BETWEEN_SETS;
  const estimatedMinutes = estimatedSeconds / 60;
  return Math.round(estimatedMinutes * 10) / 10;
}
