---
project_id: "2026-09-14-1651-profile-weight-height"
phase: engineering
---
# 実装ログ - 2026-09-14-1651-profile-weight-height

## 編集ファイル一覧
| ファイル | 操作 | 完了 | 備考 |
|---------|------|------|------|
| prisma/schema.prisma | 編集 | ✅ | `User.heightCm Float?` 追加、`WorkoutLog.bodyWeightKgOverride` に未使用化コメント追記 |
| prisma/migrations/20260914170000_add_user_height_cm/migration.sql | 新規 | ✅ | `ALTER TABLE "User" ADD COLUMN "heightCm" REAL;` のみ |
| src/lib/validation.ts | 編集 | ✅ | `workoutLogInputSchema`から`bodyWeightKgOverride`削除、`profileUpdateSchema`に`heightCm`追加 |
| src/lib/weight.ts | 新規 | ✅ | `resolveWeightKgForCalorie()`, `DEFAULT_WEIGHT_REQUIRED_ERROR` |
| src/types/index.ts | 編集 | ✅ | `WorkoutLogDTO.bodyWeightKgOverride`削除 |
| src/app/actions/workouts.ts | 編集 | ✅ | 体重解決を`resolveWeightKgForCalorie()`に置換、create/update dataとDTOマッピング3箇所から`bodyWeightKgOverride`除去 |
| src/app/actions/profile.ts | 変更なし | ✅ | 設計書通り差分ゼロを確認 |
| src/components/WorkoutLogForm.tsx | 編集 | ✅ | 体重上書き欄削除、`defaultWeightKg===null`時の警告バナー追加 |
| src/components/WorkoutSessionLogs.tsx | 編集 | ✅ | 編集モーダルの体重上書き欄・状態削除、警告バナー追加 |
| src/components/WorkoutLogItem.tsx | 編集 | ✅ | `bodyWeightKgOverride`参照の条件表示を削除 |
| src/components/ProfileForm.tsx | 編集 | ✅ | 身長入力欄・`initialHeightCm` prop追加 |
| src/app/profile/page.tsx | 編集 | ✅ | `ProfileForm`に`initialHeightCm`を渡す |
| tests/unit/weight.test.ts | 新規 | ✅ | `resolveWeightKgForCalorie()`の4ケース |
| tests/unit/calorie.test.ts | 変更なし | ✅ | 設計書通り変更不要を確認 |
| tests/e2e/workout-flow.spec.ts | 編集 | ✅ | §7方針通り、削除1件・新設1件・書き換え2件・文言更新1件 |

## ファイル別詳細

### prisma/schema.prisma
- 操作: 編集
- 設計書参照: detailed-design.md §3.1
- 実装内容: `User`モデルに`heightCm Float?`を`defaultWeightKg`直後に追加（コメント付き）。`WorkoutLog.bodyWeightKgOverride`は列自体を変更せず、廃止済み・未使用である旨のコメントを追記。
- 設計との差異: なし

### prisma/migrations/20260914170000_add_user_height_cm/migration.sql
- 操作: 新規
- 設計書参照: detailed-design.md §3.2
- 実装内容: `ALTER TABLE "User" ADD COLUMN "heightCm" REAL;` のみを含むマイグレーションファイルを作成。タイムスタンプは既存最新マイグレーション`20260914020356`より新しい`20260914170000`を採番。
- 設計との差異: なし
- ローカル検証（基本設計§5.1・タスク指示5に従い実施）: `.env`・`prisma.config.ts`は一切変更せず、`@libsql/client`を直接使い接続先を`file:C:/project/MuscleBoost/prisma/dev.db`に固定した一時検証スクリプト（プロジェクト直下に一時配置、検証後削除。非コミット）で以下を確認した。
  - 事前に`prisma/dev.db`をバックアップ（検証後、問題なしを確認し削除）。
  - 適用前: `User`列に`heightCm`が存在しない、`User`78件・`WorkoutLog`17件。
  - `ALTER TABLE "User" ADD COLUMN "heightCm" REAL;`を適用。
  - 適用後: `User`列に`heightCm`が追加され、件数は`User`78件・`WorkoutLog`17件のまま変化なし。既存`User.defaultWeightKg`は全行で値が不変、新規`heightCm`は既存行すべてNULL。既存`WorkoutLog.bodyWeightKgOverride`/`caloriesBurned`/`metValueSnapshot`も全行で不変（過去記録の非破壊性を確認）。
  - 本番Tursoへの適用は本プロジェクトでは実施していない（設計書§5.1の通り、ユーザー確認後の別作業とする）。

