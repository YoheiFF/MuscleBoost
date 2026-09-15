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

/** 月曜始まりの曜日ラベル。heatmap.daysの並び順（月曜始まり、buildWorkoutHeatmapが
 *  computeHeatmapWindowStartUtcで週の月曜0:00(JST)に整列済み）と対応させる固定表示用配列。 */
const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"] as const;

export default function WorkoutHeatmap({ heatmap }: WorkoutHeatmapProps) {
  // heatmap.daysは必ず月曜日始まり（buildWorkoutHeatmapのdays[0]が週の月曜0:00(JST)に
  // 整列済みのため）。7日ずつのチャンクに区切ると、区切り位置(0, 7, 14, ...)は常に月曜に
  // 一致するので、各チャンクの先頭(index0)は必ず月曜、以降 火→水→木→金→土→日 の順になる。
  // 最後のチャンクのみ「今日」で打ち切られるため7件に満たない場合があるが、それでも先頭は
  // 月曜のままなので、下記の曜日ラベル列との縦位置の対応は常に崩れない。
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
      <div className="flex gap-2">
        <div className="flex shrink-0 flex-col gap-[3px] pb-2">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="h-3 text-[10px] leading-3 text-gray-400 sm:h-3.5 sm:leading-[14px]"
            >
              {label}
            </div>
          ))}
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
      </div>
      <p className="mt-2 text-xs text-gray-400">直近5ヶ月間の記録日数: {heatmap.totalActiveDays}日</p>
    </div>
  );
}
