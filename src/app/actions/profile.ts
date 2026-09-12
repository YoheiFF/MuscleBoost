// src/app/actions/profile.ts
"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserOrThrow } from "@/lib/session-guard";
import { profileUpdateSchema, weightLogInputSchema } from "@/lib/validation";
import type { ActionResult, WeightLogDTO } from "@/types";

export async function updateProfile(input: unknown): Promise<ActionResult> {
  const user = await getCurrentUserOrThrow();
  const parsed = profileUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力内容を確認してください", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  await prisma.user.update({ where: { id: user.id }, data: parsed.data });
  return { ok: true, data: undefined };
}

export async function addWeightLog(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUserOrThrow();
  const parsed = weightLogInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力内容を確認してください", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const log = await prisma.weightLog.create({
    data: {
      userId: user.id,
      weightKg: parsed.data.weightKg,
      recordedAt: parsed.data.recordedAt ?? new Date(),
    },
  });
  return { ok: true, data: { id: log.id } };
}

export async function listWeightLogs(): Promise<WeightLogDTO[]> {
  const user = await getCurrentUserOrThrow();
  const rows = await prisma.weightLog.findMany({
    where: { userId: user.id },
    orderBy: { recordedAt: "desc" },
  });
  return rows.map((r) => ({ id: r.id, weightKg: r.weightKg, recordedAt: r.recordedAt.toISOString() }));
}
