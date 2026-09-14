---
project_id: "2026-09-14-1040-machine-weight-input"
phase: engineering
---
# 実装ログ - 2026-09-14-1040-machine-weight-input

## 重要な申し送り（最優先で読むこと）

**本プロジェクトのdev/prod DB共有構成により、実際のマイグレーション適用・シード実行・E2Eテスト実行はTursoの本番相当DBに対して行えないため、安全な代替手順で検証した。**

調査の結果、以下が判明した:
- `prisma.config.ts` の `adapter` は常に `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` を使用する（`DATABASE_URL`はスキーマ上の宣言のみで実際には使われない）。
- `prisma/seed.ts`（設計書通りの実装）、`src/lib/prisma.ts`（アプリ実行時のPrismaクライアント）も同様に常に`TURSO_DATABASE_URL`を使う。
- `basic-design.md` §7.1 に明記されている通り、このTursoインスタンスは**開発と本番で同一のDB**である。
- したがって `npx prisma migrate dev` / `npx prisma migrate deploy` / `npm run db:seed` / `npx playwright test`（アプリ起動を伴う）を素の状態で実行すると、**すべて本番と共有のTurso DBに接続・書き込みしてしまう**。これはタスクの明示的な制約（本番DBへ接続してマイグレーションを適用する操作は行わないこと、`.env`の本番Turso認証情報には触れないこと）に抵触する。

**採った対応（すべてローカルの `prisma/dev.db`（SQLite、gitignore対象）のみに閉じている）:**
1. `prisma.config.ts` を一時的に編集し、adapterのURLをローカルファイル（`prisma/dev.db`）に向けて `npx prisma migrate dev --create-only` を試行 → ローカルdev.dbに `_prisma_migrations` 追跡テーブルの不整合（本タスク以前からの既存のドリフト。過去に`db push`等で作られた形跡があり、`migrate dev`が自動生成した「期待スキーマ」と実DBスキーマの間でインデックス定義の差分が検出されリセットを要求された）があり、CLIでのマイグレーション生成が完走しなかった。
2. そのため、`prisma/migrations/20260914020356_merge_exercise_intensity_and_workout_weight/migration.sql` は、設計書§3.2のデータ移行SQL（そのまま採用）と、SQLite列削除の標準的なPrisma生成パターン（`new_Exercise`テーブル作成→コピー→旧テーブルDROP→RENAME、`WorkoutLog`への`ALTER TABLE ADD COLUMN`）に基づき**手動で作成**した。既存の初回マイグレーション（`20260912065446_init/migration.sql`）のテーブル定義・命名規則と完全に整合させている。
3. 作成したSQLを、ローカル`prisma/dev.db`のバックアップを取った上でNode.jsの`node:sqlite`から直接トランザクション実行し、正しく適用されることを確認した（詳細は下記テスト結果）。
4. `prisma.config.ts` は検証後に**元の内容（Turso adapter）へ完全に復元**した（`git diff prisma.config.ts` で差分ゼロを確認済み。コミット対象外）。
5. `prisma/seed.ts`（設計書通りの最終版）とロジックが同一で、adapterのURLだけをローカルdev.dbに向けた一時スクリプトを作成し、ローカルdev.dbに対して2回実行して冪等性を確認した。このスクリプトはプロジェクトにもスクラッチパッドにも残していない（検証後に削除済み）。
6. E2E（Playwright）テストはアプリ起動が必須で、アプリの`src/lib/prisma.ts`が常にTursoへ接続する構成のため、本タスクの制約上実行できなかった。テストコード自体は設計書§3.13通りに更新済み（詳細は下表）。**QAフェーズでの実行を申し送る。**
7. `.github/workflows/deploy.yml`への`npx prisma migrate deploy`追加はコード変更のみ実施し、実行はしていない（本番Tursoへの実適用はユーザー確認後の別作業）。
8. `.env`は一切編集・参照のための書き込みを行っていない（読み取りのみ、TURSO認証情報はコマンドに使用していない）。

