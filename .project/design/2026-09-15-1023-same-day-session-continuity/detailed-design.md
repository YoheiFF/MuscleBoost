---
project_id: "2026-09-15-1023-same-day-session-continuity"
phase: design
sub: detailed-design
created: "2026-09-15"
---
# 詳細設計書: ワークアウトセッションの「同じ日は同一セッション」継続化

本書は ClaudeCode に実装を依頼できる粒度で記述する。曖昧な表現（「適切に処理する」等）は用いない。実装者は本書の記述通りにファイルを編集すればよい。

前提ドキュメント:
- `requirements.md`（本プロジェクト内）
- `basic-design.md`（本プロジェクト内）
- 情報収集レポート: `C:\project\MuscleBoost\.project\research\topics\2026-09-15-1023-same-day-session-continuity.md`

## 1. 概要

現在、記録開始のたびに`createWorkoutSession`（`src/app/actions/workouts.ts:17-27`）が無条件で新規`WorkoutSession`を作成するため、同じ日にアプリを再訪しても記録が別セッションに分裂してしまう。本プロジェクトでは、**JST暦日を基準としたfind-or-createロジック**を`createWorkoutSession`に組み込み、かつホーム画面の主導線を「当日セッションへ直行する新規ページ（`/workouts/today`）」に切り替えることで、同じ日の記録が常に1つの`WorkoutSession`に集約されるようにする。スキーマ変更は行わない。

セッション統合により「セッションを削除する」操作の影響範囲が拡大するため、削除確認ダイアログも本プロジェクトのスコープに含める。

## 2. 影響範囲（編集／新規ファイル一覧）

| No | ファイルパス | 種別 | 変更概要 |
|---|---|---|---|
| 1 | `src/lib/date.ts` | 変更 | JST暦日範囲を返す`getJstDayRangeUtc`を追加 |
| 2 | `src/app/actions/workouts.ts` | 変更 | `createWorkoutSession`をfind-or-create化。非公開ヘルパー`resolveOrCreateSessionForDay`追加。新規Server Action`getOrCreateTodaysWorkoutSession`追加 |
| 3 | `src/app/workouts/today/page.tsx` | 新規 | 当日セッションへの直行専用ページ |
| 4 | `src/app/page.tsx` | 変更 | 「①今日の記録をする」リンク先を`/workouts/new`→`/workouts/today`に変更 |
| 5 | `src/app/workouts/new/page.tsx` | 変更 | 合流時の挙動を説明する注記文を追加 |
| 6 | `src/components/DeleteSessionButton.tsx` | 新規 | 削除確認ダイアログ付きボタン（Client Component） |
| 7 | `src/app/workouts/[id]/page.tsx` | 変更 | 既存の削除ボタンを`DeleteSessionButton`に置き換え |
| 8 | `tests/unit/date.test.ts` | 新規 | `getJstDayRangeUtc`の境界値単体テスト |
| 9 | `tests/e2e/workout-flow.spec.ts` | 変更（回帰確認＋新規テスト追加） | find-or-create化後も既存テストが成立することを確認し、合流挙動を検証する新規テストケースを追加する |

編集対象外（変更なし）: `prisma/schema.prisma`、`src/app/actions/workouts.ts`内の`addWorkoutLog`/`updateWorkoutLog`/`deleteWorkoutLog`/`listWorkoutSessions`/`getWorkoutSession`/`getDashboardStats`、`src/components/WorkoutSessionLogs.tsx`ほかログ入力系コンポーネント、`middleware.ts`、`src/lib/auth.ts`、`src/lib/auth.config.ts`、`src/lib/calorie.ts`、`src/lib/volume.ts`、`src/lib/weight.ts`。

## 3. ファイル別変更詳細

### 3.1 `src/lib/date.ts`（変更）

#### 編集前の関連箇所（現状、全文1-8行目）
```ts
// src/lib/date.ts

/** 現在時刻から指定日数前のISO日時文字列と現在時刻を返す（ダッシュボード集計用） */
export function getPeriodRange(days: number): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to };
}
```

#### 編集後の期待形
```ts
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
```

#### 関数シグネチャと処理ロジック（pseudo-code）
```
function getJstDayRangeUtc(date: Date): { dayStartUtc: Date; dayEndUtc: Date }
  1. date のUTCミリ秒値に JST_OFFSET_MS（+9時間）を加算し、"JSTでの壁時計時刻" を表すミリ秒値 jstMs を得る。
     - 実装上の技法: jstMsを new Date(jstMs) に変換すると、その Date オブジェクトの
       getUTCFullYear()/getUTCMonth()/getUTCDate() が「JSTでの年月日」を返す
       （UTCゲッターを使うことで、実行環境のローカルタイムゾーン設定の影響を一切受けない）。
  2. jstDate から year, month, day（JSTでの年月日）を取り出す。
  3. Date.UTC(year, month, day, 0, 0, 0, 0) で「JSTの年月日と同じ数字のUTC 0:00」を求め、
     そこから JST_OFFSET_MS を引くことで「JST 0:00 に対応する実際のUTC時刻」jstMidnightAsUtcMs を得る。
  4. dayStartUtc = new Date(jstMidnightAsUtcMs)
     dayEndUtc   = new Date(jstMidnightAsUtcMs + 24時間ぶんのミリ秒)
  5. { dayStartUtc, dayEndUtc } を返す。
```
- 入力の`date`はどのタイムゾーンで生成された`Date`でも良い（`Date`は内部的にUTCエポックミリ秒で保持されるため）。
- サマータイムを考慮する分岐は不要（JSTには存在しないため）。
- 既存の`getPeriodRange`は変更しない。

