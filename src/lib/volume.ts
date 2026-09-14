// src/lib/volume.ts
import type { WeightUnit } from "@/types";

/** 1lb = 0.45359237kg（国際ポンド定義値）。ボリューム集計はKG基準に統一するため、
 *  LB入力分はこの係数で換算してから合算する。将来変更する場合はここのみ変更する。 */
export const LB_TO_KG_FACTOR = 0.45359237;

export interface VolumeCalcInput {
  setCount: number;              // セット数。1以上の整数を想定（呼び出し側はZodで検証済み）
  repsPerSet: number;            // 1セットあたりレップ数。1以上の整数を想定
  weightValue: number | null;    // 未入力の場合はnull
  weightUnit: WeightUnit | null; // weightValueとペア。weightValueがnullならweightUnitもnullの前提
}

/**
 * 1記録分のトレーニングボリューム(kg)を算出する純粋関数。
 * ボリューム = 重さ(kg換算後) × setCount × repsPerSet
 *
 * 処理ロジック:
 * 1. setCount, repsPerSetが不正（NaN, Infinity, 0以下）な場合は 0 を返す（防御的処理。
 *    通常はZodのpositive/int制約により発生しないが、calculateCaloriesと同じ防御方針を踏襲する）。
 * 2. weightValueがnull、またはweightUnitがnullの場合は 0 を返す（＝重さ未入力の記録は
 *    ボリューム計算対象外。呼び出し側UIはこの0を「未入力」として区別して表示すること）。
 * 3. weightValueが不正（NaN, Infinity, 0以下）な場合も 0 を返す。
 * 4. weightUnitが"LB"の場合、weightValue × LB_TO_KG_FACTOR でkgに換算する。
 *    "KG"の場合はweightValueをそのまま使う。
 * 5. weightKg × setCount × repsPerSet を計算し、小数第1位に四捨五入して返す
 *    （calculateCaloriesと同じ丸め規則: Math.round(x * 10) / 10）。
 */
export function calculateVolumeKg(input: VolumeCalcInput): number {
  const { setCount, repsPerSet, weightValue, weightUnit } = input;

  if (!Number.isFinite(setCount) || setCount <= 0) return 0;
  if (!Number.isFinite(repsPerSet) || repsPerSet <= 0) return 0;
  if (weightValue === null || weightUnit === null) return 0;
  if (!Number.isFinite(weightValue) || weightValue <= 0) return 0;

  const weightKg = weightUnit === "LB" ? weightValue * LB_TO_KG_FACTOR : weightValue;
  const raw = weightKg * setCount * repsPerSet;
  return Math.round(raw * 10) / 10;
}
