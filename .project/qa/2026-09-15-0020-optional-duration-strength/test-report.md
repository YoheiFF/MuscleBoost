---
project_id: "2026-09-15-0020-optional-duration-strength"
phase: qa
overall_status: pass
---
# テストレポート - 2026-09-15-0020-optional-duration-strength

## 総合判定
- 結果: partial
- 設計準拠率: 11/11 ファイル（コード差分は詳細設計書§2の期待形と完全一致）。ただし完了条件チェックリスト（設計書§6・全14項目）のうち13/14が満たされ、「tests/e2e/workout-flow.spec.ts が2.11節の内容で更新され、全シナリオがパスする」の1項目のみ不成立（1件のe2eテストが決定的に失敗）。

## テスト観点別結果
| # | 観点 | 種別 | 結果 | 詳細 |
|---|------|------|------|------|
| 1 | `estimateDurationMinutesForStrength` 正常系（3×10→3.5分、5×10→6.5分） | 正常系 | ✅ pass | `tests/unit/duration-estimate.test.ts` 実行確認 |
| 2 | `estimateDurationMinutesForStrength` 境界値（setCount=1で休憩0、50×200で有限値） | 境界値 | ✅ pass | 同上 |
| 3 | `estimateDurationMinutesForStrength` 異常系防御（0/負数/非整数/NaN/Infinity→0） | 異常系 | ✅ pass | 同上 |
| 4 | `isCardioMuscleGroup` がCARDIOのみtrue、他全MuscleGroupでfalse | 正常系 | ✅ pass | `tests/unit/muscle-group.test.ts` |
| 5 | `workoutLogInputSchema.durationMinutes` のoptional化（省略/指定/範囲外0・601/weightValue無回帰） | 正常系+異常系 | ✅ pass | `tests/unit/validation.test.ts` |
| 6 | 既存単体テスト（calorie/volume/weight）無回帰 | 正常系 | ✅ pass | `npm test` 全44件パス |
| 7 | CARDIO種目・`durationMinutes`未指定→`fieldErrors`、DB未作成（AC相当） | 異常系 | ✅ pass | e2e「有酸素系マシンで運動時間を未入力のまま保存」 |
| 8 | CARDIO種目・`durationMinutes`指定時は従来通りユーザー入力値を使用 | 正常系 | ✅ pass | e2e「有酸素系: セット数のみ変更」前半（128.6kcal表示を確認） |
| 9 | 非CARDIO・`durationMinutes`未指定→推定値でカロリー算出・一致（**AC-3**） | 正常系 | ✅ pass | e2e「MET5.5マシンで記録」（23.6kcal）、「デフォルト体重変更」（27kcal）が期待値通り表示 |
| 10 | 非CARDIO種目に`durationMinutes`を送っても改ざん防御でサーバー推定値が優先される | 異常系（改ざん） | ⚠️ pass（コードレビューのみ） | `workouts.ts`のロジック確認済みだが、これを直接検証する自動テスト（API直叩き等）は存在しない |
| 11 | `getWorkoutSession`の`muscleGroup`が`Exercise.muscleGroup`と一致 | 正常系 | ✅ pass（コードレビュー＋間接e2e） | 推定値ラベル・必須判定が種目ごとに正しく出る＝間接的に整合を確認 |
| 12 | 編集（`updateWorkoutLog`）でCARDIO⇔非CARDIO切替時の必須判定/推定切替 | 境界値 | ❌ 未検証 | e2eテストに編集モーダルを操作するシナリオが1件も存在しない（後述の問題参照） |
| 13 | UI: 筋トレ系種目選択時、運動時間欄が非表示 | 正常系 | ✅ pass | e2e「筋トレ系マシンを選択すると運動時間欄が表示されない」 |
| 14 | UI: 有酸素系種目選択時、運動時間欄が表示され必須マーク`*`が見える | 正常系 | ✅ pass（コードレビュー＋間接e2e） | 欄の表示自体はe2eで確認。`*`表示そのものへの直接assertionは無い |
| 15 | UI: 有酸素系・未入力送信→エラーメッセージ表示・未保存 | 異常系 | ✅ pass | e2e該当テスト |
| 16 | UI: 筋トレ系・セット数/レップ数のみで保存→推定値ベースのカロリー表示（**AC-4関連の前提**） | 正常系 | ✅ pass | e2e「MET5.5マシンで記録」 |
| 17 | UI: 記録一覧で非CARDIOに「（推定値）」付与、CARDIOには付与されない（**AC-4**） | 正常系 | ✅ pass（診断用一時テストで確認、正規e2eには未実装） | 手動診断: 筋トレ系ログ表示「3.5分（推定値）」、有酸素系ログ表示「30分」（ラベル無し）を確認。ただし`tests/e2e/workout-flow.spec.ts`にこの検証を行う正式なassertionが存在しない |
| 18 | UI: 編集モーダルでも運動時間欄の表示切替・`editFieldErrors`が機能する | 境界値 | ❌ 未検証 | 同#12。編集モーダル自体を操作するe2eシナリオが皆無 |
| 19 | 既存の削除・体重変更・マルチユーザー分離等に回帰なし | 正常系 | ✅ pass | e2e該当テスト全てパス |
| 20 | **AC-9: e2eフルスイート（新規/更新シナリオ含む）が全てパスする** | 正常系 | ❌ **fail** | 18件中17件pass、1件fail（詳細は「発見した問題」参照） |

