// src/components/MuscleBalanceChart.tsx
"use client";

import { useState } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { MUSCLE_GROUP_CHART_COLORS } from "@/types";
import type { MuscleGroupBalanceDTO } from "@/types";

interface MuscleBalanceChartProps {
  balance: MuscleGroupBalanceDTO[];
}

type BalanceMetric = "count" | "volume";

export default function MuscleBalanceChart({ balance }: MuscleBalanceChartProps) {
  const [metric, setMetric] = useState<BalanceMetric>("count");
  const hasData = balance.length > 0;
  const dataKey = metric === "count" ? "logCount" : "volumeKg";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-700">部位別バランス（直近90日）</h3>
        <div className="flex overflow-hidden rounded-md border border-gray-200 text-xs">
          <button
            type="button"
            onClick={() => setMetric("count")}
            className={metric === "count" ? "bg-blue-600 px-2 py-1 text-white" : "bg-white px-2 py-1 text-gray-600"}
          >
            頻度
          </button>
          <button
            type="button"
            onClick={() => setMetric("volume")}
            className={metric === "volume" ? "bg-blue-600 px-2 py-1 text-white" : "bg-white px-2 py-1 text-gray-600"}
          >
            ボリューム
          </button>
        </div>
      </div>
      {!hasData ? (
        <p className="py-10 text-center text-sm text-gray-400">
          記録がまだありません。トレーニングを記録すると部位別バランスが表示されます。
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={balance} dataKey={dataKey} nameKey="label" innerRadius={60} outerRadius={90} paddingAngle={2}>
              {balance.map((entry) => (
                <Cell key={entry.muscleGroup} fill={MUSCLE_GROUP_CHART_COLORS[entry.muscleGroup]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => (metric === "count" ? [`${value}件`, "頻度"] : [`${value}kg`, "ボリューム"])}
            />
            <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
