---
project_id: "2026-09-14-1040-machine-weight-input"
phase: design
doc: detailed-design
created: "2026-09-14"
---

# 詳細設計書: マシン選択肢の統一と重量記録欄の新設（MuscleBoost）

## 0. 概要

本プロジェクトで実現されること:
1. マシン選択プルダウンから「強度レベル（軽度/中等度/高強度）」による選択肢分岐を無くし、**1マシン名=1選択肢**にする（対象: 筋トレマシン10種。有酸素6種は元々1エントリのため対象外）。
2. トレーニング記録に「重さ」（数値＋KG/ポンドの単位）の入力欄を新設し、一覧・詳細に表示する。
3. 重さの値は**カロリー計算に一切使用しない**（`src/lib/calorie.ts` の `calculateCalories()` のシグネチャ・実装・呼び出し引数は無変更）。
4. 強度統合に伴い削除される `Exercise` レコードを参照している既存 `WorkoutLog.exerciseId` を、マイグレーション内のデータ移行SQLで代表レコードへ再ポイントする。過去記録の `metValueSnapshot`/`caloriesBurned` は不変。
5. 本番Turso DBへの `prisma migrate deploy` 適用手順をデプロイパイプライン（`.github/workflows/deploy.yml`）に組み込む。

方針の根拠・比較検討は `basic-design.md` §2・§3・§4・§7 を参照。本書はその方針を「実装可能な粒度」に落とし込んだものである。

---

## 1. 影響範囲（新規／変更ファイル一覧）

| # | ファイル | 区分 | 概要 |
|---|---|---|---|
| 1 | `prisma/schema.prisma` | 変更 | `Exercise.intensityCategory` 削除、`WorkoutLog.weightValue`/`weightUnit` 追加 |
| 2 | `prisma/migrations/<timestamp>_merge_exercise_intensity_and_workout_weight/migration.sql` | 新規 | データ移行（再ポイント・削除・リネーム）＋スキーマDDL |
| 3 | `prisma/seed.ts` | 変更 | 筋トレ10機種を1エントリ化 |
| 4 | `src/types/index.ts` | 変更 | `IntensityCategory`関連削除、`WeightUnit`関連追加、DTO更新 |
| 5 | `src/lib/validation.ts` | 変更 | `exerciseInputSchema`から強度項目削除、`workoutLogInputSchema`に重さ項目追加 |
| 6 | `src/app/actions/exercises.ts` | 変更 | `toDTO`から`intensityCategory`除去 |
| 7 | `src/app/actions/workouts.ts` | 変更 | `weightValue`/`weightUnit`の保存・DTOマッピング追加（3箇所） |
| 8 | `src/components/ExercisePicker.tsx` | 変更 | option表示から強度セグメント削除 |
| 9 | `src/components/ExerciseForm.tsx` | 変更 | 強度選択欄削除 |
| 10 | `src/app/exercises/page.tsx` | 変更 | 一覧表示から強度セグメント削除 |
| 11 | `src/components/WorkoutLogForm.tsx` | 変更 | 重さ入力欄＋単位切替UI追加 |
| 12 | `src/components/WorkoutLogItem.tsx` | 変更 | 重さ＋単位の表示追加 |
| 13 | `tests/e2e/workout-flow.spec.ts` | 変更 | マシン名セレクタ・カロリー期待値の更新 |
| 14 | `.github/workflows/deploy.yml` | 変更 | `prisma migrate deploy` ステップ追加 |
| 15 | `tests/unit/calorie.test.ts` | 変更なし | `calculateCalories()`のシグネチャ・実装が不変のため対応不要（確認のみ） |

---

## 2. データ構造定義

### 2.1 `prisma/schema.prisma`（差分）

```prisma
model Exercise {
  id                String   @id @default(cuid())
  name              String
  // MuscleGroup: "CHEST" | "BACK" | "LEGS" | "SHOULDERS" | "ARMS" | "ABS" | "FULL_BODY" | "CARDIO"
  muscleGroup       String
  metValue          Float
  description       String?
  isCustom          Boolean  @default(false)
  createdByUserId   String?
  createdByUser     User?    @relation("UserCustomExercises", fields: [createdByUserId], references: [id], onDelete: Cascade)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  workoutLogs WorkoutLog[]

  @@index([createdByUserId])
  @@index([muscleGroup])
}
```
（`intensityCategory String` 行とそのコメント行を削除する。他フィールド・インデックスは変更なし。）

```prisma
model WorkoutLog {
  id                    String         @id @default(cuid())
  workoutSessionId      String
  workoutSession        WorkoutSession @relation(fields: [workoutSessionId], references: [id], onDelete: Cascade)
  exerciseId            String
  exercise              Exercise       @relation(fields: [exerciseId], references: [id])
  setCount              Int
  repsPerSet            Int
  durationMinutes       Float
  secondsPerSetOverride Int?
  bodyWeightKgOverride  Float?
  // 使用重量の記録（表示専用）。カロリー計算には一切使用しない。
  // WeightUnit: "KG" | "LB"。weightValueとweightUnitは常にペアで存在する（片方のみの入力はZodバリデーションで拒否）。
  weightValue           Float?
  weightUnit            String?
  metValueSnapshot      Float
  caloriesBurned        Float
  createdAt             DateTime       @default(now())
  updatedAt             DateTime       @updatedAt

  @@index([workoutSessionId])
  @@index([exerciseId])
}
```
（`bodyWeightKgOverride` と `metValueSnapshot` の間に `weightValue`/`weightUnit` の2行を追加する。それ以外は変更なし。）

### 2.2 `src/types/index.ts`（差分）

**削除する定義:**
```ts
export const INTENSITY_CATEGORIES = [
  "LIGHT", "MODERATE", "VIGOROUS", "HIGH_INTENSITY",
] as const;
export type IntensityCategory = (typeof INTENSITY_CATEGORIES)[number];

export const INTENSITY_LABELS: Record<IntensityCategory, string> = {
  LIGHT: "軽度", MODERATE: "中等度", VIGOROUS: "高強度", HIGH_INTENSITY: "最高強度",
};
```
（`grep -rn "IntensityCategory\|INTENSITY_" src/` で削除対象の参照箇所を洗い出し、本書§3の各ファイルの更新と合わせて全て除去すること。）

