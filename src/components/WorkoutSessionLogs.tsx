// src/components/WorkoutSessionLogs.tsx
// 設計書1.3節には明記が無いが、WorkoutLogForm/WorkoutLogItemを組み合わせて
// セッション詳細画面のログ一覧状態（追加・編集・削除）をクライアント側で管理するために追加した補助コンポーネント。
"use client";

import { useState } from "react";
import { updateWorkoutLog, deleteWorkoutLog } from "@/app/actions/workouts";
import WorkoutLogForm from "@/components/WorkoutLogForm";
import WorkoutLogItem from "@/components/WorkoutLogItem";
import ExercisePicker from "@/components/ExercisePicker";
import { isCardioMuscleGroup, type ExerciseDTO, type WorkoutLogDTO } from "@/types";

interface WorkoutSessionLogsProps {
  sessionId: string;
  initialLogs: WorkoutLogDTO[];
  exercises: ExerciseDTO[];
  defaultWeightKg: number | null;
}

export default function WorkoutSessionLogs({
  sessionId,
  initialLogs,
  exercises,
  defaultWeightKg,
}: WorkoutSessionLogsProps) {
  const [logs, setLogs] = useState<WorkoutLogDTO[]>(initialLogs);
  const [editingLog, setEditingLog] = useState<WorkoutLogDTO | null>(null);
  const [editExerciseId, setEditExerciseId] = useState("");
  const [editSetCount, setEditSetCount] = useState("");
  const [editRepsPerSet, setEditRepsPerSet] = useState("");
  const [editDurationMinutes, setEditDurationMinutes] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editFieldErrors, setEditFieldErrors] = useState<Record<string, string[]>>({});
  const [editSubmitting, setEditSubmitting] = useState(false);

  const editExercise = exercises.find((ex) => ex.id === editExerciseId) ?? null;
  const editRequiresDuration = editExercise !== null && isCardioMuscleGroup(editExercise.muscleGroup);

  const totalCalories = Math.round(logs.reduce((sum, l) => sum + l.caloriesBurned, 0) * 10) / 10;
  const totalVolumeKg = Math.round(logs.reduce((sum, l) => sum + l.volumeKg, 0) * 10) / 10;

  function startEdit(log: WorkoutLogDTO) {
    setEditingLog(log);
    setEditExerciseId(log.exerciseId);
    setEditSetCount(String(log.setCount));
    setEditRepsPerSet(String(log.repsPerSet));
    setEditDurationMinutes(String(log.durationMinutes));
    setEditError(null);
    setEditFieldErrors({});
  }

  async function handleUpdate() {
    if (!editingLog) return;
    setEditSubmitting(true);
    setEditError(null);
    setEditFieldErrors({});
    const result = await updateWorkoutLog(editingLog.id, {
      exerciseId: editExerciseId,
      setCount: Number(editSetCount),
      repsPerSet: Number(editRepsPerSet),
      durationMinutes: editRequiresDuration && editDurationMinutes !== "" ? Number(editDurationMinutes) : undefined,
    });
    setEditSubmitting(false);
    if (!result.ok) {
      setEditError(result.error);
      setEditFieldErrors(result.fieldErrors ?? {});
      return;
    }
    setLogs((prev) => prev.map((l) => (l.id === result.data.log.id ? result.data.log : l)));
    setEditingLog(null);
  }

  async function handleDelete(id: string) {
    const result = await deleteWorkoutLog(id);
    if (result.ok) {
      setLogs((prev) => prev.filter((l) => l.id !== id));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-6">
        <div>
          <p className="text-sm text-gray-500">合計消費カロリー</p>
          <p className="text-2xl font-bold text-gray-900">{totalCalories} kcal</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">合計トレーニングボリューム（kg換算）</p>
          <p className="text-2xl font-bold text-gray-900">{totalVolumeKg} kg</p>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-lg font-semibold">記録を追加</h2>
        <WorkoutLogForm
          sessionId={sessionId}
          exercises={exercises}
          defaultWeightKg={defaultWeightKg}
          onCreated={(log) => setLogs((prev) => [...prev, log])}
        />
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">記録一覧</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-gray-500">まだ記録がありません。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {logs.map((log) => (
              <WorkoutLogItem key={log.id} log={log} onEdit={startEdit} onDelete={handleDelete} />
            ))}
          </ul>
        )}
      </section>

      {editingLog && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4">
            <h3 className="mb-4 text-lg font-semibold">記録を編集</h3>
            {editError && <p className="mb-2 text-sm text-red-600">{editError}</p>}
            {defaultWeightKg === null && (
              <p className="mb-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                体重が未設定です。
                <a href="/profile" className="ml-1 underline">
                  プロフィール
                </a>
                でデフォルト体重を設定してください。
              </p>
            )}
            <div className="flex flex-col gap-3">
              <ExercisePicker exercises={exercises} value={editExerciseId} onChange={setEditExerciseId} />
              <input
                type="number"
                value={editSetCount}
                onChange={(e) => setEditSetCount(e.target.value)}
                placeholder="セット数"
                className="rounded border border-gray-300 px-3 py-2"
              />
              <input
                type="number"
                value={editRepsPerSet}
                onChange={(e) => setEditRepsPerSet(e.target.value)}
                placeholder="レップ数"
                className="rounded border border-gray-300 px-3 py-2"
              />
              {editRequiresDuration && (
                <div>
                  <input
                    type="number"
                    step="0.1"
                    value={editDurationMinutes}
                    onChange={(e) => setEditDurationMinutes(e.target.value)}
                    placeholder="運動時間（分）"
                    className="w-full rounded border border-gray-300 px-3 py-2"
                  />
                  {editFieldErrors.durationMinutes && (
                    <p className="text-xs text-red-600">{editFieldErrors.durationMinutes[0]}</p>
                  )}
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingLog(null)}
                className="rounded border border-gray-300 px-3 py-2 text-sm"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleUpdate}
                disabled={editSubmitting}
                className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                {editSubmitting ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
