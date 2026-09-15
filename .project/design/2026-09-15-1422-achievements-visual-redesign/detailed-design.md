---
project_id: "2026-09-15-1422-achievements-visual-redesign"
phase: design
sub: detailed-design
created: "2026-09-15"
---
# 詳細設計書: 実績画面（/workouts）ビジュアル要素4種追加

本書は ClaudeCode に実装を依頼できる粒度で記述する。曖昧な表現（「適切に処理する」等）は用いない。実装者は本書の記述通りにファイルを編集すればよい。

前提ドキュメント:
- `requirements.md`（本プロジェクト内）
- `basic-design.md`（本プロジェクト内）
- 情報収集レポート: `C:\project\MuscleBoost\.project\research\topics\2026-09-15-1422-achievements-visual-redesign.md`

## 1. 概要

`/workouts`（実績画面）に、カレンダーヒートマップ・推移トレンドグラフ・部位別トレーニングバランス・自己ベスト＆達成バッジの4つのビジュアル要素を追加する。既存の集計（`getDashboardStats`, `listWorkoutSessions`）・スキーマ（`prisma/schema.prisma`）は変更しない。新規に、DB非依存の純粋集計ロジック（`src/lib/achievements.ts`）と、それを呼び出す単一のServer Action（`getAchievementsData()`）を追加し、グラフ描画には新規導入する**Recharts**を用いる。カレンダーヒートマップはライブラリを使わずTailwindで自前実装する。

## 2. 影響範囲（編集／新規ファイル一覧）

| No | ファイルパス | 種別 | 変更概要 |
|---|---|---|---|
| 1 | `src/lib/date.ts` | 変更 | `getJstDateKey`, `addDays`, `getJstWeekRangeUtc`, `getJstMonthRangeUtc`を追加 |
| 2 | `src/lib/achievements.ts` | 新規 | DB非依存の純粋集計関数5種＋定数群 |
| 3 | `src/app/actions/achievements.ts` | 新規 | `getAchievementsData()`（"use server"） |
| 4 | `src/types/index.ts` | 変更 | 新規DTO型9種、`MUSCLE_GROUP_CHART_COLORS`定数を追加 |
| 5 | `src/components/WorkoutHeatmap.tsx` | 新規 | カレンダーヒートマップ（Server Component） |
| 6 | `src/components/TrendChart.tsx` | 新規 | 推移トレンドグラフ（Client Component, Recharts） |
| 7 | `src/components/MuscleBalanceChart.tsx` | 新規 | 部位別バランス（Client Component, Recharts） |
| 8 | `src/components/PersonalBestList.tsx` | 新規 | 自己ベスト一覧（Server Component） |
| 9 | `src/components/AchievementBadges.tsx` | 新規 | 達成バッジ一覧（Server Component） |
| 10 | `src/app/workouts/page.tsx` | 変更 | 新規5コンポーネントの組み込み |
| 11 | `package.json` | 変更 | `recharts`依存を追加 |
| 12 | `package-lock.json` | 変更（自動） | `npm install`実行により再生成（手動編集禁止） |
| 13 | `tests/unit/date.test.ts` | 変更 | 新規日付関数の単体テスト追加 |
| 14 | `tests/unit/achievements.test.ts` | 新規 | 集計純粋関数の単体テスト |

編集対象外（変更なし）: `prisma/schema.prisma`、`src/app/actions/workouts.ts`（既存の全関数）、`src/lib/volume.ts`、`src/lib/calorie.ts`、`src/components/StatsSummaryCard.tsx`、`src/components/CalorieDisclaimer.tsx`、その他既存の全ファイル。

---

## 3. ファイル別変更詳細

### 3.1 `src/lib/date.ts`（変更）

#### 編集前の関連箇所（現状、全文）
既存の`getPeriodRange`, `JST_OFFSET_MS`, `getJstDayRangeUtc`はそのまま維持し、末尾に以下を追記する（既存コードは1文字も変更しない）。

#### 編集後の期待形（末尾に追記する内容）
```ts
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
```

#### 関数シグネチャと処理ロジック
```
function getJstDateKey(date: Date): string
  1. dateにJST_OFFSET_MSを加算し、UTCゲッターでJSTでの年月日を取り出す（getJstDayRangeUtcと同じ技法）。
  2. "YYYY-MM-DD"形式（0埋め2桁）の文字列に整形して返す。

function addDays(date: Date, days: number): Date
  1. date.getTime() + days*86400000 を新しいDateとして返す。

function getJstWeekRangeUtc(date: Date): { weekStartUtc, weekEndUtc }
  1. getJstDayRangeUtc(date)でその日のdayStartUtcを求める。
  2. dayStartUtc+JST_OFFSET_MSのgetUTCDay()でJST曜日(0=日〜6=土)を求める。
  3. 月曜からの経過日数 daysSinceMonday = (dayOfWeek + 6) % 7 を求める。
  4. weekStartUtc = dayStartUtc - daysSinceMonday日。weekEndUtc = weekStartUtc + 7日。

function getJstMonthRangeUtc(date: Date): { monthStartUtc, monthEndUtc }
  1. dateをJSTにオフセットし、year/monthを取り出す（getJstDayRangeUtcと同じ技法）。
  2. Date.UTC(year, month, 1) - JST_OFFSET_MS で「JST月初0:00」のUTC時刻を得る。
  3. Date.UTC(year, month+1, 1) - JST_OFFSET_MS で「翌月初0:00」のUTC時刻を得る（JavaScriptの
     Date.UTCはmonthに12以上を渡すと自動的に年を繰り上げるため、12月→翌年1月の処理も特別な分岐は不要）。
```

#### エラー処理
- 入力`date`が`Invalid Date`の場合、`getTime()`は`NaN`を返し、以降の計算は全て`NaN`または`Invalid Date`になる。呼び出し元（`src/lib/achievements.ts`）は常にPrismaが返す有効な`Date`型フィールド（`WorkoutSession.performedAt`）のみを渡すため、本関数内でのバリデーションは行わない（既存の`getJstDayRangeUtc`と同じ方針）。

---

### 3.2 `src/lib/achievements.ts`（新規）