---

### 3.2 `src/app/actions/workouts.ts`（変更）

#### 編集前の関連箇所（現状、1-27行目）
```ts
// src/app/actions/workouts.ts
"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserOrThrow } from "@/lib/session-guard";
import { calculateCalories, estimateDurationMinutesForStrength } from "@/lib/calorie";
import { calculateVolumeKg } from "@/lib/volume";
import { resolveWeightKgForCalorie } from "@/lib/weight";
import { getPeriodRange } from "@/lib/date";
import { workoutSessionInputSchema, workoutLogInputSchema } from "@/lib/validation";
import { isCardioMuscleGroup } from "@/types";
import type {
  ActionResult, WorkoutSessionSummaryDTO, WorkoutSessionDetailDTO,
  WorkoutLogDTO, DashboardStatsDTO, WeightUnit, MuscleGroup,
} from "@/types";

export async function createWorkoutSession(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUserOrThrow();
  const parsed = workoutSessionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力内容を確認してください", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const session = await prisma.workoutSession.create({
    data: { userId: user.id, performedAt: parsed.data.performedAt, memo: parsed.data.memo },
  });
  return { ok: true, data: { id: session.id } };
}
```

#### 編集後の期待形
```ts
// src/app/actions/workouts.ts
"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserOrThrow } from "@/lib/session-guard";
import { calculateCalories, estimateDurationMinutesForStrength } from "@/lib/calorie";
import { calculateVolumeKg } from "@/lib/volume";
import { resolveWeightKgForCalorie } from "@/lib/weight";
import { getPeriodRange, getJstDayRangeUtc } from "@/lib/date";
import { workoutSessionInputSchema, workoutLogInputSchema } from "@/lib/validation";
import { isCardioMuscleGroup } from "@/types";
import type {
  ActionResult, WorkoutSessionSummaryDTO, WorkoutSessionDetailDTO,
  WorkoutLogDTO, DashboardStatsDTO, WeightUnit, MuscleGroup,
} from "@/types";

/**
 * find-or-createの本体。userIdの「performedAtが属するJST暦日」の既存WorkoutSessionを検索し、
 * あれば再利用し（reused: true）、無ければ新規作成する（reused: false）。
 * createWorkoutSessionとgetOrCreateTodaysWorkoutSessionの両方から呼ばれる非公開ヘルパー。
 * 同一暦日に複数件該当する場合（本機能導入前に作られた既存データ等）は、
 * createdAt昇順で最も早く作られたものを正とする。
 */
async function resolveOrCreateSessionForDay(
  userId: string,
  performedAt: Date,
  memo: string | undefined
): Promise<{ id: string; reused: boolean }> {
  const { dayStartUtc, dayEndUtc } = getJstDayRangeUtc(performedAt);
  const existing = await prisma.workoutSession.findFirst({
    where: {
      userId,
      performedAt: { gte: dayStartUtc, lt: dayEndUtc },
    },
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    return { id: existing.id, reused: true };
  }
  const created = await prisma.workoutSession.create({
    data: { userId, performedAt, memo },
  });
  return { id: created.id, reused: false };
}

export async function createWorkoutSession(
  input: unknown
): Promise<ActionResult<{ id: string; reused: boolean }>> {
  const user = await getCurrentUserOrThrow();
  const parsed = workoutSessionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力内容を確認してください", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const result = await resolveOrCreateSessionForDay(user.id, parsed.data.performedAt, parsed.data.memo);
  return { ok: true, data: result };
}

/**
 * 「今日（JST基準）」を対象にfind-or-createする。入力なし。
 * ホーム画面「①今日の記録をする」→ /workouts/today から呼ばれる。
 */
export async function getOrCreateTodaysWorkoutSession(): Promise<
  ActionResult<{ id: string; reused: boolean }>
> {
  const user = await getCurrentUserOrThrow();
  const result = await resolveOrCreateSessionForDay(user.id, new Date(), undefined);
  return { ok: true, data: result };
}
```

以降の`addWorkoutLog`・`updateWorkoutLog`・`deleteWorkoutLog`・`deleteWorkoutSession`・`listWorkoutSessions`・`getWorkoutSession`・`getDashboardStats`（既存28行目以降）は一切変更しない。

