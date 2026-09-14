// src/app/actions/exercises.ts
"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserOrThrow } from "@/lib/session-guard";
import { exerciseInputSchema } from "@/lib/validation";
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

/** マスタ + 自分のカスタムマシンを一覧取得（他人のカスタムは含めない） */
export async function listExercises(filter?: { muscleGroup?: MuscleGroup }): Promise<ExerciseDTO[]> {
  const user = await getCurrentUserOrThrow();
  const rows = await prisma.exercise.findMany({
    where: {
      AND: [
        filter?.muscleGroup ? { muscleGroup: filter.muscleGroup } : {},
        { OR: [{ isCustom: false }, { createdByUserId: user.id }] },
      ],
    },
    orderBy: [{ isCustom: "asc" }, { muscleGroup: "asc" }, { name: "asc" }],
  });
  return rows.map(toDTO);
}

export async function createExercise(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUserOrThrow();
  const parsed = exerciseInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力内容を確認してください", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const created = await prisma.exercise.create({
    data: { ...parsed.data, isCustom: true, createdByUserId: user.id },
  });
  return { ok: true, data: { id: created.id } };
}

export async function deleteCustomExercise(id: string): Promise<ActionResult> {
  const user = await getCurrentUserOrThrow();
  const target = await prisma.exercise.findUnique({ where: { id } });
  if (!target || !target.isCustom || target.createdByUserId !== user.id) {
    return { ok: false, error: "対象のマシンが見つかりません" };
  }
  await prisma.exercise.delete({ where: { id } });
  return { ok: true, data: undefined };
}