#### 新規ファイルの内容
```ts
// src/lib/achievements.ts
// DB(Prisma)に一切依存しない、実績画面向けの純粋集計関数群。
// 現在時刻は必ず引数 now: Date として受け取り、関数内部で new Date() を呼び出さない
// （呼び出し側でDateを固定できるようにし、単体テストで決定的な結果を検証できるようにするため）。

import { calculateVolumeKg, LB_TO_KG_FACTOR } from "@/lib/volume";
import {
  JST_OFFSET_MS,
  getJstDateKey,
  addDays,
  getJstWeekRangeUtc,
  getJstMonthRangeUtc,
} from "@/lib/date";
import { MUSCLE_GROUPS, MUSCLE_GROUP_LABELS } from "@/types";
import type {
  MuscleGroup,
  WeightUnit,
  HeatmapDayDTO,
  WorkoutHeatmapDTO,
  TrendPointDTO,
  TrendSeriesDTO,
  MuscleGroupBalanceDTO,
  PersonalBestDTO,
  AchievementBadgeDTO,
  AchievementBadgesDTO,
} from "@/types";

/** 集計対象ログ1件分の入力形。Prismaの行そのものではなく、
 *  Server Action側でWorkoutLog+Exerciseの結合結果から詰め替えたプレーンな形。 */
export interface AchievementLogInput {
  exerciseId: string;
  exerciseName: string;
  muscleGroup: MuscleGroup;
  setCount: number;
  repsPerSet: number;
  weightValue: number | null;
  weightUnit: WeightUnit | null;
  caloriesBurned: number;
}

/** 集計対象セッション1件分の入力形。 */
export interface AchievementSessionInput {
  id: string;
  performedAt: Date;
  logs: AchievementLogInput[];
}

/** ヒートマップの表示日数（53週×7日=371日、GitHub風の1年表示用ウィンドウ） */
export const HEATMAP_WINDOW_DAYS = 371;
/** ヒートマップの色レベル境界（件数）。この件数以上でlevel2、level3になる */
export const HEATMAP_LEVEL_2_MIN_LOG_COUNT = 3;
export const HEATMAP_LEVEL_3_MIN_LOG_COUNT = 6;

export const TREND_WEEKLY_BUCKET_COUNT = 12;
export const TREND_MONTHLY_BUCKET_COUNT = 6;

/** 部位別バランスの集計対象期間（日） */
export const MUSCLE_BALANCE_WINDOW_DAYS = 90;

/** 自己ベストの「直近更新（NEW）」とみなす日数（当日を含む） */
export const RECENT_PB_WINDOW_DAYS = 7;

/** 連続日数バッジの閾値（日）。判定基準は「全期間の最長ストリーク」 */
export const STREAK_BADGE_THRESHOLDS = [3, 7, 14, 30, 60, 100] as const;
/** 累計セッション数バッジの閾値（回）。判定基準は「全期間のWorkoutSession件数」 */
export const SESSION_COUNT_BADGE_THRESHOLDS = [10, 30, 50, 100, 200, 365] as const;

/** "YYYY-MM-DD"のJST暦日キーを、連続比較可能な整数の日インデックスに変換する。
 *  日インデックスが1違えば暦日で1日違うことが保証される（ヒートマップのstreak計算、
 *  自己ベストの「直近N日以内」判定の両方で使う内部ヘルパー）。 */
function dateKeyToDayIndex(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / (24 * 60 * 60 * 1000));
}

function computeHeatmapLevel(logCount: number): 0 | 1 | 2 | 3 {
  if (logCount <= 0) return 0;
  if (logCount < HEATMAP_LEVEL_2_MIN_LOG_COUNT) return 1;
  if (logCount < HEATMAP_LEVEL_3_MIN_LOG_COUNT) return 2;
  return 3;
}

/**
 * 直近windowDays日分の日別ヒートマップデータ、現在のストリーク、最長ストリークを算出する。
 *
 * 処理ロジック:
 * 1. sessions（全期間）をJST暦日キー（getJstDateKey）でグルーピングし、
 *    日ごとのsessionCount/logCount/totalCaloriesを合算したMapを作る。
 * 2. 表示用グリッド(days)は、now を含む直近windowDays日分を「古い→新しい」の順で生成する。
 *    各日について、Mapに該当キーがあればその値を、無ければ0を使い、
 *    level(0-3)はcomputeHeatmapLevelで決定する。
 * 3. 現在のストリーク(currentStreak): 今日(getJstDateKey(now))にMap上の記録があれば
 *    今日を起点に、無ければ昨日を起点に、Map上に記録がある限り1日ずつ過去へ遡ってカウントする
 *    （「今日はまだジムに行っていないだけ」でストリークを0にしないための仕様）。
 * 4. 最長ストリーク(longestStreak): 1.のMapの全キー（371日の表示ウィンドウに限定しない、
 *    全期間）をdateKeyToDayIndexで整数化し、連続する整数の最長run長を求める。
 *    currentStreakは必ずこのrunの一部であるため、最終的にlongestStreak = max(longestStreak, currentStreak)とする。
 * 5. totalActiveDays: 2.のdays配列のうちlogCount>0の日数（表示ウィンドウ内のみ）。
 */
export function buildWorkoutHeatmap(
  sessions: AchievementSessionInput[],
  now: Date,
  windowDays: number = HEATMAP_WINDOW_DAYS
): WorkoutHeatmapDTO {
  const dayMap = new Map<string, { sessionCount: number; logCount: number; totalCalories: number }>();
  for (const s of sessions) {
    const key = getJstDateKey(s.performedAt);
    const entry = dayMap.get(key) ?? { sessionCount: 0, logCount: 0, totalCalories: 0 };
    entry.sessionCount += 1;
    entry.logCount += s.logs.length;
    entry.totalCalories += s.logs.reduce((sum, l) => sum + l.caloriesBurned, 0);
    dayMap.set(key, entry);
  }

  const days: HeatmapDayDTO[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const key = getJstDateKey(addDays(now, -i));
    const entry = dayMap.get(key);
    const logCount = entry?.logCount ?? 0;
    days.push({
      date: key,
      sessionCount: entry?.sessionCount ?? 0,
      logCount,
      totalCalories: entry ? Math.round(entry.totalCalories * 10) / 10 : 0,
      level: computeHeatmapLevel(logCount),
    });
  }

  let currentStreak = 0;
  {
    let offset = dayMap.has(getJstDateKey(now)) ? 0 : 1;
    while (dayMap.has(getJstDateKey(addDays(now, -offset)))) {
      currentStreak++;
      offset++;
    }
  }

  const dayIndexSet = new Set<number>();
  for (const key of dayMap.keys()) {
    dayIndexSet.add(dateKeyToDayIndex(key));
  }
  let longestStreak = 0;
  for (const idx of dayIndexSet) {
    if (dayIndexSet.has(idx - 1)) continue; // runの途中の要素はスキップ（runの先頭からのみ数える）
    let run = 1;
    let cur = idx;
    while (dayIndexSet.has(cur + 1)) {
      run++;
      cur++;
    }
    longestStreak = Math.max(longestStreak, run);
  }
  longestStreak = Math.max(longestStreak, currentStreak);

  const totalActiveDays = days.filter((d) => d.logCount > 0).length;

  return { days, currentStreak, longestStreak, totalActiveDays };
}

function formatWeekLabel(weekStartUtc: Date): string {
  const jst = new Date(weekStartUtc.getTime() + JST_OFFSET_MS);
  return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()}週`;
}

function formatMonthLabel(monthStartUtc: Date): string {
  const jst = new Date(monthStartUtc.getTime() + JST_OFFSET_MS);
  return `${jst.getUTCFullYear()}年${jst.getUTCMonth() + 1}月`;
}

/** nowが属する月からmonths ヶ月前の月の「1日」を表すDateを返す（getJstMonthRangeUtcに渡す基準日算出用）。
 *  日を1日に固定することで、月末日（31日等）が対象月に存在しないことによるズレを避ける。 */
function subtractJstMonths(date: Date, months: number): Date {
  const jstMs = date.getTime() + JST_OFFSET_MS;
  const jstDate = new Date(jstMs);
  const year = jstDate.getUTCFullYear();
  const month = jstDate.getUTCMonth();
  const targetMonthFirstAsUtcMs = Date.UTC(year, month - months, 1, 0, 0, 0, 0) - JST_OFFSET_MS;
  return new Date(targetMonthFirstAsUtcMs);
}

function aggregateBucket(
  sessions: AchievementSessionInput[],
  start: Date,
  end: Date,
  label: string,
  periodKey: string
): TrendPointDTO {
  let totalCalories = 0;
  let totalVolumeKg = 0;
  let sessionCount = 0;
  for (const s of sessions) {
    if (s.performedAt >= start && s.performedAt < end) {
      sessionCount++;
      for (const l of s.logs) {
        totalCalories += l.caloriesBurned;
        totalVolumeKg += calculateVolumeKg({
          setCount: l.setCount,
          repsPerSet: l.repsPerSet,
          weightValue: l.weightValue,
          weightUnit: l.weightUnit,
        });
      }
    }
  }
  return {
    periodKey,
    label,
    periodStart: start.toISOString(),
    totalCalories: Math.round(totalCalories * 10) / 10,
    totalVolumeKg: Math.round(totalVolumeKg * 10) / 10,
    sessionCount,
  };
}

/**
 * 週別(weeklyCount件)・月別(monthlyCount件)の消費カロリー・ボリューム・セッション数の推移を算出する。
 *
 * 処理ロジック:
 * 1. 週別: offset = weeklyCount-1 ～ 0 の順に、nowからoffset*7日前を基準日としてgetJstWeekRangeUtcで
 *    週の範囲を求め、その範囲に入るsessionsを集計してTrendPointDTOを作る（古い→新しいの順で配列化）。
 * 2. 月別: offset = monthlyCount-1 ～ 0 の順に、nowからoffsetヶ月前(subtractJstMonths)を基準日として
 *    getJstMonthRangeUtcで月の範囲を求め、同様に集計する。
 * 3. periodKeyは週別=週開始日のgetJstDateKey、月別="YYYY-MM"とする（一意性の担保のみが目的で、
 *    ISO週番号計算は行わない）。labelは表示用の日本語ラベル（例: "9/8週", "2026年9月"）。
 */
export function buildTrendSeries(
  sessions: AchievementSessionInput[],
  now: Date,
  weeklyCount: number = TREND_WEEKLY_BUCKET_COUNT,
  monthlyCount: number = TREND_MONTHLY_BUCKET_COUNT
): TrendSeriesDTO {
  const weekly: TrendPointDTO[] = [];
  for (let offset = weeklyCount - 1; offset >= 0; offset--) {
    const base = addDays(now, -7 * offset);
    const { weekStartUtc, weekEndUtc } = getJstWeekRangeUtc(base);
    weekly.push(
      aggregateBucket(sessions, weekStartUtc, weekEndUtc, formatWeekLabel(weekStartUtc), getJstDateKey(weekStartUtc))
    );
  }

  const monthly: TrendPointDTO[] = [];
  for (let offset = monthlyCount - 1; offset >= 0; offset--) {
    const base = subtractJstMonths(now, offset);
    const { monthStartUtc, monthEndUtc } = getJstMonthRangeUtc(base);
    const jst = new Date(monthStartUtc.getTime() + JST_OFFSET_MS);
    const periodKey = `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}`;
    monthly.push(
      aggregateBucket(sessions, monthStartUtc, monthEndUtc, formatMonthLabel(monthStartUtc), periodKey)
    );
  }

  return { weekly, monthly };
}

/**
 * 直近windowDays日のmuscleGroup別トレーニングバランス（頻度・ボリューム・構成比）を算出する。
 *
 * 処理ロジック:
 * 1. MUSCLE_GROUPSの全キーについて{ logCount: 0, volumeKg: 0 }で初期化したMapを作る。
 * 2. performedAtが[now-windowDays日, now]の範囲に入るsessionsのlogsのみを対象に、
 *    muscleGroupごとにlogCount(+1件ずつ)とvolumeKg(calculateVolumeKg合計)を積算する。
 * 3. 全muscleGroup合計のtotalLogCount/totalVolumeKgを求め、各グループの構成比
 *    (logCountRatio, volumeRatio)を計算する（合計が0の場合は0とする、ゼロ除算回避）。
 * 4. logCountが0のグループは結果配列から除外する（ドーナツチャートに空スライスを描画しないため）。
 *    戻り値の順序はMUSCLE_GROUPS定数の宣言順を維持する。
 */
export function buildMuscleGroupBalance(
  sessions: AchievementSessionInput[],
  now: Date,
  windowDays: number = MUSCLE_BALANCE_WINDOW_DAYS
): MuscleGroupBalanceDTO[] {
  const windowStart = addDays(now, -windowDays);
  const stats = new Map<MuscleGroup, { logCount: number; volumeKg: number }>();
  for (const group of MUSCLE_GROUPS) {
    stats.set(group, { logCount: 0, volumeKg: 0 });
  }

  for (const s of sessions) {
    if (s.performedAt < windowStart || s.performedAt > now) continue;
    for (const l of s.logs) {
      const entry = stats.get(l.muscleGroup);
      if (!entry) continue; // 想定外のmuscleGroup値が来ても落ちないための防御的処理
      entry.logCount += 1;
      entry.volumeKg += calculateVolumeKg({
        setCount: l.setCount,
        repsPerSet: l.repsPerSet,
        weightValue: l.weightValue,
        weightUnit: l.weightUnit,
      });
    }
  }

  const totalLogCount = [...stats.values()].reduce((sum, v) => sum + v.logCount, 0);
  const totalVolumeKg = [...stats.values()].reduce((sum, v) => sum + v.volumeKg, 0);

  return MUSCLE_GROUPS.map((group) => {
    const entry = stats.get(group)!;
    return {
      muscleGroup: group,
      label: MUSCLE_GROUP_LABELS[group],
      logCount: entry.logCount,
      volumeKg: Math.round(entry.volumeKg * 10) / 10,
      logCountRatio: totalLogCount > 0 ? entry.logCount / totalLogCount : 0,
      volumeRatio: totalVolumeKg > 0 ? entry.volumeKg / totalVolumeKg : 0,
    };
  }).filter((g) => g.logCount > 0);
}

