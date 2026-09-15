// src/app/actions/achievements.ts
"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserOrThrow } from "@/lib/session-guard";
import {
  buildWorkoutHeatmap,
  buildTrendSeries,
  buildMuscleGroupBalance,
  buildPersonalBests,
  buildAchievementBadges,
} from "@/lib/achievements";
import type { AchievementSessionInput } from "@/lib/achievements";
import type { AchievementsDataDTO, MuscleGroup, WeightUnit } from "@/types";

/**
 * 実績画面（/workouts）向けに、ヒートマップ・トレンド・部位別バランス・自己ベスト・
 * 達成バッジの5要素分のデータをまとめて返す。ログインユーザー自身の全期間の
 * WorkoutSession（logs, exercise込み）を1回だけ取得し、以降はDBアクセスなしで
 * src/lib/achievements.tsの純粋関数群に処理を委譲する。
 */
export async function getAchievementsData(): Promise<AchievementsDataDTO> {
  const user = await getCurrentUserOrThrow();

  const sessions = await prisma.workoutSession.findMany({
    where: { userId: user.id },
    include: { logs: { include: { exercise: true } } },
    orderBy: { performedAt: "asc" },
  });

  const input: AchievementSessionInput[] = sessions.map((s) => ({
    id: s.id,
    performedAt: s.performedAt,
    logs: s.logs.map((l) => ({
      exerciseId: l.exerciseId,
      exerciseName: l.exercise.name,
      muscleGroup: l.exercise.muscleGroup as MuscleGroup,
      setCount: l.setCount,
      repsPerSet: l.repsPerSet,
      weightValue: l.weightValue,
      weightUnit: l.weightUnit as WeightUnit | null,
      caloriesBurned: l.caloriesBurned,
    })),
  }));

  const now = new Date();
  const heatmap = buildWorkoutHeatmap(input, now);
  const trend = buildTrendSeries(input, now);
  const muscleBalance = buildMuscleGroupBalance(input, now);
  const personalBests = buildPersonalBests(input, now);
  const badges = buildAchievementBadges(input, heatmap);

  return { heatmap, trend, muscleBalance, personalBests, badges };
}
