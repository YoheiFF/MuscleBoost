---
project_id: "2026-09-15-2347-heatmap-monday-3months"
phase: design
sub: detailed-design
created: "2026-09-15"
---
# 詳細設計書: トレーニングカレンダーの月曜始まり週整列＋表示期間「当月＋過去2ヶ月」化

本書は ClaudeCode に実装を依頼できる粒度で記述する。曖昧な表現（「適切に処理する」等）は用いない。実装者は本書の記述通りにファイルを編集すればよい。

前提ドキュメント:
- `requirements.md`（本プロジェクト内。確定事項A〜Eを前提とする）
- `basic-design.md`（本プロジェクト内）
- 情報収集レポート: `C:\project\MuscleBoost\.project\research\topics\2026-09-15-2347-heatmap-monday-3months.md`

## 1. 概要

トレーニングカレンダーヒートマップ（`/workouts`）の表示グリッドを、「今日から371日前を起点とした単純な7日チャンク」から「月曜始まりの暦週（月〜日の7行）に整列した、当月＋過去2ヶ月（可変長）」に変更する。ストリーク計算・達成バッジ・他の集計関数（トレンド、部位別バランス、自己ベスト）は一切変更しない。**新規ファイルの追加は無く、既存4ファイル＋テストファイル1件の変更のみで完結する。**

## 2. 影響範囲（編集／新規ファイル一覧）

| No | ファイルパス | 種別 | 変更概要 |
|---|---|---|---|
| 1 | `src/lib/achievements.ts` | 変更 | `computeHeatmapWindowStartUtc`/`computeHeatmapWindowDays`を新規追加。`HEATMAP_WINDOW_DAYS`定数を削除。`buildWorkoutHeatmap`のデフォルト引数を変更。`subtractJstMonths`を`buildWorkoutHeatmap`より前に移設（振る舞いは不変）。`import`に`getJstDayRangeUtc`を追加。 |
| 2 | `src/types/index.ts` | 変更 | `WorkoutHeatmapDTO`のJSDocコメント3箇所（「371日」表記）を修正。型構造は不変。 |
| 3 | `src/components/WorkoutHeatmap.tsx` | 変更 | 曜日ラベル列（月〜日）を追加。フッター文言「直近1年間」→「直近3ヶ月間」に修正。冒頭コメントを修正。グリッドのチャンク分割ロジック自体は不変。 |
| 4 | `tests/unit/achievements.test.ts` | 変更 | `toHaveLength(371)`の更新。月またぎ・年またぎの新規境界値テスト追加。`computeHeatmapWindowStartUtc`/`computeHeatmapWindowDays`のimport追加。 |

編集対象外（変更なし）: `src/lib/date.ts`（既存関数をそのまま再利用するのみ）、`src/app/actions/achievements.ts`、`prisma/schema.prisma`、`buildTrendSeries`/`buildMuscleGroupBalance`/`buildPersonalBests`/`buildAchievementBadges`の各関数本体、その他既存の全ファイル。

情報収集レポートで洗い出された「修正漏れが起きやすい箇所」の対応状況（全て本設計書でカバー済み）:

| 箇所 | 対応 |
|---|---|
| `achievements.ts:48-49` `HEATMAP_WINDOW_DAYS`定数 | 削除（4.1節） |
| `achievements.ts:95` JSDocコメント「371日の表示ウィンドウ」 | 修正（4.1節） |
| `achievements.ts:103` デフォルト引数 | 変更（4.1節） |
| `types/index.ts:114,116,119` コメント「371日」 | 修正（4.2節） |
| `WorkoutHeatmap.tsx:18` コメント | 修正（4.3節） |
| `WorkoutHeatmap.tsx:47` UI文言「直近1年間」 | 修正（4.3節） |
| `tests/unit/achievements.test.ts:35` `toHaveLength(371)` | 修正（4.4節） |

---

## 3. データ構造定義

型の構造そのものは変更しない（`HeatmapDayDTO`/`WorkoutHeatmapDTO`ともにフィールド名・型は現状のまま）。意味論のみ変わる点を明記する。

