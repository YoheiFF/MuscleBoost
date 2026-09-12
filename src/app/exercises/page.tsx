// src/app/exercises/page.tsx
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { listExercises, deleteCustomExercise } from "@/app/actions/exercises";
import { MUSCLE_GROUPS, MUSCLE_GROUP_LABELS, INTENSITY_LABELS, type MuscleGroup } from "@/types";

interface ExercisesPageProps {
  searchParams: Promise<{ muscleGroup?: string }>;
}

export default async function ExercisesPage({ searchParams }: ExercisesPageProps) {
  const { muscleGroup } = await searchParams;
  const validGroup = (MUSCLE_GROUPS as readonly string[]).includes(muscleGroup ?? "")
    ? (muscleGroup as MuscleGroup)
    : undefined;
  const exercises = await listExercises(validGroup ? { muscleGroup: validGroup } : undefined);

  async function handleDelete(id: string) {
    "use server";
    await deleteCustomExercise(id);
    revalidatePath("/exercises");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">マシン一覧</h1>
        <Link href="/exercises/new" className="rounded bg-blue-600 px-3 py-2 text-sm text-white">
          マイマシンを追加
        </Link>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href="/exercises"
          className={`rounded border px-3 py-1 ${!validGroup ? "border-blue-600 text-blue-600" : "border-gray-300"}`}
        >
          すべて
        </Link>
        {MUSCLE_GROUPS.map((g) => (
          <Link
            key={g}
            href={`/exercises?muscleGroup=${g}`}
            className={`rounded border px-3 py-1 ${validGroup === g ? "border-blue-600 text-blue-600" : "border-gray-300"}`}
          >
            {MUSCLE_GROUP_LABELS[g]}
          </Link>
        ))}
      </div>
      <ul className="flex flex-col gap-2">
        {exercises.map((ex) => (
          <li key={ex.id} className="flex items-center justify-between rounded border border-gray-200 bg-white p-3">
            <div>
              <p className="font-medium">
                {ex.name}
                {ex.isCustom && (
                  <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">マイマシン</span>
                )}
              </p>
              <p className="text-sm text-gray-500">
                {MUSCLE_GROUP_LABELS[ex.muscleGroup]} / {INTENSITY_LABELS[ex.intensityCategory]} / MET {ex.metValue}
              </p>
              {ex.description && <p className="mt-1 text-xs text-gray-400">{ex.description}</p>}
            </div>
            {/* マスタ（isCustom=false）行には編集・削除ボタンを表示しない（設計書§5 二重防御方針） */}
            {ex.isCustom && (
              <form action={handleDelete.bind(null, ex.id)}>
                <button type="submit" className="text-sm text-red-600 hover:underline">
                  削除
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