## 編集ファイル一覧
| ファイル | 操作 | 完了 | 備考 |
|---------|------|------|------|
| prisma/schema.prisma | 編集 | ✅ | `intensityCategory`削除、`weightValue`/`weightUnit`追加 |
| prisma/migrations/20260914020356_merge_exercise_intensity_and_workout_weight/migration.sql | 新規 | ✅ | 手動作成（上記申し送り参照）。ローカルdev.dbへの適用・検証済み |
| prisma/seed.ts | 編集 | ✅ | 1マシン1エントリ化。ローカルdev.dbで冪等性確認済み |
| src/types/index.ts | 編集 | ✅ | `IntensityCategory`関連削除、`WeightUnit`関連追加 |
| src/lib/validation.ts | 編集 | ✅ | `exerciseInputSchema`から強度削除、`workoutLogInputSchema`にペア制約付き重さ項目追加 |
| src/app/actions/exercises.ts | 編集 | ✅ | `toDTO`から`intensityCategory`除去 |
| src/app/actions/workouts.ts | 編集 | ✅ | 3関数×weightValue/weightUnitのcreate/update/DTOマッピング追加 |
| src/components/ExercisePicker.tsx | 編集 | ✅ | option表示から強度セグメント削除 |
| src/components/ExerciseForm.tsx | 編集 | ✅ | 強度選択欄削除 |
| src/app/exercises/page.tsx | 編集 | ✅ | 一覧表示から強度セグメント削除 |
| src/components/WorkoutLogForm.tsx | 編集 | ✅ | 重さ入力欄＋単位切替UI追加 |
| src/components/WorkoutLogItem.tsx | 編集 | ✅ | 重さ＋単位の表示追加 |
| tests/e2e/workout-flow.spec.ts | 編集 | ✅ | マシン名セレクタ・カロリー期待値更新（+ テストタイトル/コメント内の残存MET3.0表記を軽微修正、下記参照） |
| .github/workflows/deploy.yml | 編集 | ✅ | `prisma migrate deploy`ステップ追加（実行はしていない） |
| tests/unit/calorie.test.ts | 変更なし | ✅ | 確認のみ。`npm run test`で13件全パス確認 |

## ファイル別詳細

### prisma/schema.prisma
- 操作: 編集
- 設計書参照: detailed-design.md §2.1, §3.1
- 実装内容: `Exercise.intensityCategory`（コメント行含む）を削除。`WorkoutLog`に`weightValue Float?`/`weightUnit String?`を`bodyWeightKgOverride`と`metValueSnapshot`の間にコメント付きで追加。
- 設計との差異: なし。

### prisma/migrations/20260914020356_merge_exercise_intensity_and_workout_weight/migration.sql
- 操作: 新規
- 設計書参照: detailed-design.md §3.2
- 実装内容: Step1（設計書§3.2記載のデータ移行SQL全文をそのまま採用）+ Step2（SQLite標準パターンによるExercise再構築DDL＋WorkoutLogへのADD COLUMN）。
- 設計との差異: 設計書はStep2を「`--create-only`が自動生成した内容をそのまま残す」前提で書かれていたが、ローカル環境の`_prisma_migrations`履歴に本タスク以前からの不整合があり、CLIでのマイグレーション生成が完走しなかった。そのためStep2のDDLは、既存の初回マイグレーション（`prisma/migrations/20260912065446_init/migration.sql`）の命名・スタイルに厳密に倣って手動作成した。ロジック（テーブル再構築の手順、列定義、インデックス、ADD COLUMNの型）は設計書の期待内容と完全に一致させている。
- ローカル検証: `prisma/dev.db`のバックアップを取った上でトランザクション内で直接適用し、以下を確認した。
  - Exercise件数: 36件 → 16件（筋トレ10・有酸素6）
  - `seed-*-LIGHT`/`seed-*-VIGOROUS`のIDが0件
  - 既存WorkoutLog 13件の`exerciseId`が全て現存する`seed-チェストプレス-MODERATE`を指し、孤立参照なし
  - 適用前後で`caloriesBurned`/`metValueSnapshot`の値に差異なし（13件全一致）
  - `WorkoutLog`に`weightValue`/`weightUnit`列が追加され、既存13件は両方NULL
  - `Exercise`テーブルから`intensityCategory`列が消えていることを`PRAGMA table_info`で確認

