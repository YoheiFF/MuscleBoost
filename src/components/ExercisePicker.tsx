// src/components/ExercisePicker.tsx
import { MUSCLE_GROUP_LABELS, type ExerciseDTO } from "@/types";

interface ExercisePickerProps {
  exercises: ExerciseDTO[];
  value: string; // exerciseId
  onChange: (exerciseId: string) => void;
  id?: string;
}

export default function ExercisePicker({ exercises, value, onChange, id }: ExercisePickerProps) {
  return (
    <select
      id={id}
      aria-label="マシン"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-gray-300 px-3 py-2"
    >
      <option value="">マシンを選択してください</option>
      {exercises.map((ex) => (
        <option key={ex.id} value={ex.id}>
          {ex.name}（{MUSCLE_GROUP_LABELS[ex.muscleGroup]} / MET {ex.metValue}）
        </option>
      ))}
    </select>
  );
}
