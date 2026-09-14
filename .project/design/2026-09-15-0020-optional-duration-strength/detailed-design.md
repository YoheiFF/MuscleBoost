---
project_id: "2026-09-15-0020-optional-duration-strength"
phase: design
document: detailed-design
created: "2026-09-15"
---

# 詳細設計書: 運動時間の任意化（有酸素系は必須維持・筋トレ系は固定想定値で算出）

## 0. 概要
有酸素系種目（`Exercise.muscleGroup === "CARDIO"`）は引き続き運動時間（分）の入力を必須とする。それ以外（筋トレ系）の種目は運動時間の入力欄自体を表示せず、ユーザーが既に入力済みの「セット数」「レップ数」から、固定の想定値（1repあたりの想定秒数・セット間休憩の想定秒数）を用いて運動時間を内部推定し、既存の消費カロリー計算式（`kcal = MET × 体重 × 時間 × 1.05`、`calculateCalories()`）へそのまま投入する。

判定は`exercise.muscleGroup === "CARDIO"`の1条件のみで行い、`src/types/index.ts`に新設する`isCardioMuscleGroup()`にロジックを一元化してUI・Server Actionの両方から参照する。運動時間の推定は新規純粋関数`estimateDurationMinutesForStrength(setCount, repsPerSet)`（`src/lib/calorie.ts`）で行う。バリデーションは`workoutLogInputSchema.durationMinutes`を`optional()`化した上で、Server Action側（`exercise`取得後）でCARDIOの必須チェックを追加する方式（候補A）を採用する。`WorkoutLog.durationMinutes`列（`Float` NOT NULL）は無変更のまま、筋トレ系は推定値をそのまま保存する。DBに実測/推定の区別フラグ列は追加せず、`WorkoutLogDTO`に追加する`muscleGroup`から表示側で導出する。`src/lib/volume.ts`（トレーニングボリューム機能）には一切影響しない。

## 1. 影響範囲（編集／新規ファイル一覧）

| ファイル | 区分 | 概要 |
|---|---|---|
| `src/lib/calorie.ts` | 変更 | 想定値定数2つ・推定関数`estimateDurationMinutesForStrength`を追加。既存export（`CALORIE_CORRECTION_FACTOR`, `CalorieCalcInput`, `calculateCalories`）は無変更 |
| `src/types/index.ts` | 変更 | `isCardioMuscleGroup()`を追加。`WorkoutLogDTO`に`muscleGroup: MuscleGroup`を追加 |
| `src/lib/validation.ts` | 変更 | `workoutLogInputSchema.durationMinutes`を`.optional()`化 |
| `src/app/actions/workouts.ts` | 変更 | `addWorkoutLog`/`updateWorkoutLog`にCARDIO必須チェック＋非CARDIO推定ロジックを追加。`getWorkoutSession`のDTO構築に`muscleGroup`を追加 |
| `src/components/WorkoutLogForm.tsx` | 変更 | 選択中種目に応じて運動時間欄の表示/非表示を切替。非表示時は`durationMinutes: undefined`を送信 |
| `src/components/WorkoutSessionLogs.tsx` | 変更 | 編集モーダルで同様の表示切替。`editFieldErrors`状態を新設 |
| `src/components/WorkoutLogItem.tsx` | 変更 | 非CARDIO記録の運動時間表示に「（推定値）」を付与 |
| `tests/unit/duration-estimate.test.ts` | **新規** | `estimateDurationMinutesForStrength`の単体テスト |
| `tests/unit/muscle-group.test.ts` | **新規** | `isCardioMuscleGroup`の単体テスト |
| `tests/unit/validation.test.ts` | **新規** | `workoutLogInputSchema`の`durationMinutes`任意化に関する単体テスト |
| `tests/e2e/workout-flow.spec.ts` | 変更 | 既存5シナリオの更新＋新規2シナリオ追加（6章参照） |
| `src/lib/volume.ts` | **変更しない** | `durationMinutes`を一切使用しないため無影響（基本設計書6章参照） |
| `src/components/ExercisePicker.tsx` | **変更しない** | 種目選択UI自体は変更不要（`muscleGroup`は既に選択肢ラベルに表示済み） |
| `prisma/schema.prisma`, `prisma/migrations/`, `prisma/seed.ts` | **変更しない** | マイグレーション不要（区別フラグ列も追加しない） |
| `tests/unit/calorie.test.ts`, `tests/unit/volume.test.ts`, `tests/unit/weight.test.ts` | **変更しない** | 対象関数のシグネチャに変更がないため無回帰 |

## 2. ファイル別変更詳細

### 2.1 `src/lib/calorie.ts`（変更）

#### 編集前（全文）
```ts
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
```

#### 編集後の期待形（全文。既存部分は無変更、末尾に追記）
```ts
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
```

#### 関数シグネチャ（確定）
```ts
export const ESTIMATED_SECONDS_PER_REP: number; // 3
export const ESTIMATED_REST_SECONDS_BETWEEN_SETS: number; // 60
export function estimateDurationMinutesForStrength(setCount: number, repsPerSet: number): number;
```
`calculateCalories`, `CalorieCalcInput`, `CALORIE_CORRECTION_FACTOR`は無変更（差分なし）。

---

### 2.2 `src/types/index.ts`（変更）

#### 編集前の関連箇所（3〜11行目、20〜45行目）
```ts
export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  CHEST: "胸", BACK: "背中", LEGS: "脚", SHOULDERS: "肩",
  ARMS: "腕", ABS: "腹", FULL_BODY: "全身", CARDIO: "有酸素",
};
```
```ts
export interface WorkoutLogDTO {
  id: string;
  exerciseId: string;
  exerciseName: string;
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
```

#### 編集後の期待形
```ts
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
```
```ts
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
```
`MUSCLE_GROUPS`, `MuscleGroup`, `WEIGHT_UNITS`, `WeightUnit`, `WEIGHT_UNIT_LABELS`, `ExerciseDTO`, その他のDTO・`ActionResult`は無変更。

#### 関数シグネチャ（確定）
```ts
export function isCardioMuscleGroup(muscleGroup: MuscleGroup): boolean;
```

---

### 2.3 `src/lib/validation.ts`（変更）

#### 編集前の関連箇所（28〜56行目）
```ts
export const workoutLogInputSchema = z
  .object({
    exerciseId: z.string().min(1),
    setCount: z.number().int().positive("セット数は1以上の整数で入力してください").max(50),
    repsPerSet: z.number().int().positive("レップ数は1以上の整数で入力してください").max(200),
    durationMinutes: z.number().positive("運動時間は0より大きい値を入力してください").max(600),
    weightValue: z
      .number()
      .positive("重さは0より大きい値を入力してください")
      .max(1000, "重さは1000以下で入力してください")
      .optional(),
    weightUnit: z.enum(WEIGHT_UNITS).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.weightValue !== undefined && data.weightUnit === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weightUnit"],
        message: "重さの単位を選択してください",
      });
    }
    if (data.weightValue === undefined && data.weightUnit !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weightValue"],
        message: "重さの値を入力してください",
      });
    }
  });
```