```ts
// src/types/index.ts（構造は既存のまま。コメントのみ4.2節の内容に更新）
export interface HeatmapDayDTO {
  date: string; // "YYYY-MM-DD"（JST暦日）
  sessionCount: number;
  logCount: number;
  totalCalories: number;
  level: 0 | 1 | 2 | 3;
}

export interface WorkoutHeatmapDTO {
  days: HeatmapDayDTO[]; // 古い→新しいの順。要素数は可変（当月＋過去2ヶ月を月曜始まりで切り下げた日数）
  currentStreak: number;
  longestStreak: number;
  totalActiveDays: number; // days配列のうちlogCount>0の日数（表示期間内のみ）
}
```

新規に追加する関数の型シグネチャ（`src/lib/achievements.ts`、4.1節で詳述）:

```ts
export function computeHeatmapWindowStartUtc(now: Date): Date;
export function computeHeatmapWindowDays(now: Date): number;
```

---

## 4. ファイル別変更詳細

### 4.1 `src/lib/achievements.ts`（変更）

#### 編集前の関連箇所

現状ファイル全文は読み込み済み（`src/lib/achievements.ts:1-453`）。変更対象は以下の4箇所。

**(a) import文（1-13行目）** — `getJstDayRangeUtc`が未importのため追加が必要。

現状:
```ts
import {
  JST_OFFSET_MS,
  getJstDateKey,
  addDays,
  getJstWeekRangeUtc,
  getJstMonthRangeUtc,
} from "@/lib/date";
```

**(b) 定数定義（48-49行目）**

現状:
```ts
/** ヒートマップの表示日数（53週×7日=371日、GitHub風の1年表示用ウィンドウ） */
export const HEATMAP_WINDOW_DAYS = 371;
/** ヒートマップの色レベル境界（件数）。この件数以上でlevel2、level3になる */
export const HEATMAP_LEVEL_2_MIN_LOG_COUNT = 3;
export const HEATMAP_LEVEL_3_MIN_LOG_COUNT = 6;
```

**(c) `buildWorkoutHeatmap`のJSDocコメントとシグネチャ（83-104行目）**

現状:
```ts
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
```

**(d) `subtractJstMonths`の現在の定義位置（170-179行目、`formatMonthLabel`の直後）**

現状:
```ts
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
```

`buildWorkoutHeatmap`の本体ループ（105-158行目）・`formatWeekLabel`/`formatMonthLabel`（160-168行目）・以降の全関数（`aggregateBucket`, `buildTrendSeries`, `buildMuscleGroupBalance`, `buildPersonalBests`, `buildAchievementBadges`）は**1文字も変更しない**。

#### 編集後の期待形

**(a) import文を以下に置き換える:**
```ts
import {
  JST_OFFSET_MS,
  getJstDateKey,
  addDays,
  getJstDayRangeUtc,
  getJstWeekRangeUtc,
  getJstMonthRangeUtc,
} from "@/lib/date";
```

**(b) 定数定義を以下に置き換える（`HEATMAP_WINDOW_DAYS`とそのコメントを削除）:**
```ts
/** ヒートマップの色レベル境界（件数）。この件数以上でlevel2、level3になる */
export const HEATMAP_LEVEL_2_MIN_LOG_COUNT = 3;
export const HEATMAP_LEVEL_3_MIN_LOG_COUNT = 6;
```

