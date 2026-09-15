// src/app/actions/workouts.ts
"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserOrThrow } from "@/lib/session-guard";
import { calculateCalories, estimateDurationMinutesForStrength } from "@/lib/calorie";
import { calculateVolumeKg } from "@/lib/volume";
import { resolveWeightKgForCalorie } from "@/lib/weight";
import { getPeriodRange, getJstDayRangeUtc } from "@/lib/date";
import { workoutSessionInputSchema, workoutLogInputSchema } from "@/lib/validation";
import { isCardioMuscleGroup } from "@/types";
import type {
  ActionResult, WorkoutSessionSummaryDTO, WorkoutSessionDetailDTO,
  WorkoutLogDTO, DashboardStatsDTO, WeightUnit, MuscleGroup,
} from "@/types";

/**
 * find-or-createの本体。userIdの「performedAtが属するJST暦日」の既存WorkoutSessionを検索し、
 * あれば再利用し（reused: true）、無ければ新規作成する（reused: false）。
 * createWorkoutSessionとgetOrCreateTodaysWorkoutSessionの両方から呼ばれる非公開ヘルパー。
 * 同一暦日に複数件該当する場合（本機能導入前に作られた既存データ等）は、
 * createdAt昇順で最も早く作られたものを正とする。
 */
async function resolveOrCreateSessionForDay(
  userId: string,
  performedAt: Date,
  memo: string | undefined
): Promise<{ id: string; reused: boolean }> {
  const { dayStartUtc, dayEndUtc } = getJstDayRangeUtc(performedAt);
  const existing = await prisma.workoutSession.findFirst({
    where: {
      userId,
      performedAt: { gte: dayStartUtc, lt: dayEndUtc },
    },
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    return { id: existing.id, reused: true };
  }
  const created = await prisma.workoutSession.create({
    data: { userId, performedAt, memo },
  });
  return { id: created.id, reused: false };
}

export async function createWorkoutSession(
  input: unknown
): Promise<ActionResult<{ id: string; reused: boolean }>> {
  const user = await getCurrentUserOrThrow();
  const parsed = workoutSessionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力内容を確認してください", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const result = await resolveOrCreateSessionForDay(user.id, parsed.data.performedAt, parsed.data.memo);
  return { ok: true, data: result };
}

/**
 * 「今日（JST基準）」を対象にfind-or-createする。入力なし。
 * ホーム画面「①今日の記録をする」→ /workouts/today から呼ばれる。
 */
export async function getOrCreateTodaysWorkoutSession(): Promise<
  ActionResult<{ id: string; reused: boolean }>
> {
  const user = await getCurrentUserOrThrow();
  const result = await resolveOrCreateSessionForDay(user.id, new Date(), undefined);
  return { ok: true, data: result };
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