#### 編集後の期待形（`durationMinutes`の行のみ変更。それ以外は無変更）
```ts
export const workoutLogInputSchema = z
  .object({
    exerciseId: z.string().min(1),
    setCount: z.number().int().positive("セット数は1以上の整数で入力してください").max(50),
    repsPerSet: z.number().int().positive("レップ数は1以上の整数で入力してください").max(200),
    durationMinutes: z
      .number()
      .positive("運動時間は0より大きい値を入力してください")
      .max(600)
      .optional(),
    weightValue: z
      .number()
      .positive("重さは0より大きい値を入力してください")
      .max(1000, "重さは1000以下で入力してください")
      .optional(),
    weightUnit: z.enum(WEIGHT_UNITS).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.weightValue !== undefined && data.weightUnit === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weightUnit"],
        message: "重さの単位を選択してください",
      });
    }
    if (data.weightValue === undefined && data.weightUnit !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weightValue"],
        message: "重さの値を入力してください",
      });
    }
  });
```
**重要**: `muscleGroup`に応じた必須/任意の切替は、このZodスキーマ内には実装しない（`muscleGroup`はこのスキーマの入力に含まれない）。CARDIOの必須チェックは2.4節のServer Action側で行う。`registerSchema`, `loginSchema`, `exerciseInputSchema`, `workoutSessionInputSchema`, `profileUpdateSchema`, `weightLogInputSchema`は無変更。

---

### 2.4 `src/app/actions/workouts.ts`（変更）

#### 2.4.1 import文の変更

編集前（1〜14行目）:
```ts
import { prisma } from "@/lib/prisma";
import { getCurrentUserOrThrow } from "@/lib/session-guard";
import { calculateCalories } from "@/lib/calorie";
import { calculateVolumeKg } from "@/lib/volume";
import { resolveWeightKgForCalorie } from "@/lib/weight";
import { getPeriodRange } from "@/lib/date";
import { workoutSessionInputSchema, workoutLogInputSchema } from "@/lib/validation";
import type {
  ActionResult, WorkoutSessionSummaryDTO, WorkoutSessionDetailDTO,
  WorkoutLogDTO, DashboardStatsDTO, WeightUnit,
} from "@/types";
```

編集後（`estimateDurationMinutesForStrength`と`isCardioMuscleGroup`, `MuscleGroup`を追加）:
```ts
import { prisma } from "@/lib/prisma";
import { getCurrentUserOrThrow } from "@/lib/session-guard";
import { calculateCalories, estimateDurationMinutesForStrength } from "@/lib/calorie";
import { calculateVolumeKg } from "@/lib/volume";
import { resolveWeightKgForCalorie } from "@/lib/weight";
import { getPeriodRange } from "@/lib/date";
import { workoutSessionInputSchema, workoutLogInputSchema } from "@/lib/validation";
import { isCardioMuscleGroup } from "@/types";
import type {
  ActionResult, WorkoutSessionSummaryDTO, WorkoutSessionDetailDTO,
  WorkoutLogDTO, DashboardStatsDTO, WeightUnit, MuscleGroup,
} from "@/types";
```

#### 2.4.2 `addWorkoutLog`関数（全文差し替え）

編集前は既存コード（29〜99行目）の通り。編集後の期待形（全文）:
```ts
/** ワークアウトログ追加。カロリーはここで計算し保存する（アプリ内で唯一のカロリー計算箇所）。 */
export async function addWorkoutLog(sessionId: string, input: unknown): Promise<ActionResult<{ log: WorkoutLogDTO }>> {
  const user = await getCurrentUserOrThrow();

  const session = await prisma.workoutSession.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== user.id) {
    return { ok: false, error: "対象のセッションが見つかりません" };
  }

  const parsed = workoutLogInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力内容を確認してください", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;

  const exercise = await prisma.exercise.findUnique({ where: { id: data.exerciseId } });
  if (!exercise) {
    return { ok: false, error: "対象のマシンが見つかりません" };
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  const weightResolution = resolveWeightKgForCalorie(dbUser?.defaultWeightKg);
  if (!weightResolution.ok) {
    return { ok: false, error: weightResolution.error };
  }
  const weightKg = weightResolution.weightKg;

  const muscleGroup = exercise.muscleGroup as MuscleGroup;
  let durationMinutes: number;
  if (isCardioMuscleGroup(muscleGroup)) {
    // 有酸素系: 運動時間は引き続き必須。Zodではoptional化しているため、ここで明示的に検証する。
    if (data.durationMinutes === undefined) {
      return {
        ok: false,
        error: "入力内容を確認してください",
        fieldErrors: { durationMinutes: ["有酸素系のマシンでは運動時間の入力が必須です"] },
      };
    }
    durationMinutes = data.durationMinutes;
  } else {
    // 筋トレ系: クライアントからdurationMinutesが送られてきても無視し、
    // 常にサーバー側でセット数・レップ数から推定する（改ざん・実装漏れへの防御）。
    durationMinutes = estimateDurationMinutesForStrength(data.setCount, data.repsPerSet);
  }

  const caloriesBurned = calculateCalories({
    metValue: exercise.metValue,
    weightKg,
    durationMinutes,
  });
  const volumeKg = calculateVolumeKg({
    setCount: data.setCount,
    repsPerSet: data.repsPerSet,
    weightValue: data.weightValue ?? null,
    weightUnit: data.weightUnit ?? null,
  });

  const log = await prisma.workoutLog.create({
    data: {
      workoutSessionId: sessionId,
      exerciseId: data.exerciseId,
      setCount: data.setCount,
      repsPerSet: data.repsPerSet,
      durationMinutes,
      weightValue: data.weightValue ?? null,
      weightUnit: data.weightUnit ?? null,
      metValueSnapshot: exercise.metValue,
      caloriesBurned,
    },
  });

  return {
    ok: true,
    data: {
      log: {
        id: log.id,
        exerciseId: log.exerciseId,
        exerciseName: exercise.name,
        muscleGroup,
        setCount: log.setCount,
        repsPerSet: log.repsPerSet,
        durationMinutes: log.durationMinutes,
        weightValue: log.weightValue,
        weightUnit: log.weightUnit as WeightUnit | null,
        metValueSnapshot: log.metValueSnapshot,
        caloriesBurned: log.caloriesBurned,
        volumeKg,
      },
    },
  };
}
```
**変更点の要約**: (1) `exercise`取得直後ではなく、`weightKg`解決後・`calculateCalories`呼び出し前に`muscleGroup`判定ブロックを挿入（既存の「必要になる直前で計算する」という既存コードの並び方に合わせる）。(2) `prisma.workoutLog.create`の`data.durationMinutes`と`calculateCalories`への引数を、`data.durationMinutes`（Zodパース結果そのもの）ではなくローカル変数`durationMinutes`（CARDIOなら実測値、非CARDIOなら推定値）に置き換える。(3) 戻り値DTOに`muscleGroup`を追加する。

