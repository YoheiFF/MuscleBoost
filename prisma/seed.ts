// prisma/seed.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const adapter = new PrismaLibSql({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const prisma = new PrismaClient({ adapter });

// 筋トレマシン: Compendium of Physical Activities の
// "Weight lifting, light/moderate effort"=3.0, "Resistance training, multiple exercises, 8-15 reps, varied resistance"=5.5,
// "Weight lifting (power lifting/body building), vigorous effort"=6.0 を根拠に3段階を割り当てる。
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

const STRENGTH_LEVELS: Array<{ suffix: string; intensityCategory: string; metValue: number; description: string }> = [
  { suffix: "（軽度）", intensityCategory: "LIGHT", metValue: 3.0, description: "Compendium: Weight lifting, light or moderate effort" },
  { suffix: "（中等度）", intensityCategory: "MODERATE", metValue: 5.5, description: "Compendium: Resistance training, multiple exercises, 8-15 reps, varied resistance" },
  { suffix: "（高強度）", intensityCategory: "VIGOROUS", metValue: 6.0, description: "Compendium: Weight lifting (power lifting/body building), vigorous effort" },
];

// 有酸素マシン: 厚労省「健康づくりのための身体活動基準」参考資料 運動のメッツ表 準拠
const CARDIO_MACHINES: Array<{ name: string; intensityCategory: string; metValue: number; description: string }> = [
  { name: "エアロバイク（30〜50W）", intensityCategory: "LIGHT", metValue: 3.5, description: "厚労省メッツ表: 自転車エルゴメーター(30〜50ワット)" },
  { name: "トレッドミル（速歩 93m/分）", intensityCategory: "MODERATE", metValue: 4.3, description: "厚労省メッツ表: やや速歩（平地、93m/分）" },
  { name: "トレッドミル（ジョギング）", intensityCategory: "VIGOROUS", metValue: 7.0, description: "厚労省メッツ表: ジョギング" },
  { name: "エアロバイク（90〜100W）", intensityCategory: "VIGOROUS", metValue: 6.8, description: "厚労省メッツ表: 自転車エルゴメーター(90〜100ワット)" },
  { name: "ランニングマシン（134m/分）", intensityCategory: "HIGH_INTENSITY", metValue: 8.3, description: "厚労省メッツ表: ランニング(134m/分)" },
  { name: "クロストレーナー", intensityCategory: "VIGOROUS", metValue: 8.0, description: "Compendium: Circuit training, including some aerobic movement with minimal rest" },
];

async function main() {
  for (const machine of STRENGTH_MACHINES) {
    for (const level of STRENGTH_LEVELS) {
      const name = `${machine.name}${level.suffix}`;
      await prisma.exercise.upsert({
        where: { id: `seed-${machine.name}-${level.intensityCategory}` },
        update: {},
        create: {
          id: `seed-${machine.name}-${level.intensityCategory}`,
          name,
          muscleGroup: machine.muscleGroup,
          intensityCategory: level.intensityCategory,
          metValue: level.metValue,
          description: level.description,
          isCustom: false,
        },
      });
    }
  }

  for (const cardio of CARDIO_MACHINES) {
    await prisma.exercise.upsert({
      where: { id: `seed-cardio-${cardio.name}` },
      update: {},
      create: {
        id: `seed-cardio-${cardio.name}`,
        name: cardio.name,
        muscleGroup: "CARDIO",
        intensityCategory: cardio.intensityCategory,
        metValue: cardio.metValue,
        description: cardio.description,
        isCustom: false,
      },
    });
  }

  console.log("シードデータ投入完了: マシンマスタ", STRENGTH_MACHINES.length * STRENGTH_LEVELS.length + CARDIO_MACHINES.length, "件");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