interface PersonalBestAccumulator {
  exerciseName: string;
  muscleGroup: MuscleGroup;
  maxWeightKg: number;
  maxWeightAt: Date | null;
  maxVolumeKg: number;
  maxVolumeAt: Date | null;
}

/**
 * 種目（exerciseId）ごとの自己ベスト（最大重量kg換算・最大ボリュームkg）と、
 * 直近RECENT_PB_WINDOW_DAYS日以内に更新されたかどうかを算出する。
 *
 * 処理ロジック:
 * 1. sessionsをperformedAt昇順にソートする（「最初にその値に到達した日時」をachievedAtとして
 *    記録するため、昇順で走査し「厳密に上回った時だけ」達成日を更新する）。
 * 2. exerciseIdごとにAccumulatorを持ち、各ログについて:
 *    a. weightValueが null でなく、weightUnitも null でなく、weightValue > 0 の場合のみ、
 *       LB_TO_KG_FACTORでkg換算した値(小数第1位に四捨五入)を求め、現在のmaxWeightKgより
 *       大きい場合のみ更新し、達成日時をそのセッションのperformedAtにする。
 *    b. calculateVolumeKgでそのログのボリュームを求め、現在のmaxVolumeKgより大きい場合のみ
 *       更新し、達成日時を記録する。
 * 3. 全種目を走査した後、以下の条件でPersonalBestDTOへ変換する:
 *    - maxWeightAtがnull（＝一度もweightValueが有効入力されたことがない）場合、
 *      maxWeightKg/maxWeightAchievedAtはnullとする。
 *    - maxVolumeAtがnullまたはmaxVolumeKgが0の場合、maxVolumeKg/maxVolumeAchievedAtはnullとする。
 *    - 上記2つが両方nullになる種目（有酸素専用・自重のみで一度もweightValueが入力されていない種目）は
 *      結果配列から除外する。
 * 4. isRecentWeightPb/isRecentVolumePbは、各achievedAtのgetJstDateKeyをdateKeyToDayIndexで
 *    整数化し、「dateKeyToDayIndex(getJstDateKey(now)) - (RECENT_PB_WINDOW_DAYS - 1)」以上であればtrueとする
 *    （＝直近7日以内、当日を含む）。
 * 5. 結果配列は「直近更新(isRecentWeightPb||isRecentVolumePb)のものを先頭」「次にmuscleGroupの
 *    MUSCLE_GROUPS宣言順」「次にexerciseNameの辞書順(ja)」でソートして返す。
 */
export function buildPersonalBests(sessions: AchievementSessionInput[], now: Date): PersonalBestDTO[] {
  const sorted = [...sessions].sort((a, b) => a.performedAt.getTime() - b.performedAt.getTime());
  const map = new Map<string, PersonalBestAccumulator>();

  for (const s of sorted) {
    for (const l of s.logs) {
      const acc: PersonalBestAccumulator =
        map.get(l.exerciseId) ?? {
          exerciseName: l.exerciseName,
          muscleGroup: l.muscleGroup,
          maxWeightKg: 0,
          maxWeightAt: null,
          maxVolumeKg: 0,
          maxVolumeAt: null,
        };

      if (l.weightValue !== null && l.weightUnit !== null && l.weightValue > 0) {
        const weightKg = l.weightUnit === "LB" ? l.weightValue * LB_TO_KG_FACTOR : l.weightValue;
        const roundedWeightKg = Math.round(weightKg * 10) / 10;
        if (roundedWeightKg > acc.maxWeightKg) {
          acc.maxWeightKg = roundedWeightKg;
          acc.maxWeightAt = s.performedAt;
        }
      }

      const volumeKg = calculateVolumeKg({
        setCount: l.setCount,
        repsPerSet: l.repsPerSet,
        weightValue: l.weightValue,
        weightUnit: l.weightUnit,
      });
      if (volumeKg > acc.maxVolumeKg) {
        acc.maxVolumeKg = volumeKg;
        acc.maxVolumeAt = s.performedAt;
      }

      map.set(l.exerciseId, acc);
    }
  }

  const recentThreshold = dateKeyToDayIndex(getJstDateKey(now)) - (RECENT_PB_WINDOW_DAYS - 1);
  const result: PersonalBestDTO[] = [];

  for (const [exerciseId, acc] of map) {
    const hasWeightData = acc.maxWeightAt !== null;
    const hasVolumeData = acc.maxVolumeAt !== null && acc.maxVolumeKg > 0;
    if (!hasWeightData && !hasVolumeData) continue;

    const isRecentWeightPb =
      hasWeightData && dateKeyToDayIndex(getJstDateKey(acc.maxWeightAt as Date)) >= recentThreshold;
    const isRecentVolumePb =
      hasVolumeData && dateKeyToDayIndex(getJstDateKey(acc.maxVolumeAt as Date)) >= recentThreshold;

    result.push({
      exerciseId,
      exerciseName: acc.exerciseName,
      muscleGroup: acc.muscleGroup,
      maxWeightKg: hasWeightData ? acc.maxWeightKg : null,
      maxWeightAchievedAt: hasWeightData ? (acc.maxWeightAt as Date).toISOString() : null,
      maxVolumeKg: hasVolumeData ? acc.maxVolumeKg : null,
      maxVolumeAchievedAt: hasVolumeData ? (acc.maxVolumeAt as Date).toISOString() : null,
      isRecentWeightPb,
      isRecentVolumePb,
    });
  }

  result.sort((a, b) => {
    const aRecent = a.isRecentWeightPb || a.isRecentVolumePb;
    const bRecent = b.isRecentWeightPb || b.isRecentVolumePb;
    if (aRecent !== bRecent) return aRecent ? -1 : 1;
    if (a.muscleGroup !== b.muscleGroup) {
      return MUSCLE_GROUPS.indexOf(a.muscleGroup) - MUSCLE_GROUPS.indexOf(b.muscleGroup);
    }
    return a.exerciseName.localeCompare(b.exerciseName, "ja");
  });

  return result;
}

/**
 * 連続日数バッジ・累計セッション数バッジの達成状況を算出する。
 * heatmapはbuildWorkoutHeatmapの戻り値をそのまま渡す（currentStreak/longestStreakの再計算をしない）。
 */
export function buildAchievementBadges(
  sessions: AchievementSessionInput[],
  heatmap: WorkoutHeatmapDTO
): AchievementBadgesDTO {
  const totalSessionCount = sessions.length;
  const { currentStreak, longestStreak } = heatmap;

  const streakBadges: AchievementBadgeDTO[] = STREAK_BADGE_THRESHOLDS.map((threshold) => ({
    id: `streak-${threshold}`,
    category: "streak",
    label: `${threshold}日連続達成`,
    threshold,
    achieved: longestStreak >= threshold,
    achievedValue: longestStreak,
  }));

  const sessionCountBadges: AchievementBadgeDTO[] = SESSION_COUNT_BADGE_THRESHOLDS.map((threshold) => ({
    id: `sessions-${threshold}`,
    category: "sessionCount",
    label: `累計${threshold}回達成`,
    threshold,
    achieved: totalSessionCount >= threshold,
    achievedValue: totalSessionCount,
  }));

  return { streakBadges, sessionCountBadges, totalSessionCount, currentStreak, longestStreak };
}
```

#### エラー処理
- `sessions`が空配列（新規ユーザー）の場合: 全関数がクラッシュしないことを保証する。`buildWorkoutHeatmap`は全日level0・streak0、`buildTrendSeries`は全バケット0値、`buildMuscleGroupBalance`は空配列`[]`、`buildPersonalBests`は空配列`[]`、`buildAchievementBadges`は全バッジ`achieved: false`を返す（いずれも例外を投げない。詳細は「6. テスト観点」参照）。
- `l.weightValue`が0以下・`NaN`・`Infinity`等の不正値の場合: `calculateVolumeKg`側の防御的処理（0を返す）にすでに委ねられているため、本モジュール側で追加のバリデーションは行わない。最大重量側は`weightValue > 0`のガード条件で不正値を除外する。
- `buildMuscleGroupBalance`で`stats.get(l.muscleGroup)`が`undefined`になるケース（DB上の`muscleGroup`文字列が`MUSCLE_GROUPS`定数に存在しない値である異常データ）: `continue`でスキップし例外を投げない（防御的処理）。

---

### 3.3 `src/app/actions/achievements.ts`（新規）

#### 新規ファイルの内容
```ts
// src/app/actions/achievements.ts
"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserOrThrow } from "@/lib/session-guard";
import {
  buildWorkoutHeatmap,
  buildTrendSeries,
  buildMuscleGroupBalance,
  buildPersonalBests,
  buildAchievementBadges,
} from "@/lib/achievements";
import type { AchievementSessionInput } from "@/lib/achievements";
import type { AchievementsDataDTO, MuscleGroup, WeightUnit } from "@/types";