#### 関数シグネチャと処理ロジック（pseudo-code）
```
function resolveOrCreateSessionForDay(userId, performedAt, memo): { id, reused }
  1. getJstDayRangeUtc(performedAt) で { dayStartUtc, dayEndUtc } を得る。
  2. prisma.workoutSession.findFirst({
       where: { userId, performedAt: { gte: dayStartUtc, lt: dayEndUtc } },
       orderBy: { createdAt: "asc" },
     }) を実行する。
  3. 見つかった場合 → { id: existing.id, reused: true } を返す（新規作成しない。memoは無視する）。
  4. 見つからない場合 → prisma.workoutSession.create({ data: { userId, performedAt, memo } }) し、
     { id: created.id, reused: false } を返す。

function createWorkoutSession(input): ActionResult<{ id, reused }>
  1. getCurrentUserOrThrow() で認証済みuserを取得（未ログインならUnauthorizedErrorがthrowされ、
     Server Action呼び出し元にエラーとして伝播する。既存の全Server Actionと同じ挙動）。
  2. workoutSessionInputSchema.safeParse(input) でバリデーション。
     失敗時: { ok: false, error: "入力内容を確認してください", fieldErrors } を返す（既存と同じ）。
  3. resolveOrCreateSessionForDay(user.id, parsed.data.performedAt, parsed.data.memo) を呼ぶ。
  4. { ok: true, data: { id, reused } } を返す。

function getOrCreateTodaysWorkoutSession(): ActionResult<{ id, reused }>
  1. getCurrentUserOrThrow() で認証済みuserを取得。
  2. resolveOrCreateSessionForDay(user.id, new Date(), undefined) を呼ぶ（memoは常にundefined）。
  3. { ok: true, data: { id, reused } } を返す。
```

#### エラー処理
- `getCurrentUserOrThrow()`が`UnauthorizedError`をthrowした場合: catchしない。既存の全Server Actionと同じくそのまま伝播させる（Server Actionの呼び出し元でPromise rejectionとして扱われる）。
- `workoutSessionInputSchema.safeParse`が失敗した場合（`createWorkoutSession`のみ。`getOrCreateTodaysWorkoutSession`は入力を受け取らないため対象外）: `{ ok: false, error, fieldErrors }`を返す（既存と同じ形式）。
- `resolveOrCreateSessionForDay`内のPrisma呼び出し（`findFirst`/`create`）が例外を投げた場合（DB接続断等）: catchしない。呼び出し元のServer Action経由でそのまま伝播させる（既存の他Server Actionと同じ方針。本ファイル内に新たなtry/catchパターンを導入しない）。
- 同時実行による競合（同一ユーザーが同時に2回find-or-createを実行し、`findFirst`が両方とも「無し」と判定して2件作成される可能性）: 本設計では対処しない（要件定義 NFR-5 で許容リスクとして明記済み）。既存の`/workouts/new/page.tsx`の`submitting`状態によるボタン無効化が実質的な抑止として機能する。

---

### 3.3 `src/app/workouts/today/page.tsx`（新規）

#### 新規ファイルの内容
```tsx
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
```

#### 関数シグネチャと処理ロジック（pseudo-code）
```
async function TodayWorkoutSessionRedirectPage(): JSX.Element（実際にはredirect()がthrowするため到達しない）
  1. getOrCreateTodaysWorkoutSession() を呼ぶ。
  2. result.ok === false の場合 → redirect("/workouts")。
  3. result.ok === true の場合 → redirect(`/workouts/${result.data.id}`)。
```
- Next.jsの`redirect()`は内部的に例外をthrowしてナビゲーションを行う仕様のため、`redirect()`呼び出し以降のコードは実行されない。関数の戻り値としてJSXを返すコードパスは存在しない。
- `params`/`searchParams`は受け取らない（不要）。
- このページ自体はいかなるUIも描画しない（常にリダイレクトする）。

#### エラー処理
- `getOrCreateTodaysWorkoutSession()`が例外を投げた場合（`UnauthorizedError`、DB例外等）: catchしない。Next.jsの標準エラー処理（`error.tsx`があればそれ、無ければデフォルトエラー画面）に伝播させる。`middleware.ts`により`/workouts/today`は未ログインでは`/login`にリダイレクトされるため、通常フローで`UnauthorizedError`が発生することはない（`src/app/page.tsx`の既存の防御的パターンと同じ位置づけ）。

---

### 3.4 `src/app/page.tsx`（変更）

#### 編集前の関連箇所（現状、15-22行目）
```tsx
        <Link
          href="/workouts/new"
          className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-6 text-center hover:bg-gray-50"
        >
          <span className="text-3xl">💪</span>
          <span className="text-lg font-semibold text-gray-900">① 今日の記録をする</span>
          <span className="text-sm text-gray-500">ジムでのトレーニングを記録します</span>
        </Link>
```

#### 編集後の期待形
```tsx
        <Link
          href="/workouts/today"
          className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-6 text-center hover:bg-gray-50"
        >
          <span className="text-3xl">💪</span>
          <span className="text-lg font-semibold text-gray-900">① 今日の記録をする</span>
          <span className="text-sm text-gray-500">ジムでのトレーニングを記録します</span>
        </Link>
```

#### 変更手順
1. `href="/workouts/new"` を `href="/workouts/today"` に変更する。それ以外（テキスト・アイコン・クラス名・「②今までの実績を確認する」カード）は一切変更しない。
2. 関数シグネチャ・処理ロジック（`greeting`組み立て等、2026-09-15-0953プロジェクトで導入済みの挙動）は変更しない。

#### エラー処理
- 本ファイルへの追加のエラー処理は不要（変更は`href`の文字列変更のみ）。

---

### 3.5 `src/app/workouts/new/page.tsx`（変更）

