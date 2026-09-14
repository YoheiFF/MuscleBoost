---
project_id: "2026-09-15-0020-optional-duration-strength"
phase: engineering
---
# 実装ログ - 2026-09-15-0020-optional-duration-strength

## 編集ファイル一覧
| ファイル | 操作 | 完了 | 備考 |
|---------|------|------|------|
| src/lib/calorie.ts | 編集 | ✅ | `ESTIMATED_SECONDS_PER_REP`, `ESTIMATED_REST_SECONDS_BETWEEN_SETS`, `estimateDurationMinutesForStrength`を追加。既存exportは無変更 |
| src/types/index.ts | 編集 | ✅ | `isCardioMuscleGroup()`を追加。`WorkoutLogDTO`に`muscleGroup`を追加 |
| src/lib/validation.ts | 編集 | ✅ | `workoutLogInputSchema.durationMinutes`を`.optional()`化 |
| src/app/actions/workouts.ts | 編集 | ✅ | `addWorkoutLog`/`updateWorkoutLog`にCARDIO必須チェック＋非CARDIO推定ロジックを追加。`getWorkoutSession`のDTOに`muscleGroup`を追加 |
| src/components/WorkoutLogForm.tsx | 編集 | ✅ | 選択中種目に応じて運動時間欄の表示/非表示を切替 |
| src/components/WorkoutSessionLogs.tsx | 編集 | ✅ | 編集モーダルで同様の表示切替。`editFieldErrors`を新設 |
| src/components/WorkoutLogItem.tsx | 編集 | ✅ | 非CARDIO記録の運動時間表示に「（推定値）」を付与 |
| tests/unit/duration-estimate.test.ts | 新規 | ✅ | `estimateDurationMinutesForStrength`の単体テスト（12ケース） |
| tests/unit/muscle-group.test.ts | 新規 | ✅ | `isCardioMuscleGroup`の単体テスト |
| tests/unit/validation.test.ts | 新規 | ✅ | `workoutLogInputSchema`の`durationMinutes`任意化に関する単体テスト |
| tests/e2e/workout-flow.spec.ts | 編集 | ✅ | 既存5シナリオ更新＋新規2シナリオ追加（設計書2.11節通り） |
| src/lib/volume.ts | 変更しない | ✅ | 無変更（差分なしを確認） |
| src/components/ExercisePicker.tsx | 変更しない | ✅ | 無変更（差分なしを確認） |
| prisma/schema.prisma, prisma/migrations/, prisma/seed.ts | 変更しない | ✅ | マイグレーション不要。無変更を確認 |
| tests/unit/calorie.test.ts, tests/unit/volume.test.ts, tests/unit/weight.test.ts | 変更しない | ✅ | 無変更のまま全パス確認 |

## ファイル別詳細

### src/lib/calorie.ts
- 操作: 編集
- 設計書参照: detailed-design.md §2.1
- 実装内容: 末尾に想定値定数2つ（`ESTIMATED_SECONDS_PER_REP=3`, `ESTIMATED_REST_SECONDS_BETWEEN_SETS=60`）と純粋関数`estimateDurationMinutesForStrength(setCount, repsPerSet)`を追加。防御的処理（NaN/Infinity/0以下/非整数で0を返す）、丸め規則（小数第1位四捨五入）とも設計書通り。
- 設計との差異: なし

### src/types/index.ts
- 操作: 編集
- 設計書参照: detailed-design.md §2.2
- 実装内容: `MUSCLE_GROUP_LABELS`直後・`WEIGHT_UNITS`直前に`isCardioMuscleGroup(muscleGroup)`を追加。`WorkoutLogDTO`に`muscleGroup: MuscleGroup`フィールド（コメント付き）を追加。
- 設計との差異: なし

### src/lib/validation.ts
- 操作: 編集
- 設計書参照: detailed-design.md §2.3
- 実装内容: `workoutLogInputSchema.durationMinutes`に`.optional()`を追加。`positive().max(600)`の制約は維持。他フィールド・`superRefine`は無変更。
- 設計との差異: なし

### src/app/actions/workouts.ts
- 操作: 編集
- 設計書参照: detailed-design.md §2.4
- 実装内容:
  1. import文に`estimateDurationMinutesForStrength`, `isCardioMuscleGroup`, `MuscleGroup`を追加。
  2. `addWorkoutLog`: `weightKg`解決後・`calculateCalories`呼び出し前に`muscleGroup`判定ブロックを挿入。CARDIOで`durationMinutes`未指定なら`fieldErrors`を返却。非CARDIOは`estimateDurationMinutesForStrength`で算出したローカル変数`durationMinutes`を`calculateCalories`と`prisma.workoutLog.create`の両方に使用。戻り値DTOに`muscleGroup`を追加。
  3. `updateWorkoutLog`: 同一パターンを適用。
  4. `getWorkoutSession`: `logs`マップ内で`exerciseName`直後に`muscleGroup: l.exercise.muscleGroup as MuscleGroup`を追加（`s.logs`は既に`exercise`をjoin済みのため追加DBアクセスなし）。
  5. `createWorkoutSession`, `deleteWorkoutLog`, `deleteWorkoutSession`, `listWorkoutSessions`, `getDashboardStats`は無変更。
