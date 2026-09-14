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
