---
project_id: "2026-09-14-1351-training-volume"
phase: design
document: detailed-design
created: "2026-09-14"
---

# 詳細設計書: トレーニングボリューム算出機能

## 0. 概要
既存の`WorkoutLog`（`setCount`, `repsPerSet`, `weightValue`, `weightUnit`）から、トレーニングボリューム（= 重さ(kg換算) × セット数 × レップ数）を **DBに保存せず都度計算** し、以下2箇所に表示する。

1. セッション詳細画面の記録ごとの表示（`WorkoutLogItem.tsx`）
2. セッション詳細画面の合計表示（`WorkoutSessionLogs.tsx`、既存の「合計消費カロリー」の隣）

新規モジュール`src/lib/volume.ts`に純粋関数`calculateVolumeKg()`を実装し、既存の`src/lib/calorie.ts`と完全に独立させる（`calorie.ts`は無変更）。LB単位の記録は`1lb = 0.45359237kg`で換算してKG合計に含める。`weightValue`が`null`の記録はボリューム0として扱い、UIでは「未入力」であることを明示する。DBスキーマ変更・マイグレーションは発生しない。

## 1. 影響範囲（編集／新規ファイル一覧）

| ファイル | 区分 | 概要 |
|---|---|---|
| `src/lib/volume.ts` | **新規** | ボリューム計算の純粋関数・換算定数 |
| `src/types/index.ts` | 変更 | `WorkoutLogDTO`に`volumeKg: number`を追加 |
| `src/app/actions/workouts.ts` | 変更 | `addWorkoutLog`/`updateWorkoutLog`/`getWorkoutSession`のDTO構築箇所で`calculateVolumeKg()`を呼び出し`volumeKg`を詰める |
| `src/components/WorkoutLogItem.tsx` | 変更 | 記録ごとのボリューム表示を追加 |
| `src/components/WorkoutSessionLogs.tsx` | 変更 | セッション合計ボリューム表示を追加（`totalCalories`と同じreduceパターン） |
| `tests/unit/volume.test.ts` | **新規** | `calculateVolumeKg()`の単体テスト（`calorie.test.ts`と同パターン） |
| `src/lib/calorie.ts` | **変更しない** | 依頼の明示的制約により無変更（本設計書で触れるのは「変更しない」ことの確認のみ） |
| `prisma/schema.prisma`, `prisma/migrations/` | **変更しない** | 都度計算方式のためスキーマ変更不要（基本設計書 3.3節） |
| `src/app/workouts/page.tsx`, `getDashboardStats`, `DashboardStatsDTO`, `WorkoutSessionSummaryDTO` | **変更しない** | スコープ外（要件定義書スコープ外セクション参照） |

## 2. ファイル別変更詳細

### 2.1 `src/lib/volume.ts`（新規作成）

#### 編集前
ファイルは存在しない。

