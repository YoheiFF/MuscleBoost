// src/components/WorkoutLogForm.tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { addWorkoutLog } from "@/app/actions/workouts";
import { estimateDurationMinutes } from "@/lib/calorie";
import ExercisePicker from "@/components/ExercisePicker";
import type { ExerciseDTO, WorkoutLogDTO } from "@/types";

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
  const [secondsPerSet, setSecondsPerSet] = useState("");
  const [bodyWeightKgOverride, setBodyWeightKgOverride] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);

  // 「セット数×秒数から時間を計算」補助ボタン。運動時間欄はユーザーが直接編集可能な値であり、
  // 送信時は最終的にフォームに表示されている値を送る。
  function handleEstimateDuration() {
    const estimated = estimateDurationMinutes(Number(setCount), Number(secondsPerSet));
    if (estimated > 0) {
      setDurationMinutes(String(estimated));
    }
  }

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
      bodyWeightKgOverride: bodyWeightKgOverride ? Number(bodyWeightKgOverride) : undefined,
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
    setSecondsPerSet("");
    setBodyWeightKgOverride("");

    if (onCreated) {
      onCreated(result.data.log);
    } else {
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-end">
        <div>
          <label htmlFor="workout-log-seconds-per-set" className="block text-sm font-medium">
            1セットあたり秒数（任意）
          </label>
          <input
            id="workout-log-seconds-per-set"
            type="number"
            value={secondsPerSet}
            onChange={(e) => setSecondsPerSet(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>
        <button
          type="button"
          onClick={handleEstimateDuration}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          セット数×秒数から時間を計算
        </button>
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
      <div>
        <label htmlFor="workout-log-weight-override" className="block text-sm font-medium">
          体重（kg・上書き、任意）
        </label>
        <input
          id="workout-log-weight-override"
          type="number"
          step="0.1"
          value={bodyWeightKgOverride}
          onChange={(e) => setBodyWeightKgOverride(e.target.value)}
          placeholder={defaultWeightKg ? String(defaultWeightKg) : "未設定"}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
        />
        {fieldErrors.bodyWeightKgOverride && (
          <p className="text-xs text-red-600">{fieldErrors.bodyWeightKgOverride[0]}</p>
        )}
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