**追加する定義:**
```ts
export const WEIGHT_UNITS = ["KG", "LB"] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

export const WEIGHT_UNIT_LABELS: Record<WeightUnit, string> = {
  KG: "kg", LB: "lb",
};
```

**`ExerciseDTO` の変更:**
```ts
export interface ExerciseDTO {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  metValue: number;
  description: string | null;
  isCustom: boolean;
  createdByUserId: string | null;
}
```
（`intensityCategory: IntensityCategory;` の行を削除。）

**`WorkoutLogDTO` の変更:**
```ts
export interface WorkoutLogDTO {
  id: string;
  exerciseId: string;
  exerciseName: string;
  setCount: number;
  repsPerSet: number;
  durationMinutes: number;
  bodyWeightKgOverride: number | null;
  weightValue: number | null;
  weightUnit: WeightUnit | null;
  metValueSnapshot: number;
  caloriesBurned: number;
}
```
（`bodyWeightKgOverride` の直後に `weightValue`/`weightUnit` の2行を追加。）

---

## 3. ファイル別変更詳細

### 3.1 `prisma/schema.prisma`

- **編集前**: §2.1参照（既存全文は情報収集レポート出典 `prisma/schema.prisma:25-44, 60-78`）。
- **編集後の期待形**: §2.1の差分をそのまま適用。
- **処理ロジック**: なし（宣言的スキーマ）。
- **エラー処理**: なし。ただし本ファイルの変更は§3.2のマイグレーション生成の入力になるため、変更後に必ず `npx prisma migrate dev --create-only --name merge_exercise_intensity_and_workout_weight` を実行してDDL差分を生成すること（後述）。

### 3.2 マイグレーション（新規: `prisma/migrations/<timestamp>_merge_exercise_intensity_and_workout_weight/migration.sql`）

**方針**: Prisma自動生成のDDLだけでは既存データ（強度違いレコードの重複）を解決できないため、「Prisma migrate `--create-only` でDDL雛形を生成 → 生成されたSQLファイルの先頭にデータ移行SQLを手動挿入」という**手動SQL併用方式**を採る。

**生成手順:**
1. §3.1のスキーマ変更を適用した状態で以下を実行し、マイグレーションファイルを「未適用のまま」生成する（`--create-only` により自動適用はされない）。
   ```bash
   npx prisma migrate dev --create-only --name merge_exercise_intensity_and_workout_weight
   ```
2. 生成された `prisma/migrations/<timestamp>_merge_exercise_intensity_and_workout_weight/migration.sql` を開き、**ファイルの一番先頭**（Prismaが生成したDDL文の直前）に、以下のデータ移行SQLブロックを挿入する。

**挿入するデータ移行SQL（全文）:**
```sql
-- ============================================================
-- Step 1: データ移行（この後に続くスキーマDDLより必ず先に実行する）
-- 目的: 強度統合により削除される Exercise 行（LIGHT/VIGOROUS）を参照している
--       既存 WorkoutLog.exerciseId を代表行（MODERATE）へ再ポイントしてから削除する。
--       WorkoutLog.exerciseId は onDelete: Restrict のため、再ポイントを終えるまで
--       参照元の Exercise 行を DELETE できない。
-- ============================================================

-- 1-1. 再ポイント（LIGHT/VIGOROUS → MODERATE）
UPDATE "WorkoutLog" SET "exerciseId" = 'seed-チェストプレス-MODERATE'
  WHERE "exerciseId" IN ('seed-チェストプレス-LIGHT', 'seed-チェストプレス-VIGOROUS');
UPDATE "WorkoutLog" SET "exerciseId" = 'seed-ラットプルダウン-MODERATE'
  WHERE "exerciseId" IN ('seed-ラットプルダウン-LIGHT', 'seed-ラットプルダウン-VIGOROUS');
UPDATE "WorkoutLog" SET "exerciseId" = 'seed-レッグプレス-MODERATE'
  WHERE "exerciseId" IN ('seed-レッグプレス-LIGHT', 'seed-レッグプレス-VIGOROUS');
UPDATE "WorkoutLog" SET "exerciseId" = 'seed-レッグエクステンション-MODERATE'
  WHERE "exerciseId" IN ('seed-レッグエクステンション-LIGHT', 'seed-レッグエクステンション-VIGOROUS');
UPDATE "WorkoutLog" SET "exerciseId" = 'seed-レッグカール-MODERATE'
  WHERE "exerciseId" IN ('seed-レッグカール-LIGHT', 'seed-レッグカール-VIGOROUS');
UPDATE "WorkoutLog" SET "exerciseId" = 'seed-ショルダープレス-MODERATE'
  WHERE "exerciseId" IN ('seed-ショルダープレス-LIGHT', 'seed-ショルダープレス-VIGOROUS');
UPDATE "WorkoutLog" SET "exerciseId" = 'seed-アブドミナルクランチ-MODERATE'
  WHERE "exerciseId" IN ('seed-アブドミナルクランチ-LIGHT', 'seed-アブドミナルクランチ-VIGOROUS');
UPDATE "WorkoutLog" SET "exerciseId" = 'seed-シーテッドロー-MODERATE'
  WHERE "exerciseId" IN ('seed-シーテッドロー-LIGHT', 'seed-シーテッドロー-VIGOROUS');
UPDATE "WorkoutLog" SET "exerciseId" = 'seed-ケーブルクロスオーバー-MODERATE'
  WHERE "exerciseId" IN ('seed-ケーブルクロスオーバー-LIGHT', 'seed-ケーブルクロスオーバー-VIGOROUS');
UPDATE "WorkoutLog" SET "exerciseId" = 'seed-スミスマシン-MODERATE'
  WHERE "exerciseId" IN ('seed-スミスマシン-LIGHT', 'seed-スミスマシン-VIGOROUS');

-- 1-2. 再ポイント後に不要となった LIGHT/VIGOROUS 行を削除
DELETE FROM "Exercise" WHERE "id" IN (
  'seed-チェストプレス-LIGHT', 'seed-チェストプレス-VIGOROUS',
  'seed-ラットプルダウン-LIGHT', 'seed-ラットプルダウン-VIGOROUS',
  'seed-レッグプレス-LIGHT', 'seed-レッグプレス-VIGOROUS',
  'seed-レッグエクステンション-LIGHT', 'seed-レッグエクステンション-VIGOROUS',
  'seed-レッグカール-LIGHT', 'seed-レッグカール-VIGOROUS',
  'seed-ショルダープレス-LIGHT', 'seed-ショルダープレス-VIGOROUS',
  'seed-アブドミナルクランチ-LIGHT', 'seed-アブドミナルクランチ-VIGOROUS',
  'seed-シーテッドロー-LIGHT', 'seed-シーテッドロー-VIGOROUS',
  'seed-ケーブルクロスオーバー-LIGHT', 'seed-ケーブルクロスオーバー-VIGOROUS',
  'seed-スミスマシン-LIGHT', 'seed-スミスマシン-VIGOROUS'
);

-- 1-3. 代表行（MODERATE）の名称から強度サフィックスを除去
UPDATE "Exercise" SET "name" = 'チェストプレス' WHERE "id" = 'seed-チェストプレス-MODERATE';
UPDATE "Exercise" SET "name" = 'ラットプルダウン' WHERE "id" = 'seed-ラットプルダウン-MODERATE';
UPDATE "Exercise" SET "name" = 'レッグプレス' WHERE "id" = 'seed-レッグプレス-MODERATE';
UPDATE "Exercise" SET "name" = 'レッグエクステンション' WHERE "id" = 'seed-レッグエクステンション-MODERATE';
UPDATE "Exercise" SET "name" = 'レッグカール' WHERE "id" = 'seed-レッグカール-MODERATE';
UPDATE "Exercise" SET "name" = 'ショルダープレス' WHERE "id" = 'seed-ショルダープレス-MODERATE';
UPDATE "Exercise" SET "name" = 'アブドミナルクランチ' WHERE "id" = 'seed-アブドミナルクランチ-MODERATE';
UPDATE "Exercise" SET "name" = 'シーテッドロー' WHERE "id" = 'seed-シーテッドロー-MODERATE';
UPDATE "Exercise" SET "name" = 'ケーブルクロスオーバー' WHERE "id" = 'seed-ケーブルクロスオーバー-MODERATE';
UPDATE "Exercise" SET "name" = 'スミスマシン' WHERE "id" = 'seed-スミスマシン-MODERATE';

-- ============================================================
-- Step 2: スキーマDDL（`npx prisma migrate dev --create-only` が自動生成した内容を
--          このコメントの直後にそのまま残す。手書き不要）
-- 想定される生成内容の要点:
--   - Exercise: SQLiteは列削除に非対応のため、
--     PRAGMA foreign_keys=OFF → 新テーブル(new_Exercise)作成（intensityCategory列を含まない）
--     → 旧テーブルから全列コピー → 旧テーブルDROP → RENAME → PRAGMA foreign_keys=ON
--     という手順で自動生成される。
--   - WorkoutLog: ALTER TABLE "WorkoutLog" ADD COLUMN "weightValue" REAL;
--                 ALTER TABLE "WorkoutLog" ADD COLUMN "weightUnit" TEXT;
-- ============================================================
```