#### 編集後の期待形（全文）
```ts
// src/lib/volume.ts
import type { WeightUnit } from "@/types";

/** 1lb = 0.45359237kg（国際ポンド定義値）。ボリューム集計はKG基準に統一するため、
 *  LB入力分はこの係数で換算してから合算する。将来変更する場合はここのみ変更する。 */
export const LB_TO_KG_FACTOR = 0.45359237;

export interface VolumeCalcInput {
  setCount: number;              // セット数。1以上の整数を想定（呼び出し側はZodで検証済み）
  repsPerSet: number;            // 1セットあたりレップ数。1以上の整数を想定
  weightValue: number | null;    // 未入力の場合はnull
  weightUnit: WeightUnit | null; // weightValueとペア。weightValueがnullならweightUnitもnullの前提
}

/**
 * 1記録分のトレーニングボリューム(kg)を算出する純粋関数。
 * ボリューム = 重さ(kg換算後) × setCount × repsPerSet
 *
 * 処理ロジック:
 * 1. setCount, repsPerSetが不正（NaN, Infinity, 0以下）な場合は 0 を返す（防御的処理。
 *    通常はZodのpositive/int制約により発生しないが、calculateCaloriesと同じ防御方針を踏襲する）。
 * 2. weightValueがnull、またはweightUnitがnullの場合は 0 を返す（＝重さ未入力の記録は
 *    ボリューム計算対象外。呼び出し側UIはこの0を「未入力」として区別して表示すること）。
 * 3. weightValueが不正（NaN, Infinity, 0以下）な場合も 0 を返す。
 * 4. weightUnitが"LB"の場合、weightValue × LB_TO_KG_FACTOR でkgに換算する。
 *    "KG"の場合はweightValueをそのまま使う。
 * 5. weightKg × setCount × repsPerSet を計算し、小数第1位に四捨五入して返す
 *    （calculateCaloriesと同じ丸め規則: Math.round(x * 10) / 10）。
 */
export function calculateVolumeKg(input: VolumeCalcInput): number {
  const { setCount, repsPerSet, weightValue, weightUnit } = input;

  if (!Number.isFinite(setCount) || setCount <= 0) return 0;
  if (!Number.isFinite(repsPerSet) || repsPerSet <= 0) return 0;
  if (weightValue === null || weightUnit === null) return 0;
  if (!Number.isFinite(weightValue) || weightValue <= 0) return 0;

  const weightKg = weightUnit === "LB" ? weightValue * LB_TO_KG_FACTOR : weightValue;
  const raw = weightKg * setCount * repsPerSet;
  return Math.round(raw * 10) / 10;
}
```

#### 関数シグネチャ（確定）
```ts
export const LB_TO_KG_FACTOR: number; // 0.45359237
export interface VolumeCalcInput {
  setCount: number;
  repsPerSet: number;
  weightValue: number | null;
  weightUnit: WeightUnit | null;
}
export function calculateVolumeKg(input: VolumeCalcInput): number;
```
`WeightUnit`は新規定義せず、必ず`@/types`から`import type { WeightUnit }`で再利用する（`"KG" | "LB"`の定義を二重管理しない）。

---

### 2.2 `src/types/index.ts`（変更）

#### 編集前の関連箇所（30〜42行目）
```ts
export interface WorkoutLogDTO {
  id: string;
  exerciseId: string;
  exerciseName: string;
  setCount: number;
  repsPerSet: number;
  durationMinutes: number;
  bodyWeightKgOverride: number | null;
  weightValue: number | null;
  weightUnit: WeightUnit | null;
  metValueSnapshot: number;
  caloriesBurned: number;
}
```

#### 編集後の期待形
`caloriesBurned`の直後（末尾）に`volumeKg`を追加する。
```ts
export interface WorkoutLogDTO {
  id: string;
  exerciseId: string;
  exerciseName: string;
  setCount: number;
  repsPerSet: number;
  durationMinutes: number;
  bodyWeightKgOverride: number | null;
  weightValue: number | null;
  weightUnit: WeightUnit | null;
  metValueSnapshot: number;
  caloriesBurned: number;
  /** トレーニングボリューム(kg) = 重さ(kg換算後)×setCount×repsPerSet。
   *  weightValueがnullの場合は0（未入力。UI側で0kgと区別して表示すること）。
   *  DBには保存されず、Server Action呼び出しの都度サーバー側で計算される。 */
  volumeKg: number;
}
```
`WorkoutSessionSummaryDTO` / `WorkoutSessionDetailDTO` / `DashboardStatsDTO`はこのプロジェクトでは変更しない。

---

### 2.3 `src/app/actions/workouts.ts`（変更）

`calculateVolumeKg`のimportを追加し、`WorkoutLogDTO`を構築している3箇所（`addWorkoutLog`, `updateWorkoutLog`, `getWorkoutSession`）に`volumeKg`計算を追加する。**Prismaの`create`/`update`の`data`オブジェクトには追加しない**（DBに保存しないため）。

#### 2.3.1 import文の変更
編集前（1〜12行目付近）:
```ts
import { calculateCalories } from "@/lib/calorie";
```
編集後（追加、`calculateCalories`の下に1行追加）:
```ts
import { calculateCalories } from "@/lib/calorie";
import { calculateVolumeKg } from "@/lib/volume";
```

