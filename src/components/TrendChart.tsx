// src/components/TrendChart.tsx
"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { TrendSeriesDTO } from "@/types";

interface TrendChartProps {
  series: TrendSeriesDTO;
}

type TrendUnit = "week" | "month";
type TrendMetric = "calories" | "volume";

export default function TrendChart({ series }: TrendChartProps) {
  const [unit, setUnit] = useState<TrendUnit>("week");
  const [metric, setMetric] = useState<TrendMetric>("calories");

  const points = unit === "week" ? series.weekly : series.monthly;
  const hasData = points.some((p) => p.sessionCount > 0);
  const dataKey = metric === "calories" ? "totalCalories" : "totalVolumeKg";
  const unitLabel = metric === "calories" ? "kcal" : "kg";
  const metricName = metric === "calories" ? "消費カロリー" : "ボリューム";
  const color = metric === "calories" ? "#f97316" : "#3b82f6";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-700">推移トレンド</h3>
        <div className="flex flex-wrap gap-2 text-xs">
          <div className="flex overflow-hidden rounded-md border border-gray-200">
            <button
              type="button"
              onClick={() => setUnit("week")}
              className={unit === "week" ? "bg-blue-600 px-2 py-1 text-white" : "bg-white px-2 py-1 text-gray-600"}
            >
              週別
            </button>
            <button
              type="button"
              onClick={() => setUnit("month")}
              className={unit === "month" ? "bg-blue-600 px-2 py-1 text-white" : "bg-white px-2 py-1 text-gray-600"}
            >
              月別
            </button>
          </div>
          <div className="flex overflow-hidden rounded-md border border-gray-200">
            <button
              type="button"
              onClick={() => setMetric("calories")}
              className={metric === "calories" ? "bg-orange-500 px-2 py-1 text-white" : "bg-white px-2 py-1 text-gray-600"}
            >
              カロリー
            </button>
            <button
              type="button"
              onClick={() => setMetric("volume")}
              className={metric === "volume" ? "bg-orange-500 px-2 py-1 text-white" : "bg-white px-2 py-1 text-gray-600"}
            >
              ボリューム
            </button>
          </div>
        </div>
      </div>
      {!hasData ? (
        <p className="py-10 text-center text-sm text-gray-400">
          記録がまだありません。トレーニングを記録するとグラフが表示されます。
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={points} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9ca3af" />
            <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
            <Tooltip formatter={(value: number) => [`${value} ${unitLabel}`, metricName]} />
            <Area type="monotone" dataKey={dataKey} stroke={color} fill={color} fillOpacity={0.2} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