3. Step 1 のブロックを挿入した後、Step 2 として続くPrisma生成のDDL本体（Exerciseテーブル再構築＋WorkoutLogへの列追加）は**内容を変更せずそのまま残す**。
4. ローカル検証: `npx prisma migrate dev`（引数なし）を実行し、ローカルTuroso dev DBに適用されることを確認する。適用後、`npx prisma studio` または直接クエリで以下を確認する。
   - `Exercise` テーブルが16件（筋トレ10 + 有酸素6）になっている。
   - 既存 `WorkoutLog` 行の `exerciseId` が全て現存する `Exercise.id` を指している（孤立参照がない）。
   - `WorkoutLog` に `weightValue`/`weightUnit` 列が追加され、既存行は両方 `NULL` になっている。

**エラー処理・注意点:**
- Step 1 のUPDATE/DELETEはローカルdevで最初にテストが済んだシード状態（既存の36件シード＋テスト由来の `WorkoutLog`）を前提に書かれている。**本番Turso DBに適用する前に、`seed-${machine}-LIGHT/MODERATE/VIGOROUS` のIDがローカルと本番で一致していること**（＝過去に一度もIDフォーマットを変えていないこと）を`SELECT id FROM Exercise WHERE id LIKE 'seed-%'`で確認すること。
- 万が一、本番に存在するIDがこのSQLの想定と異なる場合（例: 過去に手動でIDを変更した形跡がある場合）は、SQLをそのまま流用せず、実データに基づいて再作成すること。

### 3.3 `prisma/seed.ts`