#### 2.3.2 `addWorkoutLog`関数
編集前の関連箇所（52〜90行目）:
```ts
  const caloriesBurned = calculateCalories({
    metValue: exercise.metValue,
    weightKg,
    durationMinutes: data.durationMinutes,
  });

  const log = await prisma.workoutLog.create({
    data: {
      workoutSessionId: sessionId,
      exerciseId: data.exerciseId,
      setCount: data.setCount,
      repsPerSet: data.repsPerSet,
      durationMinutes: data.durationMinutes,
      bodyWeightKgOverride: data.bodyWeightKgOverride ?? null,
      weightValue: data.weightValue ?? null,
      weightUnit: data.weightUnit ?? null,
      metValueSnapshot: exercise.metValue,
      caloriesBurned,
    },
  });

  return {
    ok: true,
    data: {
      log: {
        id: log.id,
        exerciseId: log.exerciseId,
        exerciseName: exercise.name,
        setCount: log.setCount,
        repsPerSet: log.repsPerSet,
        durationMinutes: log.durationMinutes,
        bodyWeightKgOverride: log.bodyWeightKgOverride,
        weightValue: log.weightValue,
        weightUnit: log.weightUnit as WeightUnit | null,
        metValueSnapshot: log.metValueSnapshot,
        caloriesBurned: log.caloriesBurned,
      },
    },
  };
```

編集後の期待形（`caloriesBurned`計算の直後に`volumeKg`計算を追加し、戻り値オブジェクトの末尾に`volumeKg`を追加。Prismaの`create`の`data`は変更しない）:
```ts
  const caloriesBurned = calculateCalories({
    metValue: exercise.metValue,
    weightKg,
    durationMinutes: data.durationMinutes,
  });
  const volumeKg = calculateVolumeKg({
    setCount: data.setCount,
    repsPerSet: data.repsPerSet,
    weightValue: data.weightValue ?? null,
    weightUnit: data.weightUnit ?? null,
  });

  const log = await prisma.workoutLog.create({
    data: {
      workoutSessionId: sessionId,
      exerciseId: data.exerciseId,
      setCount: data.setCount,
      repsPerSet: data.repsPerSet,
      durationMinutes: data.durationMinutes,
      bodyWeightKgOverride: data.bodyWeightKgOverride ?? null,
      weightValue: data.weightValue ?? null,
      weightUnit: data.weightUnit ?? null,
      metValueSnapshot: exercise.metValue,
      caloriesBurned,
    },
  });

  return {
    ok: true,
    data: {
      log: {
        id: log.id,
        exerciseId: log.exerciseId,
        exerciseName: exercise.name,
        setCount: log.setCount,
        repsPerSet: log.repsPerSet,
        durationMinutes: log.durationMinutes,
        bodyWeightKgOverride: log.bodyWeightKgOverride,
        weightValue: log.weightValue,
        weightUnit: log.weightUnit as WeightUnit | null,
        metValueSnapshot: log.metValueSnapshot,
        caloriesBurned: log.caloriesBurned,
        volumeKg,
      },
    },
  };
```

#### 2.3.3 `updateWorkoutLog`関数
編集前の関連箇所（126〜164行目）は2.3.2と同型（`caloriesBurned`計算 → `prisma.workoutLog.update` → 戻り値のDTO構築）。

編集後の期待形: 同様に`caloriesBurned`計算の直後に以下を追加する。
```ts
  const volumeKg = calculateVolumeKg({
    setCount: data.setCount,
    repsPerSet: data.repsPerSet,
    weightValue: data.weightValue ?? null,
    weightUnit: data.weightUnit ?? null,
  });
```
`prisma.workoutLog.update`の`data`オブジェクトは変更しない。戻り値オブジェクトの末尾（`caloriesBurned: updated.caloriesBurned,`の次）に`volumeKg,`を追加する。