#### 2.4.3 `updateWorkoutLog`関数（全文差し替え）

編集前は既存コード（102〜179行目）の通り。編集後の期待形（全文）:
```ts
/** ログ更新（体重・時間等を変更した場合、カロリーを再計算する） */
export async function updateWorkoutLog(logId: string, input: unknown): Promise<ActionResult<{ log: WorkoutLogDTO }>> {
  const user = await getCurrentUserOrThrow();

  const existing = await prisma.workoutLog.findUnique({
    where: { id: logId },
    include: { workoutSession: true, exercise: true },
  });
  if (!existing || existing.workoutSession.userId !== user.id) {
    return { ok: false, error: "対象の記録が見つかりません" };
  }

  const parsed = workoutLogInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力内容を確認してください", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  const weightResolution = resolveWeightKgForCalorie(dbUser?.defaultWeightKg);
  if (!weightResolution.ok) {
    return { ok: false, error: weightResolution.error };
  }
  const weightKg = weightResolution.weightKg;

  // MET値はマスタの現在値を使う（マシン変更されていなければスナップショットは既存値のまま維持してもよいが、
  // ここでは編集時点の最新マスタ値で再計算し、metValueSnapshotも更新する: 編集操作は「今の情報で直す」行為とみなす）。
  const exercise = existing.exerciseId === data.exerciseId
    ? existing.exercise
    : await prisma.exercise.findUnique({ where: { id: data.exerciseId } });
  if (!exercise) {
    return { ok: false, error: "対象のマシンが見つかりません" };
  }

  const muscleGroup = exercise.muscleGroup as MuscleGroup;
  let durationMinutes: number;
  if (isCardioMuscleGroup(muscleGroup)) {
    if (data.durationMinutes === undefined) {
      return {
        ok: false,
        error: "入力内容を確認してください",
        fieldErrors: { durationMinutes: ["有酸素系のマシンでは運動時間の入力が必須です"] },
      };
    }
    durationMinutes = data.durationMinutes;
  } else {
    durationMinutes = estimateDurationMinutesForStrength(data.setCount, data.repsPerSet);
  }

  const caloriesBurned = calculateCalories({
    metValue: exercise.metValue,
    weightKg,
    durationMinutes,
  });
  const volumeKg = calculateVolumeKg({
    setCount: data.setCount,
    repsPerSet: data.repsPerSet,
    weightValue: data.weightValue ?? null,
    weightUnit: data.weightUnit ?? null,
  });

  const updated = await prisma.workoutLog.update({
    where: { id: logId },
    data: {
      exerciseId: data.exerciseId,
      setCount: data.setCount,
      repsPerSet: data.repsPerSet,
      durationMinutes,
      weightValue: data.weightValue ?? null,
      weightUnit: data.weightUnit ?? null,
      metValueSnapshot: exercise.metValue,
      caloriesBurned,
    },
  });

  return {
    ok: true,
    data: {
      log: {
        id: updated.id,
        exerciseId: updated.exerciseId,
        exerciseName: exercise.name,
        muscleGroup,
        setCount: updated.setCount,
        repsPerSet: updated.repsPerSet,
        durationMinutes: updated.durationMinutes,
        weightValue: updated.weightValue,
        weightUnit: updated.weightUnit as WeightUnit | null,
        metValueSnapshot: updated.metValueSnapshot,
        caloriesBurned: updated.caloriesBurned,
        volumeKg,
      },
    },
  };
}
```
`addWorkoutLog`と同一パターンの変更（muscleGroup判定ブロックの挿入、`durationMinutes`ローカル変数への置換、戻り値DTOへの`muscleGroup`追加）。

#### 2.4.4 `getWorkoutSession`関数

編集前の関連箇所（228〜245行目）:
```ts
  const logs: WorkoutLogDTO[] = s.logs.map((l) => ({
    id: l.id,
    exerciseId: l.exerciseId,
    exerciseName: l.exercise.name,
    setCount: l.setCount,
    repsPerSet: l.repsPerSet,
    durationMinutes: l.durationMinutes,
    weightValue: l.weightValue,
    weightUnit: l.weightUnit as WeightUnit | null,
    metValueSnapshot: l.metValueSnapshot,
    caloriesBurned: l.caloriesBurned,
    volumeKg: calculateVolumeKg({
      setCount: l.setCount,
      repsPerSet: l.repsPerSet,
      weightValue: l.weightValue,
      weightUnit: l.weightUnit as WeightUnit | null,
    }),
  }));
```

編集後の期待形（`exerciseName`の直後に`muscleGroup`を追加）:
```ts
  const logs: WorkoutLogDTO[] = s.logs.map((l) => ({
    id: l.id,
    exerciseId: l.exerciseId,
    exerciseName: l.exercise.name,
    muscleGroup: l.exercise.muscleGroup as MuscleGroup,
    setCount: l.setCount,
    repsPerSet: l.repsPerSet,
    durationMinutes: l.durationMinutes,
    weightValue: l.weightValue,
    weightUnit: l.weightUnit as WeightUnit | null,
    metValueSnapshot: l.metValueSnapshot,
    caloriesBurned: l.caloriesBurned,
    volumeKg: calculateVolumeKg({
      setCount: l.setCount,
      repsPerSet: l.repsPerSet,
      weightValue: l.weightValue,
      weightUnit: l.weightUnit as WeightUnit | null,
    }),
  }));
```
`s.logs`は`include: { logs: { include: { exercise: true }, ... } }`で既に`exercise`をjoin済みのため、追加のDBアクセスは発生しない。

#### 2.4.5 変更しない関数
`createWorkoutSession`, `deleteWorkoutLog`, `deleteWorkoutSession`, `listWorkoutSessions`, `getDashboardStats`はこのプロジェクトの変更対象外（`WorkoutLogDTO`を構築していない、または`durationMinutes`/`muscleGroup`を扱わないため）。

---

### 2.5 `src/components/WorkoutLogForm.tsx`（変更）

#### 編集前（全文は現況ファイル参照。要点抜粋）
```tsx
import { WEIGHT_UNITS, WEIGHT_UNIT_LABELS, type WeightUnit, type ExerciseDTO, type WorkoutLogDTO } from "@/types";

export default function WorkoutLogForm({
  sessionId,
  exercises,
  defaultWeightKg,
  onCreated,
}: WorkoutLogFormProps) {
  const router = useRouter();
  const [exerciseId, setExerciseId] = useState("");
  const [setCount, setSetCount] = useState("");
  const [repsPerSet, setRepsPerSet] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [weightValue, setWeightValue] = useState("");
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("KG");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const result = await addWorkoutLog(sessionId, {
      exerciseId,
      setCount: Number(setCount),
      repsPerSet: Number(repsPerSet),
      durationMinutes: Number(durationMinutes),
      weightValue: weightValue ? Number(weightValue) : undefined,
      weightUnit: weightValue ? weightUnit : undefined,
    });
    ...
```
```tsx
      <div>
        <label htmlFor="workout-log-duration" className="block text-sm font-medium">運動時間（分）</label>
        <input
          id="workout-log-duration"
          type="number"
          step="0.1"
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(e.target.value)}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
        />
        {fieldErrors.durationMinutes && (
          <p className="text-xs text-red-600">{fieldErrors.durationMinutes[0]}</p>
        )}
      </div>
```

