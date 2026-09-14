// src/types/index.ts

export const MUSCLE_GROUPS = [
  "CHEST", "BACK", "LEGS", "SHOULDERS", "ARMS", "ABS", "FULL_BODY", "CARDIO",
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  CHEST: "胸", BACK: "背中", LEGS: "脚", SHOULDERS: "肩",
  ARMS: "腕", ABS: "腹", FULL_BODY: "全身", CARDIO: "有酸素",
};

/**
 * muscleGroupが有酸素系（CARDIO）かどうかを判定する。
 * 有酸素/筋トレの判定はこの関数（＝muscleGroup === "CARDIO"）に一元化し、
 * UI（運動時間欄の要否切替）・Server Action（運動時間の必須チェック/推定切替）・
 * 記録表示（推定値ラベルの要否）のすべてが本関数を参照する（判定ロジックの二重実装を避ける）。
 */
export function isCardioMuscleGroup(muscleGroup: MuscleGroup): boolean {
  return muscleGroup === "CARDIO";
}

export const WEIGHT_UNITS = ["KG", "LB"] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

export const WEIGHT_UNIT_LABELS: Record<WeightUnit, string> = {
  KG: "kg", LB: "lb",
};

export interface ExerciseDTO {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  metValue: number;
  description: string | null;
  isCustom: boolean;
  createdByUserId: string | null;
}

export interface WorkoutLogDTO {
  id: string;
  exerciseId: string;
  exerciseName: string;
  /** 記録した種目のmuscleGroup。運動時間(durationMinutes)が「ユーザー入力値」か
   *  「サーバー推定値」かを表示側で判別するために使う
   *  （isCardioMuscleGroup(muscleGroup) === falseの記録は、durationMinutesが常に
   *  estimateDurationMinutesForStrength()によるサーバー推定値であることを意味する）。
   *  区別用の新規DB列は追加せず、Exercise.muscleGroupをServer Actionで都度参照して詰めている。 */
  muscleGroup: MuscleGroup;
  setCount: number;
  repsPerSet: number;
  durationMinutes: number;
  weightValue: number | null;
  weightUnit: WeightUnit | null;
  metValueSnapshot: number;
  caloriesBurned: number;
  /** トレーニングボリューム(kg) = 重さ(kg換算後)×setCount×repsPerSet。
   *  weightValueがnullの場合は0（未入力。UI側で0kgと区別して表示すること）。
   *  DBには保存されず、Server Action呼び出しの都度サーバー側で計算される。 */
  volumeKg: number;
}

export interface WorkoutSessionSummaryDTO {
  id: string;
  performedAt: string; // ISO date string
  memo: string | null;
  logCount: number;
  totalCalories: number;
}

export interface WorkoutSessionDetailDTO extends WorkoutSessionSummaryDTO {
  logs: WorkoutLogDTO[];
}

export interface WeightLogDTO {
  id: string;
  weightKg: number;
  recordedAt: string;
}

export interface DashboardStatsDTO {
  periodDays: number;
  totalCalories: number;
  sessionCount: number;
  logCount: number;
  from: string;
  to: string;
}

/** Server Actionの共通戻り値型 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };
