// src/components/PersonalBestList.tsx
import { MUSCLE_GROUP_LABELS } from "@/types";
import type { PersonalBestDTO } from "@/types";

interface PersonalBestListProps {
  personalBests: PersonalBestDTO[];
}

export default function PersonalBestList({ personalBests }: PersonalBestListProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">自己ベスト</h3>
      {personalBests.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">重量を記録した種目がまだありません。</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {personalBests.map((pb) => (
            <li
              key={pb.exerciseId}
              className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {pb.exerciseName}
                  {(pb.isRecentWeightPb || pb.isRecentVolumePb) && (
                    <span className="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
                      NEW
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-400">{MUSCLE_GROUP_LABELS[pb.muscleGroup]}</p>
              </div>
              <div className="text-right text-xs text-gray-600">
                {pb.maxWeightKg !== null && <p>最大重量 {pb.maxWeightKg}kg</p>}
                {pb.maxVolumeKg !== null && <p>最大ボリューム {pb.maxVolumeKg}kg</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