#### 編集後の期待形

import文:
```tsx
import {
  WEIGHT_UNITS, WEIGHT_UNIT_LABELS, isCardioMuscleGroup,
  type WeightUnit, type ExerciseDTO, type WorkoutLogDTO,
} from "@/types";
```

state宣言の直後（`submitting`の次）に判定ロジックを追加:
```tsx
  const [submitting, setSubmitting] = useState(false);

  const selectedExercise = exercises.find((ex) => ex.id === exerciseId) ?? null;
  const requiresDuration = selectedExercise !== null && isCardioMuscleGroup(selectedExercise.muscleGroup);
```

`handleSubmit`内の送信オブジェクト:
```tsx
    const result = await addWorkoutLog(sessionId, {
      exerciseId,
      setCount: Number(setCount),
      repsPerSet: Number(repsPerSet),
      durationMinutes: requiresDuration && durationMinutes !== "" ? Number(durationMinutes) : undefined,
      weightValue: weightValue ? Number(weightValue) : undefined,
      weightUnit: weightValue ? weightUnit : undefined,
    });
```

運動時間欄のJSXブロック（`requiresDuration`がtrueの場合のみ描画。種目未選択時は非表示になる）:
```tsx
      {requiresDuration && (
        <div>
          <label htmlFor="workout-log-duration" className="block text-sm font-medium">
            運動時間（分）<span className="text-red-600">*</span>
          </label>
          <input
            id="workout-log-duration"
            type="number"
            step="0.1"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          />
          {fieldErrors.durationMinutes && (
            <p className="text-xs text-red-600">{fieldErrors.durationMinutes[0]}</p>
          )}
        </div>
      )}
```
他のJSX（マシン選択欄、セット数/レップ数欄、重さ欄、送信ボタン）、`handleSubmit`の成功時のstateリセット処理（`setDurationMinutes("")`含む）は無変更。

#### 処理ロジック（確定）
- `selectedExercise`は`exerciseId`から`exercises`配列を検索して求める（追加のAPI呼び出しなし）。
- `requiresDuration`は「種目が選択されている」かつ「その種目がCARDIO」の場合のみ`true`。種目未選択（`exerciseId === ""`）の場合は常に`false`（欄は表示しない）。
- 送信時、`requiresDuration`が`false`の場合は入力欄の値に関わらず常に`durationMinutes: undefined`を送る（欄が表示されていないため通常`durationMinutes`のローカルstateは空文字のままだが、二重の安全策として明示的に無視する）。

---

### 2.6 `src/components/WorkoutSessionLogs.tsx`（変更）

#### 編集前（全文は現況ファイル参照。要点抜粋）
```tsx
import type { ExerciseDTO, WorkoutLogDTO } from "@/types";

export default function WorkoutSessionLogs({
  sessionId,
  initialLogs,
  exercises,
  defaultWeightKg,
}: WorkoutSessionLogsProps) {
  const [logs, setLogs] = useState<WorkoutLogDTO[]>(initialLogs);
  const [editingLog, setEditingLog] = useState<WorkoutLogDTO | null>(null);
  const [editExerciseId, setEditExerciseId] = useState("");
  const [editSetCount, setEditSetCount] = useState("");
  const [editRepsPerSet, setEditRepsPerSet] = useState("");
  const [editDurationMinutes, setEditDurationMinutes] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  ...
  function startEdit(log: WorkoutLogDTO) {
    setEditingLog(log);
    setEditExerciseId(log.exerciseId);
    setEditSetCount(String(log.setCount));
    setEditRepsPerSet(String(log.repsPerSet));
    setEditDurationMinutes(String(log.durationMinutes));
    setEditError(null);
  }

  async function handleUpdate() {
    if (!editingLog) return;
    setEditSubmitting(true);
    setEditError(null);
    const result = await updateWorkoutLog(editingLog.id, {
      exerciseId: editExerciseId,
      setCount: Number(editSetCount),
      repsPerSet: Number(editRepsPerSet),
      durationMinutes: Number(editDurationMinutes),
    });
    setEditSubmitting(false);
    if (!result.ok) {
      setEditError(result.error);
      return;
    }
    setLogs((prev) => prev.map((l) => (l.id === result.data.log.id ? result.data.log : l)));
    setEditingLog(null);
  }
```
```tsx
              <input
                type="number"
                step="0.1"
                value={editDurationMinutes}
                onChange={(e) => setEditDurationMinutes(e.target.value)}
                placeholder="運動時間（分）"
                className="rounded border border-gray-300 px-3 py-2"
              />
```

#### 編集後の期待形

import文:
```tsx
import { isCardioMuscleGroup, type ExerciseDTO, type WorkoutLogDTO } from "@/types";
```

state宣言と派生値（`editSubmitting`宣言の直後に`editFieldErrors`を追加し、`totalCalories`計算の前に判定ロジックを追加）:
```tsx
  const [editError, setEditError] = useState<string | null>(null);
  const [editFieldErrors, setEditFieldErrors] = useState<Record<string, string[]>>({});
  const [editSubmitting, setEditSubmitting] = useState(false);

  const editExercise = exercises.find((ex) => ex.id === editExerciseId) ?? null;
  const editRequiresDuration = editExercise !== null && isCardioMuscleGroup(editExercise.muscleGroup);
```

`startEdit`関数:
```tsx
  function startEdit(log: WorkoutLogDTO) {
    setEditingLog(log);
    setEditExerciseId(log.exerciseId);
    setEditSetCount(String(log.setCount));
    setEditRepsPerSet(String(log.repsPerSet));
    setEditDurationMinutes(String(log.durationMinutes));
    setEditError(null);
    setEditFieldErrors({});
  }
```

`handleUpdate`関数:
```tsx
  async function handleUpdate() {
    if (!editingLog) return;
    setEditSubmitting(true);
    setEditError(null);
    setEditFieldErrors({});
    const result = await updateWorkoutLog(editingLog.id, {
      exerciseId: editExerciseId,
      setCount: Number(editSetCount),
      repsPerSet: Number(editRepsPerSet),
      durationMinutes: editRequiresDuration && editDurationMinutes !== "" ? Number(editDurationMinutes) : undefined,
    });
    setEditSubmitting(false);
    if (!result.ok) {
      setEditError(result.error);
      setEditFieldErrors(result.fieldErrors ?? {});
      return;
    }
    setLogs((prev) => prev.map((l) => (l.id === result.data.log.id ? result.data.log : l)));
    setEditingLog(null);
  }
```

編集モーダル内の運動時間入力欄:
```tsx
              {editRequiresDuration && (
                <div>
                  <input
                    type="number"
                    step="0.1"
                    value={editDurationMinutes}
                    onChange={(e) => setEditDurationMinutes(e.target.value)}
                    placeholder="運動時間（分）"
                    className="w-full rounded border border-gray-300 px-3 py-2"
                  />
                  {editFieldErrors.durationMinutes && (
                    <p className="text-xs text-red-600">{editFieldErrors.durationMinutes[0]}</p>
                  )}
                </div>
              )}
```
他のJSX（合計表示、`WorkoutLogForm`呼び出し、記録一覧、`ExercisePicker`、セット数/レップ数入力、モーダルのボタン等）は無変更。`handleDelete`関数は無変更。

#### 処理ロジック（確定）
- `WorkoutLogForm.tsx`とは別実装のまま、同じ判定ロジック（`isCardioMuscleGroup`）のみを共有し、状態管理（`useState`群）自体は重複実装する（既存の2ファイル間の重複パターン踏襲。基本設計書5.3節参照）。
- `editFieldErrors`は新規追加のstateであり、既存の`editError`（トップレベルのエラーメッセージ）と併用する。CARDIO必須チェックに違反した場合、`editError`に汎用メッセージ、`editFieldErrors.durationMinutes`に具体的なメッセージが入る。

---

### 2.7 `src/components/WorkoutLogItem.tsx`（変更）

#### 編集前（全文）
```tsx
// src/components/WorkoutLogItem.tsx
import { WEIGHT_UNIT_LABELS, type WorkoutLogDTO } from "@/types";

interface WorkoutLogItemProps {
  log: WorkoutLogDTO;
  onEdit: (log: WorkoutLogDTO) => void;
  onDelete: (id: string) => void;
}

export default function WorkoutLogItem({ log, onEdit, onDelete }: WorkoutLogItemProps) {
  return (
    <li className="flex items-center justify-between rounded border border-gray-200 bg-white p-3">
      <div>
        <p className="font-medium">{log.exerciseName}</p>
        <p className="text-sm text-gray-500">
          {log.setCount}セット × {log.repsPerSet}レップ / {log.durationMinutes}分
          {log.weightValue !== null && log.weightUnit ? ` / 重さ${log.weightValue}${WEIGHT_UNIT_LABELS[log.weightUnit]}` : ""}
        </p>
        <p className="text-sm font-semibold text-gray-900">{log.caloriesBurned} kcal</p>
        {log.weightValue !== null ? (
          <p className="text-sm text-gray-700">
            ボリューム: {log.volumeKg} kg
            {log.weightUnit === "LB" ? "（lb→kg換算）" : ""}
          </p>
        ) : (
          <p className="text-sm text-gray-400">ボリューム: -（重さ未入力）</p>
        )}
      </div>
      <div className="flex gap-3 text-sm">
        <button type="button" onClick={() => onEdit(log)} className="text-blue-600 hover:underline">
          編集
        </button>
        <button type="button" onClick={() => onDelete(log.id)} className="text-red-600 hover:underline">
          削除
        </button>
      </div>
    </li>
  );
}
```

#### 編集後の期待形（全文）
```tsx
// src/components/WorkoutLogItem.tsx
import { WEIGHT_UNIT_LABELS, isCardioMuscleGroup, type WorkoutLogDTO } from "@/types";

interface WorkoutLogItemProps {
  log: WorkoutLogDTO;
  onEdit: (log: WorkoutLogDTO) => void;
  onDelete: (id: string) => void;
}

export default function WorkoutLogItem({ log, onEdit, onDelete }: WorkoutLogItemProps) {
  // 非CARDIO種目のdurationMinutesは常にサーバー推定値（src/app/actions/workouts.ts参照）。
  const isEstimatedDuration = !isCardioMuscleGroup(log.muscleGroup);
  return (
    <li className="flex items-center justify-between rounded border border-gray-200 bg-white p-3">
      <div>
        <p className="font-medium">{log.exerciseName}</p>
        <p className="text-sm text-gray-500">
          {log.setCount}セット × {log.repsPerSet}レップ / {log.durationMinutes}分
          {isEstimatedDuration ? "（推定値）" : ""}
          {log.weightValue !== null && log.weightUnit ? ` / 重さ${log.weightValue}${WEIGHT_UNIT_LABELS[log.weightUnit]}` : ""}
        </p>
        <p className="text-sm font-semibold text-gray-900">{log.caloriesBurned} kcal</p>
        {log.weightValue !== null ? (
          <p className="text-sm text-gray-700">
            ボリューム: {log.volumeKg} kg
            {log.weightUnit === "LB" ? "（lb→kg換算）" : ""}
          </p>
        ) : (
          <p className="text-sm text-gray-400">ボリューム: -（重さ未入力）</p>
        )}
      </div>
      <div className="flex gap-3 text-sm">
        <button type="button" onClick={() => onEdit(log)} className="text-blue-600 hover:underline">
          編集
        </button>
        <button type="button" onClick={() => onDelete(log.id)} className="text-red-600 hover:underline">
          削除
        </button>
      </div>
    </li>
  );
}
```

---

### 2.8 `tests/unit/duration-estimate.test.ts`（新規作成）

```ts
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
```

---

### 2.9 `tests/unit/muscle-group.test.ts`（新規作成）

```ts
// tests/unit/muscle-group.test.ts
import { describe, it, expect } from "vitest";
import { isCardioMuscleGroup, MUSCLE_GROUPS } from "@/types";

describe("isCardioMuscleGroup", () => {
  it("CARDIOの場合はtrueを返す", () => {
    expect(isCardioMuscleGroup("CARDIO")).toBe(true);
  });

  it("CARDIO以外の全muscleGroupに対してfalseを返す", () => {
    for (const mg of MUSCLE_GROUPS) {
      if (mg === "CARDIO") continue;
      expect(isCardioMuscleGroup(mg)).toBe(false);
    }
  });
});
```

---

### 2.10 `tests/unit/validation.test.ts`（新規作成）