/**
 * 実績画面（/workouts）向けに、ヒートマップ・トレンド・部位別バランス・自己ベスト・
 * 達成バッジの5要素分のデータをまとめて返す。ログインユーザー自身の全期間の
 * WorkoutSession（logs, exercise込み）を1回だけ取得し、以降はDBアクセスなしで
 * src/lib/achievements.tsの純粋関数群に処理を委譲する。
 */
export async function getAchievementsData(): Promise<AchievementsDataDTO> {
  const user = await getCurrentUserOrThrow();

  const sessions = await prisma.workoutSession.findMany({
    where: { userId: user.id },
    include: { logs: { include: { exercise: true } } },
    orderBy: { performedAt: "asc" },
  });

  const input: AchievementSessionInput[] = sessions.map((s) => ({
    id: s.id,
    performedAt: s.performedAt,
    logs: s.logs.map((l) => ({
      exerciseId: l.exerciseId,
      exerciseName: l.exercise.name,
      muscleGroup: l.exercise.muscleGroup as MuscleGroup,
      setCount: l.setCount,
      repsPerSet: l.repsPerSet,
      weightValue: l.weightValue,
      weightUnit: l.weightUnit as WeightUnit | null,
      caloriesBurned: l.caloriesBurned,
    })),
  }));

  const now = new Date();
  const heatmap = buildWorkoutHeatmap(input, now);
  const trend = buildTrendSeries(input, now);
  const muscleBalance = buildMuscleGroupBalance(input, now);
  const personalBests = buildPersonalBests(input, now);
  const badges = buildAchievementBadges(input, heatmap);

  return { heatmap, trend, muscleBalance, personalBests, badges };
}
```

#### 関数シグネチャと処理ロジック
```
async function getAchievementsData(): Promise<AchievementsDataDTO>
  1. getCurrentUserOrThrow()で認証済みuserを取得（未ログインならUnauthorizedErrorがthrowされ、
     既存の全Server Actionと同じくそのまま伝播する）。
  2. prisma.workoutSession.findMany({ where: { userId: user.id }, include: { logs: { include: { exercise: true } } }, orderBy: { performedAt: "asc" } }) で
     対象ユーザーの全期間のセッションを1回だけ取得する。
  3. Prismaの行をAchievementSessionInput[]に詰め替える（exercise.muscleGroupはstring型のため
     MuscleGroupへキャストする。既存のworkouts.ts内の各所と同じキャスト方針を踏襲する）。
  4. buildWorkoutHeatmap → buildTrendSeries → buildMuscleGroupBalance → buildPersonalBests の順で呼ぶ
     （buildAchievementBadgesはbuildWorkoutHeatmapの戻り値に依存するため最後に呼ぶ）。
  5. 5つのDTOをまとめたAchievementsDataDTOを返す。
```

#### エラー処理
- `getCurrentUserOrThrow()`が`UnauthorizedError`をthrowした場合: catchしない。既存の全Server Actionと同じくそのまま伝播させる。
- Prismaクエリが例外を投げた場合（DB接続断等）: catchしない。既存の他Server Actionと同じ方針。
- `sessions`が空配列の場合: 例外にならない（3.2節参照）。`AchievementsDataDTO`の各フィールドは空状態を表す値になる。

---

### 3.4 `src/types/index.ts`（変更）

#### 編集前の関連箇所
既存の`DashboardStatsDTO`（81-88行目）と`ActionResult`（91-93行目）の間に、以下を追記する。また、`MUSCLE_GROUP_LABELS`（8-11行目）の直後に`MUSCLE_GROUP_CHART_COLORS`を追記する。既存のエクスポート（`MUSCLE_GROUPS`, `MuscleGroup`, `MUSCLE_GROUP_LABELS`, `isCardioMuscleGroup`, `WeightUnit`等）は一切変更しない。

#### 編集後の期待形（追記部分）

`MUSCLE_GROUP_LABELS`の直後に追記:
```ts
/** 部位別バランスチャート（ドーナツ）用の固定配色。Rechartsはfill propに実際の色値（hex）を
 *  要求するため、Tailwindクラス名ではなくhex値で定義する。8部位それぞれ視認性の高い色相を
 *  1つずつ割り当てる（Tailwindの-500系相当）。将来ダークモード対応する場合もこの1箇所を
 *  見直せばよい。 */
export const MUSCLE_GROUP_CHART_COLORS: Record<MuscleGroup, string> = {
  CHEST: "#f97316",     // orange-500
  BACK: "#3b82f6",      // blue-500
  LEGS: "#22c55e",      // green-500
  SHOULDERS: "#a855f7", // purple-500
  ARMS: "#ef4444",      // red-500
  ABS: "#eab308",       // yellow-500
  FULL_BODY: "#14b8a6", // teal-500
  CARDIO: "#ec4899",    // pink-500
};
```

`DashboardStatsDTO`と`ActionResult`の間に追記:
```ts
/** カレンダーヒートマップの1日分のセル情報 */
export interface HeatmapDayDTO {
  date: string; // "YYYY-MM-DD"（JST暦日）
  sessionCount: number;
  logCount: number;
  totalCalories: number;
  level: 0 | 1 | 2 | 3; // 0=記録なし, 1=1-2件, 2=3-5件, 3=6件以上
}

/** カレンダーヒートマップ全体（直近371日分）＋ストリーク情報 */
export interface WorkoutHeatmapDTO {
  days: HeatmapDayDTO[]; // 古い→新しいの順、直近371日分
  currentStreak: number; // 現在の連続日数（今日未記録でも前日までの連続を維持）
  longestStreak: number; // 全期間の最長連続日数
  totalActiveDays: number; // 直近371日中、記録がある日数
}

/** 推移トレンドグラフの1バケット（1週間 or 1ヶ月）分のデータ */
export interface TrendPointDTO {
  periodKey: string; // 週別: 週開始日"YYYY-MM-DD" / 月別: "YYYY-MM"
  label: string; // 表示用ラベル 例: "9/8週" / "2026年9月"
  periodStart: string; // ISO日時文字列（バケット開始時刻、UTC）
  totalCalories: number;
  totalVolumeKg: number;
  sessionCount: number;
}

/** 推移トレンドグラフ全体（週別・月別を両方含む。クライアント側でトグル切替する） */
export interface TrendSeriesDTO {
  weekly: TrendPointDTO[]; // 直近12週分、古い→新しい
  monthly: TrendPointDTO[]; // 直近6ヶ月分、古い→新しい
}

/** 部位別トレーニングバランスの1部位分のデータ（記録が0件の部位は配列に含まれない） */
export interface MuscleGroupBalanceDTO {
  muscleGroup: MuscleGroup;
  label: string; // MUSCLE_GROUP_LABELSの値
  logCount: number;
  volumeKg: number;
  logCountRatio: number; // 0〜1。全muscleGroup合計に対する割合
  volumeRatio: number; // 0〜1
}

/** 種目ごとの自己ベスト情報。重量・ボリュームのいずれもデータが無い種目（有酸素専用・
 *  自重のみ等）はそもそも配列に含まれない。 */
export interface PersonalBestDTO {
  exerciseId: string;
  exerciseName: string;
  muscleGroup: MuscleGroup;
  maxWeightKg: number | null; // kg換算後の最大重量。未記録ならnull
  maxWeightAchievedAt: string | null; // ISO日時（達成したWorkoutSessionのperformedAt）
  maxVolumeKg: number | null; // 最大ボリューム(kg)。未記録ならnull
  maxVolumeAchievedAt: string | null;
  isRecentWeightPb: boolean; // 直近7日以内（当日含む）に更新されたか
  isRecentVolumePb: boolean;
}

/** 達成バッジ1件分のデータ */
export interface AchievementBadgeDTO {
  id: string; // 例: "streak-7", "sessions-100"
  category: "streak" | "sessionCount";
  label: string; // 例: "7日連続達成"
  threshold: number;
  achieved: boolean;
  achievedValue: number; // 比較に使った現在値（streak系はlongestStreak、sessionCount系は累計セッション数）
}

/** 達成バッジ一覧全体 */
export interface AchievementBadgesDTO {
  streakBadges: AchievementBadgeDTO[];
  sessionCountBadges: AchievementBadgeDTO[];
  totalSessionCount: number;
  currentStreak: number;
  longestStreak: number;
}

/** 実績画面（/workouts）の新規4要素分をまとめたトップレベルDTO。getAchievementsData()の戻り値。 */
export interface AchievementsDataDTO {
  heatmap: WorkoutHeatmapDTO;
  trend: TrendSeriesDTO;
  muscleBalance: MuscleGroupBalanceDTO[];
  personalBests: PersonalBestDTO[];
  badges: AchievementBadgesDTO;
}
```

#### 変更手順
1. `MUSCLE_GROUP_LABELS`定義の直後に`MUSCLE_GROUP_CHART_COLORS`を追加する。
2. `DashboardStatsDTO`と`ActionResult`の間に、上記9つの型定義を追加する。
3. 既存の型・定数・関数は名前も内容も一切変更しない。

#### エラー処理
- 型定義のみの変更のため、実行時エラー処理は発生しない。TypeScriptのコンパイル時チェックで、後続ファイルの実装ミス（フィールド名の誤り等）を検出する。

---

### 3.5 `src/components/WorkoutHeatmap.tsx`（新規、Server Component）

#### 新規ファイルの内容
```tsx
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