- **編集前**: 筋トレ10種 × 強度3段階（LIGHT/MODERATE/VIGOROUS）の二重ループで36件中30件を生成（情報収集レポート出典 `prisma/seed.ts:15-81`）。
- **編集後の期待形（全文）:**
```ts
// prisma/seed.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const adapter = new PrismaLibSql({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const prisma = new PrismaClient({ adapter });

// 筋トレマシン: 1マシン=1エントリ。MET値は統合前のMODERATE代表値
// （Compendium of Physical Activities「Resistance training, multiple exercises,
// 8-15 reps, varied resistance」=5.5）を採用する。
// IDは統合前の `seed-${name}-MODERATE` をそのまま踏襲する
// （既存WorkoutLog.exerciseIdとの互換性維持のため。詳細は
// prisma/migrations/<timestamp>_merge_exercise_intensity_and_workout_weight/migration.sql を参照）。
const STRENGTH_MACHINES: Array<{ name: string; muscleGroup: string }> = [
  { name: "チェストプレス", muscleGroup: "CHEST" },
  { name: "ラットプルダウン", muscleGroup: "BACK" },
  { name: "レッグプレス", muscleGroup: "LEGS" },
  { name: "レッグエクステンション", muscleGroup: "LEGS" },
  { name: "レッグカール", muscleGroup: "LEGS" },
  { name: "ショルダープレス", muscleGroup: "SHOULDERS" },
  { name: "アブドミナルクランチ", muscleGroup: "ABS" },
  { name: "シーテッドロー", muscleGroup: "BACK" },
  { name: "ケーブルクロスオーバー", muscleGroup: "CHEST" },
  { name: "スミスマシン", muscleGroup: "FULL_BODY" },
];
const STRENGTH_MET_VALUE = 5.5;
const STRENGTH_DESCRIPTION =
  "Compendium: Resistance training, multiple exercises, 8-15 reps, varied resistance";

// 有酸素マシン: 厚労省「健康づくりのための身体活動基準」参考資料 運動のメッツ表 準拠。
// 元々1マシン1エントリの個別命名のため変更なし。
const CARDIO_MACHINES: Array<{ name: string; metValue: number; description: string }> = [
  { name: "エアロバイク（30〜50W）", metValue: 3.5, description: "厚労省メッツ表: 自転車エルゴメーター(30〜50ワット)" },
  { name: "トレッドミル（速歩 93m/分）", metValue: 4.3, description: "厚労省メッツ表: やや速歩（平地、93m/分）" },
  { name: "トレッドミル（ジョギング）", metValue: 7.0, description: "厚労省メッツ表: ジョギング" },
  { name: "エアロバイク（90〜100W）", metValue: 6.8, description: "厚労省メッツ表: 自転車エルゴメーター(90〜100ワット)" },
  { name: "ランニングマシン（134m/分）", metValue: 8.3, description: "厚労省メッツ表: ランニング(134m/分)" },
  { name: "クロストレーナー", metValue: 8.0, description: "Compendium: Circuit training, including some aerobic movement with minimal rest" },
];

async function main() {
  for (const machine of STRENGTH_MACHINES) {
    const id = `seed-${machine.name}-MODERATE`;
    await prisma.exercise.upsert({
      where: { id },
      update: {
        name: machine.name,
        muscleGroup: machine.muscleGroup,
        metValue: STRENGTH_MET_VALUE,
        description: STRENGTH_DESCRIPTION,
        isCustom: false,
      },
      create: {
        id,
        name: machine.name,
        muscleGroup: machine.muscleGroup,
        metValue: STRENGTH_MET_VALUE,
        description: STRENGTH_DESCRIPTION,
        isCustom: false,
      },
    });
  }

  for (const cardio of CARDIO_MACHINES) {
    const id = `seed-cardio-${cardio.name}`;
    await prisma.exercise.upsert({
      where: { id },
      update: {
        name: cardio.name,
        muscleGroup: "CARDIO",
        metValue: cardio.metValue,
        description: cardio.description,
        isCustom: false,
      },
      create: {
        id,
        name: cardio.name,
        muscleGroup: "CARDIO",
        metValue: cardio.metValue,
        description: cardio.description,
        isCustom: false,
      },
    });
  }

  console.log(
    "シードデータ投入完了: マシンマスタ",
    STRENGTH_MACHINES.length + CARDIO_MACHINES.length,
    "件"
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```
- **変更点の要旨**: 二重ループ廃止、`STRENGTH_LEVELS`配列削除、`upsert`の`update`句を`{}`から実フィールド更新に変更（冪等かつ自己修復的にする）。合計件数は36件→16件になる。
- **エラー処理**: 既存同様、`main()`の`catch`で`process.exit(1)`（変更なし）。

### 3.4 `src/types/index.ts`

- 差分は §2.2 の通り。
- **処理フロー**: なし（型・定数定義のみ）。
- **注意**: `WEIGHT_UNITS`/`WeightUnit`/`WEIGHT_UNIT_LABELS` は既存の `MUSCLE_GROUPS`/`MuscleGroup`/`MUSCLE_GROUP_LABELS` と全く同じ定義パターン（`as const`配列 → `(typeof X)[number]`型 → `Record`ラベル）に揃えること。

### 3.5 `src/lib/validation.ts`

- **編集前**:
```ts
export const exerciseInputSchema = z.object({
  name: z.string().min(1, "マシン名を入力してください").max(80),
  muscleGroup: z.enum(MUSCLE_GROUPS),
  intensityCategory: z.enum(INTENSITY_CATEGORIES),
  metValue: z.number().positive("MET値は0より大きい値を入力してください").max(30),
  description: z.string().max(500).optional(),
});
...
export const workoutLogInputSchema = z.object({
  exerciseId: z.string().min(1),
  setCount: z.number().int().positive("セット数は1以上の整数で入力してください").max(50),
  repsPerSet: z.number().int().positive("レップ数は1以上の整数で入力してください").max(200),
  durationMinutes: z.number().positive("運動時間は0より大きい値を入力してください").max(600),
  bodyWeightKgOverride: z.number().positive().max(400).optional(),
});
```
- **編集後の期待形:**
```ts
import { z } from "zod";
import { MUSCLE_GROUPS, WEIGHT_UNITS } from "@/types";

export const exerciseInputSchema = z.object({
  name: z.string().min(1, "マシン名を入力してください").max(80),
  muscleGroup: z.enum(MUSCLE_GROUPS),
  metValue: z.number().positive("MET値は0より大きい値を入力してください").max(30),
  description: z.string().max(500).optional(),
});

// ...(registerSchema/loginSchema/workoutSessionInputSchemaは変更なし)

export const workoutLogInputSchema = z
  .object({
    exerciseId: z.string().min(1),
    setCount: z.number().int().positive("セット数は1以上の整数で入力してください").max(50),
    repsPerSet: z.number().int().positive("レップ数は1以上の整数で入力してください").max(200),
    durationMinutes: z.number().positive("運動時間は0より大きい値を入力してください").max(600),
    bodyWeightKgOverride: z.number().positive().max(400).optional(),
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
- **処理フロー（`workoutLogInputSchema`のバリデーション）**:
  1. 基本フィールド（`exerciseId`等）を通常通り検証。
  2. `weightValue`/`weightUnit` は個別には任意（`.optional()`）。
  3. `superRefine`で「片方だけ値がある」状態を検出し、不足している側のフィールドに `fieldErrors` を追加する。
  4. 両方未入力、または両方入力済みの場合はエラーなし。
- **エラー処理**: Server Action側（`addWorkoutLog`/`updateWorkoutLog`）は既存パターン通り `parsed.error.flatten().fieldErrors` をそのままクライアントへ返す。フォーム側は `fieldErrors.weightValue`/`fieldErrors.weightUnit` を個別に表示する（§3.10）。
- **`import`の変更**: `INTENSITY_CATEGORIES` の import を削除し、`WEIGHT_UNITS` を追加する。

### 3.6 `src/app/actions/exercises.ts`

- **編集前**:
```ts
function toDTO(row: {
  id: string; name: string; muscleGroup: string; intensityCategory: string;
  metValue: number; description: string | null; isCustom: boolean; createdByUserId: string | null;
}): ExerciseDTO {
  return {
    ...row,
    muscleGroup: row.muscleGroup as MuscleGroup,
    intensityCategory: row.intensityCategory as IntensityCategory,
  };
}
```
- **編集後の期待形:**
```ts
import type { ActionResult, ExerciseDTO, MuscleGroup } from "@/types";

