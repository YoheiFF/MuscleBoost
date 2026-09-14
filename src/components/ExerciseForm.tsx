// src/components/ExerciseForm.tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createExercise } from "@/app/actions/exercises";
import {
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
  type MuscleGroup,
} from "@/types";

interface ExerciseFormProps {
  onCreated?: (id: string) => void;
}

export default function ExerciseForm({ onCreated }: ExerciseFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>("CHEST");
  const [metValue, setMetValue] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const result = await createExercise({
      name,
      muscleGroup,
      metValue: Number(metValue),
      description: description || undefined,
    });

    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }

    if (onCreated) {
      onCreated(result.data.id);
    } else {
      router.push("/exercises");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div>
        <label htmlFor="exercise-name" className="block text-sm font-medium">マシン名</label>
        <input
          id="exercise-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
        />
        {fieldErrors.name && <p className="text-xs text-red-600">{fieldErrors.name[0]}</p>}
      </div>
      <div>
        <label htmlFor="exercise-muscle-group" className="block text-sm font-medium">部位</label>
        <select
          id="exercise-muscle-group"
          value={muscleGroup}
          onChange={(e) => setMuscleGroup(e.target.value as MuscleGroup)}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
        >
          {MUSCLE_GROUPS.map((g) => (
            <option key={g} value={g}>
              {MUSCLE_GROUP_LABELS[g]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="exercise-met-value" className="block text-sm font-medium">MET値</label>
        <input
          id="exercise-met-value"
          type="number"
          step="0.1"
          value={metValue}
          onChange={(e) => setMetValue(e.target.value)}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
        />
        {fieldErrors.metValue && <p className="text-xs text-red-600">{fieldErrors.metValue[0]}</p>}
      </div>
      <div>
        <label htmlFor="exercise-description" className="block text-sm font-medium">説明（任意）</label>
        <textarea
          id="exercise-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
      >
        {submitting ? "保存中..." : "マシンを追加"}
      </button>
    </form>
  );
}