export default function WorkoutHeatmap({ heatmap }: WorkoutHeatmapProps) {
  // 371日を7日ずつの列に区切る（暦週の月曜始まりへの厳密な整列は行わない設計判断。
  // basic-design.mdの通り、実装簡易化のため単純に7日単位のチャンクとする）。
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
      <p className="mt-2 text-xs text-gray-400">直近1年間の記録日数: {heatmap.totalActiveDays}日</p>
    </div>
  );
}
```

#### 関数シグネチャと処理ロジック
```
function WorkoutHeatmap({ heatmap }: WorkoutHeatmapProps): JSX.Element
  1. heatmap.days（371要素、古い→新しい順）を7要素ずつのチャンクに分割し、weeks配列を作る。
  2. weeksを横方向（flex）に並べ、各週の中身を縦方向（flex-col）に7セル並べる。
  3. 各セルはlevelに応じたTailwind背景色クラスを適用し、title属性でネイティブツールチップ
     （日付・件数・カロリー）を表示する。JSは一切使わない。
  4. ヘッダーに現在のストリーク・最長ストリークを表示する。
  5. フッターに直近1年間の記録日数を表示する。
```

#### エラー処理
- `heatmap.days`が空配列になることは`buildWorkoutHeatmap`の実装上あり得ない（`windowDays`は常に371固定で呼ばれる）が、万一0件でも`weeks`は空配列になり、ヒートマップ領域が単に空になるだけでエラーにはならない。
- 新規ユーザー（記録0件）の場合: 全セルが`level: 0`（`bg-slate-100`）になり、`currentStreak`/`longestStreak`は共に0と表示される。空状態として自然に成立するため、専用の空状態メッセージは設けない。

---

### 3.6 `src/components/TrendChart.tsx`（新規、Client Component）

#### 新規ファイルの内容
```tsx
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
```

#### 関数シグネチャと処理ロジック
```
function TrendChart({ series }: TrendChartProps): JSX.Element
  1. unit(週/月)、metric(カロリー/ボリューム)をuseStateでローカル管理する（初期値: 週別・カロリー）。
  2. unitに応じてseries.weekly / series.monthlyのどちらを描画対象にするか選ぶ。
  3. 選んだ配列の全要素でsessionCountが0であれば「データなし」とみなし、空状態メッセージを表示する
     （グラフは描画しない）。
  4. データがあれば、metricに応じてdataKey("totalCalories"|"totalVolumeKg")・単位・色を切り替えて
     Recharts AreaChartを描画する。
  5. 週/月・カロリー/ボリュームの切替ボタンは、クリック時にuseStateを更新するのみで、
     サーバーへの再フェッチは行わない（propsのseriesに両方のデータが既に含まれているため）。
```

#### エラー処理
- `series.weekly`/`series.monthly`が空配列になることは`buildTrendSeries`の実装上あり得ない（`weeklyCount`/`monthlyCount`は常に固定件数）が、空配列が渡された場合でも`points.some(...)`は`false`になり、空状態メッセージが表示される（例外は発生しない）。
- Rechartsの`ResponsiveContainer`は親要素に高さを持たせる必要があるため、`height={240}`を固定指定し、親のレイアウト崩れによる「高さ0でグラフが見えない」事象を防ぐ。

---

### 3.7 `src/components/MuscleBalanceChart.tsx`（新規、Client Component）

#### 新規ファイルの内容
```tsx
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
```

#### 関数シグネチャと処理ロジック
```
function MuscleBalanceChart({ balance }: MuscleBalanceChartProps): JSX.Element
  1. metric(頻度/ボリューム)をuseStateでローカル管理する（初期値: 頻度）。
  2. balance配列が空であれば空状態メッセージを表示する（グラフは描画しない）。
  3. データがあれば、metricに応じてdataKey("logCount"|"volumeKg")を切り替えてRecharts PieChart
     （innerRadius指定でドーナツ化）を描画する。各Cellの色はMUSCLE_GROUP_CHART_COLORSから
     muscleGroupごとに固定で割り当てる。
  4. 頻度/ボリュームの切替はuseState更新のみ。サーバー再フェッチは行わない。
```

#### エラー処理
- `balance`が空配列の場合（新規ユーザー、または直近90日に記録が無いユーザー）: 空状態メッセージを表示する（`buildMuscleGroupBalance`はlogCount>0のグループのみ返すため、全部位0件なら必ず空配列になる。この経路は正常系として設計済み）。

---

### 3.8 `src/components/PersonalBestList.tsx`（新規、Server Component）

#### 新規ファイルの内容
```tsx
// src/components/PersonalBestList.tsx
import { MUSCLE_GROUP_LABELS } from "@/types";
import type { PersonalBestDTO } from "@/types";

interface PersonalBestListProps {
  personalBests: PersonalBestDTO[];
}

