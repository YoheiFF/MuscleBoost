---
project_id: "2026-09-14-1351-training-volume"
phase: engineering
---
# 実装ログ - 2026-09-14-1351-training-volume

## 編集ファイル一覧
| ファイル | 操作 | 完了 | 備考 |
|---------|------|------|------|
| src/lib/volume.ts | 新規 | ✅ | `calculateVolumeKg`・`LB_TO_KG_FACTOR`を実装。detailed-design.md §2.1の全文コピー通り |
| src/types/index.ts | 編集 | ✅ | `WorkoutLogDTO`末尾に`volumeKg: number`を追加 |
| src/app/actions/workouts.ts | 編集 | ✅ | import追加、`addWorkoutLog`/`updateWorkoutLog`/`getWorkoutSession`の3箇所で`calculateVolumeKg()`呼び出しを追加 |
| src/components/WorkoutLogItem.tsx | 編集 | ✅ | 記録ごとのボリューム表示（未入力/LB換算注記込み）を追加 |
| src/components/WorkoutSessionLogs.tsx | 編集 | ✅ | `totalVolumeKg`をreduceで算出し、カロリーと横並び表示に変更 |
| tests/unit/volume.test.ts | 新規 | ✅ | `calculateVolumeKg`の単体テスト12件、全てパス |
| src/lib/calorie.ts | 変更しない | ✅ | `git diff`で無変更を確認済み |
| prisma/schema.prisma, prisma/migrations/ | 変更しない | ✅ | 触れていない。既存の未コミット差分（別プロジェクト2026-09-14-1040由来）は本作業開始前から存在しており、本プロジェクトでは一切編集していない |

## ファイル別詳細

### src/lib/volume.ts
- 操作: 新規
- 設計書参照: detailed-design.md §2.1
- 実装内容: 設計書の「編集後の期待形（全文）」をそのまま実装。`WeightUnit`は`@/types`からimportし二重定義しない。
- 設計との差異: なし

### src/types/index.ts
- 操作: 編集
- 設計書参照: detailed-design.md §2.2
- 実装内容: `WorkoutLogDTO`の`caloriesBurned`直後に`volumeKg: number`とコメントを追加。
- 設計との差異: なし

### src/app/actions/workouts.ts
- 操作: 編集
- 設計書参照: detailed-design.md §2.3
- 実装内容:
  - `import { calculateVolumeKg } from "@/lib/volume";` を`calorie`importの下に追加
  - `addWorkoutLog`: `caloriesBurned`計算直後に`volumeKg`計算を追加し、Prismaの`create`データには含めず、戻り値DTOの末尾に`volumeKg`を追加
  - `updateWorkoutLog`: 同様に`volumeKg`計算を追加し、`update`データには含めず、戻り値DTOの末尾に`volumeKg`を追加
  - `getWorkoutSession`: `logs`map内で各記録の`calculateVolumeKg()`をインラインで呼び出し`volumeKg`を追加
- 設計との差異: なし。`createWorkoutSession`, `deleteWorkoutLog`, `deleteWorkoutSession`, `listWorkoutSessions`, `getDashboardStats`は設計書通り変更していない

### src/components/WorkoutLogItem.tsx
- 操作: 編集
- 設計書参照: detailed-design.md §2.4
- 実装内容: `caloriesBurned`表示の直後に、`weightValue !== null`で分岐しボリューム表示（LBの場合は「（lb→kg換算）」注記）または「ボリューム: -（重さ未入力）」を表示する`<p>`を追加。
- 設計との差異: なし

### src/components/WorkoutSessionLogs.tsx
- 操作: 編集
- 設計書参照: detailed-design.md §2.5
- 実装内容: `totalCalories`の直後に`totalVolumeKg`を同一reduceパターンで追加。既存の単一`<div>`を`<div className="flex flex-wrap gap-6">`でラップし、カロリーとボリュームを横並び表示。`handleUpdate`/`handleDelete`/編集モーダル等のロジックは無変更。
- 設計との差異: なし

### tests/unit/volume.test.ts
- 操作: 新規
- 設計書参照: detailed-design.md §2.6
- 実装内容: 設計書のテストコードをそのまま作成（正常系KG/LB、定数確認、null/0/負数/NaN/Infinity/大きな値の境界値、計12件）。
- 設計との差異: なし

### src/lib/calorie.ts
- 操作: 変更しない（確認のみ）
- `git diff -- src/lib/calorie.ts`で差分なしを確認済み

### prisma/schema.prisma, prisma/migrations/
- 操作: 変更しない（確認のみ）
- 本プロジェクトでは一切編集していない。なお、作業開始時点で`prisma/schema.prisma`に既存の未コミット差分（`intensityCategory`削除・`weightValue`/`weightUnit`追加）が存在していたが、これは別プロジェクト（2026-09-14-1040-machine-weight-input）由来のものであり、本プロジェクトの作業前から存在していたことを確認済み（git status初期スナップショットで`M prisma/schema.prisma`済み）。本プロジェクトはこのファイルに一切触れていない。

## 検証結果
- `npx tsc --noEmit`: エラーなし（出力なし）
- `npm run build`: 成功（型チェック・Lint含め全ページ生成完了）
- `npm run test`（Vitest）: 全25件パス（新規`volume.test.ts` 12件 + 既存`calorie.test.ts` 13件、無回帰確認済み）
- Playwright E2E（`tests/e2e/workout-flow.spec.ts`）: 依頼指示に従い今回は実行していない（本番DB接続リスクのため）。QAフェーズでの実施判断に委ねる。

## 全体サマリー
- 影響範囲: 6ファイル（新規2、変更4）+ 変更しないことを確認したファイル2件
- 設計通り完了: 6ファイル全て設計書の記述通りに完了
- 部分完了・要相談: なし
- 次フェーズ（QA）への申し送り:
  1. `tests/e2e/workout-flow.spec.ts`は本番Turso DB接続リスクのため今回未実行。DOM構造変更（`WorkoutLogItem`にボリューム表示の`<p>`追加、`WorkoutSessionLogs`の合計表示の`<div>`ラップ変更）がセレクタに影響しないか、QAフェーズで確認要。
  2. 手動結合確認観点（detailed-design.md §5.3）: KG/LB混在セッション、重さ未入力記録混在セッション、記録0件セッション、編集直後のボリューム即時反映、の4点は自動テスト未カバーのためQAフェーズでの確認を推奨。
  3. `prisma/schema.prisma`には本プロジェクト開始前から存在する未コミット差分（`weightValue`/`weightUnit`列追加・`intensityCategory`列削除）があるが、これは別プロジェクト由来であり本プロジェクトの変更対象外。