### src/lib/validation.ts
- 操作: 編集
- 設計書参照: detailed-design.md §3.3
- 実装内容: `workoutLogInputSchema`から`bodyWeightKgOverride: z.number().positive().max(400).optional()`の行を削除（`superRefine`は無変更）。`profileUpdateSchema`に`heightCm: z.number().positive().max(300).optional()`を追加。
- 設計との差異: なし

### src/lib/weight.ts
- 操作: 新規
- 設計書参照: detailed-design.md §3.4
- 実装内容: `DEFAULT_WEIGHT_REQUIRED_ERROR`定数、`WeightResolutionResult`型、`resolveWeightKgForCalorie()`関数を設計書のシグネチャ通りにそのまま実装。
- 設計との差異: なし

### src/types/index.ts
- 操作: 編集
- 設計書参照: detailed-design.md §3.5
- 実装内容: `WorkoutLogDTO`から`bodyWeightKgOverride: number | null;`の行を削除。他フィールド・コメントは無変更。
- 設計との差異: なし

### src/app/actions/workouts.ts
- 操作: 編集
- 設計書参照: detailed-design.md §3.6
- 実装内容:
  - `import { resolveWeightKgForCalorie } from "@/lib/weight";` を追加。
  - `addWorkoutLog`/`updateWorkoutLog`双方で、`data.bodyWeightKgOverride ?? dbUser?.defaultWeightKg ?? null`による解決を`resolveWeightKgForCalorie(dbUser?.defaultWeightKg)`呼び出しに置換し、エラー文言を両関数とも`weightResolution.error`（=`DEFAULT_WEIGHT_REQUIRED_ERROR`）に統一。
  - `prisma.workoutLog.create`/`update`の`data`から`bodyWeightKgOverride`キーを完全に省略（`null`明示もしない）。**既存データへの非破壊性を確保するため、`update`の`data`オブジェクトに`bodyWeightKgOverride`キーを一切含めていないことを実装後に目視確認済み。**
  - `addWorkoutLog`/`updateWorkoutLog`/`getWorkoutSession`の3箇所すべてのDTOマッピングから`bodyWeightKgOverride`行を削除。
- 設計との差異: なし

### src/app/actions/profile.ts
- 操作: 変更なし（確認のみ）
- 設計書参照: detailed-design.md §3.7
- 実装内容: 設計書の指示通り、本ファイルには一切変更を加えていない。`profileUpdateSchema`の変更（`heightCm`追加）に伴い、`updateProfile`は`data: parsed.data`をそのまま渡す既存実装のまま`heightCm`の保存に自動対応する。
- 設計との差異: なし（差分ゼロ）

### src/components/WorkoutLogForm.tsx
- 操作: 編集
- 設計書参照: detailed-design.md §3.8
- 実装内容: `bodyWeightKgOverride`の`useState`宣言削除。`addWorkoutLog`呼び出し・フォームリセット処理から同キー削除。体重上書き入力欄の`<div>`を削除。`error`表示の直下に`defaultWeightKg === null`時の警告バナー（プロフィールへのリンク付き）を追加。`WorkoutLogFormProps`の`defaultWeightKg: number | null;`は変更せず据え置き。
- 設計との差異: なし

### src/components/WorkoutSessionLogs.tsx
- 操作: 編集
- 設計書参照: detailed-design.md §3.9
- 実装内容: `editBodyWeightKgOverride`の`useState`削除。`startEdit`・`handleUpdate`（`updateWorkoutLog`呼び出し）から同キー削除。編集モーダル内の体重上書き`<input>`削除。`editError`表示の直下に警告バナーを追加（`defaultWeightKg`を利用）。`WorkoutSessionLogsProps`は変更なし。
- 設計との差異: なし

### src/components/WorkoutLogItem.tsx
- 操作: 編集
- 設計書参照: detailed-design.md §3.10
- 実装内容: `{log.bodyWeightKgOverride ? ... : ""}`の1行を削除。他は無変更。
- 設計との差異: なし

### src/components/ProfileForm.tsx
- 操作: 編集
- 設計書参照: detailed-design.md §3.11
- 実装内容: `ProfileFormProps`に`initialHeightCm: number | null;`を追加。`heightCm` stateを`defaultWeightKg`と同一パターンで追加。`updateProfile`呼び出しペイロードに`heightCm`を追加。JSXに身長入力欄（`id="profile-height"`）を`defaultWeightKg`欄の直後に追加。
- 設計との差異: なし

### src/app/profile/page.tsx
- 操作: 編集
- 設計書参照: detailed-design.md §3.12
- 実装内容: `ProfileForm`呼び出しに`initialHeightCm={dbUser?.heightCm ?? null}`を追加。
- 設計との差異: なし

