---
project_id: "2026-09-14-1351-training-volume"
phase: design
document: basic-design
created: "2026-09-14"
---

# 基本設計書: トレーニングボリューム算出機能

## 1. 全体アーキテクチャ

既存のカロリー計算と同一の3層パターンをそのまま踏襲し、並列の指標として追加する。

```
┌─────────────────────────────────────────────────────────────┐
│ 層1: 純粋関数（新規）                                          │
│ src/lib/volume.ts                                             │
│   calculateVolumeKg(input) -> number                          │
│   ※ src/lib/calorie.ts は一切変更しない（完全に独立・並列）    │
├─────────────────────────────────────────────────────────────┤
│ 層2: Server Action（変更）                                     │
│ src/app/actions/workouts.ts                                   │
│   addWorkoutLog / updateWorkoutLog / getWorkoutSession 内で    │
│   calculateVolumeKg() を呼び出し、WorkoutLogDTO.volumeKg に    │
│   計算結果を詰めて返す（DBには保存しない＝都度計算）            │
├─────────────────────────────────────────────────────────────┤
│ 層3: コンポーネント（変更）                                     │
│ src/components/WorkoutLogItem.tsx                              │
│   log.volumeKg をそのまま表示（記録ごと）                       │
│ src/components/WorkoutSessionLogs.tsx                          │
│   logs.reduce(...) でクライアント側合計を再計算し表示            │
│   ※ 既存の totalCalories と全く同じ集計パターン                │
└─────────────────────────────────────────────────────────────┘
```

カロリーとの並列関係:

| 項目 | カロリー（既存） | ボリューム（新規） |
|---|---|---|
| 純粋関数 | `calculateCalories()` (`src/lib/calorie.ts`) | `calculateVolumeKg()` (`src/lib/volume.ts`) |
| 保存方式 | DBに`caloriesBurned`列として保存 | **保存しない。都度計算のみ**（下記2.3参照） |
| DTOフィールド | `WorkoutLogDTO.caloriesBurned` | `WorkoutLogDTO.volumeKg`（新規追加） |
| 記録ごと表示 | `WorkoutLogItem.tsx` | `WorkoutLogItem.tsx`（同一ファイルに追記） |
| セッション合計表示 | `WorkoutSessionLogs.tsx`（reduce） | `WorkoutSessionLogs.tsx`（reduce、同一ファイルに追記） |
| 丸め規則 | 小数第1位（`Math.round(x*10)/10`） | 同一規則を踏襲 |

## 2. データフロー

### 2.1 記録追加・編集時（`addWorkoutLog` / `updateWorkoutLog`）
```
[Zod検証済み入力 data: {setCount, repsPerSet, weightValue?, weightUnit?}]
        │
        ▼
calculateVolumeKg({ setCount, repsPerSet,
                     weightValue: data.weightValue ?? null,
                     weightUnit: data.weightUnit ?? null })
        │
        ▼
volumeKg (number, DBには保存せず、レスポンスDTOにのみ含める)
        │
        ▼
WorkoutLogDTO { ..., volumeKg } としてクライアントに返却
```
既存の`caloriesBurned`のようにPrismaの`create`/`update`の`data`には**含めない**（＝DBスキーマ変更なし）。`volumeKg`は関数の戻り値をそのままレスポンスDTOに詰めるだけ。

### 2.2 セッション詳細取得時（`getWorkoutSession`）
```
prisma.workoutLog.findMany(...) で取得した各 l (setCount, repsPerSet, weightValue, weightUnit)
        │
        ▼ (map内で1件ずつ)
calculateVolumeKg({ setCount: l.setCount, repsPerSet: l.repsPerSet,
                     weightValue: l.weightValue, weightUnit: l.weightUnit })
        │
        ▼
WorkoutLogDTO { ..., volumeKg } を配列生成
```

### 2.3 セッション合計の集計（クライアント側）
`WorkoutSessionLogs.tsx`は現在`totalCalories`をpropsからではなく、自身が保持する`logs`状態から`reduce`で都度計算して表示している（サーバーの`WorkoutSessionDetailDTO.totalCalories`は本画面では未使用）。ボリュームもこれに完全に倣い、`WorkoutSessionDetailDTO`への合計フィールド追加は行わず、コンポーネント内で`logs.reduce((sum, l) => sum + l.volumeKg, 0)`により算出する。これにより追加・編集・削除の都度サーバーへ合計を問い合わせる必要がなく、既存の実装パターンとの一貫性も保たれる。

## 3. 設計方針として確定した3点