#### 編集前の関連箇所（現状、38-41行目）
```tsx
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-xl font-bold">新規セッション</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
```

#### 編集後の期待形
```tsx
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-xl font-bold">新規セッション</h1>
      <p className="mb-4 text-sm text-gray-500">
        指定した日にすでに記録がある場合は、新しいセッションを作らず、その日の記録に追加します
        （その場合、ここで入力したメモは反映されません）。
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
```

#### 変更手順
1. `<h1>`の直後、`<form>`の直前に、上記の`<p>`（注記文）を1つ追加する。
2. `handleSubmit`関数のロジック（`createWorkoutSession`呼び出し・`router.push`）は変更しない。`result.data`に新たに`reused`フィールドが加わるが、本ページはこれを利用しない（`result.data.id`のみ参照する既存コードのまま。TypeScript上、`ActionResult<{ id: string; reused: boolean }>`は`{ id: string }`を期待する既存コードに対しても後方互換であり型エラーは発生しない）。
3. `toDatetimeLocalValue`関数、フォームの各入力欄（`performedAt`、`memo`）、送信ボタンの文言は変更しない。

#### エラー処理
- 変更なし（既存の`error`ステート表示・`fieldErrors`処理はそのまま）。

---

### 3.6 `src/components/DeleteSessionButton.tsx`（新規）

#### 新規ファイルの内容
```tsx
// src/components/DeleteSessionButton.tsx
// セッション統合（同じ日の記録が1つのWorkoutSessionに集約される）により、
// セッション削除がその日の記録すべてを削除する操作になるため、削除前に確認する。
"use client";

interface DeleteSessionButtonProps {
  confirmMessage: string;
}

export default function DeleteSessionButton({ confirmMessage }: DeleteSessionButtonProps) {
  return (
    <button
      type="submit"
      className="text-sm text-red-600 hover:underline"
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      セッションを削除
    </button>
  );
}
```

#### 関数シグネチャと処理ロジック（pseudo-code）
```
function DeleteSessionButton({ confirmMessage }): JSX.Element
  1. type="submit" のボタンを描画する（親の<form action={handleDeleteSession}>の内側に配置される前提）。
  2. onClickで window.confirm(confirmMessage) を呼ぶ。
     - falseが返った場合（キャンセル） → event.preventDefault() し、フォーム送信を中止する。
     - trueが返った場合（OK） → 何もしない（デフォルトのフォーム送信が続行され、
       親フォームのaction（Server Action）が実行される）。
```
- `"use client"`が必要な理由: `window.confirm`はブラウザAPIであり、Server Componentからは呼び出せない。親の`/workouts/[id]/page.tsx`はServer Componentのままとし、このボタンのみをClient Componentとして切り出す。

#### エラー処理
- `window.confirm`が例外を投げることは通常ない（ブラウザ標準API）。特別なエラー処理は設けない。

---

### 3.7 `src/app/workouts/[id]/page.tsx`（変更）

#### 編集前の関連箇所（現状、1-8行目・30-39行目）
```tsx
// src/app/workouts/[id]/page.tsx
import { notFound, redirect } from "next/navigation";
import { getWorkoutSession, deleteWorkoutSession } from "@/app/actions/workouts";
import { listExercises } from "@/app/actions/exercises";
import { prisma } from "@/lib/prisma";
import { getCurrentUserOrThrow } from "@/lib/session-guard";
import CalorieDisclaimer from "@/components/CalorieDisclaimer";
import WorkoutSessionLogs from "@/components/WorkoutSessionLogs";
```
```tsx
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{new Date(session.performedAt).toLocaleString("ja-JP")}</h1>
        <form action={handleDeleteSession}>
          <button type="submit" className="text-sm text-red-600 hover:underline">
            セッションを削除
          </button>
        </form>
      </div>
```

#### 編集後の期待形
```tsx
// src/app/workouts/[id]/page.tsx
import { notFound, redirect } from "next/navigation";
import { getWorkoutSession, deleteWorkoutSession } from "@/app/actions/workouts";
import { listExercises } from "@/app/actions/exercises";
import { prisma } from "@/lib/prisma";
import { getCurrentUserOrThrow } from "@/lib/session-guard";
import CalorieDisclaimer from "@/components/CalorieDisclaimer";
import WorkoutSessionLogs from "@/components/WorkoutSessionLogs";
import DeleteSessionButton from "@/components/DeleteSessionButton";
```
```tsx
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{new Date(session.performedAt).toLocaleString("ja-JP")}</h1>
        <form action={handleDeleteSession}>
          <DeleteSessionButton
            confirmMessage={`この日の記録を${session.logCount}件すべて削除します。よろしいですか？`}
          />
        </form>
      </div>
```

#### 変更手順
1. import文に`DeleteSessionButton`（`@/components/DeleteSessionButton`）を追加する。
2. `<form action={handleDeleteSession}>`内の`<button type="submit" ...>セッションを削除</button>`を、`<DeleteSessionButton confirmMessage={...} />`に置き換える。`confirmMessage`は`session.logCount`（`WorkoutSessionDetailDTO`の既存フィールド、`getWorkoutSession`が返す）を埋め込んだ文字列とする。
3. `handleDeleteSession`（`"use server"`のインラインServer Action、既存24-28行目）、`deleteWorkoutSession`呼び出し、`redirect("/workouts")`のロジックは変更しない。
4. `WorkoutSessionLogs`呼び出し、`CalorieDisclaimer`、その他のJSXは変更しない。

