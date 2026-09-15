// src/app/workouts/today/page.tsx（当日セッションへの直行専用ページ。UIを持たない中継ページ）
import { redirect } from "next/navigation";
import { getOrCreateTodaysWorkoutSession } from "@/app/actions/workouts";

export default async function TodayWorkoutSessionRedirectPage() {
  const result = await getOrCreateTodaysWorkoutSession();
  if (!result.ok) {
    // getOrCreateTodaysWorkoutSessionは現状バリデーション失敗を返さない
    // （入力を受け取らないため）が、将来の変更に備えたフォールバックとして一覧へ逃がす。
    redirect("/workouts");
  }
  redirect(`/workouts/${result.data.id}`);
}