#### 2.3.4 `getWorkoutSession`関数
編集前の関連箇所（214〜226行目）:
```ts
  const logs: WorkoutLogDTO[] = s.logs.map((l) => ({
    id: l.id,
    exerciseId: l.exerciseId,
    exerciseName: l.exercise.name,
    setCount: l.setCount,
    repsPerSet: l.repsPerSet,
    durationMinutes: l.durationMinutes,
    bodyWeightKgOverride: l.bodyWeightKgOverride,
    weightValue: l.weightValue,
    weightUnit: l.weightUnit as WeightUnit | null,
    metValueSnapshot: l.metValueSnapshot,
    caloriesBurned: l.caloriesBurned,
  }));
```

編集後の期待形:
```ts
  const logs: WorkoutLogDTO[] = s.logs.map((l) => ({
    id: l.id,
    exerciseId: l.exerciseId,
    exerciseName: l.exercise.name,
    setCount: l.setCount,
    repsPerSet: l.repsPerSet,
    durationMinutes: l.durationMinutes,
    bodyWeightKgOverride: l.bodyWeightKgOverride,
    weightValue: l.weightValue,
    weightUnit: l.weightUnit as WeightUnit | null,
    metValueSnapshot: l.metValueSnapshot,
    caloriesBurned: l.caloriesBurned,
    volumeKg: calculateVolumeKg({
      setCount: l.setCount,
      repsPerSet: l.repsPerSet,
      weightValue: l.weightValue,
      weightUnit: l.weightUnit as WeightUnit | null,
    }),
  }));
```

#### 2.3.5 変更しない関数
`createWorkoutSession`, `deleteWorkoutLog`, `deleteWorkoutSession`, `listWorkoutSessions`, `getDashboardStats` はこのプロジェクトの変更対象外。`WorkoutLogDTO`を構築していないため、型エラーも発生しない。

---

### 2.4 `src/components/WorkoutLogItem.tsx`（変更）

#### 編集前（全文、10〜32行目相当）
```tsx
export default function WorkoutLogItem({ log, onEdit, onDelete }: WorkoutLogItemProps) {
  return (
    <li className="flex items-center justify-between rounded border border-gray-200 bg-white p-3">
      <div>
        <p className="font-medium">{log.exerciseName}</p>
        <p className="text-sm text-gray-500">
          {log.setCount}セット × {log.repsPerSet}レップ / {log.durationMinutes}分
          {log.bodyWeightKgOverride ? ` / 体重${log.bodyWeightKgOverride}kg` : ""}
          {log.weightValue !== null && log.weightUnit ? ` / 重さ${log.weightValue}${WEIGHT_UNIT_LABELS[log.weightUnit]}` : ""}
        </p>
        <p className="text-sm font-semibold text-gray-900">{log.caloriesBurned} kcal</p>
      </div>
      <div className="flex gap-3 text-sm">
        <button type="button" onClick={() => onEdit(log)} className="text-blue-600 hover:underline">
          編集
        </button>
        <button type="button" onClick={() => onDelete(log.id)} className="text-red-600 hover:underline">
          削除
        </button>
      </div>
    </li>
  );
}
```

