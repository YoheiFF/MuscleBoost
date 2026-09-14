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
-- Step 2: スキーマDDL
-- ============================================================

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Exercise" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "muscleGroup" TEXT NOT NULL,
    "metValue" REAL NOT NULL,
    "description" TEXT,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Exercise_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Exercise" ("id", "name", "muscleGroup", "metValue", "description", "isCustom", "createdByUserId", "createdAt", "updatedAt") SELECT "id", "name", "muscleGroup", "metValue", "description", "isCustom", "createdByUserId", "createdAt", "updatedAt" FROM "Exercise";
DROP TABLE "Exercise";
ALTER TABLE "new_Exercise" RENAME TO "Exercise";
CREATE INDEX "Exercise_createdByUserId_idx" ON "Exercise"("createdByUserId");
CREATE INDEX "Exercise_muscleGroup_idx" ON "Exercise"("muscleGroup");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- AlterTable
ALTER TABLE "WorkoutLog" ADD COLUMN "weightValue" REAL;
ALTER TABLE "WorkoutLog" ADD COLUMN "weightUnit" TEXT;
