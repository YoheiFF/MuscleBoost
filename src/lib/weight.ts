// src/lib/weight.ts
export const DEFAULT_WEIGHT_REQUIRED_ERROR =
  "体重が未設定です。プロフィールでデフォルト体重を設定してから記録してください。";

export type WeightResolutionResult =
  | { ok: true; weightKg: number }
  | { ok: false; error: string };

/**
 * カロリー計算に使う体重(kg)を解決する。
 * プロフィールのデフォルト体重(User.defaultWeightKg)が未設定(null/undefined)の場合はエラーを返す。
 * 記録側での体重上書きは廃止されたため、このプロジェクト以降は本関数が体重解決の唯一の経路となる。
 */
export function resolveWeightKgForCalorie(
  defaultWeightKg: number | null | undefined
): WeightResolutionResult {
  if (defaultWeightKg === null || defaultWeightKg === undefined) {
    return { ok: false, error: DEFAULT_WEIGHT_REQUIRED_ERROR };
  }
  return { ok: true, weightKg: defaultWeightKg };
}
