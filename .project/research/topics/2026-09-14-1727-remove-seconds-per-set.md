---
project_id: "2026-09-14-1727-remove-seconds-per-set"
phase: research
created: "2026-09-14"
---
# 情報収集レポート: 秒数入力欄の削除

## 結論サマリー

- 「1セットあたり秒数（任意）」入力欄と「セット数×秒数から時間を計算」ボタンは `src/components/WorkoutLogForm.tsx` の**追加フォームにのみ**存在する、クライアント側限定の補助UI。DB・Server Action・DTO・バリデーションスキーマのいずれにも `secondsPerSet` という名前の値は一切登場せず、フォーム送信時の `addWorkoutLog()` 呼び出しにも含まれていない（DB非保存であることを裏付け済み）。
- 記録編集フォーム（`WorkoutSessionLogs.tsx` 内のモーダル）は `WorkoutLogForm` を再利用しておらず、独自の簡易フォームであり、そもそも秒数入力欄・自動計算ボタンは存在しない。よって編集フォーム側の対応は不要。
- e2e テスト (`tests/e2e/workout-flow.spec.ts`) はこの入力欄・ボタンを一切操作していない（該当する `id`/ラベル文字列でのマッチなし）。
- 削除しても「運動時間（分）」欄（`durationMinutes` state、`workout-log-duration` input）自体はそのまま独立して存在し続け、直接入力・バリデーション・送信ロジックに影響しない。
- 削除対象のロジックが依存する `estimateDurationMinutes()`（`src/lib/calorie.ts:35-39`）は、UI側の呼び出し元がなくなると他に呼び出し箇所がなくなり未使用になる。ただし `tests/unit/calorie.test.ts` にこの関数を直接テストするケースが4件あるため、関数自体・テスト自体を削除するかどうかは設計判断が必要（本タスクの依頼スコープは「UIの削除」であり、関数の削除までは明示されていない）。

## 確認済み事実

- ［ファクト］`WorkoutLogForm.tsx` の該当state: `const [secondsPerSet, setSecondsPerSet] = useState("");`（出典: `src/components/WorkoutLogForm.tsx:29`）
- ［ファクト］自動計算ボタンのハンドラ: `handleEstimateDuration()` が `estimateDurationMinutes(Number(setCount), Number(secondsPerSet))` を呼び、結果を `setDurationMinutes()` にセットする（出典: `src/components/WorkoutLogForm.tsx:38-43`）
- ［ファクト］入力欄JSX（ラベル「1セットあたり秒数（任意）」、`id="workout-log-seconds-per-set"`）と隣接する「セット数×秒数から時間を計算」ボタン（`type="button"`, `onClick={handleEstimateDuration}`）は同一の `<div className="grid ... sm:items-end">` ブロック内にまとまっている（出典: `src/components/WorkoutLogForm.tsx:128-148`）
- ［ファクト］フォーム送信時 `addWorkoutLog()` へ渡すオブジェクトは `{ exerciseId, setCount, repsPerSet, durationMinutes, weightValue, weightUnit }` のみで `secondsPerSet` は含まれない（出典: `src/components/WorkoutLogForm.tsx:51-58`）
- ［ファクト］送信成功後のリセット処理にも `setSecondsPerSet("")` が呼ばれている（出典: `src/components/WorkoutLogForm.tsx:71`）— 削除対象に含める必要あり
- ［ファクト］`secondsPerSet` という語は `validation.ts`（`workoutLogInputSchema` 含む全体）、`src/app/actions/workouts.ts`、`src/types/index.ts` のいずれにも grep で一致なし（出典: 各ファイルへの grep 実行結果、0件）
- ［ファクト］Prisma スキーマには類似名の `secondsPerSetOverride Int?` フィールドが存在する（出典: `prisma/schema.prisma:69`）が、これは名前が異なり、かつ既存調査（`.project/research/topics/2026-09-14-1040-machine-weight-input.md:18`）で「バリデーション・DTO・Server Actionのいずれにも登場しない未使用の死んだフィールド」と確認済み。今回の `secondsPerSet`（フォームのローカルstate）とは別物であり、本タスクのスコープ外（触らないこと）。
- ［ファクト］編集用フォームは `WorkoutSessionLogs.tsx` 内にモーダルとして独自実装されており、`exerciseId/setCount/repsPerSet/durationMinutes` のみを扱う。`WorkoutLogForm` コンポーネントは再利用していない（出典: `src/components/WorkoutSessionLogs.tsx:20-170`、特に27-64行目のstateとhandleUpdate、123-147行目のJSX）。秒数入力欄・自動計算ボタンに相当するUIは存在しない。
- ［ファクト］`tests/e2e/workout-flow.spec.ts` に対して `secondsPerSet|seconds-per-set|1セットあたり秒数|セット数×秒数から時間|workout-log-seconds` で grep した結果、一致0件（出典: grep実行結果）
- ［ファクト］「運動時間（分）」欄は独立した state (`durationMinutes`) ・独立した `<div>` ブロック（130-162行目とは別、149-162行目）であり、秒数入力欄・ボタンのブロック（128-148行目）とは別のJSXブロック。削除対象を128-148行目に限定すれば運動時間欄のJSX・ロジックには一切触れない（出典: `src/components/WorkoutLogForm.tsx:128-162`）
- ［ファクト］`estimateDurationMinutes` 関数は `src/lib/calorie.ts:35-39` で定義され、コードベース内での呼び出し元は `WorkoutLogForm.tsx:39` の1箇所のみ（出典: 全文grep結果、他に呼び出し箇所なし）。テストは `tests/unit/calorie.test.ts:48-63` に4ケース存在。

