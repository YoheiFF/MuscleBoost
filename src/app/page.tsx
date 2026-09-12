// src/app/page.tsx（トップ画面: 記録する／実績を確認する の選択メニュー）
import Link from "next/link";

export default function TopPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">今日は何をしますか？</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/workouts/new"
          className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-6 text-center hover:bg-gray-50"
        >
          <span className="text-3xl">💪</span>
          <span className="text-lg font-semibold text-gray-900">① 今日の記録をする</span>
          <span className="text-sm text-gray-500">ジムでのトレーニングを記録します</span>
        </Link>
        <Link
          href="/workouts"
          className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-6 text-center hover:bg-gray-50"
        >
          <span className="text-3xl">📊</span>
          <span className="text-lg font-semibold text-gray-900">② 今までの実績を確認する</span>
          <span className="text-sm text-gray-500">これまでのトレーニング履歴・消費カロリーを見ます</span>
        </Link>
      </div>
    </div>
  );
}
