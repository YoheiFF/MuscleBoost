// src/app/workouts/page.tsx（実績確認: 週間・月間集計 + 履歴一覧）
import Link from "next/link";
import { getDashboardStats, listWorkoutSessions } from "@/app/actions/workouts";
import StatsSummaryCard from "@/components/StatsSummaryCard";
import CalorieDisclaimer from "@/components/CalorieDisclaimer";

export default async function WorkoutsPage() {
  const [weekStats, monthStats, sessions] = await Promise.all([
    getDashboardStats(7),
    getDashboardStats(30),
    listWorkoutSessions(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">実績</h1>
        <Link href="/workouts/new" className="rounded bg-blue-600 px-3 py-2 text-sm text-white">
          新規セッション
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatsSummaryCard periodLabel="直近7日" stats={weekStats} />
        <StatsSummaryCard periodLabel="直近30日" stats={monthStats} />
      </div>
      <CalorieDisclaimer />
      <h2 className="text-lg font-semibold">履歴</h2>
      {sessions.length === 0 ? (
        <p className="text-sm text-gray-500">まだ記録がありません。</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link
                href={`/workouts/${s.id}`}
                className="flex items-center justify-between rounded border border-gray-200 bg-white p-3 hover:bg-gray-50"
              >
                <div>
                  <p className="font-medium">{new Date(s.performedAt).toLocaleString("ja-JP")}</p>
                  {s.memo && <p className="text-sm text-gray-500">{s.memo}</p>}
                </div>
                <span className="text-sm text-gray-500">
                  {s.logCount}件 / {s.totalCalories} kcal
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