### prisma/seed.ts
- 操作: 編集
- 設計書参照: detailed-design.md §3.3
- 実装内容: 設計書の全文をそのまま採用（二重ループ廃止、`STRENGTH_MACHINES`を1マシン1エントリでupsert、`update`句を実フィールド更新に変更）。
- 設計との差異: なし。
- ローカル検証: ロジック同一・接続先のみローカルdev.dbに向けた一時スクリプト（非コミット、検証後削除）を2回実行し、いずれも総数16件で変化なし（冪等性確認）。

### src/types/index.ts
- 操作: 編集
- 設計書参照: detailed-design.md §2.2, §3.4
- 実装内容: `INTENSITY_CATEGORIES`/`IntensityCategory`/`INTENSITY_LABELS`を削除。`WEIGHT_UNITS`/`WeightUnit`/`WEIGHT_UNIT_LABELS`を`MUSCLE_GROUPS`と同一パターンで追加。`ExerciseDTO`から`intensityCategory`削除、`WorkoutLogDTO`に`weightValue`/`weightUnit`を`bodyWeightKgOverride`直後に追加。
- 設計との差異: なし。

### src/lib/validation.ts
- 操作: 編集
- 設計書参照: detailed-design.md §3.5
- 実装内容: import変更（`INTENSITY_CATEGORIES`削除、`WEIGHT_UNITS`追加）。`exerciseInputSchema`から`intensityCategory`削除。`workoutLogInputSchema`に`weightValue`/`weightUnit`をoptionalで追加し、`superRefine`で片方のみ入力を拒否。
- 設計との差異: なし。

### src/app/actions/exercises.ts
- 操作: 編集
- 設計書参照: detailed-design.md §3.6
- 実装内容: `toDTO`の引数型・戻り値組み立てから`intensityCategory`除去。`IntensityCategory`のimport削除。
- 設計との差異: なし。`listExercises`/`createExercise`/`deleteCustomExercise`本体は無変更（設計書の指摘通り自動的に追随）。

### src/app/actions/workouts.ts
- 操作: 編集
- 設計書参照: detailed-design.md §3.7
- 実装内容: import型に`WeightUnit`追加。`addWorkoutLog`/`updateWorkoutLog`の`create`/`update` dataに`weightValue`/`weightUnit`追加（`calculateCalories()`呼び出し引数より後ろに配置、呼び出し自体は無変更）。両関数の戻り値DTO、および`getWorkoutSession`の`logs`マッピングに`weightValue`/`weightUnit`を追加。
- 設計との差異: なし。

### src/components/ExercisePicker.tsx
- 操作: 編集
- 設計書参照: detailed-design.md §3.8
- 実装内容: `INTENSITY_LABELS`のimportとoption表示内の強度セグメントを削除。
- 設計との差異: なし。

### src/components/ExerciseForm.tsx
- 操作: 編集
- 設計書参照: detailed-design.md §3.9
- 実装内容: `INTENSITY_CATEGORIES`/`INTENSITY_LABELS`/`IntensityCategory`のimport削除、`intensityCategory`状態削除、強度選択`<select>`ブロック削除、`createExercise`呼び出しから`intensityCategory`削除。
- 設計との差異: なし。

### src/app/exercises/page.tsx
- 操作: 編集
- 設計書参照: detailed-design.md §3.10
- 実装内容: `INTENSITY_LABELS`のimportと表示テキストから強度セグメント削除。
- 設計との差異: なし。

### src/components/WorkoutLogForm.tsx
- 操作: 編集
- 設計書参照: detailed-design.md §3.11
- 実装内容: `WEIGHT_UNITS`/`WEIGHT_UNIT_LABELS`/`WeightUnit`のimport追加。`weightValue`/`weightUnit`状態追加。`addWorkoutLog`呼び出しpayloadに追加（`weightValue`が空なら`weightUnit`も送らない）。成功時リセット処理に追加。「運動時間（分）」と「体重（kg・上書き、任意）」の間に重さ入力欄＋単位切替UIを新設。
- 設計との差異: なし。

### src/components/WorkoutLogItem.tsx
- 操作: 編集
- 設計書参照: detailed-design.md §3.12
- 実装内容: `WEIGHT_UNIT_LABELS`のimport追加。表示テキストに`weightValue !== null && weightUnit`の条件で重さ＋単位を追記（`bodyWeightKgOverride`と同じ「値がある時だけ追記」方式）。
- 設計との差異: なし。