### tests/unit/weight.test.ts
- 操作: 新規
- 設計書参照: detailed-design.md §6.1
- 実装内容: 設計書表の4ケース（正常系・null・undefined・境界値0.1）をそのまま実装。
- 設計との差異: なし

### tests/unit/calorie.test.ts
- 操作: 変更なし（確認のみ）
- 設計書参照: detailed-design.md §6.1
- 実装内容: 既存テストは`calculateCalories`/`estimateDurationMinutes`のみを対象とし、本改修の影響を受けないことを確認。変更なし。
- 設計との差異: なし

### tests/e2e/workout-flow.spec.ts
- 操作: 編集
- 設計書参照: detailed-design.md §7
- 実装内容:
  - §7.1「デフォルト体重設定→...」: 変更なし（維持）。
  - §7.2「体重を記録時に上書き→...」テストを削除し、「プロフィールのデフォルト体重を変更すると、以降の記録に反映される」テストを新設（設計書のコードをそのまま採用）。
  - §7.3「セット数のみ変更...」: 体重上書き欄の`fill`を削除し、テスト冒頭でプロフィールのデフォルト体重70を設定する手順に書き換え。
  - §7.4「デフォルト体重未設定...」: 期待エラーテキストを`"体重が未設定です"`に更新。
  - §7.5「削除: ログ削除後...」: 体重上書き欄の`fill`を削除し、事前にプロフィールでデフォルト体重70を設定する手順に書き換え。
  - §7.6「マルチユーザー分離」: 変更なし。
  - 身長専用のE2Eシナリオ追加は設計書§7.7により必須ではないため見送り（手動確認観点§6.3でカバーする申し送り）。
- 設計との差異: なし

## 全体サマリー
- 影響範囲: 15 ファイル（設計書§2の影響範囲一覧と一致）
- 設計通り完了: 15 ファイル
- 部分完了・要相談: 0 ファイル
- 検証結果:
  - `npx prisma generate`: 実施。型定義（`node_modules/.prisma/client/index.d.ts`）への`heightCm`反映を確認済み（`grep`で確認）。ネイティブクエリエンジンDLL(`query_engine-windows.dll.node`)のコピーのみ、既存の`npm run dev`プロセスがファイルをロックしていたため`EPERM`で失敗したが、型情報自体は正しく更新されており、以降の`tsc`/`build`/`test`には影響なし（実行中プロセスの停止は許可されなかったため、DLL自体は前バージョンのまま）。
  - `npx tsc --noEmit`: **エラーなし（パス）**。
  - `npm run build`: **成功**（`✓ Compiled successfully`、`/profile`・`/workouts/[id]`含む全11ルートの静的/動的生成に成功）。既存の警告（bcryptjs/jose/prisma driver adapterのEdge Runtime非対応警告）は本改修と無関係の既存警告。
  - `npm run test`（Vitest）: **全29件パス**（`tests/unit/weight.test.ts`の新規4件を含む、`tests/unit/calorie.test.ts`13件、`tests/unit/volume.test.ts`12件）。
- マイグレーション運用: 設計書§5.1の方針に厳密に従い、`.env`・`prisma.config.ts`は一切変更していない。ローカル検証は、シェルコマンド実行時に一時的に`TURSO_DATABASE_URL`等の環境変数をローカルSQLite（`prisma/dev.db`）向けに上書きする方法でのみ実施し、本番Tursoへの実マイグレーション適用・`npm run db:seed`の本番接続実行は一切行っていない。本番Tursoへの実適用はユーザー確認後の別作業とする。
- 次フェーズ（QA）への申し送り:
  - 過去記録（`bodyWeightKgOverride`が非NULLの行）の表示・カロリー計算が改修前と変わらないことを、可能であれば本番相当データで確認すること（設計書§6.3の手動確認観点参照）。
  - `addWorkoutLog`/`updateWorkoutLog`のUPDATE文に`bodyWeightKgOverride`キーが一切含まれていないこと（既存データ非破壊）を、`src/app/actions/workouts.ts`のコードレビューで再確認すること。
  - E2Eテスト（`tests/e2e/workout-flow.spec.ts`）はこのプロジェクトでもローカル実行していない（本番Turso接続必須のため）。静的レビューにとどめており、実行確認はQA/本番相当環境で行うこと。
  - 身長の保存・表示・バリデーション（0以下・301以上の拒否）を手動確認すること。
  - `npx prisma generate`実行時、既存の`npm run dev`プロセスがネイティブクエリエンジンDLLをロックしていたため、DLL自体（`node_modules/.prisma/client/query_engine-windows.dll.node`）は更新されなかった（型定義`index.d.ts`は更新済み）。動作確認前に一度`npm run dev`を再起動（または停止後に`npx prisma generate`を再実行）し、DLLを最新化することを推奨する。
