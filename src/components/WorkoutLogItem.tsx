// src/components/WorkoutLogItem.tsx
import type { WorkoutLogDTO } from "@/types";

interface WorkoutLogItemProps {
  log: WorkoutLogDTO;
  onEdit: (log: WorkoutLogDTO) => void;
  onDelete: (id: string) => void;
}

export default function WorkoutLogItem({ log, onEdit, onDelete }: WorkoutLogItemProps) {
  return (
    <li className="flex items-center justify-between rounded border border-gray-200 bg-white p-3">
      <div>
        <p className="font-medium">{log.exerciseName}</p>
        <p className="text-sm text-gray-500">
          {log.setCount}セット × {log.repsPerSet}レップ / {log.durationMinutes}分
          {log.bodyWeightKgOverride ? ` / 体重${log.bodyWeightKgOverride}kg` : ""}
        </p>
        <p className="text-sm font-semibold text-gray-900">{log.caloriesBurned} kcal</p>
      </div>
      <div className="flex gap-3 text-sm">
        <button type="button" onClick={() => onEdit(log)} className="text-blue-600 hover:underline">
          編集
        </button>
        <button type="button" onClick={() => onDelete(log.id)} className="text-red-600 hover:underline">
          削除
        </button>
      </div>
    </li>
  );
}