function toDTO(row: {
  id: string; name: string; muscleGroup: string;
  metValue: number; description: string | null; isCustom: boolean; createdByUserId: string | null;
}): ExerciseDTO {
  return {
    ...row,
    muscleGroup: row.muscleGroup as MuscleGroup,
  };
}
```
- `listExercises`/`createExercise`/`deleteCustomExercise` の本体ロジックは変更なし（`exerciseInputSchema`が既に強度項目を除いているため、`createExercise`の`prisma.exercise.create({ data: { ...parsed.data, ... } })`は自動的に`intensityCategory`を含まなくなる）。
- **import変更**: `IntensityCategory` の import を削除。

### 3.7 `src/app/actions/workouts.ts`

**変更箇所は3つの関数の計4箇所（create data 2箇所、DTOマッピング3箇所のうち`weightValue`/`weightUnit`追加分）。**

- **`addWorkoutLog`関数内 `prisma.workoutLog.create` の `data`:**
  - **編集前:**
  ```ts
  const log = await prisma.workoutLog.create({
    data: {
      workoutSessionId: sessionId,
      exerciseId: data.exerciseId,
      setCount: data.setCount,
      repsPerSet: data.repsPerSet,
      durationMinutes: data.durationMinutes,
      bodyWeightKgOverride: data.bodyWeightKgOverride ?? null,
      metValueSnapshot: exercise.metValue,
      caloriesBurned,
    },
  });
  ```
  - **編集後:**
  ```ts
  const log = await prisma.workoutLog.create({
    data: {
      workoutSessionId: sessionId,
      exerciseId: data.exerciseId,
      setCount: data.setCount,
      repsPerSet: data.repsPerSet,
      durationMinutes: data.durationMinutes,
      bodyWeightKgOverride: data.bodyWeightKgOverride ?? null,
      weightValue: data.weightValue ?? null,
      weightUnit: data.weightUnit ?? null,
      metValueSnapshot: exercise.metValue,
      caloriesBurned,
    },
  });
  ```
  - **重要**: `calculateCalories({...})` の呼び出し引数（直前のコードブロック）は**一切変更しない**。`weightValue`/`weightUnit`はこの呼び出しより後ろの`create` dataにのみ追加する。

- **`addWorkoutLog`関数の戻り値DTOマッピング:**
  - **編集前:**
  ```ts
  log: {
    id: log.id,
    exerciseId: log.exerciseId,
    exerciseName: exercise.name,
    setCount: log.setCount,
    repsPerSet: log.repsPerSet,
    durationMinutes: log.durationMinutes,
    bodyWeightKgOverride: log.bodyWeightKgOverride,
    metValueSnapshot: log.metValueSnapshot,
    caloriesBurned: log.caloriesBurned,
  },
  ```
  - **編集後:**
  ```ts
  log: {
    id: log.id,
    exerciseId: log.exerciseId,
    exerciseName: exercise.name,
    setCount: log.setCount,
    repsPerSet: log.repsPerSet,
    durationMinutes: log.durationMinutes,
    bodyWeightKgOverride: log.bodyWeightKgOverride,
    weightValue: log.weightValue,
    weightUnit: log.weightUnit as WeightUnit | null,
    metValueSnapshot: log.metValueSnapshot,
    caloriesBurned: log.caloriesBurned,
  },
  ```

- **`updateWorkoutLog`関数**: `prisma.workoutLog.update`の`data`、および戻り値DTOマッピングに、`addWorkoutLog`と全く同じ2行（`weightValue: data.weightValue ?? null, weightUnit: data.weightUnit ?? null,` / `weightValue: updated.weightValue, weightUnit: updated.weightUnit as WeightUnit | null,`）を同じ位置に追加する。

- **`getWorkoutSession`関数の`logs`マッピング:**
  - **編集前:**
  ```ts
  const logs: WorkoutLogDTO[] = s.logs.map((l) => ({
    id: l.id,
    exerciseId: l.exerciseId,
    exerciseName: l.exercise.name,
    setCount: l.setCount,
    repsPerSet: l.repsPerSet,
    durationMinutes: l.durationMinutes,
    bodyWeightKgOverride: l.bodyWeightKgOverride,
    metValueSnapshot: l.metValueSnapshot,
    caloriesBurned: l.caloriesBurned,
  }));
  ```
  - **編集後:**
  ```ts
  const logs: WorkoutLogDTO[] = s.logs.map((l) => ({
    id: l.id,
    exerciseId: l.exerciseId,
    exerciseName: l.exercise.name,
    setCount: l.setCount,
    repsPerSet: l.repsPerSet,
    durationMinutes: l.durationMinutes,
    bodyWeightKgOverride: l.bodyWeightKgOverride,
    weightValue: l.weightValue,
    weightUnit: l.weightUnit as WeightUnit | null,
    metValueSnapshot: l.metValueSnapshot,
    caloriesBurned: l.caloriesBurned,
  }));
  ```

- **import変更**: ファイル先頭の型importに `WeightUnit` を追加（`import type { ActionResult, WorkoutSessionSummaryDTO, WorkoutSessionDetailDTO, WorkoutLogDTO, DashboardStatsDTO, WeightUnit } from "@/types";`）。
- **エラー処理**: 既存のエラー分岐（セッション未検出・マシン未検出・体重未設定・バリデーション失敗）は変更しない。`weightValue`/`weightUnit`はバリデーション層（§3.5）で既にペア制約が保証されているため、Server Action内で追加のチェックは不要。

### 3.8 `src/components/ExercisePicker.tsx`

- **編集前:**
```tsx
import { MUSCLE_GROUP_LABELS, INTENSITY_LABELS, type ExerciseDTO } from "@/types";
...
<option key={ex.id} value={ex.id}>
  {ex.name}（{MUSCLE_GROUP_LABELS[ex.muscleGroup]} / {INTENSITY_LABELS[ex.intensityCategory]} / MET {ex.metValue}）