```ts
// tests/unit/validation.test.ts
import { describe, it, expect } from "vitest";
import { workoutLogInputSchema } from "@/lib/validation";

const baseInput = {
  exerciseId: "ex-1",
  setCount: 3,
  repsPerSet: 10,
};

describe("workoutLogInputSchema（durationMinutesの任意化）", () => {
  it("正常系: durationMinutesを省略しても検証を通過する（筋トレ系フォームの送信を想定）", () => {
    const result = workoutLogInputSchema.safeParse(baseInput);
    expect(result.success).toBe(true);
  });

  it("正常系: durationMinutesを指定した場合も従来通り検証を通過する（有酸素系フォームの送信を想定）", () => {
    const result = workoutLogInputSchema.safeParse({ ...baseInput, durationMinutes: 30 });
    expect(result.success).toBe(true);
  });

  it("異常系: durationMinutesが0以下の場合は指定時のみエラーになる", () => {
    const result = workoutLogInputSchema.safeParse({ ...baseInput, durationMinutes: 0 });
    expect(result.success).toBe(false);
  });

  it("異常系: durationMinutesが600を超える場合はエラーになる", () => {
    const result = workoutLogInputSchema.safeParse({ ...baseInput, durationMinutes: 601 });
    expect(result.success).toBe(false);
  });

  it("既存仕様への無回帰: weightValueのみ指定するとweightUnit必須エラーになる", () => {
    const result = workoutLogInputSchema.safeParse({ ...baseInput, weightValue: 50 });
    expect(result.success).toBe(false);
  });
});
```

---

### 2.11 `tests/e2e/workout-flow.spec.ts`（変更）

既存6シナリオのうち5件が「チェストプレス」（筋トレ系）で運動時間欄への明示入力（`.fill("30")`）とその前提のカロリー期待値に依存している。運動時間欄を非表示にする実装（2.5節）により、これらの`.fill()`呼び出しは対象要素が存在せず失敗するため、更新が必須。加えて、筋トレ系のカロリーが`setCount`に依存するようになったため、既存の「セット数のみ変更→カロリー不変」という検証シナリオはCARDIO種目に切り替えて存続させる。

推定運動時間・期待カロリーの参考値（すべて`ESTIMATED_SECONDS_PER_REP=3`, `ESTIMATED_REST_SECONDS_BETWEEN_SETS=60`, `CALORIE_CORRECTION_FACTOR=1.05`で算出。実装後は必ず実際の表示値で再確認すること）:

| 条件 | 推定運動時間 | 消費カロリー |
|---|---|---|
| チェストプレス(MET5.5)/体重70kg/3セット×10レップ | 3.5分 | 23.6 kcal |
| チェストプレス(MET5.5)/体重80kg/3セット×10レップ | 3.5分 | 27 kcal |
| エアロバイク30〜50W(MET3.5)/体重70kg/運動時間30分（手入力、セット数に非依存） | 30分（入力値） | 128.6 kcal |

#### 2.11.1 「デフォルト体重設定→MET5.5マシンで記録→カロリーが期待値通り計算される」（変更）

編集前（76〜85行目）:
```ts
    await createSession(page);
    await selectExerciseByName(page, "チェストプレス");
    await page.getByLabel("セット数").fill("3");
    await page.getByLabel("レップ数").fill("10");
    await page.getByLabel("運動時間（分）").fill("30");
    await page.getByRole("button", { name: "記録を追加" }).click();

    // MET5.5 × 70kg × 0.5h × 1.05 = 202.125 → 202.1kcal
    // QA指摘対応: 「合計消費カロリー」表示とログ項目内表示の2箇所に同じテキストが出るため
    // strict mode違反になっていた。ここでは表示されていること自体の確認が目的のため .first() で一意化する。
    await expect(page.getByText("202.1 kcal").first()).toBeVisible();
```

編集後:
```ts
    await createSession(page);
    await selectExerciseByName(page, "チェストプレス");
    await page.getByLabel("セット数").fill("3");
    await page.getByLabel("レップ数").fill("10");
    // 筋トレ系（非CARDIO）は運動時間欄が表示されないため入力しない。
    await page.getByRole("button", { name: "記録を追加" }).click();

    // 推定運動時間 = (3*10*3 + 2*60)/60 = 3.5分
    // MET5.5 × 70kg × (3.5/60)h × 1.05 = 23.58125 → 23.6kcal
    // QA指摘対応: 「合計消費カロリー」表示とログ項目内表示の2箇所に同じテキストが出るため
    // strict mode違反になっていた。ここでは表示されていること自体の確認が目的のため .first() で一意化する。
    await expect(page.getByText("23.6 kcal").first()).toBeVisible();
```

#### 2.11.2 「プロフィールのデフォルト体重を変更すると、以降の記録に反映される」（変更）

編集前（97〜118行目の該当部分）は運動時間`.fill("30")`を2回含み、期待値が`202.1 kcal`・`231 kcal`。

編集後: 両方の`.fill("運動時間（分）", "30")`行を削除し、コメントと期待値を以下に更新する。
```ts
    await createSession(page);
    await selectExerciseByName(page, "チェストプレス");
    await page.getByLabel("セット数").fill("3");
    await page.getByLabel("レップ数").fill("10");
    await page.getByRole("button", { name: "記録を追加" }).click();
    // 推定運動時間3.5分。MET5.5 × 70kg × (3.5/60)h × 1.05 = 23.6kcal
    await expect(page.getByText("23.6 kcal").first()).toBeVisible();

    await page.goto("/profile");
    await page.getByLabel("デフォルト体重 (kg)").fill("80");
    await page.getByRole("button", { name: "更新する" }).click();
    await expect(page.getByText("プロフィールを更新しました")).toBeVisible();

    await createSession(page);
    await selectExerciseByName(page, "チェストプレス");
    await page.getByLabel("セット数").fill("3");
    await page.getByLabel("レップ数").fill("10");
    await page.getByRole("button", { name: "記録を追加" }).click();
    // MET5.5 × 80kg × (3.5/60)h × 1.05 = 27kcal
    await expect(page.getByText("27 kcal").first()).toBeVisible();
```

#### 2.11.3 「セット数のみ変更（時間は同じ）→カロリー表示が変化しない」（テスト名・内容を変更）

このテストの原意図（運動時間を固定したままセット数だけ変えてもカロリーが変わらないことの確認）は、筋トレ系では運動時間自体がセット数から推定されるようになったため成立しなくなる。有酸素系（運動時間は依然としてセット数と無関係のユーザー入力値）に対象を変更して原意図を維持する。

編集前（121〜144行目）を、テスト名ごと以下に置き換える:
```ts
  test("有酸素系: セット数のみ変更（運動時間は同じ入力値）→カロリー表示が変化しない", async ({ page }) => {
    const email = uniqueEmail("setonly");
    await registerAndLogin(page, "セット数比較ユーザー", email);

    await page.goto("/profile");
    await page.getByLabel("デフォルト体重 (kg)").fill("70");
    await page.getByRole("button", { name: "更新する" }).click();
    await expect(page.getByText("プロフィールを更新しました")).toBeVisible();

    await createSession(page);
    // 有酸素系は運動時間がセット数に依存しない（ユーザー入力値のまま）ことを確認するため、
    // CARDIOマシン（エアロバイク 30〜50W、MET3.5）を使う。
    await selectExerciseByName(page, "30〜50W");
    await page.getByLabel("セット数").fill("3");
    await page.getByLabel("レップ数").fill("10");
    await page.getByLabel("運動時間（分）").fill("30");
    await page.getByRole("button", { name: "記録を追加" }).click();
    // MET3.5 × 70kg × 0.5h × 1.05 = 128.625 → 128.6kcal
    await expect(page.getByText("128.6 kcal").first()).toBeVisible();

    await page.getByLabel("セット数").fill("5");
    await page.getByLabel("レップ数").fill("10");
    await page.getByLabel("運動時間（分）").fill("30");
    await page.getByRole("button", { name: "記録を追加" }).click();

    await expect(page.getByText("128.6 kcal")).toHaveCount(2);
  });
```
`selectExerciseByName`の`namePart`には`"30〜50W"`を用いる（種目名に「エアロバイク（90〜100W）」も存在し、"エアロバイク"のみでは複数マッチするため）。