## 静的検証
- 型チェック（`npx tsc --noEmit`）: ✅ エラーなし
- lint（`npm run lint` / `next lint`）: ⚠️ 実行不可（本プロジェクト起因ではない既存の環境未整備）。リポジトリに`eslint.config.*`等の設定ファイルが存在せず、`next lint`が対話式セットアップを要求するため非対話環境では完走できない。本機能の変更ファイルに起因する問題ではなく、プロジェクト全体の既存ギャップ
- ビルド: 型チェックが実質的なビルド時型検証を兼ねており、これはパス。`npm run build`のフルビルド実行は今回のQAでは`tsc --noEmit`で代替（実装ログにも`npm run build`で型チェック済みの記載あり）

## 自動テスト実行
- コマンド: `npm test`（vitest run）
- 結果: 6ファイル / 44テスト 全てpass（新規3ファイル: duration-estimate 12件, muscle-group 2件, validation 5件を含む）
- コマンド: `npx playwright test`（TURSO_DATABASE_URL=file:...dev.db を明示指定してローカルSQLiteに対して実行。本番Turso設定へのフォールバックは発生していないことを確認済み）
- 結果: 18件中17 pass / 1 fail
- 失敗詳細:
  - `tests\e2e\workout-flow.spec.ts:120:7 › トレーニング記録（最重要） › 有酸素系: セット数のみ変更（運動時間は同じ入力値）→カロリー表示が変化しない`
  - `Error: locator.fill: Test timeout of 30000ms exceeded. - waiting for getByLabel('運動時間（分）')`（142行目）
  - 再現性: 単独実行でも100%再現（フレーキーではない）

## 発見した問題

### 「セット数のみ変更」テストが、1回目の記録追加成功後に運動時間欄が消えて失敗する
- 症状: 有酸素系マシンで1件目の記録を追加すると成功する（128.6 kcal表示）。続けて同じフォームでセット数だけ変えて2件目を追加しようとすると、`page.getByLabel("運動時間（分）").fill("30")`がタイムアウトする（要素が見つからない）。
- 期待: 設計書2.11.3節の期待動作は「セット数のみ変更してもう一度送信すると2件目が保存され、カロリー表示（128.6 kcal）が2箇所になる」こと。
- 再現手順:
  1. デフォルト体重70kgでユーザー登録・ログイン
  2. セッション作成→マシン「エアロバイク（30〜50W）」選択→セット数3・レップ数10・運動時間30分で「記録を追加」
  3. 128.6 kcalの表示を確認（成功）
  4. マシンを再選択せずにセット数を5に変更し、運動時間欄に再度入力しようとする
  5. → 運動時間欄自体が画面上に存在せずタイムアウト
- 原因の仮説: `WorkoutLogForm.tsx`の`handleSubmit`は成功時に`setExerciseId("")`を含む全フィールドリセットを行う（この挙動自体は本プロジェクト以前からの既存仕様）。今回追加された`requiresDuration = selectedExercise !== null && isCardioMuscleGroup(...)`は`exerciseId`（＝`selectedExercise`）に依存するため、1回目の送信成功後に`exerciseId`が`""`にリセットされると`selectedExercise`が`null`になり、`requiresDuration`が`false`になって運動時間欄が非表示になる。診断用の一時テストで実測したところ、送信成功後は実際にマシン選択欄も「マシンを選択してください」（未選択状態）に戻ることを確認した。以前は運動時間欄が常時表示（無条件レンダリング）だったため同じ挙動でも問題が表面化しなかったが、今回の「種目カテゴリに応じた表示切替」の追加によって、フォームリセット後は運動時間欄も連動して消えるようになり、既存のテストパターン（マシン再選択なしで連続追加する書き方）と衝突した。これは設計書2.11.3節のテストコード自体（既存パターンをそのまま流用）に内在していた見落としであり、実装は設計書通りに正しく作られている（実装起因のバグではなく、設計書のe2eテストシナリオの側の問題）。
- 推奨対応（いずれか一方でよい）:
  1. テスト側を修正: 2回目の送信前に`await selectExerciseByName(page, "30〜50W")`を追加してマシンを再選択してから運動時間欄を操作する（実際のユーザー操作としても自然で、プロダクトコードの変更は不要）。
  2. あるいはプロダクト仕様として「送信成功後もマシン選択を保持する」という要件を追加するなら`WorkoutLogForm.tsx`の`setExerciseId("")`を見直す（ただし本プロジェクトのスコープ外の仕様変更になるため、要件確認が必要）。
  - QAとしては対応1（テスト修正）を推奨する。