- 設計との差異: なし

### src/components/WorkoutLogForm.tsx
- 操作: 編集
- 設計書参照: detailed-design.md §2.5
- 実装内容: import文に`isCardioMuscleGroup`を追加。`selectedExercise`/`requiresDuration`を`submitting`宣言の直後に追加。送信オブジェクトの`durationMinutes`を`requiresDuration && durationMinutes !== "" ? Number(durationMinutes) : undefined`に変更。運動時間欄のJSXを`{requiresDuration && (...)}`でラップし、ラベルに必須マーク`*`を追加。
- 設計との差異: なし

### src/components/WorkoutSessionLogs.tsx
- 操作: 編集
- 設計書参照: detailed-design.md §2.6
- 実装内容: import文に`isCardioMuscleGroup`を追加。`editFieldErrors`state・`editExercise`/`editRequiresDuration`派生値を追加。`startEdit`で`editFieldErrors`をリセット。`handleUpdate`で`editFieldErrors`をリセット・送信時に`durationMinutes`を条件付きで`undefined`化・エラー時に`editFieldErrors`をセット。編集モーダルの運動時間入力欄を`{editRequiresDuration && (...)}`でラップし、`editFieldErrors.durationMinutes`のエラー表示を追加。
- 設計との差異: なし

### src/components/WorkoutLogItem.tsx
- 操作: 編集
- 設計書参照: detailed-design.md §2.7
- 実装内容: import文に`isCardioMuscleGroup`を追加。`isEstimatedDuration = !isCardioMuscleGroup(log.muscleGroup)`を算出し、運動時間表示の末尾に条件付きで「（推定値）」を追加。
- 設計との差異: なし

### tests/unit/duration-estimate.test.ts
- 操作: 新規
- 設計書参照: detailed-design.md §2.8
- 実装内容: 設計書記載のテストコードをそのまま作成（正常系2件、境界値2件、定数確認2件、異常系防御6件、計12ケース）。
- 設計との差異: なし

### tests/unit/muscle-group.test.ts
- 操作: 新規
- 設計書参照: detailed-design.md §2.9
- 実装内容: 設計書記載のテストコードをそのまま作成。
- 設計との差異: なし

### tests/unit/validation.test.ts
- 操作: 新規
- 設計書参照: detailed-design.md §2.10
- 実装内容: 設計書記載のテストコードをそのまま作成。
- 設計との差異: なし

### tests/e2e/workout-flow.spec.ts
- 操作: 編集
- 設計書参照: detailed-design.md §2.11
- 実装内容: 「デフォルト体重設定→MET5.5マシンで記録」「プロフィールのデフォルト体重変更」「セット数のみ変更（有酸素系に変更）」「デフォルト体重未設定」「削除」の5シナリオを設計書通りに更新。新規2シナリオ（有酸素系必須チェック・筋トレ系欄非表示）を追加。マシンマスタ・トップ画面/実績・マルチユーザー分離のテストは無変更。
- 設計との差異: なし

## 全体サマリー
- 影響範囲: 11 ファイル（変更7・新規3・e2e変更1）＋変更しないことを確認した5ファイル
- 設計通り完了: 11 ファイル
- 部分完了・要相談: 0 ファイル
- 型チェック: `npm run build`（Next.jsの型チェックを含む）を実行し、エラーなしを確認（詳細は本ログ末尾の実行結果を参照）
- 単体テスト: `npm test`（vitest run）で全テスト（新規3ファイル含む）がパスすることを確認
- 次フェーズ（QA）への申し送り:
  - e2e（`npm run test:e2e`）はローカルDB（`TURSO_DATABASE_URL=file:...dev.db`）に対して実行すること。本作業ではNode/Playwrightブラウザの都合上、型チェック・単体テストのみを実施し、e2eの実行はQAフェーズに委ねる（設計書のシナリオ通りに更新済みだが、実機での動作確認が必要）。
  - AC-1〜AC-10（要件定義書7章）を中心に確認すること。特にAC-3（推定カロリーの一致）、AC-4（推定値ラベル）、AC-9（e2e全シナリオ）。
  - `prisma/schema.prisma`・`prisma/migrations/`・`prisma/seed.ts`に差分がないこと（AC-10）を再確認すること。

## 追加修正（QA指摘対応）

QAレポート（`.project/qa/2026-09-15-0020-optional-duration-strength/test-report.md`）で指摘された、テストコード側の不備2件を修正した。プロダクトコード（`src/`配下）は無変更。対象は`tests/e2e/workout-flow.spec.ts`のみ。