#### 2.11.4 「デフォルト体重未設定・上書きも無しで記録保存→エラーが表示され保存されない」（変更）

編集前（150〜159行目）の`.fill("運動時間（分）", "30")`行を削除する。それ以外は無変更。
```ts
    await createSession(page);
    await selectExerciseByName(page, "チェストプレス");
    await page.getByLabel("セット数").fill("3");
    await page.getByLabel("レップ数").fill("10");
    await page.getByRole("button", { name: "記録を追加" }).click();

    await expect(page.getByText("体重が未設定です")).toBeVisible();
    await expect(page.getByText("まだ記録がありません。")).toBeVisible();
```
（体重未設定チェックは`muscleGroup`判定より前段の`resolveWeightKgForCalorie`で行われる想定のため、本シナリオの検証意図に影響しない。）

#### 2.11.5 「削除: ログ削除後、セッション詳細の合計カロリーが更新される」（変更）

編集前（170〜177行目）の`.fill("運動時間（分）", "30")`行を削除し、期待値を`202.1 kcal`から`23.6 kcal`に変更する。
```ts
    await createSession(page);
    await selectExerciseByName(page, "チェストプレス");
    await page.getByLabel("セット数").fill("3");
    await page.getByLabel("レップ数").fill("10");
    await page.getByRole("button", { name: "記録を追加" }).click();
    await expect(page.getByText("合計消費カロリー")).toBeVisible();
    await expect(page.getByText("23.6 kcal").first()).toBeVisible();

    await page.getByRole("button", { name: "削除", exact: true }).click();
    await expect(page.getByText("まだ記録がありません。")).toBeVisible();
```

#### 2.11.6 新規追加テスト（AC-1/AC-2の直接検証。「トレーニング記録（最重要）」describeブロック内に追加）

```ts
  test("有酸素系マシンで運動時間を未入力のまま保存しようとするとエラーになり保存されない", async ({ page }) => {
    const email = uniqueEmail("cardiorequired");
    await registerAndLogin(page, "有酸素必須確認ユーザー", email);

    await page.goto("/profile");
    await page.getByLabel("デフォルト体重 (kg)").fill("70");
    await page.getByRole("button", { name: "更新する" }).click();
    await expect(page.getByText("プロフィールを更新しました")).toBeVisible();

    await createSession(page);
    await selectExerciseByName(page, "30〜50W");
    await page.getByLabel("セット数").fill("3");
    await page.getByLabel("レップ数").fill("10");
    // 運動時間（分）は意図的に未入力のまま送信する
    await page.getByRole("button", { name: "記録を追加" }).click();

    await expect(page.getByText("有酸素系のマシンでは運動時間の入力が必須です")).toBeVisible();
    await expect(page.getByText("まだ記録がありません。")).toBeVisible();
  });

  test("筋トレ系マシンを選択すると運動時間欄が表示されない", async ({ page }) => {
    const email = uniqueEmail("nofield");
    await registerAndLogin(page, "欄非表示確認ユーザー", email);

    await createSession(page);
    await selectExerciseByName(page, "チェストプレス");
    await expect(page.getByLabel("運動時間（分）")).toHaveCount(0);
  });
```

#### 2.11.7 変更しないテスト
`マシンマスタ`describeブロック内の2テスト、`トップ画面・実績`describeブロック内の2テスト、および「マルチユーザー分離」テストは運動時間欄に依存しないため無変更。

---

## 3. データ構造定義（確定・全体まとめ）

```ts
// src/lib/calorie.ts（追加分）
export const ESTIMATED_SECONDS_PER_REP: number; // 3
export const ESTIMATED_REST_SECONDS_BETWEEN_SETS: number; // 60
export function estimateDurationMinutesForStrength(setCount: number, repsPerSet: number): number;
```

```ts
// src/types/index.ts（追加分）
export function isCardioMuscleGroup(muscleGroup: MuscleGroup): boolean;

export interface WorkoutLogDTO {
  id: string;
  exerciseId: string;
  exerciseName: string;
  muscleGroup: MuscleGroup; // 新規追加
  setCount: number;
  repsPerSet: number;
  durationMinutes: number; // CARDIO: ユーザー入力値 / 非CARDIO: サーバー推定値（意味論が変わるがフィールド自体・型は無変更）
  weightValue: number | null;
  weightUnit: WeightUnit | null;
  metValueSnapshot: number;
  caloriesBurned: number;
  volumeKg: number;
}
```

```ts
// src/lib/validation.ts（変更分）
export const workoutLogInputSchema: z.ZodType<{
  exerciseId: string;
  setCount: number;
  repsPerSet: number;
  durationMinutes?: number; // optional化（従来はrequired）
  weightValue?: number;
  weightUnit?: "KG" | "LB";
}>;
```

## 4. エラー処理方針

| ケース | 扱い |
|---|---|
| CARDIO種目で`durationMinutes`が未指定のまま`addWorkoutLog`/`updateWorkoutLog`が呼ばれる | `exercise`取得・`weightKg`解決後に`isCardioMuscleGroup(muscleGroup)`が`true`かつ`data.durationMinutes === undefined`の場合、`{ ok: false, error: "入力内容を確認してください", fieldErrors: { durationMinutes: ["有酸素系のマシンでは運動時間の入力が必須です"] } }`を返しDB書き込みは行わない。 |
| 非CARDIO種目で`durationMinutes`が指定されている（UI実装漏れ・改ざん・API直接呼び出し等） | サーバーは`data.durationMinutes`を一切参照せず、常に`estimateDurationMinutesForStrength(data.setCount, data.repsPerSet)`の結果を使用する（クライアント値を信頼しない）。 |
| `durationMinutes`がZodの範囲外（0以下、600超）で指定される | 既存通り`workoutLogInputSchema.safeParse`が失敗し、`parsed.error.flatten().fieldErrors.durationMinutes`にZod標準のメッセージが入る（本プロジェクトでの変更なし）。 |
| `setCount`/`repsPerSet`が不正な値で`estimateDurationMinutesForStrength`に渡る（理論上Zodのint/positive制約により発生しないが防御） | `0`を返す。結果として`calculateCalories`も`0`（`durationMinutes <= 0`のため）を返し、`caloriesBurned = 0`が保存される（既存の`calculateCalories`の防御ロジックと整合）。例外は投げない。 |
| 種目未選択のまま`WorkoutLogForm`/編集モーダルで送信する | 既存通り`workoutLogInputSchema`の`exerciseId: z.string().min(1)`により拒否される（本プロジェクトでの変更なし）。`requiresDuration`は`false`（欄非表示）だが、これはバリデーションの代替にはならない点に注意（欄非表示はUI上のガイドに過ぎず、最終的な必須判定は常にServer Action側で行う）。 |
| カスタム種目で`muscleGroup: "CARDIO"`を選択して作成した場合 | 既存の`isCardioMuscleGroup(muscleGroup)`判定にそのまま従う（一貫した扱いになる）。逆に有酸素運動をCARDIO以外で登録した場合は筋トレ系として扱われる（要件定義書6章のスコープ外事項として許容）。 |
| `src/lib/volume.ts`（`calculateVolumeKg`）への影響 | 一切なし。`durationMinutes`を参照しないため、本プロジェクトの変更前後で入出力とも完全に同一。 |

