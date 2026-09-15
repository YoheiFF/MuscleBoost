// src/app/workouts/[id]/page.tsx
import { notFound, redirect } from "next/navigation";
import { getWorkoutSession, deleteWorkoutSession } from "@/app/actions/workouts";
import { listExercises } from "@/app/actions/exercises";
import { prisma } from "@/lib/prisma";
import { getCurrentUserOrThrow } from "@/lib/session-guard";
import CalorieDisclaimer from "@/components/CalorieDisclaimer";
import WorkoutSessionLogs from "@/components/WorkoutSessionLogs";
import DeleteSessionButton from "@/components/DeleteSessionButton";

interface WorkoutSessionPageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkoutSessionPage({ params }: WorkoutSessionPageProps) {
  const { id } = await params;
  const [session, exercises] = await Promise.all([getWorkoutSession(id), listExercises()]);
  if (!session) {
    notFound();
  }

  const user = await getCurrentUserOrThrow();
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });

  async function handleDeleteSession() {
    "use server";
    await deleteWorkoutSession(id);
    redirect("/workouts");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{new Date(session.performedAt).toLocaleString("ja-JP")}</h1>
        <form action={handleDeleteSession}>
          <DeleteSessionButton
            confirmMessage={`この日の記録を${session.logCount}件すべて削除します。よろしいですか？`}
          />
        </form>
      </div>
      {session.memo && <p className="text-sm text-gray-500">{session.memo}</p>}
      <CalorieDisclaimer />
      <WorkoutSessionLogs
        sessionId={session.id}
        initialLogs={session.logs}
        exercises={exercises}
        defaultWeightKg={dbUser?.defaultWeightKg ?? null}
      />
    </div>
  );
}