#### 編集後の期待形
`caloriesBurned`表示の直後に、ボリューム表示の`<p>`を1行追加する。`log.weightValue === null`の場合は「未入力」であることが分かる文言にし、`log.weightUnit === "LB"`の場合は換算した旨を注記する（基本設計書3.1節）。
```tsx
export default function WorkoutLogItem({ log, onEdit, onDelete }: WorkoutLogItemProps) {
  return (
    <li className="flex items-center justify-between rounded border border-gray-200 bg-white p-3">
      <div>
        <p className="font-medium">{log.exerciseName}</p>
        <p className="text-sm text-gray-500">
          {log.setCount}セット × {log.repsPerSet}レップ / {log.durationMinutes}分
          {log.bodyWeightKgOverride ? ` / 体重${log.bodyWeightKgOverride}kg` : ""}
          {log.weightValue !== null && log.weightUnit ? ` / 重さ${log.weightValue}${WEIGHT_UNIT_LABELS[log.weightUnit]}` : ""}
        </p>
        <p className="text-sm font-semibold text-gray-900">{log.caloriesBurned} kcal</p>
        {log.weightValue !== null ? (
          <p className="text-sm text-gray-700">
            ボリューム: {log.volumeKg} kg
            {log.weightUnit === "LB" ? "（lb→kg換算）" : ""}
          </p>
        ) : (
          <p className="text-sm text-gray-400">ボリューム: -（重さ未入力）</p>
        )}
      </div>
      <div className="flex gap-3 text-sm">
        <button type="button" onClick={() => onEdit(log)} className="text-blue-600 hover:underline">
          編集
        </button>
        <button type="button" onClick={() => onDelete(log.id)} className="text-red-600 hover:underline">
          削除
        </button>
      </div>
    </li>
  );
}
```
importやProps型（`WorkoutLogItemProps`）は変更不要（`WorkoutLogDTO`型経由で`volumeKg`が自動的に利用可能になる）。

---

### 2.5 `src/components/WorkoutSessionLogs.tsx`（変更）

#### 編集前の関連箇所（36行目、および76〜80行目）
```ts
  const totalCalories = Math.round(logs.reduce((sum, l) => sum + l.caloriesBurned, 0) * 10) / 10;
```
```tsx
      <div>
        <p className="text-sm text-gray-500">合計消費カロリー</p>
        <p className="text-2xl font-bold text-gray-900">{totalCalories} kcal</p>
      </div>
```

#### 編集後の期待形
`totalCalories`の直後に`totalVolumeKg`を同一パターンで追加し、表示ブロックにも1つ追加する。
```ts
  const totalCalories = Math.round(logs.reduce((sum, l) => sum + l.caloriesBurned, 0) * 10) / 10;
  const totalVolumeKg = Math.round(logs.reduce((sum, l) => sum + l.volumeKg, 0) * 10) / 10;
```
```tsx
      <div className="flex flex-wrap gap-6">
        <div>
          <p className="text-sm text-gray-500">合計消費カロリー</p>
          <p className="text-2xl font-bold text-gray-900">{totalCalories} kcal</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">合計トレーニングボリューム（kg換算）</p>
          <p className="text-2xl font-bold text-gray-900">{totalVolumeKg} kg</p>
        </div>
      </div>
```
既存の`<div>`（カロリー単体）を`<div className="flex flex-wrap gap-6">`でラップして2指標を横並び表示する形に変更する。それ以外のロジック（`handleUpdate`, `handleDelete`, 編集モーダル等）は変更しない。

---

### 2.6 `tests/unit/volume.test.ts`（新規作成）

`tests/unit/calorie.test.ts`と同一パターン（正常系1件＋定数確認＋境界値）で作成する。