#### 関数シグネチャと処理ロジック
- `WorkoutSessionPage`の型シグネチャ（`{ params }: WorkoutSessionPageProps`）は変更しない。
- 処理フロー全体は変更なし。追加されるのは「削除ボタンクリック時にブラウザ確認ダイアログを挟む」という1ステップのみ。

#### エラー処理
- 変更なし。`deleteWorkoutSession`が`{ ok: false, error }`を返すケース（対象セッションが見つからない＝他ユーザーのものである等）は、現状`handleDeleteSession`が戻り値を見ずに常に`redirect("/workouts")`する既存仕様のままとする（本プロジェクトのスコープ外。挙動を変更しない）。

---

### 3.8 `tests/unit/date.test.ts`（新規）

#### 新規ファイルの内容
```ts
// tests/unit/date.test.ts
import { describe, it, expect } from "vitest";
import { getJstDayRangeUtc, JST_OFFSET_MS } from "@/lib/date";

describe("getJstDayRangeUtc", () => {
  it("JST_OFFSET_MSは9時間である", () => {
    expect(JST_OFFSET_MS).toBe(9 * 60 * 60 * 1000);
  });

  it("JST日中の時刻から、その日のJST 0:00〜翌日0:00（UTC換算）の範囲を返す", () => {
    // 2026-09-15T04:30:00Z(UTC) = 2026-09-15T13:30:00(JST) → 2026-09-15のJST暦日
    const input = new Date("2026-09-15T04:30:00.000Z");
    const { dayStartUtc, dayEndUtc } = getJstDayRangeUtc(input);
    expect(dayStartUtc.toISOString()).toBe("2026-09-14T15:00:00.000Z"); // JST 2026-09-15 00:00
    expect(dayEndUtc.toISOString()).toBe("2026-09-15T15:00:00.000Z"); // JST 2026-09-16 00:00
  });

  it("境界値: JST 0:00ちょうど（UTC前日15:00:00.000）は当日として扱われる", () => {
    const input = new Date("2026-09-15T15:00:00.000Z"); // = JST 2026-09-16T00:00:00.000
    const { dayStartUtc } = getJstDayRangeUtc(input);
    expect(dayStartUtc.toISOString()).toBe("2026-09-15T15:00:00.000Z");
  });

  it("境界値: JST 23:59:59.999（UTC同日14:59:59.999）は前日として扱われる", () => {
    const input = new Date("2026-09-15T14:59:59.999Z"); // = JST 2026-09-15T23:59:59.999
    const { dayStartUtc, dayEndUtc } = getJstDayRangeUtc(input);
    expect(dayStartUtc.toISOString()).toBe("2026-09-14T15:00:00.000Z"); // JST 2026-09-15 00:00
    expect(dayEndUtc.toISOString()).toBe("2026-09-15T15:00:00.000Z"); // JST 2026-09-16 00:00（含まない）
  });

  it("月境界（JST月末23:59:59→翌月1日0:00）でも正しく暦日が切り替わる", () => {
    const lastOfMonth = new Date("2026-09-30T14:59:59.999Z"); // JST 2026-09-30T23:59:59.999
    const firstOfNextMonth = new Date("2026-09-30T15:00:00.000Z"); // JST 2026-10-01T00:00:00.000
    const a = getJstDayRangeUtc(lastOfMonth);
    const b = getJstDayRangeUtc(firstOfNextMonth);
    expect(a.dayStartUtc.toISOString()).not.toBe(b.dayStartUtc.toISOString());
    expect(b.dayStartUtc.toISOString()).toBe("2026-09-30T15:00:00.000Z");
  });

  it("年境界（JST 12/31 23:59:59→翌年1/1 0:00）でも正しく暦日が切り替わる", () => {
    const lastOfYear = new Date("2026-12-31T14:59:59.999Z"); // JST 2026-12-31T23:59:59.999
    const firstOfNextYear = new Date("2026-12-31T15:00:00.000Z"); // JST 2027-01-01T00:00:00.000
    const a = getJstDayRangeUtc(lastOfYear);
    const b = getJstDayRangeUtc(firstOfNextYear);
    expect(a.dayStartUtc.toISOString()).not.toBe(b.dayStartUtc.toISOString());
  });

  it("dayEndUtcはdayStartUtcのちょうど24時間後である", () => {
    const { dayStartUtc, dayEndUtc } = getJstDayRangeUtc(new Date("2026-09-15T04:30:00.000Z"));
    expect(dayEndUtc.getTime() - dayStartUtc.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});
```

#### 変更手順
1. `tests/unit/`配下に本ファイルを新規作成する（既存の`calorie.test.ts`等と同じ配置・同じ`describe`/`it`スタイル）。
2. `npm run test`（Vitest）で実行されることを確認する（既存の`vitest.config.*`の`include`パターンに`tests/unit/*.test.ts`が含まれていることを前提とする。含まれていない場合は設定変更が必要になるため、実装時に既存設定を確認すること）。

