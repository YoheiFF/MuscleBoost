// src/app/exercises/new/page.tsx
import ExerciseForm from "@/components/ExerciseForm";

export default function NewExercisePage() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-xl font-bold">マイマシンを追加</h1>
      <ExerciseForm />
    </div>
  );
}