### tests/e2e/workout-flow.spec.ts
- 操作: 編集
- 設計書参照: detailed-design.md §3.13
- 実装内容: `selectExerciseByName(page, "チェストプレス（軽度）")`を5箇所すべて`"チェストプレス"`に置換。カロリー期待値を`110.3 kcal`→`202.1 kcal`（4箇所）、`126 kcal`→`231 kcal`（1箇所）に更新。関連コメントの計算式も更新。
- 設計との差異: 設計書に明記のなかった箇所として、同一テスト内に残っていた古いMET値の表記（テストタイトル「MET3.0マシンで記録」→「MET5.5マシンで記録」、コメント内「(110.3kcal)」→「(202.1kcal)」）を保守的判断で追加修正した。設計書の意図（MET値統合に伴うテストの整合性確保）に完全に沿う内容であり、動作自体には影響しない表記のみの修正のため、そのまま反映した。
- 実行結果: **未実行**（アプリの`src/lib/prisma.ts`が常にTurso本番相当DBへ接続する構成のため、本タスクの制約上ローカルで安全に実行できない。上記「重要な申し送り」参照。QAフェーズでの実行を推奨）。

### .github/workflows/deploy.yml
- 操作: 編集
- 設計書参照: detailed-design.md §3.14
- 実装内容: `npm install`の直後・`npm run build`の直前に`npx prisma migrate deploy`を追加。
- 設計との差異: なし。
- 実行: コード変更のみ。GitHub Actions自体もローカルからの本番デプロイも実行していない。

## 静的検証・自動テスト結果
- `npx tsc --noEmit`: エラー0件で完走。
- `npm run build`: 成功（`✓ Compiled successfully`、全11ルートの静的/動的ページ生成完了）。既存の`next-auth`/`jose`由来のEdge Runtime警告は本改修と無関係の既存事象。
- `npm run test`（Vitest, `tests/unit/calorie.test.ts`）: 13件全パス。
- `npx playwright test`: **未実行**（上記申し送り参照）。
- `grep -rn "IntensityCategory\|INTENSITY_" src/`: 0件（除去漏れなし）。

## 全体サマリー
- 影響範囲: 15ファイル（設計書§1の一覧通り。うち`tests/unit/calorie.test.ts`は変更なしの確認のみ）
- 設計通り完了: 14ファイル（コード変更が必要な全ファイル）
- 部分完了・要相談: 0ファイル（コード変更はすべて設計書通り完了。ただし下記「次フェーズへの申し送り」の実行検証タスクが残る）
- 次フェーズ（QA）への申し送り:
  1. **最重要**: `npx playwright test`（`tests/e2e/workout-flow.spec.ts`含む）が未実行。実行には`.env`のTURSO_DATABASE_URL経由でTuroso DBへ接続する必要があり、これは開発・本番共有DBであることが`basic-design.md`§7.1で確認済み。QAチームまたはユーザーが、安全なタイミング（例: 本番マイグレーション適用後、または隔離されたテスト用Turso DBを別途用意した上）で実行することを推奨する。
  2. `npx prisma migrate dev`（実CLI）がローカル`prisma/dev.db`の`_prisma_migrations`履歴ドリフト（本タスク以前からの既存事象）により完走しなかった。マイグレーションSQL自体はNode.jsから直接適用して正しく動作することを検証済みだが、本番Tursoに対して`npx prisma migrate deploy`を実行する際は、事前に`SELECT id FROM Exercise WHERE id LIKE 'seed-%'`で本番の実IDがこの移行SQLの想定（`seed-${machine}-LIGHT/MODERATE/VIGOROUS`形式）と一致することを必ず確認すること（設計書§3.2の注意点通り）。
  3. `npm run db:seed`は実データ（Turso）に対して未実行。本番マイグレーション適用後に一度実行し、件数が16件（＋カスタムマシン）のまま変化しないこと（冪等性）を本番相当環境で確認することを推奨する。
  4. テスト観点は設計書§5の正常系・異常系・境界値・単位変換・マイグレーション整合性チェックリストをそのまま使用可能。