---

### 3.9 `tests/e2e/workout-flow.spec.ts`（変更・回帰確認と新規テスト追加）

#### 回帰確認事項（変更不要と推測されるが、実装後に必ず実行して確認する）
- `createSession()`ヘルパー（既存17-24行目）は「`/workouts/new`から送信し、`/workouts/[id]`形式のURLに遷移するまで待つ」という実装であり、find-or-create化後も**URLの形（`/workouts/<id>`）自体は変わらない**ため、ヘルパー自体の修正は不要と判断する。
- 「プロフィールのデフォルト体重を変更すると、以降の記録に反映される」テスト（既存104-133行目）は同一ユーザーに対し`createSession()`を2回呼ぶ唯一のケースである。find-or-create化後は2回目の呼び出しが1回目と**同じセッション**に合流するため、2回目の記録追加後はセッション内に2件のログ（23.6kcalと27kcal）が存在する状態になる。ただし本テストのアサーションは各ログ項目の個別表示（`"23.6 kcal"`、`"27 kcal"`）の可視性のみを検証しており、セッションの合計値や件数を検証していないため、**このテスト自体はfind-or-create化後もそのまま成功する**と設計時点で判定する。実装後、`npm run test:e2e`で実際に成功することを必ず確認する。
- 上記以外の全テストは、1ユーザーにつき`createSession()`を1回のみ呼ぶか、ユーザーごとに新規登録し直しているため、find-or-create化の影響を受けない。

#### 追加する新規テストケース
`test.describe("トレーニング記録（最重要）", ...)`ブロック内に、以下のテストケースを追加する。

```ts
  test("同じ日に複数回セッションを開始しても、同一セッションに記録が合流する", async ({ page }) => {
    const email = uniqueEmail("samedaycontinuity");
    await registerAndLogin(page, "同日継続確認ユーザー", email);

    await page.goto("/profile");
    await page.getByLabel("デフォルト体重 (kg)").fill("70");
    await page.getByRole("button", { name: "更新する" }).click();
    await expect(page.getByText("プロフィールを更新しました")).toBeVisible();

    // 1回目: /workouts/today 経由でセッションを開始し、1件記録する
    await page.goto("/workouts/today");
    await page.waitForURL((url) => /\/workouts\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new") && !url.pathname.endsWith("/today"));
    const firstSessionUrl = page.url();
    await selectExerciseByName(page, "チェストプレス");
    await page.getByLabel("セット数").fill("3");
    await page.getByLabel("レップ数").fill("10");
    await page.getByRole("button", { name: "記録を追加" }).click();
    await expect(page.getByText("23.6 kcal").first()).toBeVisible();

    // 2回目: 別画面（プロフィール）に一度移動してから、再び /workouts/today 経由で記録を始める
    await page.goto("/profile");
    await page.goto("/workouts/today");
    await page.waitForURL((url) => /\/workouts\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new") && !url.pathname.endsWith("/today"));

    // 同一セッションに合流しているため、1回目に追加した記録がそのまま見えている
    await expect(page).toHaveURL(firstSessionUrl);
    await expect(page.getByText("23.6 kcal").first()).toBeVisible();

    // 2件目を追加すると、同一セッション内に2件の記録が積み上がる（合計 47.2kcal）
    await selectExerciseByName(page, "チェストプレス");
    await page.getByLabel("セット数").fill("3");
    await page.getByLabel("レップ数").fill("10");
    await page.getByRole("button", { name: "記録を追加" }).click();
    await expect(page.getByText("47.2 kcal")).toBeVisible(); // 合計消費カロリー表示
  });

  test("セッション削除時に確認ダイアログが表示され、キャンセルすると削除されない", async ({ page }) => {
    const email = uniqueEmail("deleteconfirm");
    await registerAndLogin(page, "削除確認ダイアログユーザー", email);

    await page.goto("/profile");
    await page.getByLabel("デフォルト体重 (kg)").fill("70");
    await page.getByRole("button", { name: "更新する" }).click();
    await expect(page.getByText("プロフィールを更新しました")).toBeVisible();

    await createSession(page);
    await selectExerciseByName(page, "チェストプレス");
    await page.getByLabel("セット数").fill("3");
    await page.getByLabel("レップ数").fill("10");
    await page.getByRole("button", { name: "記録を追加" }).click();
    await expect(page.getByText("23.6 kcal").first()).toBeVisible();

    const sessionUrl = page.url();
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "セッションを削除" }).click();
    // キャンセルしたのでページ遷移せず、記録も残ったまま
    await expect(page).toHaveURL(sessionUrl);
    await expect(page.getByText("23.6 kcal").first()).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "セッションを削除" }).click();
    await expect(page).toHaveURL("/workouts");
  });
```

#### 変更手順
1. 既存の`createSession()`・`selectExerciseByName()`等のヘルパーは変更しない（新規テストからそのまま呼び出す）。
2. 上記2つの新規`test(...)`ブロックを`test.describe("トレーニング記録（最重要）", ...)`内、既存の最後のテスト（「マルチユーザー分離」テスト）の直後に追加する。
3. 既存の全テストケースの記述・アサーションは変更しない（3.9冒頭「回帰確認事項」の通り、変更なしで成功する想定。実装後にQAフェーズで実測確認する）。