</option>
```
- **編集後:**
```tsx
import { MUSCLE_GROUP_LABELS, type ExerciseDTO } from "@/types";
...
<option key={ex.id} value={ex.id}>
  {ex.name}（{MUSCLE_GROUP_LABELS[ex.muscleGroup]} / MET {ex.metValue}）
</option>
```
- 他のロジック（`ExercisePickerProps`、`<select>`の属性等）は変更なし。

### 3.9 `src/components/ExerciseForm.tsx`

- **編集前**: `intensityCategory` の `useState<IntensityCategory>("MODERATE")`、対応する `<select id="exercise-intensity">` ブロック、`createExercise`呼び出し時の`intensityCategory`フィールドが存在する。
- **編集後の期待形（差分）:**
  - import文から `INTENSITY_CATEGORIES, INTENSITY_LABELS, type IntensityCategory` を削除。
  - `const [intensityCategory, setIntensityCategory] = useState<IntensityCategory>("MODERATE");` の行を削除。
  - `<div>`〜`</div>`の強度選択ブロック（`id="exercise-intensity"`のラベル・select一式）を削除。
  - `createExercise({...})` 呼び出しから `intensityCategory,` の行を削除:
    ```tsx
    const result = await createExercise({
      name,
      muscleGroup,
      metValue: Number(metValue),
      description: description || undefined,
    });
    ```
- 他のフィールド（マシン名・部位・MET値・説明）のUI・状態管理は変更なし。

### 3.10 `src/app/exercises/page.tsx`

- **編集前:**
```tsx
import { MUSCLE_GROUPS, MUSCLE_GROUP_LABELS, INTENSITY_LABELS, type MuscleGroup } from "@/types";
...
<p className="text-sm text-gray-500">
  {MUSCLE_GROUP_LABELS[ex.muscleGroup]} / {INTENSITY_LABELS[ex.intensityCategory]} / MET {ex.metValue}
</p>
```
- **編集後:**
```tsx
import { MUSCLE_GROUPS, MUSCLE_GROUP_LABELS, type MuscleGroup } from "@/types";
...
<p className="text-sm text-gray-500">
  {MUSCLE_GROUP_LABELS[ex.muscleGroup]} / MET {ex.metValue}
</p>
```
- 他のロジック（フィルタリンク生成、削除フォーム）は変更なし。

### 3.11 `src/components/WorkoutLogForm.tsx`

- **編集前**: `bodyWeightKgOverride`用の状態・入力欄のみ存在し、重さ関連の状態・入力欄が無い（情報収集レポート出典・§3.11に該当する既存コード全体は詳細確認済み）。
- **編集後の期待形（差分）:**

1. import文に型を追加:
```tsx
import { WEIGHT_UNITS, WEIGHT_UNIT_LABELS, type WeightUnit, type ExerciseDTO, type WorkoutLogDTO } from "@/types";
```

2. 状態を追加（`bodyWeightKgOverride`の状態定義の直後）:
```tsx
const [weightValue, setWeightValue] = useState("");
const [weightUnit, setWeightUnit] = useState<WeightUnit>("KG");
```

3. `handleSubmit`内、`addWorkoutLog`呼び出しのpayloadに追加:
```tsx
const result = await addWorkoutLog(sessionId, {
  exerciseId,
  setCount: Number(setCount),
  repsPerSet: Number(repsPerSet),
  durationMinutes: Number(durationMinutes),
  bodyWeightKgOverride: bodyWeightKgOverride ? Number(bodyWeightKgOverride) : undefined,
  weightValue: weightValue ? Number(weightValue) : undefined,
  weightUnit: weightValue ? weightUnit : undefined,
});
```
（`weightValue`が空文字なら`weightUnit`も送らない。これによりZodの`superRefine`ペア制約と整合する。）

4. 成功時のフォームリセット処理に追加（`setBodyWeightKgOverride("")`の直後）:
```tsx
setWeightValue("");
setWeightUnit("KG");
```

5. JSX: 「運動時間（分）」ブロックと「体重（kg・上書き、任意）」ブロックの間に新設:
```tsx
<div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
  <div>
    <label htmlFor="workout-log-weight-value" className="block text-sm font-medium">
      重さ（任意）
    </label>
    <input
      id="workout-log-weight-value"
      type="number"
      step="0.1"
      value={weightValue}
      onChange={(e) => setWeightValue(e.target.value)}
      className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
    />
    {fieldErrors.weightValue && <p className="text-xs text-red-600">{fieldErrors.weightValue[0]}</p>}
  </div>
  <div>
    <label htmlFor="workout-log-weight-unit" className="block text-sm font-medium">単位</label>
    <select
      id="workout-log-weight-unit"
      value={weightUnit}
      onChange={(e) => setWeightUnit(e.target.value as WeightUnit)}
      className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
    >
      {WEIGHT_UNITS.map((u) => (
        <option key={u} value={u}>{WEIGHT_UNIT_LABELS[u]}</option>
      ))}
    </select>
    {fieldErrors.weightUnit && <p className="text-xs text-red-600">{fieldErrors.weightUnit[0]}</p>}
  </div>
</div>
```
- **UX方針（重要）**: `weightUnit`の`<select>`を切り替えても`weightValue`の数値は変換されない（単位ラベルが変わるだけ）。基本設計書§3.2の方針に基づき、自動換算は実装しない。
- **エラー処理**: `fieldErrors.weightValue`/`fieldErrors.weightUnit`は、Server Actionが返す`ActionResult`の`fieldErrors`をそのまま表示する既存パターンに従う（他のフィールドと同じ扱い）。

### 3.12 `src/components/WorkoutLogItem.tsx`

- **編集前:**
```tsx
import type { WorkoutLogDTO } from "@/types";
...
<p className="text-sm text-gray-500">
  {log.setCount}セット × {log.repsPerSet}レップ / {log.durationMinutes}分
  {log.bodyWeightKgOverride ? ` / 体重${log.bodyWeightKgOverride}kg` : ""}
</p>
```
- **編集後:**
```tsx
import { WEIGHT_UNIT_LABELS, type WorkoutLogDTO } from "@/types";
...
<p className="text-sm text-gray-500">
  {log.setCount}セット × {log.repsPerSet}レップ / {log.durationMinutes}分
  {log.bodyWeightKgOverride ? ` / 体重${log.bodyWeightKgOverride}kg` : ""}
  {log.weightValue !== null && log.weightUnit ? ` / 重さ${log.weightValue}${WEIGHT_UNIT_LABELS[log.weightUnit]}` : ""}