```ts
// tests/unit/volume.test.ts
import { describe, it, expect } from "vitest";
import { calculateVolumeKg, LB_TO_KG_FACTOR } from "@/lib/volume";

describe("calculateVolumeKg", () => {
  it("正常系(KG): 80kg×3セット×10レップ = 2400kg", () => {
    expect(
      calculateVolumeKg({ setCount: 3, repsPerSet: 10, weightValue: 80, weightUnit: "KG" })
    ).toBe(2400);
  });

  it("正常系(LB): 100lb×3セット×10レップ → kg換算後に算出される", () => {
    // 100 × 0.45359237 = 45.359237kg → ×3×10 = 1360.77711 → 小数第1位丸め = 1360.8
    expect(
      calculateVolumeKg({ setCount: 3, repsPerSet: 10, weightValue: 100, weightUnit: "LB" })
    ).toBe(1360.8);
  });

  it("換算係数はLB_TO_KG_FACTOR(0.45359237)である", () => {
    expect(LB_TO_KG_FACTOR).toBe(0.45359237);
  });

  it("weightValueがnullの場合は0を返す(重さ未入力)", () => {
    expect(
      calculateVolumeKg({ setCount: 3, repsPerSet: 10, weightValue: null, weightUnit: null })
    ).toBe(0);
  });

  it("weightUnitがnullの場合(weightValueのみnullでない不整合入力)も0を返す", () => {
    expect(
      calculateVolumeKg({ setCount: 3, repsPerSet: 10, weightValue: 80, weightUnit: null })
    ).toBe(0);
  });

  it("setCount=0の場合は0を返す", () => {
    expect(
      calculateVolumeKg({ setCount: 0, repsPerSet: 10, weightValue: 80, weightUnit: "KG" })
    ).toBe(0);
  });

  it("repsPerSet=0の場合は0を返す", () => {
    expect(
      calculateVolumeKg({ setCount: 3, repsPerSet: 0, weightValue: 80, weightUnit: "KG" })
    ).toBe(0);
  });

  it("weightValue=0の場合は0を返す", () => {
    expect(
      calculateVolumeKg({ setCount: 3, repsPerSet: 10, weightValue: 0, weightUnit: "KG" })
    ).toBe(0);
  });

  it("負数の場合は0を返す", () => {
    expect(calculateVolumeKg({ setCount: -3, repsPerSet: 10, weightValue: 80, weightUnit: "KG" })).toBe(0);
    expect(calculateVolumeKg({ setCount: 3, repsPerSet: -10, weightValue: 80, weightUnit: "KG" })).toBe(0);
    expect(calculateVolumeKg({ setCount: 3, repsPerSet: 10, weightValue: -80, weightUnit: "KG" })).toBe(0);
  });

  it("NaNの場合は0を返す", () => {
    expect(calculateVolumeKg({ setCount: NaN, repsPerSet: 10, weightValue: 80, weightUnit: "KG" })).toBe(0);
    expect(calculateVolumeKg({ setCount: 3, repsPerSet: 10, weightValue: NaN, weightUnit: "KG" })).toBe(0);
  });

  it("Infinityの場合は0を返す", () => {
    expect(calculateVolumeKg({ setCount: Infinity, repsPerSet: 10, weightValue: 80, weightUnit: "KG" })).toBe(0);
    expect(calculateVolumeKg({ setCount: 3, repsPerSet: 10, weightValue: Infinity, weightUnit: "KG" })).toBe(0);
  });

  it("非常に大きい値でも例外を起こさず有限の数値を返す", () => {
    const result = calculateVolumeKg({ setCount: 50, repsPerSet: 200, weightValue: 1000, weightUnit: "KG" });
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThan(0);
  });
});
```

## 3. データ構造定義（確定）

```ts
// src/lib/volume.ts
export const LB_TO_KG_FACTOR = 0.45359237;

export interface VolumeCalcInput {
  setCount: number;
  repsPerSet: number;
  weightValue: number | null;
  weightUnit: WeightUnit | null; // "KG" | "LB" | null（@/typesのWeightUnitを再利用）
}

export function calculateVolumeKg(input: VolumeCalcInput): number;
```

```ts
// src/types/index.ts の WorkoutLogDTO（追加フィールドのみ抜粋）
export interface WorkoutLogDTO {
  // ...既存フィールド（変更なし）
  volumeKg: number; // 新規追加。DB非保存、都度計算値
}
```

## 4. エラー処理方針

| ケース | 扱い |
|---|---|
| `weightValue === null`（重さ未入力） | `calculateVolumeKg`は`0`を返す。合計には影響を与えない。ただし`WorkoutLogItem.tsx`は`log.weightValue === null`を別途判定し、「ボリューム: - （重さ未入力）」と表示して0kgと視覚的に区別する。 |
| `weightUnit === null`だが`weightValue`は非null（本来Zod制約上発生しない不整合） | `calculateVolumeKg`は防御的に`0`を返す（例外を投げない）。 |
| `weightUnit === "LB"` | `weightValue × LB_TO_KG_FACTOR`でkgに換算してから計算する。UIには「（lb→kg換算）」と注記する。 |
| `setCount`/`repsPerSet`/`weightValue`が`0`以下、`NaN`、`Infinity` | `calculateVolumeKg`は`0`を返す（例外を投げない）。Zodバリデーションにより通常のアプリ操作では発生しないが、関数単体としての防御は`calculateCalories`と同じ方針で実装する。 |
| セッション内に記録が0件 | `logs.reduce(...)`は初期値`0`から開始するため`totalVolumeKg = 0`となり、正常に「0 kg」と表示される（例外なし）。 |
| `src/lib/calorie.ts`への影響 | 一切変更しない。`calculateCalories`の引数・戻り値・呼び出し箇所は本プロジェクトの前後で完全に同一であることをコードレビューで確認する。 |

