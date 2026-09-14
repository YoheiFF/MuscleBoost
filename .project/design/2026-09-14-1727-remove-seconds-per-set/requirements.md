---
project_id: "2026-09-14-1727-remove-seconds-per-set"
phase: design
created: "2026-09-14"
---
# 要件定義: 秒数入力欄・自動計算ボタンの削除

## 背景

`src/components/WorkoutLogForm.tsx`（運動記録の追加フォーム）に存在する「1セットあたり秒数（任意）」入力欄と「セット数×秒数から時間を計算」ボタンは、DB・Server Action・DTO・バリデーションのいずれにも保存されないクライアント側限定の補助UIであり、フォームを簡素化するために削除する。

## 要件

### R1. 入力欄・ボタンの削除
`src/components/WorkoutLogForm.tsx` から以下を削除する。
- 「1セットあたり秒数（任意）」ラベル付き入力欄（`id="workout-log-seconds-per-set"`）
- 「セット数×秒数から時間を計算」ボタン
- 上記に付随する state・ハンドラ・リセット処理・未使用import

### R2. 他機能への影響排除
- 「運動時間（分）」欄（`durationMinutes` state, `id="workout-log-duration"`）は直接入力欄として現状のまま変更なく動作し続けること。
- フォーム送信処理（`addWorkoutLog()` 呼び出し）の引数・挙動は変更しないこと。
- `WorkoutSessionLogs.tsx` の編集用モーダル、`validation.ts`、`src/app/actions/workouts.ts`、Prismaスキーマ、e2eテストは対象外（変更不要、確認済み）。

### R3. デッドコードの扱い
`src/lib/calorie.ts` の `estimateDurationMinutes()` は本UI削除後、コードベース内で呼び出し元がゼロになる。デッドコード化を避けるため、関数本体と対応する単体テストも合わせて削除する（詳細な判断理由は basic-design.md 参照）。
- `calculateCalories()`, `CALORIE_CORRECTION_FACTOR` など `calorie.ts` の他のエクスポートには一切変更を加えない。

## 受け入れ条件（Acceptance Criteria）

1. 運動記録追加フォームの画面から「1セットあたり秒数（任意）」入力欄と「セット数×秒数から時間を計算」ボタンが表示されない。
2. 「運動時間（分）」欄への直接入力・バリデーションエラー表示・フォーム送信が従来通り動作する。
3. `src/lib/calorie.ts` から `estimateDurationMinutes` が削除され、`calculateCalories` / `CALORIE_CORRECTION_FACTOR` の実装・エクスポートは変更されていない。
4. `tests/unit/calorie.test.ts` から `estimateDurationMinutes` に関するテスト（`describe("estimateDurationMinutes", ...)` ブロック）が削除され、`calculateCalories` 関連テストは全件変更なくパスする。
5. 既存の自動テスト（unit, e2e）が全件パスする。
6. `estimateDurationMinutes` という識別子がコードベース全体（テスト含む）から消えている（grep 0件）。