</p>
```
- **条件分岐の意図**: `weightValue`が`null`（未入力）の場合は何も表示しない（既存の`bodyWeightKgOverride`表示パターンと同じ「値がある時だけ追記」方式）。`weightValue`と`weightUnit`は常にペアで保存されているため（§3.5のバリデーションで保証）、`weightValue !== null`のチェックのみで`weightUnit`も非nullであることが実質的に保証されるが、TypeScriptの型上`weightUnit`も明示的にチェックし、コンパイラの非nullチェックを満たす。

### 3.13 `tests/e2e/workout-flow.spec.ts`

**背景**: 代表MET値が3.0（LIGHT）→5.5（MODERATE）に変わるため、既存のカロリー期待値（110.3kcal等）は全て再計算が必要。また、マシン選択の文字列に付与されていた強度サフィックス（「（軽度）」）は無くなる。

**再計算した期待値（MET=5.5固定）:**

| シナリオ | 体重(kg) | 時間(h) | 計算式 | 結果 |
|---|---|---|---|---|
| デフォルト体重70kg・上書きなし | 70 | 0.5 | 5.5×70×0.5×1.05=202.125 | **202.1 kcal** |
| 体重上書き80kg | 80 | 0.5 | 5.5×80×0.5×1.05=231.0 | **231 kcal** |
| 体重上書き70kg（セット数比較・削除テスト共通） | 70 | 0.5 | 上記と同じ | **202.1 kcal** |

**変更箇所（既存文字列 → 新文字列）:**

1. `selectExerciseByName(page, "チェストプレス（軽度）")` の全出現箇所（76, 93, 110, 133, 148行目付近、計5箇所）を `selectExerciseByName(page, "チェストプレス")` に置換。
2. 85行目付近: `await expect(page.getByText("110.3 kcal").first()).toBeVisible();` → `await expect(page.getByText("202.1 kcal").first()).toBeVisible();`（コメントの計算式も `MET5.5 × 70kg × 0.5h × 1.05 = 202.125 → 202.1kcal` に更新）。
3. 102行目付近: `await expect(page.getByText("126 kcal").first()).toBeVisible();` → `await expect(page.getByText("231 kcal").first()).toBeVisible();`（コメントの計算式も `MET5.5 × 80kg × 0.5h × 1.05 = 231.0kcal` に更新）。
4. 116行目・125行目付近（セット数のみ変更テスト）: `"110.3 kcal"` の2箇所を `"202.1 kcal"` に置換。
5. 155行目付近（削除テスト）: `"110.3 kcal"` を `"202.1 kcal"` に置換。
6. 「シード投入後、部位フィルタ「脚」でレッグプレス等のみ表示される」テスト（37-44行目）は、名称に強度サフィックスが元々含まれていないアサーションのため**変更不要**（統合後も`getByText("レッグプレス").first()`は単一のExercise行にマッチする）。
7. その他（`registerAndLogin`、`createSession`、トップ画面・実績関連テスト）は本改修と無関係のため変更不要。

### 3.14 `.github/workflows/deploy.yml`

- **編集前:**
```yaml
script: |
  cd ~/MuscleBoost
  git fetch origin
  git reset --hard origin/main
  npm install
  npm run build
  pm2 restart muscleboost 2>/dev/null || pm2 start ecosystem.config.js --env production
  pm2 save
  echo "✅ Deploy completed at $(date)"
```
- **編集後:**
```yaml
script: |
  cd ~/MuscleBoost
  git fetch origin
  git reset --hard origin/main
  npm install
  npx prisma migrate deploy
  npm run build
  pm2 restart muscleboost 2>/dev/null || pm2 start ecosystem.config.js --env production
  pm2 save
  echo "✅ Deploy completed at $(date)"