**(c) `computeHeatmapLevel`関数（76-81行目）の直後・`buildWorkoutHeatmap`（現行83行目）の直前に、`subtractJstMonths`を移設した上で、新規に`computeHeatmapWindowStartUtc`/`computeHeatmapWindowDays`を追加する:**
```ts
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

/**
 * ヒートマップ表示グリッドの開始日（月曜始まり週の月曜日 JST 0:00、UTCのDateとして返す）を算出する。
 * 「当月＋過去2ヶ月」のうち最も過去側の暦月（2ヶ月前の月）の1日を、その週の月曜まで切り下げる。
 *
 * 処理ロジック:
 * 1. subtractJstMonths(now, 2)で「2ヶ月前の月」を表す基準日を求める。
 * 2. getJstMonthRangeUtc(基準日).monthStartUtcで、その月の1日 JST 0:00 を求める。
 * 3. getJstWeekRangeUtc(1日).weekStartUtcで、その1日が属する暦週の月曜 JST 0:00 まで切り下げる
 *    （1日が月曜でない月は、最大6日分前月にはみ出す。要件定義書「確定事項B」で許容と確定済み）。
 */
export function computeHeatmapWindowStartUtc(now: Date): Date {
  const twoMonthsAgoMonthStartUtc = getJstMonthRangeUtc(subtractJstMonths(now, 2)).monthStartUtc;
  return getJstWeekRangeUtc(twoMonthsAgoMonthStartUtc).weekStartUtc;
}

/**
 * ヒートマップ表示グリッドの日数（buildWorkoutHeatmapのdays配列長のデフォルト値）を算出する。
 * computeHeatmapWindowStartUtc(now)（月曜0:00 JST）から、nowが属するJST暦日の0:00までの
 * 経過日数に+1（今日自身の分）した値。月によって暦日数が異なるため固定値にはならず、
 * 常に7の倍数になるとも限らない（最終行＝直近の週は「今日」の曜日までしか埋まらないため）。
 */
export function computeHeatmapWindowDays(now: Date): number {
  const windowStartUtc = computeHeatmapWindowStartUtc(now);
  const { dayStartUtc: todayStartUtc } = getJstDayRangeUtc(now);
  const diffDays = Math.round((todayStartUtc.getTime() - windowStartUtc.getTime()) / (24 * 60 * 60 * 1000));
  return diffDays + 1;
}
```

**(d) `buildWorkoutHeatmap`のJSDocコメント・シグネチャを以下に置き換える（関数本体105-158行目は無変更）:**
```ts
/**
 * 表示グリッド（windowDays日分。デフォルトは「当月＋過去2ヶ月」を月曜始まり週に整列させた
 * 可変長のウィンドウ）の日別ヒートマップデータ、現在のストリーク、最長ストリークを算出する。
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
 * 4. 最長ストリーク(longestStreak): 1.のMapの全キー（表示ウィンドウ(windowDays)に限定しない、
 *    全期間）をdateKeyToDayIndexで整数化し、連続する整数の最長run長を求める。
 *    currentStreakは必ずこのrunの一部であるため、最終的にlongestStreak = max(longestStreak, currentStreak)とする。
 * 5. totalActiveDays: 2.のdays配列のうちlogCount>0の日数（表示ウィンドウ内のみ）。
 */
export function buildWorkoutHeatmap(
  sessions: AchievementSessionInput[],
  now: Date,
  windowDays: number = computeHeatmapWindowDays(now)
): WorkoutHeatmapDTO {
```

**(e) 旧`subtractJstMonths`の定義（旧170-179行目、`formatMonthLabel`の直後）は削除する**（(c)で`buildWorkoutHeatmap`の直前に移設済みのため、二重定義を避ける）。`formatWeekLabel`/`formatMonthLabel`関数自体は元の位置のまま変更しない。

#### 関数シグネチャと処理ロジック（新規2関数）

```
function computeHeatmapWindowStartUtc(now: Date): Date
  1. subtractJstMonths(now, 2) で「2ヶ月前の月」の基準日（Date）を得る。
  2. getJstMonthRangeUtc(基準日).monthStartUtc で、その月の1日 JST 0:00 のUTC Dateを得る。
  3. getJstWeekRangeUtc(1日).weekStartUtc で、その日が属する暦週の月曜 JST 0:00 のUTC Dateを得て返す。

function computeHeatmapWindowDays(now: Date): number
  1. computeHeatmapWindowStartUtc(now) で windowStartUtc を得る。
  2. getJstDayRangeUtc(now).dayStartUtc で todayStartUtc（nowが属するJST暦日の0:00）を得る。
  3. diffDays = Math.round((todayStartUtc.getTime() - windowStartUtc.getTime()) / 86400000)
  4. windowDays = diffDays + 1 を返す（今日自身を含むため+1）。
```

#### エラー処理