## 4. データ構造定義

本変更でDBスキーマ・Prismaモデルの変更はない。新規・変更するTypeScript型は以下の通り。

```ts
// src/lib/date.ts（新規追加）
export const JST_OFFSET_MS: number; // = 9 * 60 * 60 * 1000

export function getJstDayRangeUtc(date: Date): {
  dayStartUtc: Date; // JST暦日の開始（UTC）。含む。
  dayEndUtc: Date;   // JST暦日の終了（UTC）。含まない（排他的境界）。
};

// src/app/actions/workouts.ts（変更・非公開）
type ResolvedSession = { id: string; reused: boolean };
async function resolveOrCreateSessionForDay(
  userId: string,
  performedAt: Date,
  memo: string | undefined
): Promise<ResolvedSession>;

// src/app/actions/workouts.ts（既存ActionResultの型パラメータのみ変更）
// 変更前: Promise<ActionResult<{ id: string }>>
// 変更後: Promise<ActionResult<{ id: string; reused: boolean }>>
export async function createWorkoutSession(input: unknown): Promise<ActionResult<{ id: string; reused: boolean }>>;

// src/app/actions/workouts.ts（新規）
export async function getOrCreateTodaysWorkoutSession(): Promise<ActionResult<{ id: string; reused: boolean }>>;

// src/components/DeleteSessionButton.tsx（新規）
interface DeleteSessionButtonProps {
  confirmMessage: string;
}
```

`ActionResult<T>`（`src/types/index.ts:91-93`）、`WorkoutSessionDetailDTO`（同63-73行目、`logCount`フィールドを`confirmMessage`組み立てに利用）は既存のまま変更しない。

## 5. エラー処理方針（まとめ）

| ケース | 発生箇所 | 対応 |
|---|---|---|
| 未ログイン状態で`createWorkoutSession`/`getOrCreateTodaysWorkoutSession`が呼ばれる（通常到達しない） | `getCurrentUserOrThrow()` | `UnauthorizedError`をthrowしたまま伝播させる（catchしない、既存方針を踏襲） |
| `createWorkoutSession`の入力バリデーション失敗（`performedAt`不正等） | `workoutSessionInputSchema.safeParse` | `{ ok: false, error: "入力内容を確認してください", fieldErrors }`を返す（既存と同一） |
| `resolveOrCreateSessionForDay`内のPrismaクエリが例外を投げる（DB接続断等） | `findFirst`/`create` | catchしない。Server Action呼び出し元にそのまま伝播させる（既存の他Server Actionと同一方針） |
| `/workouts/today`アクセス時に`getOrCreateTodaysWorkoutSession`が失敗系(`ok: false`)を返す（現状は発生しないが将来の変更に備える） | `TodayWorkoutSessionRedirectPage` | `/workouts`一覧へフォールバックリダイレクトする |
| `/workouts/today`アクセス時に例外が投げられる | `TodayWorkoutSessionRedirectPage` | catchしない。Next.js標準エラー処理に委ねる |
| 同一ユーザーが同時に複数回find-or-createを実行し、同日セッションが稀に2件作成される（競合） | `resolveOrCreateSessionForDay` | 対処しない（要件定義NFR-5で許容リスクと明記。既存の送信ボタン無効化による抑止に留める） |
| セッション削除ボタンクリック時 | `DeleteSessionButton` | `window.confirm`でユーザーに確認する。キャンセル時は`preventDefault()`でフォーム送信を中止する |

## 6. テスト観点（QAチーム用）

### 正常系
- T-01: 当日`WorkoutSession`を持たないユーザーがホーム画面「①今日の記録をする」をクリックすると、`/workouts/today`を経由して新規セッションの詳細画面（`/workouts/[新規id]`）に遷移し、記録を追加できる。
- T-02: T-01の状態から、記録追加後にプロフィール画面へ移動し、再度ホーム画面「①今日の記録をする」をクリックすると、新しいセッションが作られず、T-01と同じセッション詳細画面に遷移し、先に追加した記録がそのまま見える。
- T-03: T-02の画面で新たに記録を追加すると、同一セッション内に記録が積み上がり、合計消費カロリー・合計トレーニングボリュームが正しく再計算される。
- T-04: `/workouts`一覧の「新規セッション」ボタンから`/workouts/new`に遷移し、実施日時を「今日」のままセッションを作成すると、find-or-createが働き、既に当日セッションがあればそちらに合流する（新規行が増えない）。
- T-05: `/workouts/new`で、当日セッションが存在しない過去の日付（例: 1週間前）を指定して作成すると、その日付で新規セッションが1件作成される。
- T-06: `/workouts/new`で、既に自分の`WorkoutSession`が存在する過去の日付（T-05で作った日付）を再度指定してメモを入力し送信すると、新規作成されず既存セッションに合流し、送信したメモは反映されない（既存セッションのメモが維持される、または元々メモが空ならそのままである）。
- T-07: `/workouts`一覧・セッション詳細画面のカロリー/トレーニングボリューム/件数の合計表示が、セッション統合後も正しい値になる（既存の集計ロジック非変更の確認）。
- T-08: セッション削除ボタンをクリックし、確認ダイアログでOKを選ぶと、そのセッションと配下の全記録が削除され`/workouts`一覧に戻る。
- T-09: セッション削除ボタンをクリックし、確認ダイアログでキャンセルを選ぶと、削除が実行されず画面はそのまま（記録が残っている）。