### 修正1（必須）: 「有酸素系: セット数のみ変更」テストの失敗解消
- 原因: `WorkoutLogForm`は1件目の記録追加成功時に`exerciseId`を含む全フィールドをリセットする既存仕様がある。今回の変更で`requiresDuration`が`selectedExercise`（＝`exerciseId`から導出）に依存するようになったため、1件目送信後はマシン未選択状態に戻り、`requiresDuration`が`false`になって運動時間欄が消える。2件目の送信前に運動時間欄を`.fill()`しようとしてタイムアウトしていた。
- 対応: QA推奨案（対応1）を採用。2件目のセット数・レップ数入力の前に`await selectExerciseByName(page, "30〜50W")`を追加し、マシンを再選択してから運動時間欄を操作するように修正（`tests/e2e/workout-flow.spec.ts`の「有酸素系: セット数のみ変更（運動時間は同じ入力値）→カロリー表示が変化しない」テスト内）。既存の`selectExerciseByName`ヘルパーをそのまま再利用しており、テストの本来の検証意図（有酸素系はセット数を変えても運動時間・カロリーが変化しないこと）は変更していない。

### 修正2（推奨・実施済み）: 不足していたe2eテストケース2件を追加
詳細設計書§5.3に記載がありながらassertionが存在しなかった観点を、実コンポーネント（`src/components/WorkoutLogItem.tsx`, `src/components/WorkoutSessionLogs.tsx`）を確認した上でテスト化した。

1. **AC-4: 推定値ラベル表示の検証**（新規テスト「記録一覧: 筋トレ系の運動時間には『（推定値）』が付き、有酸素系には付かない（AC-4）」）
   - `WorkoutLogItem.tsx`を確認し、運動時間表示が`{setCount}セット × {repsPerSet}レップ / {durationMinutes}分{（推定値）は非CARDIOのみ付与}`という1つの`<p>`内テキストであることを確認した上で、実際のDOM文言に合わせてassertionを書いた。
   - 筋トレ系（チェストプレス、3セット×10レップ）記録後: `expect(page.getByText("3セット × 10レップ / 3.5分（推定値）")).toBeVisible()`
   - 有酸素系（エアロバイク30〜50W、運動時間30分入力）記録後: `expect(page.getByText("3セット × 10レップ / 30分", { exact: true })).toBeVisible()` と `expect(page.getByText("30分（推定値）")).toHaveCount(0)` の両方で「付与されないこと」を検証。

2. **編集モーダルでの表示切替の検証**（新規テスト「編集モーダル: 種目をCARDIO⇔非CARDIOに変更すると運動時間欄の表示が切り替わる」）
   - `WorkoutSessionLogs.tsx`の`editRequiresDuration`（`editExercise`のCARDIO判定）と、編集モーダル内の運動時間`<input placeholder="運動時間（分）">`の条件描画を確認した。
   - 重要な発見: 編集モーダル内の`ExercisePicker`（`aria-label="マシン"`）には`<label htmlFor>`の関連付けが無く、追加フォームの`ExercisePicker`と同じ`aria-label="マシン"`を持つため、モーダル表示中に既存の`selectExerciseByName`（`page.getByLabel("マシン")`を使用）をそのまま呼ぶとstrict mode違反（2要素にマッチ）になることが分かった。そのため、モーダルのコンテナ（見出し「記録を編集」を含む`div`）にスコープした新規ヘルパー関数`selectEditExerciseByName(page, namePart)`を追加し、モーダル内の`マシン`選択欄のみを操作するようにした。
   - テスト内容: 筋トレ系記録を編集モーダルで開いた時点で運動時間欄が無いこと（`toHaveCount(0)`）→ `selectEditExerciseByName`で有酸素系（エアロバイク30〜50W）に変更すると運動時間欄が表示されること（`toBeVisible()`）→ 再度筋トレ系（チェストプレス）に戻すと非表示に戻ること（`toHaveCount(0)`）を検証。

### 追加したヘルパー関数
- `selectEditExerciseByName(page, namePart)`: 既存の`selectExerciseByName`と同じロジックだが、`page.locator("div", { hasText: "記録を編集" }).last()`で編集モーダルのコンテナにスコープしてからマシン選択欄を操作する点のみ異なる。

### 検証結果
- `npx tsc --noEmit`: エラーなし
- `npx vitest run`（単体テスト）: 6ファイル / 44テスト 全てpass（無回帰）
- `npx playwright test`（`TURSO_DATABASE_URL=file:C:/project/MuscleBoost/prisma/dev.db` `TURSO_AUTH_TOKEN=` を明示指定、ローカルdevサーバー[ポート3000]を再利用）: **20件中20件pass**（既存18件＋今回追加2件）
  - 1回目の実行で「削除: ログ削除後、セッション詳細の合計カロリーが更新される」テストが`registerAndLogin`内の`toHaveURL("/")`待ちでタイムアウトしフレーキーに失敗したが、単独実行・再実行のいずれも成功しており、今回の修正内容とは無関係な既存の環境起因の一過性事象と判断した（該当テストのソース自体は運動時間欄の`.fill()`削除以外に変更していない）。
- プロダクトコード（`src/`配下）への変更は無し（`git diff --stat src/`で無差分を確認可能）。