- `now`が`Invalid Date`の場合: 既存の`getJstDayRangeUtc`等と同じ方針で、本関数内での追加バリデーションは行わない（呼び出し元は常に`new Date()`または有効な`Date`を渡すため）。
- `computeHeatmapWindowDays`の戻り値が0以下になることは理論上あり得ない（`windowStartUtc`は常に`now`が属する週以前になるため、`diffDays >= 0`が保証される）。念のための防御的な`Math.max(1, ...)`等のガードは**追加しない**（既存コードベースの方針として、理論上発生しない異常値に対する冗長なガードは入れない。他の関数と同じスタイルを踏襲する）。

---

### 4.2 `src/types/index.ts`（変更）

#### 編集前の関連箇所（114-120行目）

現状:
```ts
/** カレンダーヒートマップ全体（直近371日分）＋ストリーク情報 */
export interface WorkoutHeatmapDTO {
  days: HeatmapDayDTO[]; // 古い→新しいの順、直近371日分
  currentStreak: number; // 現在の連続日数（今日未記録でも前日までの連続を維持）
  longestStreak: number; // 全期間の最長連続日数
  totalActiveDays: number; // 直近371日中、記録がある日数
}
```

#### 編集後の期待形

```ts
/** カレンダーヒートマップ全体（当月＋過去2ヶ月を月曜始まり週で切り下げた可変長の表示期間）＋ストリーク情報 */
export interface WorkoutHeatmapDTO {
  days: HeatmapDayDTO[]; // 古い→新しいの順。先頭は必ず月曜日、末尾は必ず今日
  currentStreak: number; // 現在の連続日数（今日未記録でも前日までの連続を維持）
  longestStreak: number; // 全期間の最長連続日数
  totalActiveDays: number; // 表示期間中、記録がある日数
}
```

`HeatmapDayDTO`インターフェース自体（105-112行目）は変更しない。

#### 変更手順

1. `WorkoutHeatmapDTO`のJSDocコメントと3つのフィールドコメント（`days`, `totalActiveDays`）を上記の通り書き換える。
2. フィールド名・型は一切変更しない。

#### エラー処理

型定義のみの変更のため、実行時エラー処理は発生しない。

---

### 4.3 `src/components/WorkoutHeatmap.tsx`（変更）

#### 編集前の関連箇所（全文、1-50行目）

現状ファイル全文は読み込み済み。特に以下2箇所が変更対象。

**(a) 冒頭コメント（17-19行目）:**
```tsx
export default function WorkoutHeatmap({ heatmap }: WorkoutHeatmapProps) {
  // 371日を7日ずつの列に区切る（暦週の月曜始まりへの厳密な整列は行わない設計判断。
  // basic-design.mdの通り、実装簡易化のため単純に7日単位のチャンクとする）。
  const weeks: HeatmapDayDTO[][] = [];
```

**(b) グリッド描画部分（34-46行目）とフッター（47行目）:**
```tsx
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
```

#### 編集後の期待形（ファイル全文を以下に置き換える）

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

/** 月曜始まりの曜日ラベル。heatmap.daysの並び順（月曜始まり、buildWorkoutHeatmapが
 *  computeHeatmapWindowStartUtcで週の月曜0:00(JST)に整列済み）と対応させる固定表示用配列。 */
const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"] as const;

