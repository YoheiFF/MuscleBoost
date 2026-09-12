// src/lib/date.ts

/** 現在時刻から指定日数前のISO日時文字列と現在時刻を返す（ダッシュボード集計用） */
export function getPeriodRange(days: number): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to };
}
