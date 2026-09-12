// src/app/actions/workouts.ts
"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserOrThrow } from "@/lib/session-guard";
import { calculateCalories } from "@/lib/calorie";
import { getPeriodRange } from "@/lib/date";
import { workoutSessionInputSchema, workoutLogInputSchema } from "@/lib/validation";
import type {
  ActionResult, WorkoutSessionSummaryDTO, WorkoutSessionDetailDTO,
  WorkoutLogDTO, DashboardStatsDTO,
} from "@/types";

export async function createWorkoutSession(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUserOrThrow();
  const parsed = workoutSessionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力内容を確認してください", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const session = await prisma.workoutSession.create({
    data: { userId: user.id, performedAt: parsed.data.performedAt, memo: parsed.data.memo },
  });
  return { ok: true, data: { id: session.id } };
}

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
  const weightKg = data.bodyWeightKgOverride ?? dbUser?.defaultWeightKg ?? null;
  if (weightKg === null) {
    return { ok: false, error: "体重を入力してください（プロフィールでデフォルト体重を設定するか、この記録で体重を入力してください）" };
  }

  const caloriesBurned = calculateCalories({
    metValue: exercise.metValue,
    weightKg,
    durationMinutes: data.durationMinutes,
  });

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

  return {
    ok: true,
    data: {
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
    },
  };
}

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
  const weightKg = data.bodyWeightKgOverride ?? dbUser?.defaultWeightKg ?? null;
  if (weightKg === null) {
    return { ok: false, error: "体重を入力してください" };
  }

  // MET値はマスタの現在値を使う（マシン変更されていなければスナップショットは既存値のまま維持してもよいが、
  // ここでは編集時点の最新マスタ値で再計算し、metValueSnapshotも更新する: 編集操作は「今の情報で直す」行為とみなす）。
  const exercise = existing.exerciseId === data.exerciseId
    ? existing.exercise
    : await prisma.exercise.findUnique({ where: { id: data.exerciseId } });
  if (!exercise) {
    return { ok: false, error: "対象のマシンが見つかりません" };
  }

  const caloriesBurned = calculateCalories({
    metValue: exercise.metValue,
    weightKg,
    durationMinutes: data.durationMinutes,
  });

  const updated = await prisma.workoutLog.update({
    where: { id: logId },
    data: {
      exerciseId: data.exerciseId,
      setCount: data.setCount,
      repsPerSet: data.repsPerSet,
      durationMinutes: data.durationMinutes,
      bodyWeightKgOverride: data.bodyWeightKgOverride ?? null,
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
        setCount: updated.setCount,
        repsPerSet: updated.repsPerSet,
        durationMinutes: updated.durationMinutes,
        bodyWeightKgOverride: updated.bodyWeightKgOverride,
        metValueSnapshot: updated.metValueSnapshot,
        caloriesBurned: updated.caloriesBurned,
      },
    },
  };
}

export async function deleteWorkoutLog(logId: string): Promise<ActionResult> {
  const user = await getCurrentUserOrThrow();
  const existing = await prisma.workoutLog.findUnique({
    where: { id: logId },
    include: { workoutSession: true },
  });
  if (!existing || existing.workoutSession.userId !== user.id) {
    return { ok: false, error: "対象の記録が見つかりません" };
  }
  await prisma.workoutLog.delete({ where: { id: logId } });
  return { ok: true, data: undefined };
}

export async function deleteWorkoutSession(sessionId: string): Promise<ActionResult> {
  const user = await getCurrentUserOrThrow();
  const existing = await prisma.workoutSession.findUnique({ where: { id: sessionId } });
  if (!existing || existing.userId !== user.id) {
    return { ok: false, error: "対象のセッションが見つかりません" };
  }
  await prisma.workoutSession.delete({ where: { id: sessionId } }); // WorkoutLogはonDelete:Cascadeで自動削除
  return { ok: true, data: undefined };
}

export async function listWorkoutSessions(): Promise<WorkoutSessionSummaryDTO[]> {
  const user = await getCurrentUserOrThrow();
  const sessions = await prisma.workoutSession.findMany({
    where: { userId: user.id },
    include: { logs: true },
    orderBy: { performedAt: "desc" },
  });
  return sessions.map((s) => ({
    id: s.id,
    performedAt: s.performedAt.toISOString(),
    memo: s.memo,
    logCount: s.logs.length,
    totalCalories: Math.round(s.logs.reduce((sum, l) => sum + l.caloriesBurned, 0) * 10) / 10,
  }));
}

export async function getWorkoutSession(id: string): Promise<WorkoutSessionDetailDTO | null> {
  const user = await getCurrentUserOrThrow();
  const s = await prisma.workoutSession.findUnique({
    where: { id },
    include: { logs: { include: { exercise: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!s || s.userId !== user.id) return null;

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

  return {
    id: s.id,
    performedAt: s.performedAt.toISOString(),
    memo: s.memo,
    logCount: logs.length,
    totalCalories: Math.round(logs.reduce((sum, l) => sum + l.caloriesBurned, 0) * 10) / 10,
    logs,
  };
}

export async function getDashboardStats(periodDays: 7 | 30): Promise<DashboardStatsDTO> {
  const user = await getCurrentUserOrThrow();
  const { from, to } = getPeriodRange(periodDays);

  const sessions = await prisma.workoutSession.findMany({
    where: { userId: user.id, performedAt: { gte: from, lte: to } },
    include: { logs: true },
  });

  const totalCalories = sessions.reduce(
    (sum, s) => sum + s.logs.reduce((sSum, l) => sSum + l.caloriesBurned, 0),
    0
  );
  const logCount = sessions.reduce((sum, s) => sum + s.logs.length, 0);

  return {
    periodDays,
    totalCalories: Math.round(totalCalories * 10) / 10,
    sessionCount: sessions.length,
    logCount,
    from: from.toISOString(),
    to: to.toISOString(),
  };
}
