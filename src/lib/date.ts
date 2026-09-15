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

/**
 * 指定した日時が属するJST暦日を"YYYY-MM-DD"形式のキー文字列で返す。
 * ヒートマップの日付バケット化・ストリーク計算・自己ベストの「直近7日以内」判定で、
 * 日付の同一性判定に用いる（getJstDayRangeUtcと同じ固定+9時間オフセット方式）。
 */
export function getJstDateKey(date: Date): string {
  const jstMs = date.getTime() + JST_OFFSET_MS;
  const jstDate = new Date(jstMs);
  const year = jstDate.getUTCFullYear();
  const month = String(jstDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jstDate.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * UTCミリ秒空間でdays日を加算した新しいDateを返す（daysに負数を渡すと過去方向）。
 * JSTはサマータイムが存在せず固定オフセットのため、UTC ms単位での24時間刻み加算が
 * そのままJST暦日境界の加算と一致する（日付境界をまたぐ特別な補正は不要）。
 */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * 指定した日時が属するJST暦週（月曜始まり）の開始・終了（ともにUTCのDate、半開区間）を返す。
 * 週の開始は「その週の月曜日のJST 0:00」に対応するUTC時刻。
 */
export function getJstWeekRangeUtc(date: Date): { weekStartUtc: Date; weekEndUtc: Date } {
  const { dayStartUtc } = getJstDayRangeUtc(date);
  const jstDayStart = new Date(dayStartUtc.getTime() + JST_OFFSET_MS);
  const dayOfWeek = jstDayStart.getUTCDay(); // 0=日, 1=月, ..., 6=土
  const daysSinceMonday = (dayOfWeek + 6) % 7; // 月曜=0, 火曜=1, ..., 日曜=6
  const weekStartUtc = new Date(dayStartUtc.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);
  const weekEndUtc = new Date(weekStartUtc.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { weekStartUtc, weekEndUtc };
}

/**
 * 指定した日時が属するJST暦月の開始・終了（ともにUTCのDate、半開区間）を返す。
 * 月の開始は「その月1日のJST 0:00」に対応するUTC時刻。
 */
export function getJstMonthRangeUtc(date: Date): { monthStartUtc: Date; monthEndUtc: Date } {
  const jstMs = date.getTime() + JST_OFFSET_MS;
  const jstDate = new Date(jstMs);
  const year = jstDate.getUTCFullYear();
  const month = jstDate.getUTCMonth();
  const monthStartAsUtcMs = Date.UTC(year, month, 1, 0, 0, 0, 0) - JST_OFFSET_MS;
  const monthEndAsUtcMs = Date.UTC(year, month + 1, 1, 0, 0, 0, 0) - JST_OFFSET_MS;
  return {
    monthStartUtc: new Date(monthStartAsUtcMs),
    monthEndUtc: new Date(monthEndAsUtcMs),
  };
}