## 5. テスト観点

### 5.1 単体テスト（`tests/unit/volume.test.ts`）
- 正常系（KG）: 重さ・セット数・レップ数から期待通りの値を算出する
- 正常系（LB）: LB入力が正しくkg換算された上で計算される（換算係数の丸め誤差込みで期待値を検証）
- 定数確認: `LB_TO_KG_FACTOR === 0.45359237`
- 境界値: `weightValue === null`（0を返す）、`weightUnit === null`かつ`weightValue`非null（0を返す）
- 境界値: `setCount = 0`, `repsPerSet = 0`, `weightValue = 0`（いずれも0を返す）
- 境界値: 負数（`setCount`, `repsPerSet`, `weightValue`いずれも0を返す）
- 境界値: `NaN`, `Infinity`（0を返す、例外を投げない）
- 境界値: 大きな値（`setCount=50`, `repsPerSet=200`, `weightValue=1000`）でも有限の数値を返す（Zodのmax制約の上限値相当）

### 5.2 既存テストへの無回帰確認
- `tests/unit/calorie.test.ts`が変更なしで全てパスすること
- `tests/e2e/workout-flow.spec.ts`（既存のE2Eテスト）が本変更によって壊れないこと（DOM構造の変更を伴うため、セレクタが`log.caloriesBurned`のテキスト等に依存していないか確認する。依存している場合はテスト側の更新可否をQAフェーズで判断する）

### 5.3 結合観点（手動確認 or E2E追加時の観点）
- KG記録1件・LB記録1件が混在するセッションで、記録ごとのボリューム表示とセッション合計が期待通りになること
- 重さ未入力の記録（自重トレーニング等）が1件でも含まれるセッションで、その記録が「未入力」表示になり、合計には影響しないこと
- 記録が0件のセッションで「合計トレーニングボリューム 0 kg」が例外なく表示されること
- 記録の編集（`updateWorkoutLog`）で`setCount`/`weightValue`等を変更した際、再取得せずとも編集レスポンスの`volumeKg`で表示が即座に更新されること

## 6. 完了条件チェックリスト
- [ ] `src/lib/volume.ts`が新規作成され、`calculateVolumeKg`・`LB_TO_KG_FACTOR`をexportしている
- [ ] `src/lib/calorie.ts`に差分がない（`git diff`で無変更を確認）
- [ ] `prisma/schema.prisma`・`prisma/migrations/`に差分がない
- [ ] `src/types/index.ts`の`WorkoutLogDTO`に`volumeKg: number`が追加されている
- [ ] `src/app/actions/workouts.ts`の`addWorkoutLog`/`updateWorkoutLog`/`getWorkoutSession`が`volumeKg`を含む`WorkoutLogDTO`を返す
- [ ] `src/components/WorkoutLogItem.tsx`で記録ごとのボリュームが表示され、重さ未入力時は「未入力」と分かる表示になっている
- [ ] `src/components/WorkoutSessionLogs.tsx`でセッション合計ボリュームが表示されている（`totalCalories`と同様のreduce集計）
- [ ] `tests/unit/volume.test.ts`が新規作成され、全テストがパスする
- [ ] `npm run build`（型チェック含む）がエラーなく通る
- [ ] 既存の`tests/unit/calorie.test.ts`および`tests/e2e/workout-flow.spec.ts`が引き続きパスする