### 3.1 LB単位の記録をボリューム集計にどう含めるか → **(a) 換算して合算する**
- **採用**: LB入力分は `1 lb = 0.45359237 kg`（国際ポンド定義値）で常にKGへ換算してから、KG入力分と合算する。
- **理由**:
  1. 依頼文の確認済み制約「集計はKG前提でよい」は、"KGとLBの2系統を別々に見せる"のではなく"KGという単一基準に統一して集計する"ことを意味すると解釈するのが自然（(b)案＝LB除外だと「集計基準をKGにする」ではなく「LB記録の合計無視」になり、依頼の趣旨とズレる）。
  2. (b)案（LB除外）は、LBで記録しているユーザーの合計値が実施内容と乖離し実用性を欠く。トレーニングボリュームという指標自体の目的（総負荷量の可視化）に反する。
  3. 研究レポートの申し送りでも、換算定数の定義とテストでの境界値検証を前提とした実装が推奨されている。
- **表示方針**: 換算後のKG値のみを合計表示に使う（合計は常にKGの単一値）。ただし**記録ごとの表示**では、元がLB記録である場合に「（lb→kg換算）」という注記を付け、ユーザーが「元はLBで記録した」ことを認識できるようにする（透明性の確保）。換算前のLB生値と換算後の値を両方数値表示する必要はない（既存の「重さ○○lb」という表示自体は変更しないため、生値は別途確認できる）。
- **換算定数**: `src/lib/volume.ts`に`export const LB_TO_KG_FACTOR = 0.45359237;`として定義する（`calorie.ts`の`CALORIE_CORRECTION_FACTOR`と同じ「変更時はここのみ変更する」コメント方針）。

### 3.2 `weightValue`が`null`（未入力）の記録の扱い → **ボリューム値は0として計算に算入する（＝実質的に合計へ影響しない）が、UI表示は「0kg」ではなく明示的に「未入力」と分かる表現にする**
- 計算関数`calculateVolumeKg()`は`weightValue === null`の場合`0`を返す（合計計算には影響を与えない、という要件を関数レベルで満たす）。
- ただし`WorkoutLogItem.tsx`の記録ごと表示では、`log.weightValue === null`を別途判定し、「ボリューム: - （重さ未入力）」のように**0と未入力を区別できる表示**にする。これは既存の`bodyWeightKgOverride`表示（値がある時だけ追記するパターン）を踏襲した設計であり、UR-3（0kgと誤解されない）を満たす。
- 合計値（セッション合計）は「未入力の記録を0として含めた合計」と「未入力の記録を除外した合計」は数学的に同値のため、実装上はいずれの方式でも結果は変わらない。本設計では前者（0として`reduce`に含める）を採用し、特別なフィルタ処理を追加しない（既存の`totalCalories`集計パターンと同じ「全件reduce」のシンプルさを維持するため）。

### 3.3 DBスキーマ変更を避け、都度計算方式を採用する → **候補A（都度計算・マイグレーション不要）を全面採用**
- ボリュームはDBに保存する列を一切追加しない。`WorkoutLog`テーブルのスキーマ（`prisma/schema.prisma`）は無変更。
- 理由:
  1. 前プロジェクト（2026-09-14-1040）でTurso本番/開発DB共有によるマイグレーション実行困難が確認されており、新たなマイグレーションの追加はそのリスクを不必要に再発させる。
  2. ボリュームは`setCount`/`repsPerSet`/`weightValue`/`weightUnit`という既存フィールドのみから一意に導出可能な値であり、カロリーのように「計算時点のMET値・体重をスナップショットとして固定する」必然性がない（記録編集時に古い計算式のスナップショットを保持し続ける理由がない）。
  3. 依頼の明示的制約「既存のMET値ベースのカロリー計算ロジックには一切影響を与えない、完全に独立した新指標として追加する」を満たす上でも、DBスキーマを変更しない方が既存の`caloriesBurned`列やマイグレーション履歴に一切触れずに済み、影響範囲を最小化できる。
- 結果として、本プロジェクトでは`prisma/schema.prisma`・`prisma/migrations/`配下は**一切変更しない**。

## 4. 外部インターフェース（I/F）変更点
- `WorkoutLogDTO`（`src/types/index.ts`）に`volumeKg: number`を追加する（既存フィールドの型・意味は変更しない、追加のみ）。
- `WorkoutSessionSummaryDTO` / `WorkoutSessionDetailDTO` / `DashboardStatsDTO`には変更を加えない（スコープ外、2.3節の通りクライアント側reduceで完結するため）。
- Server Action（`addWorkoutLog`, `updateWorkoutLog`, `getWorkoutSession`）の引数シグネチャは変更しない。戻り値の`WorkoutLogDTO`に`volumeKg`フィールドが追加されるのみ。

## 5. 影響を与えないことの明示
- `src/lib/calorie.ts`: 変更なし。`calculateCalories`/`estimateDurationMinutes`/`CALORIE_CORRECTION_FACTOR`のシグネチャ・実装・呼び出し箇所は本プロジェクトの前後で完全に同一。
- `prisma/schema.prisma`, `prisma/migrations/`: 変更なし。
- `src/app/workouts/page.tsx`（セッション一覧）, `getDashboardStats`, `DashboardStatsDTO`: 変更なし（スコープ外）。