## 5. テスト観点

### 5.1 単体テスト
- `tests/unit/duration-estimate.test.ts`: 正常系（3セット×10レップ、5セット×10レップ）、境界値（setCount=1で休憩ゼロ、setCount=50/repsPerSet=200の上限相当）、異常系防御（0、負数、非整数、NaN、Infinity）。
- `tests/unit/muscle-group.test.ts`: `isCardioMuscleGroup`がCARDIOのみ`true`を返し、他の全`MuscleGroup`で`false`を返すこと（網羅列挙）。
- `tests/unit/validation.test.ts`: `durationMinutes`省略時に成功、指定時（正常値）に成功、範囲外（0, 601）で失敗、既存の`weightValue`/`weightUnit`ペア制約に無回帰であること。
- 既存の`tests/unit/calorie.test.ts`, `tests/unit/volume.test.ts`, `tests/unit/weight.test.ts`が無変更のまま全てパスすること（無回帰確認）。

### 5.2 結合・Server Actionレベルの観点（e2eまたは手動確認）
- CARDIO種目・`durationMinutes`未指定 → `fieldErrors.durationMinutes`が返り、DBに`WorkoutLog`が作成されないこと。
- CARDIO種目・`durationMinutes`指定 → 従来通りユーザー入力値がそのまま`caloriesBurned`計算・DB保存に使われること（回帰なし）。
- 非CARDIO種目・`durationMinutes`未指定 → `estimateDurationMinutesForStrength`の結果が`caloriesBurned`計算・DB保存（`durationMinutes`列）に使われること。
- 非CARDIO種目で`durationMinutes`を意図的に指定して送信しても（APIを直接叩く等）無視され、常にサーバー推定値が使われること。
- `getWorkoutSession`が返す各ログの`muscleGroup`が、対応する`Exercise.muscleGroup`と一致すること。
- 記録編集（`updateWorkoutLog`）で種目をCARDIO⇔非CARDIO間で変更した場合、変更後の種目のカテゴリに応じて`durationMinutes`の必須判定・推定が正しく切り替わること。

### 5.3 UI（e2e）観点
- 筋トレ系種目選択時、運動時間欄（`page.getByLabel("運動時間（分）")`）が表示されないこと。
- 有酸素系種目選択時、運動時間欄が表示され、必須マーク（`*`）が見えること。
- 有酸素系種目で運動時間未入力のまま送信するとエラーメッセージ「有酸素系のマシンでは運動時間の入力が必須です」が表示され、記録が保存されないこと。
- 筋トレ系種目でセット数・レップ数のみ入力して送信すると、記録が保存され、推定値に基づく消費カロリーが表示されること。
- 記録一覧で、筋トレ系の記録には運動時間表示に「（推定値）」が付き、有酸素系の記録には付かないこと。
- 編集モーダルでも、追加フォームと同様に種目カテゴリに応じた運動時間欄の表示切替が機能すること。
- 既存の削除・体重変更・マルチユーザー分離等のシナリオに回帰がないこと。

### 5.4 境界値まとめ（実装・レビュー時のチェックリスト）
- `setCount = 1`（最小値）: 休憩が加算されず、推定時間 = `repsPerSet × ESTIMATED_SECONDS_PER_REP / 60`。
- `setCount = 50`, `repsPerSet = 200`（Zodの上限値）: 推定時間・カロリーとも有限の値になり例外が発生しない。
- `weightValue`/`weightUnit`のペア制約（既存機能）が、`durationMinutes`のoptional化と独立して引き続き機能すること。
- カスタム種目で`muscleGroup: "CARDIO"`を選んだ場合も、シード種目と同様に有酸素系として扱われること。

## 6. 完了条件チェックリスト
- [ ] `src/lib/calorie.ts`に`ESTIMATED_SECONDS_PER_REP`, `ESTIMATED_REST_SECONDS_BETWEEN_SETS`, `estimateDurationMinutesForStrength`が追加され、根拠コメント（暫定値である旨）が明記されている
- [ ] `src/lib/calorie.ts`の既存export（`CALORIE_CORRECTION_FACTOR`, `CalorieCalcInput`, `calculateCalories`）に差分がない
- [ ] `src/types/index.ts`に`isCardioMuscleGroup`が追加され、`WorkoutLogDTO`に`muscleGroup: MuscleGroup`が追加されている
- [ ] `src/lib/validation.ts`の`workoutLogInputSchema.durationMinutes`が`optional()`になっている（他のフィールド・`superRefine`は無変更）
- [ ] `src/app/actions/workouts.ts`の`addWorkoutLog`/`updateWorkoutLog`がCARDIO必須チェック・非CARDIO推定ロジックを実装し、`getWorkoutSession`が`muscleGroup`を含むDTOを返す
- [ ] `src/components/WorkoutLogForm.tsx`が選択中種目に応じて運動時間欄の表示/非表示を切り替え、非表示時は`durationMinutes: undefined`を送信する
- [ ] `src/components/WorkoutSessionLogs.tsx`が編集モーダルで同様の表示切替を行い、`editFieldErrors`によるエラー表示が機能する
- [ ] `src/components/WorkoutLogItem.tsx`が非CARDIO記録に「（推定値）」ラベルを表示する
- [ ] `src/lib/volume.ts`・`tests/unit/volume.test.ts`に差分がない
- [ ] `prisma/schema.prisma`・`prisma/migrations/`・`prisma/seed.ts`に差分がない
- [ ] `tests/unit/duration-estimate.test.ts`, `tests/unit/muscle-group.test.ts`, `tests/unit/validation.test.ts`が新規作成され、全テストがパスする
- [ ] `tests/e2e/workout-flow.spec.ts`が2.11節の内容で更新され、全シナリオ（既存5件の更新＋新規2件）がパスする
- [ ] `npm run build`（型チェック含む）がエラーなく通る
- [ ] 既存の`tests/unit/calorie.test.ts`, `tests/unit/weight.test.ts`が無変更のまま全てパスする