### 設計書§5.3の観点のうち2件（AC-4のラベル表示、編集モーダルの表示切替）が実際のe2eテストに実装されていない
- 症状: 詳細設計書§5.3には以下2つのUI観点が明記されているが、§2.11で追加・更新された実際のテストコードにはこれらを検証するテストケースが1件も含まれていない。
  1. 「記録一覧で、筋トレ系の記録には運動時間表示に『（推定値）』が付き、有酸素系の記録には付かないこと」（AC-4）
  2. 「編集モーダルでも、追加フォームと同様に種目カテゴリに応じた運動時間欄の表示切替が機能すること」
- 期待: §5.3に列挙された観点はすべて何らかのe2eテストでカバーされていること。
- 再現手順: `tests/e2e/workout-flow.spec.ts`全文を確認。「推定値」という文字列を検索してもヒットなし。`startEdit`/編集モーダルを操作する`test(...)`ブロックも0件。
- 原因の仮説: 詳細設計書§2.11は既存5シナリオの更新＋新規2シナリオ（CARDIO必須チェック／筋トレ系欄非表示）のみを定義しており、§5.3で列挙された観点の一部（推定値ラベル表示・編集モーダルの切替）に対応する具体的なテストコードが設計書自体に記載されていなかった。実装フェーズは設計書に忠実に実装したため、この抜けがそのままQAまで持ち越された。
- 補足: 機能自体は正しく動作することをQA側の一時的な診断テスト（本レポート作成後に削除済み・恒久ファイルには残していない）で確認済み。筋トレ系ログは「3.5分（推定値）」、有酸素系ログは「30分」（ラベルなし）と表示されることを実機確認した。編集モーダルのコードは追加フォームと同一パターンで実装されており（`WorkoutSessionLogs.tsx`の`editRequiresDuration`）、コードレビュー上は問題ないが、自動テストでの裏付けが無い。
- 推奨対応: 設計書§2.11に、以下2つのe2eシナリオを追加することを推奨する。
  1. 筋トレ系1件・有酸素系1件を記録し、一覧表示に「（推定値）」の有無が種目カテゴリ通りであることを`expect`で検証するテスト
  2. 記録編集モーダルを開き、種目をCARDIO⇔非CARDIOに変更した際に運動時間欄の表示/非表示が追加フォームと同様に切り替わることを検証するテスト

## 参考: 差分ファイルの設計準拠確認結果（全て一致）
- `src/lib/calorie.ts` / `src/types/index.ts` / `src/lib/validation.ts` / `src/app/actions/workouts.ts` / `src/components/WorkoutLogForm.tsx` / `src/components/WorkoutSessionLogs.tsx` / `src/components/WorkoutLogItem.tsx`: いずれも詳細設計書§2の「編集後の期待形」と全文一致（Readツールで実ファイルを確認）
- `tests/unit/duration-estimate.test.ts` / `tests/unit/muscle-group.test.ts` / `tests/unit/validation.test.ts`: 設計書§2.8〜2.10のテストコードと全文一致
- `tests/e2e/workout-flow.spec.ts`: 設計書§2.11の期待差分と一致（`git diff`で確認）
- `src/lib/volume.ts`, `src/components/ExercisePicker.tsx`, `prisma/schema.prisma`, `prisma/migrations/`, `prisma/seed.ts`, `tests/unit/calorie.test.ts`, `tests/unit/volume.test.ts`, `tests/unit/weight.test.ts`: `git diff --stat`で差分なしを確認（設計書通り「変更しない」）
- 種目マスタ（`prisma/seed.ts`）のMET値も設計書のe2e期待値計算（チェストプレスMET5.5、エアロバイク30〜50W MET3.5）と一致することを確認

## 追記（QA指摘対応後の再検証、PM実施）
- 対応1（必須）: `tests/e2e/workout-flow.spec.ts`の「有酸素系: セット数のみ変更」テストを、2件目送信前にマシンを再選択するよう修正（プロダクトコードは無変更）。
- 対応2（推奨）: AC-4（推定値ラベル）・編集モーダルの表示切替を検証するe2eテストを2件追加。
- 再検証結果:
  - `npx vitest run`: 6ファイル / 44テスト 全pass
  - `npx tsc --noEmit`: エラーなし
  - `npx playwright test`: **20/20 pass**（既存18件＋新規2件、全件成功）
- 完了条件チェックリスト（設計書§6・全14項目）: **14/14 満たされた**

## PM への申し送り
- 完了とみなしてよいか: **yes**（QA指摘の必須対応・推奨対応とも完了、全自動テストpass）
- 残課題:
  1. 非CARDIO種目への`durationMinutes`改ざん防御（サーバー側で無視されクライアント値が使われないこと）は自動テストでは未検証（コードレビューでのみ確認）。優先度は低いが、将来的に追加を検討してもよい。
  2. 本プロジェクトのスコープ外だが、`src/lib/auth.ts` / `src/middleware.ts` / `src/lib/auth.config.ts`に本プロジェクトと無関係な変更がある。これは本プロジェクト開始前の別の対応（ローカル開発時にmiddlewareがlibsqlのfile:スキームを扱えずクラッシュする問題の修正）であり、意図した変更である。詳細設計書のファイル一覧には含まれず、今回の検証対象外。