## 既存コードベースの関連箇所

- `src/components/WorkoutLogForm.tsx`
  - L7: `import { estimateDurationMinutes } from "@/lib/calorie";` — 削除対象ロジックのみが使用するimport。他に使用箇所がなくなるため、UI削除と同時にこのimportも削除可能（未使用import警告/lint対策）。
  - L29: `secondsPerSet` state宣言
  - L36-43: コメント＋`handleEstimateDuration`関数本体
  - L71: リセット処理内 `setSecondsPerSet("")`
  - L128-148: 入力欄とボタンのJSXブロック（`sm:items-end` グリッド全体）
- `src/lib/calorie.ts:31-39`: `estimateDurationMinutes` 関数定義（関数自体の削除要否は設計判断待ち。関数を残す場合はコメントに「UIの『時間を自動入力』ボタン用」とある点を更新するか検討の余地あり）
- `tests/unit/calorie.test.ts:48-63`: `estimateDurationMinutes` の単体テスト（関数を残せば無変更、関数を削除するならテストも削除が必要）
- `src/components/WorkoutSessionLogs.tsx`: 編集フォームは別実装であり変更不要

## 制約・前提・リスク

- JSXブロック128-148行目を削除する際、直前の「セット数・レップ数」グリッド（104-127行目）と直後の「運動時間（分）」ブロック（149-162行目）のレイアウト（`grid`, `gap-4` 等）に依存関係はなく、単純にブロックごと削除して問題ない。
- `handleEstimateDuration` を削除すると `estimateDurationMinutes` の呼び出し元がゼロになる。依頼文の対象は「入力欄・ボタン」の削除のみであり、`src/lib/calorie.ts` の関数削除は明示されていないため、**関数を残して未使用importのみ整理する**か、**関数ごと削除してテストも削除する**かは設計フェーズでの判断が必要（依頼スコープの解釈次第）。ただし関数を残す場合、コード上「呼び出し元がないユーティリティ関数」が残ることになる点はリスクとして申し送る。
- `prisma/schema.prisma` の `secondsPerSetOverride` フィールドは本タスクとは無関係の別物（既存の死んだフィールド）。誤って一緒に触らないよう注意。
- 送信データ・バリデーションには一切影響しないため、Server Action (`src/app/actions/workouts.ts`) や `validation.ts` の変更は不要。

## 設計者への申し送り

1. 削除範囲は `WorkoutLogForm.tsx` の以下4箇所：
   - L7 の `estimateDurationMinutes` import（他に使用箇所がなくなる場合は削除、`calorie.ts`側で関数を残すと決めた場合も importだけは不要になる）
   - L29 `secondsPerSet` state
   - L36-43 `handleEstimateDuration` 関数（コメント込み）
   - L71 `setSecondsPerSet("")` リセット処理
   - L128-148 入力欄＋ボタンのJSXブロック
2. `src/lib/calorie.ts` の `estimateDurationMinutes` 関数（L31-39）と `tests/unit/calorie.test.ts` のテスト（L48-63）を残すか削除するかは設計フェーズで方針決定が必要。依頼原文は「入力欄とボタンの削除」のみを指示しているため、最小スコープなら関数・テストは現状維持（未使用ユーティリティとして残す）が安全な解釈だが、コードクリーンアップの観点では削除も選択肢として提示する。
3. 編集フォーム（`WorkoutSessionLogs.tsx`）・e2eテスト・Server Action・バリデーション・DTO・Prismaスキーマには一切変更不要（影響範囲がこの1ファイルに閉じていることを確認済み）。
4. 「運動時間（分）」欄は今回の削除対象ブロックとは別のJSXブロック・別stateであり、直接入力機能に影響しないことを確認済み。
