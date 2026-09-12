// src/components/StatsSummaryCard.tsx
import type { DashboardStatsDTO } from "@/types";

interface StatsSummaryCardProps {
  periodLabel: string;
  stats: DashboardStatsDTO;
}

export default function StatsSummaryCard({ periodLabel, stats }: StatsSummaryCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-medium text-gray-500">{periodLabel}</h3>
      <p className="mt-1 text-2xl font-bold text-gray-900">{stats.totalCalories} kcal</p>
      <p className="mt-1 text-xs text-gray-500">
        セッション {stats.sessionCount} 回 / 記録 {stats.logCount} 件
      </p>
    </div>
  );
}