export default function WorkoutHeatmap({ heatmap }: WorkoutHeatmapProps) {
  // heatmap.daysは必ず月曜日始まり（buildWorkoutHeatmapのdays[0]が週の月曜0:00(JST)に
  // 整列済みのため）。7日ずつのチャンクに区切ると、区切り位置(0, 7, 14, ...)は常に月曜に
  // 一致するので、各チャンクの先頭(index0)は必ず月曜、以降 火→水→木→金→土→日 の順になる。
  // 最後のチャンクのみ「今日」で打ち切られるため7件に満たない場合があるが、それでも先頭は
  // 月曜のままなので、下記の曜日ラベル列との縦位置の対応は常に崩れない。
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
      <div className="flex gap-2">
        <div className="flex shrink-0 flex-col gap-[3px] pb-2">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="h-3 text-[10px] leading-3 text-gray-400 sm:h-3.5 sm:leading-[14px]"
            >
              {label}
            </div>
          ))}
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
      </div>
      <p className="mt-2 text-xs text-gray-400">直近3ヶ月間の記録日数: {heatmap.totalActiveDays}日</p>
    </div>
  );
}
```

#### 関数シグネチャと処理ロジック

```
function WorkoutHeatmap({ heatmap }: WorkoutHeatmapProps): JSX.Element
  1. heatmap.days（可変長、古い→新しい順、先頭が必ず月曜）を7要素ずつのチャンクに分割し、
     weeks配列を作る（ロジック自体は変更前と同一）。
  2. ヘッダーに現在のストリーク・最長ストリークを表示する（変更なし）。
  3. 本体を横方向(flex)に「曜日ラベル列」＋「週の列部分」の2ブロックで並べる。
     - 曜日ラベル列: WEEKDAY_LABELS（月火水木金土日）を縦に7つ並べた固定表示。
       overflow-x-autoの対象外（週の列部分のみが横スクロールする）。
     - 週の列部分: 変更前と同じくflex + overflow-x-autoで、各週を縦(flex-col)に描画する。
  4. フッターに「直近3ヶ月間の記録日数」を表示する（文言のみ変更）。
```

#### エラー処理

- `heatmap.days`が極端に短い（1件のみ等）場合でも、`weeks`は1要素のチャンク（1〜7件）になるだけで例外は発生しない。曜日ラベル列は常に7行固定で描画され、対応する週の列が7件未満でも表示上の不整合（エラー）にはならない（ラベルの一部に対応するセルが無いだけで、レイアウトは崩れない）。
- 新規ユーザー（記録0件）の場合: 全セルが`level: 0`（`bg-slate-100`）になり、`currentStreak`/`longestStreak`は共に0と表示される。曜日ラベル・グリッド自体は通常通り描画される（空状態専用のメッセージ分岐は設けない。既存方針を踏襲）。

---

### 4.4 `tests/unit/achievements.test.ts`（変更）

#### 編集前の関連箇所

**(a) import文（1-10行目）:**
```ts
import { describe, it, expect } from "vitest";
import {
  buildWorkoutHeatmap,
  buildTrendSeries,
  buildMuscleGroupBalance,
  buildPersonalBests,
  buildAchievementBadges,
  type AchievementSessionInput,
} from "@/lib/achievements";
```

**(b) `buildWorkoutHeatmap`の最初のテスト（32-40行目）:**
```ts
describe("buildWorkoutHeatmap", () => {
  it("記録が0件の場合、全セルlevel0・ストリーク0・totalActiveDays0を返す（新規ユーザー）", () => {
    const result = buildWorkoutHeatmap([], NOW);
    expect(result.days).toHaveLength(371);
    expect(result.days.every((d) => d.level === 0)).toBe(true);
    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(0);
    expect(result.totalActiveDays).toBe(0);
  });
```

`NOW = new Date("2026-09-15T04:00:00.000Z")`（JST 2026-09-15 13:00、火曜日）は変更しない（12行目）。

#### 編集後の期待形

**(a) import文を以下に置き換える:**
```ts
import { describe, it, expect } from "vitest";
import {
  buildWorkoutHeatmap,
  buildTrendSeries,
  buildMuscleGroupBalance,
  buildPersonalBests,
  buildAchievementBadges,
  computeHeatmapWindowStartUtc,
  computeHeatmapWindowDays,
  type AchievementSessionInput,
} from "@/lib/achievements";
import { getJstDateKey } from "@/lib/date";
```

**(b) `buildWorkoutHeatmap`の最初のテストを以下に置き換える:**
```ts
describe("buildWorkoutHeatmap", () => {
  it("記録が0件の場合、当月+過去2ヶ月を月曜始まりで整列した表示期間で、全セルlevel0・ストリーク0・totalActiveDays0を返す（新規ユーザー）", () => {
    const result = buildWorkoutHeatmap([], NOW);
    // NOW=2026-09-15(火)。2ヶ月前の月=2026年7月、7/1(水)が属する週の月曜=2026-06-29。
    // 2026-06-29〜2026-09-15は79日間（6月2日+7月31日+8月31日+9月15日=79）。
    expect(result.days).toHaveLength(79);
    expect(result.days[0].date).toBe("2026-06-29");
    expect(result.days[result.days.length - 1].date).toBe("2026-09-15");
    expect(result.days.every((d) => d.level === 0)).toBe(true);
    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(0);
    expect(result.totalActiveDays).toBe(0);
  });
```

**(c) `describe("buildWorkoutHeatmap", ...)`ブロックの末尾（既存の最後のテストの後、87行目の`});`の直前）に、新規テストを1件追加する:**
```ts

  it("windowDaysを明示的に渡した場合は、そのdays配列長で表示グリッドが生成される（後方互換の確認）", () => {
    const result = buildWorkoutHeatmap([], NOW, 10);
    expect(result.days).toHaveLength(10);
    expect(result.days[result.days.length - 1].date).toBe("2026-09-15");
  });
```

**(d) `describe("buildWorkoutHeatmap", ...)`ブロックの直後（既存87行目の`});`の直後、`describe("buildTrendSeries", ...)`の直前）に、新規`describe`ブロックを1件追加する:**
```ts

