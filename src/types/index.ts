// src/types/index.ts

export const MUSCLE_GROUPS = [
  "CHEST", "BACK", "LEGS", "SHOULDERS", "ARMS", "ABS", "FULL_BODY", "CARDIO",
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const INTENSITY_CATEGORIES = [
  "LIGHT", "MODERATE", "VIGOROUS", "HIGH_INTENSITY",
] as const;
export type IntensityCategory = (typeof INTENSITY_CATEGORIES)[number];

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  CHEST: "胸", BACK: "背中", LEGS: "脚", SHOULDERS: "肩",
  ARMS: "腕", ABS: "腹", FULL_BODY: "全身", CARDIO: "有酸素",
};

export const INTENSITY_LABELS: Record<IntensityCategory, string> = {
  LIGHT: "軽度", MODERATE: "中等度", VIGOROUS: "高強度", HIGH_INTENSITY: "最高強度",
};

export interface ExerciseDTO {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  intensityCategory: IntensityCategory;
  metValue: number;
  description: string | null;
  isCustom: boolean;
  createdByUserId: string | null;
}

export interface WorkoutLogDTO {
  id: string;
  exerciseId: string;
  exerciseName: string;
  setCount: number;
  repsPerSet: number;
  durationMinutes: number;
  bodyWeightKgOverride: number | null;
  metValueSnapshot: number;
  caloriesBurned: number;
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
