// src/components/WorkoutHeatmap.tsx
// カレンダーヒートマップ＋ストリーク表示。ブラウザAPI・useState等を使わないため
// Server Componentのまま実装する（"use client"不要）。
import type { HeatmapDayDTO, WorkoutHeatmapDTO } from "@/types";

interface WorkoutHeatmapProps {
  heatmap: WorkoutHeatmapDTO;
}

const LEVEL_CLASS: Record<0 | 1 | 2 | 3, string> = {
  0: "bg-slate-100",
  1: "bg-emerald-200",
  2: "bg-emerald-400",
  3: "bg-emerald-600",
};

export default function WorkoutHeatmap({ heatmap }: WorkoutHeatmapProps) {
  // 371日を7日ずつの列に区切る（暦週の月曜始まりへの厳密な整列は行わない設計判断。
  // basic-design.mdの通り、実装簡易化のため単純に7日単位のチャンクとする）。
  const weeks: HeatmapDayDTO[][] = [];
  for (let i = 0; i < heatmap.days.length; i += 7) {
    weeks.push(heatmap.days.slice(i, i + 7));
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-700">トレーニングカレンダー</h3>
        <div className="flex gap-4 text-sm">
          <span className="font-medium text-emerald-600">🔥 現在 {heatmap.currentStreak}日</span>
          <span className="text-gray-500">最長 {heatmap.longestStreak}日</span>
        </div>
      </div>
      <div className="flex gap-[3px] overflow-x-auto pb-2">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((day) => (
              <div
                key={day.date}
                title={`${day.date}: ${day.logCount}件 / ${day.totalCalories}kcal`}
                className={`h-3 w-3 rounded-sm sm:h-3.5 sm:w-3.5 ${LEVEL_CLASS[day.level]}`}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-400">直近1年間の記録日数: {heatmap.totalActiveDays}日</p>
    </div>
  );
}
