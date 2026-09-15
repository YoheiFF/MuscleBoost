// src/types/index.ts

export const MUSCLE_GROUPS = [
  "CHEST", "BACK", "LEGS", "SHOULDERS", "ARMS", "ABS", "FULL_BODY", "CARDIO",
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  CHEST: "胸", BACK: "背中", LEGS: "脚", SHOULDERS: "肩",
  ARMS: "腕", ABS: "腹", FULL_BODY: "全身", CARDIO: "有酸素",
};

/** 部位別バランスチャート（ドーナツ）用の固定配色。Rechartsはfill propに実際の色値（hex）を
 *  要求するため、Tailwindクラス名ではなくhex値で定義する。8部位それぞれ視認性の高い色相を
 *  1つずつ割り当てる（Tailwindの-500系相当）。将来ダークモード対応する場合もこの1箇所を
 *  見直せばよい。 */
export const MUSCLE_GROUP_CHART_COLORS: Record<MuscleGroup, string> = {
  CHEST: "#f97316",     // orange-500
  BACK: "#3b82f6",      // blue-500
  LEGS: "#22c55e",      // green-500
  SHOULDERS: "#a855f7", // purple-500
  ARMS: "#ef4444",      // red-500
  ABS: "#eab308",       // yellow-500
  FULL_BODY: "#14b8a6", // teal-500
  CARDIO: "#ec4899",    // pink-500
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

/** カレンダーヒートマップの1日分のセル情報 */
export interface HeatmapDayDTO {
  date: string; // "YYYY-MM-DD"（JST暦日）
  sessionCount: number;
  logCount: number;
  totalCalories: number;
  level: 0 | 1 | 2 | 3; // 0=記録なし, 1=1-2件, 2=3-5件, 3=6件以上
}

/** カレンダーヒートマップ全体（直近371日分）＋ストリーク情報 */
export interface WorkoutHeatmapDTO {
  days: HeatmapDayDTO[]; // 古い→新しいの順、直近371日分
  currentStreak: number; // 現在の連続日数（今日未記録でも前日までの連続を維持）
  longestStreak: number; // 全期間の最長連続日数
  totalActiveDays: number; // 直近371日中、記録がある日数
}

/** 推移トレンドグラフの1バケット（1週間 or 1ヶ月）分のデータ */
export interface TrendPointDTO {
  periodKey: string; // 週別: 週開始日"YYYY-MM-DD" / 月別: "YYYY-MM"
  label: string; // 表示用ラベル 例: "9/8週" / "2026年9月"
  periodStart: string; // ISO日時文字列（バケット開始時刻、UTC）
  totalCalories: number;
  totalVolumeKg: number;
  sessionCount: number;
}

/** 推移トレンドグラフ全体（週別・月別を両方含む。クライアント側でトグル切替する） */
export interface TrendSeriesDTO {
  weekly: TrendPointDTO[]; // 直近12週分、古い→新しい
  monthly: TrendPointDTO[]; // 直近6ヶ月分、古い→新しい
}

/** 部位別トレーニングバランスの1部位分のデータ（記録が0件の部位は配列に含まれない） */
export interface MuscleGroupBalanceDTO {
  muscleGroup: MuscleGroup;
  label: string; // MUSCLE_GROUP_LABELSの値
  logCount: number;
  volumeKg: number;
  logCountRatio: number; // 0〜1。全muscleGroup合計に対する割合
  volumeRatio: number; // 0〜1
}

/** 種目ごとの自己ベスト情報。重量・ボリュームのいずれもデータが無い種目（有酸素専用・
 *  自重のみ等）はそもそも配列に含まれない。 */
export interface PersonalBestDTO {
  exerciseId: string;
  exerciseName: string;
  muscleGroup: MuscleGroup;
  maxWeightKg: number | null; // kg換算後の最大重量。未記録ならnull
  maxWeightAchievedAt: string | null; // ISO日時（達成したWorkoutSessionのperformedAt）
  maxVolumeKg: number | null; // 最大ボリューム(kg)。未記録ならnull
  maxVolumeAchievedAt: string | null;
  isRecentWeightPb: boolean; // 直近7日以内（当日含む）に更新されたか
  isRecentVolumePb: boolean;
}

/** 達成バッジ1件分のデータ */
export interface AchievementBadgeDTO {
  id: string; // 例: "streak-7", "sessions-100"
  category: "streak" | "sessionCount";
  label: string; // 例: "7日連続達成"
  threshold: number;
  achieved: boolean;
  achievedValue: number; // 比較に使った現在値（streak系はlongestStreak、sessionCount系は累計セッション数）
}

/** 達成バッジ一覧全体 */
export interface AchievementBadgesDTO {
  streakBadges: AchievementBadgeDTO[];
  sessionCountBadges: AchievementBadgeDTO[];
  totalSessionCount: number;
  currentStreak: number;
  longestStreak: number;
}

/** 実績画面（/workouts）の新規4要素分をまとめたトップレベルDTO。getAchievementsData()の戻り値。 */
export interface AchievementsDataDTO {
  heatmap: WorkoutHeatmapDTO;
  trend: TrendSeriesDTO;
  muscleBalance: MuscleGroupBalanceDTO[];
  personalBests: PersonalBestDTO[];
  badges: AchievementBadgesDTO;
}

/** Server Actionの共通戻り値型 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };
