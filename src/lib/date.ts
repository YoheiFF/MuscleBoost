// src/lib/date.ts

/** 現在時刻から指定日数前のISO日時文字列と現在時刻を返す（ダッシュボード集計用） */
export function getPeriodRange(days: number): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to };
}

/**
 * JST（Asia/Tokyo, UTC+9固定・サマータイムなし）のミリ秒オフセット。
 * 「同じ日」の判定はサーバーの実行環境（OS/NodeプロセスのTZ設定）に依存させないため、
 * Intlのタイムゾーン機能やTZ環境変数を使わず、この固定オフセットで暦日境界を計算する。
 */
export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 指定したUTC日時が属するJST暦日の開始・終了（ともにUTCのDateとして返す）を返す。
 * 戻り値は半開区間 [dayStartUtc, dayEndUtc) として扱うこと
 * （dayEndUtcは「翌日のJST 0:00」に対応するUTC時刻であり、その瞬間ちょうどは含まない）。
 *
 * 例: date = 2026-09-15T15:00:00.000Z（UTC）はJSTでは2026-09-16T00:00:00.000（JST 2026-09-16の0:00ちょうど）
 *     → dayStartUtc = 2026-09-15T15:00:00.000Z, dayEndUtc = 2026-09-16T15:00:00.000Z
 */
export function getJstDayRangeUtc(date: Date): { dayStartUtc: Date; dayEndUtc: Date } {
  const jstMs = date.getTime() + JST_OFFSET_MS;
  const jstDate = new Date(jstMs);
  const year = jstDate.getUTCFullYear();
  const month = jstDate.getUTCMonth();
  const day = jstDate.getUTCDate();
  const jstMidnightAsUtcMs = Date.UTC(year, month, day, 0, 0, 0, 0) - JST_OFFSET_MS;
  return {
    dayStartUtc: new Date(jstMidnightAsUtcMs),
    dayEndUtc: new Date(jstMidnightAsUtcMs + 24 * 60 * 60 * 1000),
  };
}
