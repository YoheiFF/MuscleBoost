// src/components/WorkoutLogForm.tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { addWorkoutLog } from "@/app/actions/workouts";
import ExercisePicker from "@/components/ExercisePicker";
import { WEIGHT_UNITS, WEIGHT_UNIT_LABELS, type WeightUnit, type ExerciseDTO, type WorkoutLogDTO } from "@/types";

interface WorkoutLogFormProps {
  sessionId: string;
  exercises: ExerciseDTO[];
  defaultWeightKg: number | null;
  onCreated?: (log: WorkoutLogDTO) => void;
}

export default function WorkoutLogForm({
  sessionId,
  exercises,
  defaultWeightKg,
  onCreated,
}: WorkoutLogFormProps) {
  const router = useRouter();
  const [exerciseId, setExerciseId] = useState("");
  const [setCount, setSetCount] = useState("");
  const [repsPerSet, setRepsPerSet] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [weightValue, setWeightValue] = useState("");
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("KG");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const result = await addWorkoutLog(sessionId, {
      exerciseId,
      setCount: Number(setCount),
      repsPerSet: Number(repsPerSet),
      durationMinutes: Number(durationMinutes),
      weightValue: weightValue ? Number(weightValue) : undefined,
      weightUnit: weightValue ? weightUnit : undefined,
    });

    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }

    setExerciseId("");
    setSetCount("");
    setRepsPerSet("");
    setDurationMinutes("");
    setWeightValue("");
    setWeightUnit("KG");

    if (onCreated) {
      onCreated(result.data.log);
    } else {
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {defaultWeightKg === null && (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          体重が未設定です。
          <a href="/profile" className="ml-1 underline">
            プロフィール
          </a>
          でデフォルト体重を設定してください。
        </p>
      )}
      <div>
        <label htmlFor="workout-log-exercise" className="block text-sm font-medium">マシン</label>
        <ExercisePicker
          id="workout-log-exercise"
          exercises={exercises}
          value={exerciseId}
          onChange={setExerciseId}
        />
        {fieldErrors.exerciseId && <p className="text-xs text-red-600">{fieldErrors.exerciseId[0]}</p>}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="workout-log-set-count" className="block text-sm font-medium">セット数</label>
          <input
            id="workout-log-set-count"
            type="number"
            value={setCount}
            onChange={(e) => setSetCount(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          />
          {fieldErrors.setCount && <p className="text-xs text-red-600">{fieldErrors.setCount[0]}</p>}
        </div>
        <div>
          <label htmlFor="workout-log-reps" className="block text-sm font-medium">レップ数</label>
          <input
            id="workout-log-reps"
            type="number"
            value={repsPerSet}
            onChange={(e) => setRepsPerSet(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          />
          {fieldErrors.repsPerSet && <p className="text-xs text-red-600">{fieldErrors.repsPerSet[0]}</p>}
        </div>
      </div>
      <div>
        <label htmlFor="workout-log-duration" className="block text-sm font-medium">運動時間（分）</label>
        <input
          id="workout-log-duration"
          type="number"
          step="0.1"
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(e.target.value)}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
        />
        {fieldErrors.durationMinutes && (
          <p className="text-xs text-red-600">{fieldErrors.durationMinutes[0]}</p>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
        <div>
          <label htmlFor="workout-log-weight-value" className="block text-sm font-medium">
            重さ（任意）
          </label>
          <input
            id="workout-log-weight-value"
            type="number"
            step="0.1"
            value={weightValue}
            onChange={(e) => setWeightValue(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          />
          {fieldErrors.weightValue && <p className="text-xs text-red-600">{fieldErrors.weightValue[0]}</p>}
        </div>
        <div>
          <label htmlFor="workout-log-weight-unit" className="block text-sm font-medium">単位</label>
          <select
            id="workout-log-weight-unit"
            value={weightUnit}
            onChange={(e) => setWeightUnit(e.target.value as WeightUnit)}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          >
            {WEIGHT_UNITS.map((u) => (
              <option key={u} value={u}>{WEIGHT_UNIT_LABELS[u]}</option>
            ))}
          </select>
          {fieldErrors.weightUnit && <p className="text-xs text-red-600">{fieldErrors.weightUnit[0]}</p>}
        </div>
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
      >
        {submitting ? "保存中..." : "記録を追加"}
      </button>
    </form>
  );
}