### 異常系
- T-10: 未ログイン状態で`/workouts/today`に直接アクセスすると、`middleware.ts`により`/login`にリダイレクトされ、`TodayWorkoutSessionRedirectPage`のレンダリングエラーがユーザーに露出しない。
- T-11: （結合テストレベル、可能であれば）DBエラーをモックし、`resolveOrCreateSessionForDay`が例外を投げた場合に、Next.jsの標準エラー画面が表示され、アプリがクラッシュしたまま放置されないことを確認する。
- T-12: 他ユーザーの当日セッションが、自分の「①今日の記録をする」操作で誤って再利用されない（`resolveOrCreateSessionForDay`の`where`に`userId`が正しく含まれていることをコードレビュー・結合テストで確認する。マルチユーザー分離の既存E2Eテストと同じ観点）。

### 境界値（日付境界をまたぐケースを必ず含む）
- T-13: `getJstDayRangeUtc`の単体テストにおいて、JST 0:00ちょうど（UTC前日15:00:00.000）が「当日」の開始として扱われることを確認する（`tests/unit/date.test.ts`のテストケースで担保）。
- T-14: `getJstDayRangeUtc`の単体テストにおいて、JST 23:59:59.999（UTC同日14:59:59.999）が「前日」に属し、翌日には含まれないことを確認する。
- T-15: 月末・月初（JST 9/30 23:59:59.999 → JST 10/1 0:00:00.000）をまたぐ場合に、正しく別の暦日として判定されることを確認する。
- T-16: 年末・年始（JST 12/31 23:59:59.999 → JST 翌1/1 0:00:00.000）をまたぐ場合に、正しく別の暦日として判定されることを確認する。
- T-17: （手動確認、可能なら結合テスト化）システム時刻をJST 23:55頃に記録を開始し、日付が変わったJST 0:05頃に再度「今日の記録をする」を実行すると、23:55のセッションとは別の新しいセッションが作成される（＝日付境界をまたいだ場合は意図的に別セッションになることの確認。テスト実行環境のシステム時刻操作が必要なため、自動化が難しければ設計上の期待動作としてQA記録に明記するに留めてよい）。
- T-18: `WorkoutSession.performedAt`が同じJST暦日で、時刻だけが異なる複数のログ追加操作（例: 朝と夜）を行った場合、全て同一セッションに集約される（1日1セッションモデルの確認、要件UR-5相当）。

### 回帰確認
- T-19: `npm run build`が型エラーなく成功する（`createWorkoutSession`の戻り値型変更、`workouts/today/page.tsx`新規追加に伴う型整合性を含む）。
- T-20: `npm run test`（Vitest）が全件成功する（`tests/unit/date.test.ts`の新規テストを含む）。
- T-21: `npm run test:e2e`（Playwright）が全件成功する（`tests/e2e/workout-flow.spec.ts`の既存全ケース＋新規追加した2ケースを含む）。
- T-22: `tests/e2e/auth.spec.ts`など、本プロジェクトと無関係な既存E2Eテストに新規の失敗が発生していない。

## 7. 完了条件チェックリスト

- [ ] `src/lib/date.ts`に`JST_OFFSET_MS`・`getJstDayRangeUtc`が追加され、既存の`getPeriodRange`は変更されていない
- [ ] `src/app/actions/workouts.ts`に非公開ヘルパー`resolveOrCreateSessionForDay`が追加されている
- [ ] `createWorkoutSession`がfind-or-create方式になり、戻り値型に`reused: boolean`が追加されている
- [ ] 新規Server Action`getOrCreateTodaysWorkoutSession`が追加されている
- [ ] `src/app/workouts/today/page.tsx`が新規作成され、find-or-create後に`/workouts/[id]`へredirectする
- [ ] `src/app/page.tsx`の「①今日の記録をする」リンク先が`/workouts/today`に変更されている
- [ ] `src/app/workouts/new/page.tsx`に合流時のメモ非反映を説明する注記文が追加されている
- [ ] `src/components/DeleteSessionButton.tsx`が新規作成され、`window.confirm`による削除確認が実装されている
- [ ] `src/app/workouts/[id]/page.tsx`の削除ボタンが`DeleteSessionButton`に置き換わっている
- [ ] `tests/unit/date.test.ts`が新規作成され、JST暦日境界（日・月・年境界）の単体テストが含まれている
- [ ] `tests/e2e/workout-flow.spec.ts`に、同日合流を検証する新規テストと、削除確認ダイアログを検証する新規テストが追加されている
- [ ] `prisma/schema.prisma`に変更が加えられていない（マイグレーションが発生していない）
- [ ] `npm run build`が成功する
- [ ] `npm run test`（Vitest）が成功する
- [ ] `npm run test:e2e`（Playwright）が成功する
- [ ] 本書「6. テスト観点」の全項目（T-01〜T-22）を実施し、結果を記録した