export default function PersonalBestList({ personalBests }: PersonalBestListProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">自己ベスト</h3>
      {personalBests.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">重量を記録した種目がまだありません。</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {personalBests.map((pb) => (
            <li
              key={pb.exerciseId}
              className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {pb.exerciseName}
                  {(pb.isRecentWeightPb || pb.isRecentVolumePb) && (
                    <span className="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
                      NEW
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-400">{MUSCLE_GROUP_LABELS[pb.muscleGroup]}</p>
              </div>
              <div className="text-right text-xs text-gray-600">
                {pb.maxWeightKg !== null && <p>最大重量 {pb.maxWeightKg}kg</p>}
                {pb.maxVolumeKg !== null && <p>最大ボリューム {pb.maxVolumeKg}kg</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

#### 関数シグネチャと処理ロジック
```
function PersonalBestList({ personalBests }: PersonalBestListProps): JSX.Element
  1. personalBestsが空配列なら空状態メッセージを表示する。
  2. 空でなければ、配列の順序（buildPersonalBestsが既に「新記録優先→部位順→種目名順」で
     ソート済み）通りにリスト表示する。
  3. 各行: 種目名＋（該当すれば）NEWタグ、部位ラベル、最大重量（nullでなければ）、
     最大ボリューム（nullでなければ）を表示する。
```

#### エラー処理
- `maxWeightKg`/`maxVolumeKg`が共にnullの要素は`buildPersonalBests`の設計上配列に含まれないため、本コンポーネントは「両方null」のケースを考慮する必要がない（片方のみnullのケースは正しく片方のみ表示する）。

---

### 3.9 `src/components/AchievementBadges.tsx`（新規、Server Component）

#### 新規ファイルの内容
```tsx
// src/components/AchievementBadges.tsx
import type { AchievementBadgeDTO, AchievementBadgesDTO } from "@/types";

interface AchievementBadgesProps {
  badges: AchievementBadgesDTO;
}

function BadgeChip({ badge, icon }: { badge: AchievementBadgeDTO; icon: string }) {
  return (
    <div
      className={
        badge.achieved
          ? "flex flex-col items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-center"
          : "flex flex-col items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-center opacity-50"
      }
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-xs font-medium text-gray-700">{badge.label}</span>
      {!badge.achieved && (
        <span className="text-[10px] text-gray-400">あと{badge.threshold - badge.achievedValue}</span>
      )}
    </div>
  );
}

export default function AchievementBadges({ badges }: AchievementBadgesProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">達成バッジ</h3>
      <p className="mb-2 text-xs text-gray-500">連続日数</p>
      <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {badges.streakBadges.map((b) => (
          <BadgeChip key={b.id} badge={b} icon="🔥" />
        ))}
      </div>
      <p className="mb-2 text-xs text-gray-500">累計セッション数</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {badges.sessionCountBadges.map((b) => (
          <BadgeChip key={b.id} badge={b} icon="🏅" />
        ))}
      </div>
    </div>
  );
}
```

#### 関数シグネチャと処理ロジック
```
function BadgeChip({ badge, icon }): JSX.Element
  1. badge.achievedがtrueならamber系（達成済み）スタイル、falseならグレー＋opacity-50
    （未達成・ロック中）スタイルを適用する。
  2. 未達成の場合のみ「あと{threshold - achievedValue}」を表示する
    （achieved=falseの場合、achievedValue < threshold が保証されるため、この値は必ず正の整数になる）。

function AchievementBadges({ badges }): JSX.Element
  1. badges.streakBadges（6件）をgrid-cols-3(モバイル)/6(sm以上)で表示する。
  2. badges.sessionCountBadges（6件）を同様に表示する。
```

#### エラー処理
- `badges.streakBadges`/`sessionCountBadges`は`buildAchievementBadges`により常に固定6件の配列として渡されるため、空配列や`undefined`は発生しない。
- 新規ユーザー（`totalSessionCount: 0`, `currentStreak: 0`, `longestStreak: 0`）の場合、全12バッジが未達成表示（グレー＋「あと◯」）になる。これが正しい空状態表示であり、追加のメッセージは不要（バッジ一覧自体が「まだ達成していない目標一覧」として機能する）。

---

### 3.10 `src/app/workouts/page.tsx`（変更）

#### 編集前の関連箇所（現状、全文）
```tsx
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
```

#### 編集後の期待形（全文）
```tsx
// src/app/workouts/page.tsx（実績確認: 週間・月間集計 + ビジュアル実績 + 履歴一覧）
import Link from "next/link";
import { getDashboardStats, listWorkoutSessions } from "@/app/actions/workouts";
import { getAchievementsData } from "@/app/actions/achievements";
import StatsSummaryCard from "@/components/StatsSummaryCard";
import CalorieDisclaimer from "@/components/CalorieDisclaimer";
import WorkoutHeatmap from "@/components/WorkoutHeatmap";
import TrendChart from "@/components/TrendChart";
import MuscleBalanceChart from "@/components/MuscleBalanceChart";
import AchievementBadges from "@/components/AchievementBadges";
import PersonalBestList from "@/components/PersonalBestList";

export default async function WorkoutsPage() {
  const [weekStats, monthStats, sessions, achievements] = await Promise.all([
    getDashboardStats(7),
    getDashboardStats(30),
    listWorkoutSessions(),
    getAchievementsData(),
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

      <WorkoutHeatmap heatmap={achievements.heatmap} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TrendChart series={achievements.trend} />
        <MuscleBalanceChart balance={achievements.muscleBalance} />
      </div>

      <AchievementBadges badges={achievements.badges} />
      <PersonalBestList personalBests={achievements.personalBests} />

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
```

#### 変更手順
1. import文に`getAchievementsData`（`@/app/actions/achievements`）、`WorkoutHeatmap`, `TrendChart`, `MuscleBalanceChart`, `AchievementBadges`, `PersonalBestList`（いずれも`@/components/...`）を追加する。
2. `Promise.all`の対象に`getAchievementsData()`を追加し、分割代入の変数名`achievements`を追加する。
3. `StatsSummaryCard`のグリッドの直後、`CalorieDisclaimer`の直前に、`WorkoutHeatmap`→（`TrendChart`と`MuscleBalanceChart`を横並びにする`lg:grid-cols-2`グリッド）→`AchievementBadges`→`PersonalBestList`の順で追加する。
4. 既存の`StatsSummaryCard`グリッド・`CalorieDisclaimer`・履歴一覧のJSX・ロジックは一切変更しない。

#### エラー処理
- `getAchievementsData()`が例外を投げた場合（未ログイン等）: catchしない。既存の`getDashboardStats`/`listWorkoutSessions`と同じくNext.jsの標準エラー処理に委ねる（本ページは元々未認証ユーザーが到達しない前提のルートであり、既存方針を踏襲する）。

---

### 3.11 `package.json`（変更）

#### 編集前の関連箇所（現状、18-28行目 dependencies）
```json
  "dependencies": {
    "@libsql/client": "^0.18.0",
    "@prisma/adapter-libsql": "^7.10.0",
    "@prisma/client": "^6.0.0",
    "bcryptjs": "^2.4.3",
    "next": "^15.0.0",
    "next-auth": "^5.0.0-beta.25",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.23.0"
  },
```

#### 編集後の期待形
```json
  "dependencies": {
    "@libsql/client": "^0.18.0",
    "@prisma/adapter-libsql": "^7.10.0",
    "@prisma/client": "^6.0.0",
    "bcryptjs": "^2.4.3",
    "next": "^15.0.0",
    "next-auth": "^5.0.0-beta.25",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "recharts": "^2.15.0",
    "zod": "^3.23.0"
  },
```

#### 変更手順
1. `dependencies`に`"recharts": "^2.15.0"`を`"react-dom"`と`"zod"`の間（アルファベット順）に追加する。
2. `npm install`を実行し、`package-lock.json`を再生成する（`package-lock.json`は手動編集しない。実際にインストールされたバージョンが`^2.15.0`の範囲内であることを確認する）。
3. `devDependencies`・`scripts`・`prisma`セクションは変更しない。

#### エラー処理
- `npm install`実行時、Recharts側の`peerDependencies`（`react`, `react-dom`）がプロジェクトの`^19.0.0`と適合しない警告が出た場合は、Rechartsのバージョンを、React 19に対応した最新版に読み替えて実装すること（本書執筆時点でRecharts 2.15系以降がReact 19をサポートしている）。

---

### 3.12 `tests/unit/date.test.ts`（変更）

#### 変更手順
既存の`describe("getJstDayRangeUtc", ...)`ブロック（全文、変更しない）の直後に、以下の`describe`ブロックを追加する。

#### 追加するテストコード
```ts
describe("getJstDateKey", () => {
  it("JST日中の時刻から正しい暦日キーを返す", () => {
    expect(getJstDateKey(new Date("2026-09-15T04:30:00.000Z"))).toBe("2026-09-15");
  });
  it("境界値: JST 0:00ちょうど（UTC前日15:00:00.000）は当日のキーになる", () => {
    expect(getJstDateKey(new Date("2026-09-15T15:00:00.000Z"))).toBe("2026-09-16");
  });
  it("境界値: JST 23:59:59.999（UTC同日14:59:59.999）は当日のキーのままになる", () => {
    expect(getJstDateKey(new Date("2026-09-15T14:59:59.999Z"))).toBe("2026-09-15");
  });
});

describe("addDays", () => {
  it("正の日数を加算すると未来のDateを返す", () => {
    const base = new Date("2026-09-15T00:00:00.000Z");
    expect(addDays(base, 3).toISOString()).toBe("2026-09-18T00:00:00.000Z");
  });
  it("負の日数を加算すると過去のDateを返す", () => {
    const base = new Date("2026-09-15T00:00:00.000Z");
    expect(addDays(base, -3).toISOString()).toBe("2026-09-12T00:00:00.000Z");
  });
});

describe("getJstWeekRangeUtc", () => {
  it("週の途中の日から、その週の月曜0:00(JST)〜翌週月曜0:00(JST)の範囲を返す", () => {
    // 2026-09-17はJSTで木曜日。その週の月曜日は2026-09-14。
    const { weekStartUtc, weekEndUtc } = getJstWeekRangeUtc(new Date("2026-09-17T04:00:00.000Z"));
    expect(weekStartUtc.toISOString()).toBe("2026-09-13T15:00:00.000Z"); // JST 2026-09-14 00:00
    expect(weekEndUtc.toISOString()).toBe("2026-09-20T15:00:00.000Z"); // JST 2026-09-21 00:00
  });
  it("月曜日ちょうどの日を渡すと、その日自身が週の開始になる", () => {
    // 2026-09-14はJSTで月曜日
    const { weekStartUtc } = getJstWeekRangeUtc(new Date("2026-09-14T01:00:00.000Z"));
    expect(weekStartUtc.toISOString()).toBe("2026-09-13T15:00:00.000Z"); // JST 2026-09-14 00:00
  });
  it("日曜日を渡すと、前の月曜日が週の開始になる", () => {
    // 2026-09-20はJSTで日曜日
    const { weekStartUtc } = getJstWeekRangeUtc(new Date("2026-09-20T01:00:00.000Z"));
    expect(weekStartUtc.toISOString()).toBe("2026-09-13T15:00:00.000Z"); // JST 2026-09-14 00:00
  });
});

describe("getJstMonthRangeUtc", () => {
  it("月の途中の日から、月初0:00(JST)〜翌月初0:00(JST)の範囲を返す", () => {
    const { monthStartUtc, monthEndUtc } = getJstMonthRangeUtc(new Date("2026-09-17T04:00:00.000Z"));
    expect(monthStartUtc.toISOString()).toBe("2026-08-31T15:00:00.000Z"); // JST 2026-09-01 00:00
    expect(monthEndUtc.toISOString()).toBe("2026-09-30T15:00:00.000Z"); // JST 2026-10-01 00:00
  });
  it("年境界（12月→翌年1月）でも正しく月が繰り上がる", () => {
    const { monthStartUtc, monthEndUtc } = getJstMonthRangeUtc(new Date("2026-12-25T04:00:00.000Z"));
    expect(monthStartUtc.toISOString()).toBe("2026-11-30T15:00:00.000Z"); // JST 2026-12-01 00:00
    expect(monthEndUtc.toISOString()).toBe("2026-12-31T15:00:00.000Z"); // JST 2027-01-01 00:00
  });
});
```

このテストコードを使うために、ファイル先頭のimport文を以下のように変更する（既存のimportに追加する形）。

#### 編集前
```ts
import { getJstDayRangeUtc, JST_OFFSET_MS } from "@/lib/date";
```

#### 編集後
```ts
import {
  getJstDayRangeUtc,
  JST_OFFSET_MS,
  getJstDateKey,
  addDays,
  getJstWeekRangeUtc,
  getJstMonthRangeUtc,
} from "@/lib/date";
```

---

### 3.13 `tests/unit/achievements.test.ts`（新規）

#### 新規ファイルの内容
```ts
// tests/unit/achievements.test.ts
import { describe, it, expect } from "vitest";
import {
  buildWorkoutHeatmap,
  buildTrendSeries,
  buildMuscleGroupBalance,
  buildPersonalBests,
  buildAchievementBadges,
  type AchievementSessionInput,
} from "@/lib/achievements";

const NOW = new Date("2026-09-15T04:00:00.000Z"); // JST 2026-09-15 13:00（火曜日）

function session(performedAtIso: string, logs: AchievementSessionInput["logs"]): AchievementSessionInput {
  return { id: performedAtIso, performedAt: new Date(performedAtIso), logs };
}

function log(overrides: Partial<AchievementSessionInput["logs"][number]> = {}): AchievementSessionInput["logs"][number] {
  return {
    exerciseId: "ex-1",
    exerciseName: "チェストプレス",
    muscleGroup: "CHEST",
    setCount: 3,
    repsPerSet: 10,
    weightValue: 50,
    weightUnit: "KG",
    caloriesBurned: 100,
    ...overrides,
  };
}

describe("buildWorkoutHeatmap", () => {
  it("記録が0件の場合、全セルlevel0・ストリーク0・totalActiveDays0を返す（新規ユーザー）", () => {
    const result = buildWorkoutHeatmap([], NOW);
    expect(result.days).toHaveLength(371);
    expect(result.days.every((d) => d.level === 0)).toBe(true);
    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(0);
    expect(result.totalActiveDays).toBe(0);
  });

  it("今日を含め3日連続で記録があれば、currentStreakは3になる", () => {
    const sessions = [
      session("2026-09-13T04:00:00.000Z", [log()]),
      session("2026-09-14T04:00:00.000Z", [log()]),
      session("2026-09-15T04:00:00.000Z", [log()]),
    ];
    const result = buildWorkoutHeatmap(sessions, NOW);
    expect(result.currentStreak).toBe(3);
  });

  it("今日は未記録でも、前日までが連続していればcurrentStreakは途切れない", () => {
    const sessions = [
      session("2026-09-13T04:00:00.000Z", [log()]),
      session("2026-09-14T04:00:00.000Z", [log()]),
    ];
    const result = buildWorkoutHeatmap(sessions, NOW); // NOW = 2026-09-15（未記録）
    expect(result.currentStreak).toBe(2);
  });

  it("一昨日以前で途切れている場合、currentStreakは0になる", () => {
    const sessions = [session("2026-09-12T04:00:00.000Z", [log()])];
    const result = buildWorkoutHeatmap(sessions, NOW);
    expect(result.currentStreak).toBe(0);
  });

  it("JST日付境界をまたぐ記録（UTC前日15:00=JST当日0:00）でも正しく暦日ごとに1日としてカウントされる", () => {
    // 2026-09-14T15:00:00.000Z = JST 2026-09-15 00:00:00.000（NOWと同じJST暦日）
    const sessions = [session("2026-09-14T15:00:00.000Z", [log()])];
    const result = buildWorkoutHeatmap(sessions, NOW);
    expect(result.currentStreak).toBe(1);
  });

  it("過去の途切れたストリークが現在のストリークより長い場合でもlongestStreakに反映される", () => {
    const sessions = [
      session("2026-08-01T04:00:00.000Z", [log()]),
      session("2026-08-02T04:00:00.000Z", [log()]),
      session("2026-08-03T04:00:00.000Z", [log()]),
      session("2026-08-04T04:00:00.000Z", [log()]),
      session("2026-08-05T04:00:00.000Z", [log()]), // 過去5日連続
      session("2026-09-15T04:00:00.000Z", [log()]), // 現在1日
    ];
    const result = buildWorkoutHeatmap(sessions, NOW);
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(5);
  });
});

describe("buildTrendSeries", () => {
  it("記録が0件の場合、週別12件・月別6件すべて0値のバケットを返す", () => {
    const result = buildTrendSeries([], NOW);
    expect(result.weekly).toHaveLength(12);
    expect(result.monthly).toHaveLength(6);
    expect(result.weekly.every((p) => p.sessionCount === 0 && p.totalCalories === 0)).toBe(true);
  });

  it("当該週内の記録が正しく集計される", () => {
    const sessions = [session("2026-09-15T04:00:00.000Z", [log({ caloriesBurned: 120 })])];
    const result = buildTrendSeries(sessions, NOW);
    const lastWeek = result.weekly[result.weekly.length - 1];
    expect(lastWeek.sessionCount).toBe(1);
    expect(lastWeek.totalCalories).toBe(120);
  });
});

describe("buildMuscleGroupBalance", () => {
  it("記録が0件の場合、空配列を返す", () => {
    expect(buildMuscleGroupBalance([], NOW)).toEqual([]);
  });

  it("記録が1件も無い部位は結果に含まれない", () => {
    const sessions = [session("2026-09-15T04:00:00.000Z", [log({ muscleGroup: "CHEST" })])];
    const result = buildMuscleGroupBalance(sessions, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].muscleGroup).toBe("CHEST");
  });

  it("90日より前の記録は集計対象に含まれない", () => {
    const sessions = [session("2026-01-01T04:00:00.000Z", [log({ muscleGroup: "BACK" })])];
    const result = buildMuscleGroupBalance(sessions, NOW);
    expect(result).toHaveLength(0);
  });
});

describe("buildPersonalBests", () => {
  it("記録が0件の場合、空配列を返す", () => {
    expect(buildPersonalBests([], NOW)).toEqual([]);
  });

  it("KG/LB混在の記録がある種目で、kg換算後の正しい最大重量が算出される", () => {
    const sessions = [
      session("2026-08-01T04:00:00.000Z", [log({ weightValue: 60, weightUnit: "KG" })]), // 60kg
      session("2026-08-05T04:00:00.000Z", [log({ weightValue: 100, weightUnit: "LB" })]), // 約45.4kg（60kgより小さい）
    ];
    const result = buildPersonalBests(sessions, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].maxWeightKg).toBe(60);
  });

  it("LB換算後の値がKG記録を上回る場合、LB側の記録がベストとして採用される", () => {
    const sessions = [
      session("2026-08-01T04:00:00.000Z", [log({ weightValue: 40, weightUnit: "KG" })]),
      session("2026-08-05T04:00:00.000Z", [log({ weightValue: 200, weightUnit: "LB" })]), // 約90.7kg
    ];
    const result = buildPersonalBests(sessions, NOW);
    expect(result[0].maxWeightKg).toBeCloseTo(90.7, 1);
  });

  it("重量が1件も入力されていない種目（有酸素等）は結果に含まれない", () => {
    const sessions = [
      session("2026-09-01T04:00:00.000Z", [
        log({ exerciseId: "ex-cardio", muscleGroup: "CARDIO", weightValue: null, weightUnit: null }),
      ]),
    ];
    expect(buildPersonalBests(sessions, NOW)).toHaveLength(0);
  });

  it("直近7日以内に達成した記録にはisRecentWeightPb=trueが付く", () => {
    const sessions = [session("2026-09-14T04:00:00.000Z", [log({ weightValue: 80, weightUnit: "KG" })])];
    const result = buildPersonalBests(sessions, NOW);
    expect(result[0].isRecentWeightPb).toBe(true);
  });

  it("8日以上前に達成した記録にはisRecentWeightPb=falseが付く", () => {
    const sessions = [session("2026-08-01T04:00:00.000Z", [log({ weightValue: 80, weightUnit: "KG" })])];
    const result = buildPersonalBests(sessions, NOW);
    expect(result[0].isRecentWeightPb).toBe(false);
  });
});

describe("buildAchievementBadges", () => {
  it("記録が0件の場合、全バッジがachieved:falseになる", () => {
    const heatmap = buildWorkoutHeatmap([], NOW);
    const result = buildAchievementBadges([], heatmap);
    expect(result.streakBadges.every((b) => b.achieved === false)).toBe(true);
    expect(result.sessionCountBadges.every((b) => b.achieved === false)).toBe(true);
  });

  it("最長ストリークが閾値以上のバッジのみachieved:trueになる", () => {
    const heatmap = { days: [], currentStreak: 3, longestStreak: 10, totalActiveDays: 10 };
    const result = buildAchievementBadges([], heatmap);
    const streak7 = result.streakBadges.find((b) => b.threshold === 7);
    const streak14 = result.streakBadges.find((b) => b.threshold === 14);
    expect(streak7?.achieved).toBe(true);
    expect(streak14?.achieved).toBe(false);
  });

  it("累計セッション数が閾値以上のバッジのみachieved:trueになる", () => {
    const sessions = Array.from({ length: 30 }, (_, i) => session(`2026-01-${String((i % 28) + 1).padStart(2, "0")}T04:00:00.000Z`, [log()]));
    const heatmap = buildWorkoutHeatmap(sessions, NOW);
    const result = buildAchievementBadges(sessions, heatmap);
    const sessions10 = result.sessionCountBadges.find((b) => b.threshold === 10);
    const sessions50 = result.sessionCountBadges.find((b) => b.threshold === 50);
    expect(sessions10?.achieved).toBe(true);
    expect(sessions50?.achieved).toBe(false);
  });
});
```

#### 変更手順
1. `tests/unit/`配下に本ファイルを新規作成する（既存の`volume.test.ts`等と同じ配置・同じ`describe`/`it`スタイル）。
2. `npm run test`（Vitest）で実行されることを確認する。

---

## 4. データ構造定義（全体まとめ）

本プロジェクトで新規追加する型・関数のシグネチャの一覧（詳細は各節を参照）。

```ts
// src/lib/date.ts（追加）
export function getJstDateKey(date: Date): string;
export function addDays(date: Date, days: number): Date;
export function getJstWeekRangeUtc(date: Date): { weekStartUtc: Date; weekEndUtc: Date };
export function getJstMonthRangeUtc(date: Date): { monthStartUtc: Date; monthEndUtc: Date };

// src/lib/achievements.ts（新規）
export interface AchievementLogInput { /* 3.2節参照 */ }
export interface AchievementSessionInput { /* 3.2節参照 */ }
export const HEATMAP_WINDOW_DAYS: number;
export const HEATMAP_LEVEL_2_MIN_LOG_COUNT: number;
export const HEATMAP_LEVEL_3_MIN_LOG_COUNT: number;
export const TREND_WEEKLY_BUCKET_COUNT: number;
export const TREND_MONTHLY_BUCKET_COUNT: number;
export const MUSCLE_BALANCE_WINDOW_DAYS: number;
export const RECENT_PB_WINDOW_DAYS: number;
export const STREAK_BADGE_THRESHOLDS: readonly number[];
export const SESSION_COUNT_BADGE_THRESHOLDS: readonly number[];
export function buildWorkoutHeatmap(sessions: AchievementSessionInput[], now: Date, windowDays?: number): WorkoutHeatmapDTO;
export function buildTrendSeries(sessions: AchievementSessionInput[], now: Date, weeklyCount?: number, monthlyCount?: number): TrendSeriesDTO;
export function buildMuscleGroupBalance(sessions: AchievementSessionInput[], now: Date, windowDays?: number): MuscleGroupBalanceDTO[];
export function buildPersonalBests(sessions: AchievementSessionInput[], now: Date): PersonalBestDTO[];
export function buildAchievementBadges(sessions: AchievementSessionInput[], heatmap: WorkoutHeatmapDTO): AchievementBadgesDTO;

// src/app/actions/achievements.ts（新規）
export async function getAchievementsData(): Promise<AchievementsDataDTO>;

// src/types/index.ts（追加）
export const MUSCLE_GROUP_CHART_COLORS: Record<MuscleGroup, string>;
export interface HeatmapDayDTO { /* 3.4節参照 */ }
export interface WorkoutHeatmapDTO { /* 3.4節参照 */ }
export interface TrendPointDTO { /* 3.4節参照 */ }
export interface TrendSeriesDTO { /* 3.4節参照 */ }
export interface MuscleGroupBalanceDTO { /* 3.4節参照 */ }
export interface PersonalBestDTO { /* 3.4節参照 */ }
export interface AchievementBadgeDTO { /* 3.4節参照 */ }
export interface AchievementBadgesDTO { /* 3.4節参照 */ }
export interface AchievementsDataDTO { /* 3.4節参照 */ }
```

## 5. エラー処理方針（まとめ）

| ケース | 発生箇所 | 対応 |
|---|---|---|
| 未ログイン状態で`getAchievementsData`が呼ばれる（通常到達しない） | `getCurrentUserOrThrow()` | `UnauthorizedError`をthrowしたまま伝播させる（既存方針を踏襲） |
| 記録0件の新規ユーザー | `buildWorkoutHeatmap`/`buildTrendSeries`/`buildMuscleGroupBalance`/`buildPersonalBests`/`buildAchievementBadges` | 例外を投げず、ヒートマップは全level0、トレンドは全バケット0値、部位別バランス・自己ベストは空配列、バッジは全件未達成を返す。各表示コンポーネントは対応する空状態メッセージ（`TrendChart`, `MuscleBalanceChart`, `PersonalBestList`）またはゼロ表示（`WorkoutHeatmap`, `AchievementBadges`）を描画する |
| 種目が1件も無い部位（`muscleGroup`） | `buildMuscleGroupBalance` | `logCount === 0`のグループは戻り値配列から除外し、ドーナツチャートに空スライスを描画しない |
| データ不足でグラフが描画できない（全バケットが0件） | `TrendChart` | `points.some((p) => p.sessionCount > 0)`が`false`の場合、グラフを描画せず空状態メッセージ「記録がまだありません。トレーニングを記録するとグラフが表示されます。」を表示する |
| 有酸素専用・自重のみで一度もweightValueが入力されていない種目 | `buildPersonalBests` | `maxWeightKg`/`maxVolumeKg`が共にnullとなる種目は結果配列から除外する |
| KG/LB混在の記録がある種目 | `buildPersonalBests` | 常にkg換算後の値で比較・保持・表示する（`LB_TO_KG_FACTOR`を使用） |
| DB上の`muscleGroup`文字列が`MUSCLE_GROUPS`定数の想定外の値である異常データ | `buildMuscleGroupBalance` | `continue`でスキップし例外を投げない |
| Prismaクエリが例外を投げる（DB接続断等） | `getAchievementsData` | catchしない。既存の他Server Actionと同一方針でそのまま伝播させる |
| Rechartsの`ResponsiveContainer`の親要素が高さ0になる | `TrendChart`/`MuscleBalanceChart` | `height={240}`を固定指定し、親レイアウトに依存しない高さを保証する |

## 6. テスト観点（QAチーム用）

### 正常系
- T-01: `/workouts`にアクセスすると、既存の`StatsSummaryCard`2枚・履歴一覧に加えて、カレンダーヒートマップ・推移トレンドグラフ・部位別バランス・達成バッジ・自己ベスト一覧が表示される。
- T-02: ヒートマップの各セルにカーソルを合わせると、日付・記録件数・カロリーがツールチップで表示される。
- T-03: 推移トレンドグラフで「週別」「月別」を切り替えると、グラフのX軸ラベル・値が正しく再描画される。
- T-04: 推移トレンドグラフで「カロリー」「ボリューム」を切り替えると、Y軸の値・色・ツールチップの単位が正しく切り替わる。
- T-05: 部位別バランスで「頻度」「ボリューム」を切り替えると、ドーナツの各スライスの割合が正しく変わる。
- T-06: 実際に複数の部位でトレーニングを記録した状態で、記録の無い部位（例: 一度もCARDIOを記録していない）がドーナツチャートに表示されないことを確認する。
- T-07: 同じ種目で複数回、異なる重量を記録し、自己ベスト一覧に最大重量が正しく表示される。
- T-08: 連続日数バッジ・累計セッション数バッジが、達成済み（amber色）と未達成（グレー・「あと◯」表示）で視覚的に区別される。
- T-09: 3日連続でトレーニングを記録すると、「3日連続達成」バッジがamber色に切り替わる。

### 異常系・境界値
- T-10（記録ゼロ件・新規ユーザー）: セッションが1件も無い新規登録ユーザーで`/workouts`にアクセスしても例外が発生せず、ヒートマップは全セル未記録色、推移トレンドグラフ・部位別バランス・自己ベスト一覧はそれぞれ空状態メッセージが表示され、バッジは全12件が未達成表示になる。
- T-11（記録が少ない）: 記録が1件だけのユーザーで、トレンドグラフ・部位別バランス・自己ベスト一覧・ヒートマップがエラーにならず、その1件分のデータのみが正しく反映される。
- T-12（種目が1件も無い部位）: 特定の部位（例: SHOULDERS）を一度もトレーニングしていないユーザーで、部位別バランスのドーナツチャートにその部位のスライスが表示されないことを確認する。
- T-13（JST日付境界をまたぐストリーク計算・最重要）: `tests/unit/achievements.test.ts`の`buildWorkoutHeatmap`テストで、UTC前日15:00:00.000（＝JST当日0:00:00.000）に記録した場合に正しく「当日」としてストリークにカウントされ、UTC同日14:59:59.999（＝JST前日23:59:59.999）に記録した場合は「前日」としてカウントされることを確認する。
- T-14（ストリークが今日未記録でも継続する）: 前日まで記録があり今日はまだ記録していない状態で、`currentStreak`が0にならず前日までの連続日数を維持することを確認する（`buildWorkoutHeatmap`の単体テストで担保）。
- T-15（KG/LB混在時の自己ベスト計算・最重要）: 同一種目にKG単位の記録とLB単位の記録が混在する場合、kg換算後の正しい最大値が採用されることを確認する（LB記録の方が数値が大きくても、kg換算後に小さければベストにならないケースを含む）。
- T-16（重量未入力種目の除外）: 有酸素種目や自重のみの種目（`weightValue`が常にnull）が自己ベスト一覧に表示されないことを確認する。
- T-17（NEW判定の境界値）: 自己ベストを達成したセッションの`performedAt`のJST暦日が、表示時点からちょうど7日前（含む）と8日前（含まない）の境界で、NEWタグの表示・非表示が正しく切り替わることを確認する。
- T-18（暦週・暦月境界）: 月末・週末をまたぐ記録データで、週別/月別トレンドグラフの当該バケットに正しく振り分けられることを確認する（`tests/unit/date.test.ts`の`getJstWeekRangeUtc`/`getJstMonthRangeUtc`テストで担保）。
- T-19（過去の途切れたストリークの保持）: 現在のストリークより過去のストリークの方が長い場合、`longestStreak`が現在値に上書きされず、過去の最長値を維持することを確認する。
- T-20: `getAchievementsData()`呼び出し時に未ログイン状態だった場合、既存の他Server Actionと同様に`UnauthorizedError`が発生し、ミドルウェアによるログインリダイレクトが機能する（通常フローでは到達しない経路の防御確認）。

### 回帰確認
- T-21: 既存の`StatsSummaryCard`（直近7日/30日）・`CalorieDisclaimer`・セッション履歴一覧の表示内容が、本プロジェクトの変更前後で変わらないことを確認する。
- T-22: `npm run build`が型エラーなく成功する（新規DTO・新規コンポーネントのprops型整合性を含む）。
- T-23: `npm run test`（Vitest）が全件成功する（`tests/unit/date.test.ts`の追加分、`tests/unit/achievements.test.ts`の新規分を含む）。
- T-24: `npm run test:e2e`（Playwright）の既存全ケースが、`/workouts`のDOM構造変更（新規セクション追加）の影響を受けずに成功する（既存テストが`/workouts`ページ内の特定要素をセレクタで参照している場合、新規追加要素との重複や意図しないマッチが無いことを確認する）。
- T-25: スマートフォン幅（375px）で`/workouts`を表示し、ヒートマップ以外の領域で横スクロールが発生しないことを確認する。

## 7. 完了条件チェックリスト

- [ ] `src/lib/date.ts`に`getJstDateKey`, `addDays`, `getJstWeekRangeUtc`, `getJstMonthRangeUtc`が追加され、既存の関数は変更されていない
- [ ] `src/lib/achievements.ts`が新規作成され、5つの純粋集計関数と全定数がエクスポートされている
- [ ] `src/app/actions/achievements.ts`が新規作成され、`getAchievementsData()`が1回のPrismaクエリで完結している
- [ ] `src/types/index.ts`に新規DTO9種と`MUSCLE_GROUP_CHART_COLORS`が追加され、既存の型・定数は変更されていない
- [ ] `src/components/WorkoutHeatmap.tsx`が新規作成され、Server Componentのまま実装されている（"use client"が付いていない）
- [ ] `src/components/TrendChart.tsx`, `src/components/MuscleBalanceChart.tsx`が新規作成され、`"use client"`が付与されている
- [ ] `src/components/PersonalBestList.tsx`, `src/components/AchievementBadges.tsx`が新規作成されている
- [ ] `src/app/workouts/page.tsx`に新規5コンポーネントが組み込まれ、既存のStatsSummaryCard・履歴一覧が変更されていない
- [ ] `package.json`に`recharts`が追加され、`npm install`により`package-lock.json`が再生成されている
- [ ] `tests/unit/date.test.ts`に新規関数の単体テストが追加されている
- [ ] `tests/unit/achievements.test.ts`が新規作成され、記録ゼロ件・JST日付境界・KG/LB混在のテストケースを含む
- [ ] `prisma/schema.prisma`に変更が加えられていない（マイグレーションが発生していない）
- [ ] `npm run build`が成功する
- [ ] `npm run test`（Vitest）が成功する
- [ ] `npm run test:e2e`（Playwright）が成功する
- [ ] スマートフォン幅（375px）で画面崩れ・意図しない横スクロールが無いことを目視確認した
- [ ] 本書「6. テスト観点」の全項目（T-01〜T-25）を実施し、結果を記録した
