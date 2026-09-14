// src/components/WorkoutLogItem.tsx
import { WEIGHT_UNIT_LABELS, type WorkoutLogDTO } from "@/types";

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
          {log.weightValue !== null && log.weightUnit ? ` / 重さ${log.weightValue}${WEIGHT_UNIT_LABELS[log.weightUnit]}` : ""}
        </p>
        <p className="text-sm font-semibold text-gray-900">{log.caloriesBurned} kcal</p>
        {log.weightValue !== null ? (
          <p className="text-sm text-gray-700">
            ボリューム: {log.volumeKg} kg
            {log.weightUnit === "LB" ? "（lb→kg換算）" : ""}
          </p>
        ) : (
          <p className="text-sm text-gray-400">ボリューム: -（重さ未入力）</p>
        )}
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