```
- **前提条件**: VPS上の `~/MuscleBoost/.env`（Git管理外）に `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` が設定済みであること（アプリ実行時に既に必須の環境変数のため、通常は設定済みのはず。デプロイ前に念のため `cat ~/MuscleBoost/.env | grep TURSO` で存在確認することを推奨）。
- **根拠**: `prisma.config.ts` の `adapter` 設定により、`npx prisma migrate deploy` は常に環境変数`TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN`が指すTursoデータベースに対して実行される（`schema.prisma`の`datasource.url`= `DATABASE_URL`はこのコマンドには使用されない）。詳細は `basic-design.md` §7参照。

---

## 4. エラー処理方針（まとめ）

| ケース | 発生層 | 処理 |
|---|---|---|
| `weightValue`のみ入力・`weightUnit`未選択 | `workoutLogInputSchema`（superRefine） | `fieldErrors.weightUnit`に「重さの単位を選択してください」を設定し保存を中断 |
| `weightUnit`のみ選択・`weightValue`未入力 | 同上 | `fieldErrors.weightValue`に「重さの値を入力してください」を設定し保存を中断（※フォーム側の実装（§3.11手順3）では`weightValue`が空なら`weightUnit`を送らないため、通常この経路には到達しない。直接API呼び出し等の防御的チェックとして機能する） |
| `weightValue`が0以下・1000超過 | 同上 | Zodの`positive()`/`max(1000)`メッセージを`fieldErrors.weightValue`に設定 |
| `weightUnit`が"KG"/"LB"以外の値 | 同上 | `z.enum(WEIGHT_UNITS)`によりZodのデフォルトエラーメッセージで拒否 |
| マイグレーション適用時、想定外のExercise IDが本番に存在する | マイグレーションSQL適用時 | `migrate deploy`はSQLエラーで停止する（トランザクション内のため未適用分はロールバックされる想定）。実施者は本番の`Exercise.id`一覧を事前確認すること（§3.2） |
| デプロイ時、`migrate deploy`失敗 | GitHub Actions（`script_stop: true`設定済み） | 後続の`npm run build`/`pm2 restart`は実行されない（現状の`script_stop: true`設定のまま維持されるため、途中失敗時は自動的にそこで停止する） |

---

## 5. テスト観点（QAチーム用）

### 5.1 正常系
- [ ] マシン選択プルダウンに、統合対象10機種がそれぞれ1件ずつ表示され、強度サフィックスが表示されない。
- [ ] 有酸素マシン6機種は従来通り個別に表示される。
- [ ] 重さ（例: 60kg）を入力して記録を保存すると、一覧・詳細に「60kg」がそのまま表示される。
- [ ] 単位をLBに切り替えて重さ（例: 135lb）を入力して保存すると、「135lb」がそのまま表示される（**KGへの自動換算が行われていないこと**を明示的に確認）。
- [ ] 重さを入力しない場合、一覧・詳細に重さ関連の表示が一切出ない（空文字やnullが表示されない）。
- [ ] 重さの値・単位を変えても、同一のセット数・レップ数・時間・体重であれば `caloriesBurned` の表示値が変化しない（カロリー計算に重さが影響しないことの直接確認）。
- [ ] マイマシン作成フォームに強度選択欄が表示されず、マシン名・部位・MET値・説明のみで作成できる。
- [ ] 既存（マイグレーション前に作成された）`WorkoutLog`が、マイグレーション後も一覧・詳細で正しく表示され、マシン名が統合後の名称（強度サフィックスなし）になっている。
- [ ] 既存`WorkoutLog`の`caloriesBurned`表示値がマイグレーション前後で変化していない。

### 5.2 異常系
- [ ] 重さのみ入力し単位を未選択の状態（UIの通常操作では発生しないが、フォーム外から不正な入力を送った場合を想定）で保存しようとするとエラーになる。
- [ ] 重さに0以下の値（例: 0, -10）を入力すると保存時にエラーメッセージが表示される。
- [ ] 重さに極端に大きい値（1000超、例: 1001）を入力するとエラーになる。
- [ ] マシン未選択のまま記録を保存しようとするとエラーになる（既存動作の回帰確認）。
- [ ] 体重未設定・上書きなしで記録を保存しようとするとエラーになる（既存動作の回帰確認、`tests/e2e/workout-flow.spec.ts`の該当テストが引き続きパスすること）。

### 5.3 境界値
- [ ] 重さ = 0.1（許容される最小の正の値）で保存できる。
- [ ] 重さ = 1000（許容される最大値）で保存できる。
- [ ] 重さ = 1000.1（上限超過）でエラーになる。
- [ ] 小数第2位以下を含む重さ（例: 62.75）を入力した場合の保存・表示の挙動確認（`step="0.1"`のUI制約はあるが、直接送信された場合にDBへ小数のまま保存されること）。

### 5.4 単位変換（KG/ポンド切り替え）
- [ ] KG選択時に入力した数値と、LB選択時に入力した数値が、保存後にそれぞれ元の単位ラベル付きでそのまま表示される（変換されていないことの確認、NFR-5）。
- [ ] 同一記録の編集時（`updateWorkoutLog`使用箇所がある場合）、単位を後からKG→LBに変更しても数値が自動変換されず、ユーザーが入力した数値のまま更新されることを確認する。

### 5.5 マイグレーション後の既存データ整合性検証
- [ ] マイグレーション適用前に存在した全`WorkoutLog`件数が、適用後も同数のまま存在する（行が失われていないこと）。
- [ ] マイグレーション適用前後で、各`WorkoutLog.caloriesBurned`・`metValueSnapshot`の値が一致する（`SELECT id, caloriesBurned, metValueSnapshot FROM WorkoutLog`の適用前後スナップショットを比較）。
- [ ] マイグレーション適用後、`Exercise`テーブルに`seed-*-LIGHT`/`seed-*-VIGOROUS`のIDが一件も残っていない。
- [ ] マイグレーション適用後、`WorkoutLog.exerciseId`が指す`Exercise`行が必ず存在する（孤立参照が無い、外部キー整合性の確認）。
- [ ] マイグレーション適用後、`Exercise`テーブルの総件数が16件（筋トレ10 + 有酸素6）+カスタムマシン件数になっている。
- [ ] `npm run db:seed`をマイグレーション適用後のDBに対して再実行しても、件数・内容が変化しない（冪等性の確認）。

### 5.6 既存自動テストの回帰確認
- [ ] `npx tsc --noEmit` がエラー0件。
- [ ] `npm run test`（Vitest, `tests/unit/calorie.test.ts`）が全件パス（無改修のまま）。
- [ ] `npx playwright test`（`tests/e2e/workout-flow.spec.ts`含む全件）が、§3.13の更新後に全件パス。

---

## 6. 完了条件チェックリスト

- [ ] `prisma/schema.prisma`: `Exercise.intensityCategory`削除、`WorkoutLog.weightValue`/`weightUnit`追加が反映されている。
- [ ] マイグレーションファイルが生成され、データ移行SQL（再ポイント→削除→リネーム）がDDLより前に配置されている。
- [ ] ローカル環境で `npx prisma migrate dev` が成功し、`Exercise`が16件、`WorkoutLog`の孤立参照が0件であることを確認済み。
- [ ] `prisma/seed.ts` が1マシン1エントリ形式に書き換えられ、`npm run db:seed` が冪等に成功する。
- [ ] `src/types/index.ts`: `IntensityCategory`関連が削除され、`WeightUnit`関連が追加されている。
- [ ] `src/lib/validation.ts`: `exerciseInputSchema`から強度項目削除、`workoutLogInputSchema`に重さ項目のペア制約付きで追加されている。
- [ ] `src/app/actions/exercises.ts`・`src/app/actions/workouts.ts`: DTOマッピング・create/update dataが更新されている。
- [ ] `ExercisePicker.tsx`・`ExerciseForm.tsx`・`exercises/page.tsx`: 強度関連の表示・入力が完全に除去されている。
- [ ] `WorkoutLogForm.tsx`・`WorkoutLogItem.tsx`: 重さ入力・表示が実装され、単位切替時に自動換算されないことを確認済み。
- [ ] `calculateCalories()`（`src/lib/calorie.ts`）のシグネチャ・実装・呼び出し引数が一切変更されていない（diff上で本ファイルの変更が無いことを確認）。
- [ ] `tests/e2e/workout-flow.spec.ts` が§3.13の内容で更新され、全件パスする。
- [ ] `.github/workflows/deploy.yml` に `npx prisma migrate deploy` ステップが追加されている。
- [ ] 本番デプロイ前に、本番Turso DBの既存`Exercise.id`一覧がマイグレーションSQLの想定と一致することを確認済み。
- [ ] `npx tsc --noEmit` / `npm run test` / `npx playwright test` が全てエラー0件・全件パスで完走する。