describe("computeHeatmapWindowStartUtc / computeHeatmapWindowDays", () => {
  it("2ヶ月前の月の1日が月曜でない場合、その週の月曜まで切り下げる（月またぎ）", () => {
    const start = computeHeatmapWindowStartUtc(NOW); // NOW=2026-09-15、2ヶ月前=7月、7/1は水曜
    expect(getJstDateKey(start)).toBe("2026-06-29");
    expect(computeHeatmapWindowDays(NOW)).toBe(79);
  });

  it("2ヶ月前の月の1日がすでに月曜の場合は切り下げが発生しない", () => {
    // 2026-05-04(月)を基準にすると、2ヶ月前の月=2026年3月、3/1(日)が属する週の月曜=2026-02-23
    const marNow = new Date("2026-05-04T04:00:00.000Z"); // JST 2026-05-04 13:00（月曜）
    const start = computeHeatmapWindowStartUtc(marNow);
    expect(getJstDateKey(start)).toBe("2026-02-23");
  });

  it("年をまたぐ場合も正しく暦週アライメントされる", () => {
    const janNow = new Date("2026-01-15T04:00:00.000Z"); // JST 2026-01-15 13:00（木曜）
    const start = computeHeatmapWindowStartUtc(janNow); // 2ヶ月前=2025年11月、11/1は土曜→月曜切り下げで10/27
    expect(getJstDateKey(start)).toBe("2025-10-27");
    expect(computeHeatmapWindowDays(janNow)).toBe(81);
  });
});
```

> 補足: (d)の2件目のテストケース「3/1(日)が属する週の月曜=2026-02-23」は、2026年3月1日が日曜日であることを前提とする。実装者は本テストを追加する前に、`node -e "console.log(new Date(Date.UTC(2026,2,1)).getUTCDay())"`（0=日）等で日付の妥当性を再確認すること。値が異なる場合はテスト内の日付・期待値をテスト実行結果に合わせて修正してよい（本テストの目的は「切り下げが不要なケースでも数式が破綻しないこと」の確認であり、具体的な暦日そのものが設計の本質ではない）。

`describe("buildTrendSeries", ...)`以降（89行目以降）は変更しない。

#### 変更手順

1. import文に`computeHeatmapWindowStartUtc`, `computeHeatmapWindowDays`（`@/lib/achievements`より）、`getJstDateKey`（`@/lib/date`より）を追加する。
2. `buildWorkoutHeatmap`の最初のテストの期待値を書き換える。
3. `buildWorkoutHeatmap`の`describe`ブロック内に、`windowDays`明示指定の後方互換テストを追加する。
4. `buildWorkoutHeatmap`の`describe`ブロックの直後に、`computeHeatmapWindowStartUtc`/`computeHeatmapWindowDays`用の新規`describe`ブロックを追加する。
5. 他の`describe`ブロック（`buildTrendSeries`, `buildMuscleGroupBalance`, `buildPersonalBests`, `buildAchievementBadges`）は一切変更しない。

#### エラー処理

テストコードのため、実行時エラー処理の設計対象ではない。`npm run test`（Vitest）が全件成功することが完了条件（後述「7. 完了条件チェックリスト」参照）。

---

## 5. エラー処理方針（全体まとめ）

| ケース | 方針 |
|---|---|
| `now`が`Invalid Date` | 本プロジェクトの新規関数を含め、既存の`date.ts`/`achievements.ts`全体の方針を踏襲し、追加バリデーションは行わない（呼び出し元は常に有効な`Date`を渡す前提）。 |
| `sessions`が空配列（新規ユーザー） | `buildWorkoutHeatmap`は例外を投げず、全セル`level: 0`・`currentStreak: 0`・`longestStreak: 0`・`totalActiveDays: 0`を返す（変更前と同一の保証。表示グリッドの長さのみ`computeHeatmapWindowDays(now)`基準に変わる）。 |
| `computeHeatmapWindowDays`の戻り値 | 理論上必ず1以上になる（`windowStartUtc <= todayStartUtc`が常に成立するため）。防御的な下限ガードは追加しない。 |
| `WorkoutHeatmap.tsx`側で`heatmap.days`が短い／7の倍数でない | 例外にならない。最後の週の列が7件未満になるだけで、曜日ラベルとの対応・レイアウトは崩れない（3.3節/4.3節参照）。 |

---

## 6. テスト観点（QAチーム向け）

### 6.1 正常系

- `buildWorkoutHeatmap([], NOW)`の`days`配列が、`computeHeatmapWindowDays(NOW)`と同じ長さで返る。
- `days[0].date`が「2ヶ月前の月の1日が属する週の月曜日」の日付キーと一致する。
- `days[days.length-1].date`が`NOW`のJST暦日（"2026-09-15"）と一致する。
- 記録がある日について、`WorkoutHeatmap.tsx`のセル描画（`title`属性・`level`に応じた背景色クラス）が変更前と同じ内容で表示される（データ内容の描画ロジックは無変更のため回帰確認のみ）。
- 曜日ラベル（月・火・水・木・金・土・日）が7行、グリッド左側に固定表示される。
- フッター文言が「直近3ヶ月間の記録日数: N日」になっている（「直近1年間」の文言が残っていない）。

### 6.2 異常系

- `sessions`が空配列（新規ユーザー）でも例外が発生せず、全セル`level: 0`、`currentStreak: 0`、`longestStreak: 0`、`totalActiveDays: 0`で描画される。
- `buildWorkoutHeatmap`に`windowDays`を明示的に小さい値（例: 10）で渡した場合でも、その値通りのグリッド長で生成される（デフォルト値変更が既存の引数上書き機能を壊していないことの確認、後方互換性）。

### 6.3 境界値（必須項目）

- **月をまたぐ場合の月曜切り下げ**: 「2ヶ月前の月の1日」が月曜でない月（例: `NOW = 2026-09-15`、2ヶ月前=2026年7月、7/1は水曜）を基準に、`computeHeatmapWindowStartUtc`が正しく前月（6月）側の月曜（2026-06-29）まで切り下げること、かつ`computeHeatmapWindowDays`が正しい日数（79日）を返すことを確認する。
- **年をまたぐ場合**: 「2ヶ月前の月」が前年にまたがるケース（例: `NOW = 2026-01-15`、2ヶ月前=2025年11月）で、`subtractJstMonths`内部の`Date.UTC(year, month - months, 1, ...)`が年をまたいで正しく繰り下がること（JavaScript標準の`Date.UTC`の年繰り上げ/繰り下げ仕様により、特別な分岐なしで正しく動作することを確認）、および`computeHeatmapWindowStartUtc`/`computeHeatmapWindowDays`の戻り値（2025-10-27、81日）が正しいことを確認する。
- **既存の`toHaveLength(371)`テストの更新**: `tests/unit/achievements.test.ts:35`（変更前）の固定値`371`への依存が完全に除去され、新しい期間算出方式に基づく具体的な期待値（`79`、および先頭・末尾の日付）に置き換わっていることを確認する。
- **2ヶ月前の月の1日が既に月曜の場合（切り下げ不要ケース）**: 切り下げ処理が「月曜でない場合のみ」ではなく常に同じ数式（`(dayOfWeek + 6) % 7`）で動作し、月曜の場合は`daysSinceMonday = 0`となって切り下げが発生しない（同じ日がそのまま`windowStartUtc`になる）ことを確認する。
- **うるう年をまたぐ月境界**: `MUSCLE_BALANCE_WINDOW_DAYS`等の他の日数系定数と異なり、`computeHeatmapWindowDays`は暦月の実日数（28〜31日）に依存するため、2月を含む3ヶ月分の計算（例: `NOW`が3月・4月付近）で意図しない日数のズレが発生しないこと（`Date.UTC`ベースの計算のため、うるう年判定は自動的に正しく行われる想定だが、QAチームは少なくとも1ケース、2月を含む期間で目視確認する）。

### 6.4 回帰確認（本変更で影響を受けないことの確認）

- `currentStreak`/`longestStreak`の値が、同一の`sessions`・`now`に対して本変更の前後で変化しないこと（`tests/unit/achievements.test.ts`内の既存ストリーク系テスト5件がすべて無修正のまま成功することで確認する）。
- `buildTrendSeries`/`buildMuscleGroupBalance`/`buildPersonalBests`/`buildAchievementBadges`の既存テストが、無修正のまま全て成功すること。
- `/workouts`画面で、`StatsSummaryCard`・セッション履歴一覧・推移トレンドグラフ・部位別バランス・自己ベスト一覧・達成バッジの表示が、本変更前と変わらないこと（目視確認）。

---

## 7. 完了条件チェックリスト

- [ ] `src/lib/achievements.ts`: `computeHeatmapWindowStartUtc`/`computeHeatmapWindowDays`を追加し、`export`されている。
- [ ] `src/lib/achievements.ts`: `HEATMAP_WINDOW_DAYS`定数とそのコメントが削除されている。
- [ ] `src/lib/achievements.ts`: `buildWorkoutHeatmap`のデフォルト引数が`computeHeatmapWindowDays(now)`になっている（本体ロジックは無変更）。
- [ ] `src/lib/achievements.ts`: `import`に`getJstDayRangeUtc`が追加されている。
- [ ] `src/lib/achievements.ts`: `subtractJstMonths`の定義が重複しておらず、`buildWorkoutHeatmap`より前の1箇所のみに存在する。
- [ ] `src/types/index.ts`: `WorkoutHeatmapDTO`のコメントから「371」という具体的日数の記述が消えている。
- [ ] `src/components/WorkoutHeatmap.tsx`: 曜日ラベル（月火水木金土日）がグリッド左側に表示される。
- [ ] `src/components/WorkoutHeatmap.tsx`: フッター文言が「直近3ヶ月間の記録日数」になっている。
- [ ] `src/components/WorkoutHeatmap.tsx`: 冒頭コメントから「暦週の月曜始まりへの厳密な整列は行わない」という、もはや事実と異なる記述が消えている。
- [ ] `tests/unit/achievements.test.ts`: `toHaveLength(371)`が残っていない（`Grep`で"371"を再検索し、テストファイル内に0件であることを確認する）。
- [ ] `tests/unit/achievements.test.ts`: 月またぎ・年またぎの新規境界値テストが追加され、成功する。
- [ ] `src`配下全体を`Grep`で"371"再検索し、`achievements.ts`・`types/index.ts`・`WorkoutHeatmap.tsx`・`achievements.test.ts`のいずれにも一致しないことを確認する。
- [ ] `npm run build`（型チェック含む）がエラーなく成功する。
- [ ] `npm run test`（Vitest）が全て成功する。
- [ ] `/workouts`をローカルで開き、トレーニングカレンダーが月曜始まり・当月+過去2ヶ月相当の幅で表示され、曜日ラベルが正しく行と対応していることを目視確認する。
