---
project_id: "2026-09-14-1727-remove-seconds-per-set"
phase: design
created: "2026-09-14"
---
# 基本設計: 秒数入力欄・自動計算ボタンの削除

## 影響範囲の全体像

削除対象UIはクライアント側限定のローカルstate/ハンドラであり、DB・Server Action・DTO・バリデーションには一切登場しない（research report確認済み）。そのため影響範囲は以下の3ファイルに閉じる。

```
src/components/WorkoutLogForm.tsx   … UI本体（import/state/handler/JSX/reset処理を削除）
src/lib/calorie.ts                  … estimateDurationMinutes() の呼び出し元が消滅 → 関数削除
tests/unit/calorie.test.ts          … estimateDurationMinutes の単体テストを削除
```

変更不要と確認済みのファイル（今回一切触らない）:
- `src/components/WorkoutSessionLogs.tsx`（編集用フォームは別実装で秒数UIなし）
- `src/app/actions/workouts.ts`, `src/lib/validation.ts`, `src/types/index.ts`（`secondsPerSet` という名前は元々未登場）
- `prisma/schema.prisma`（`secondsPerSetOverride` は名前が似ているだけの無関係な既存の死んだフィールド。誤って触らないこと）
- `tests/e2e/workout-flow.spec.ts`（該当UIを操作するテストなし）

## `estimateDurationMinutes()` の扱いの決定

### 決定: 関数本体（`src/lib/calorie.ts` L31-39）と対応する単体テスト（`tests/unit/calorie.test.ts` の `describe("estimateDurationMinutes", ...)` ブロック、L48-65）を削除する。

### 理由
1. **唯一の呼び出し元が消滅する**: `estimateDurationMinutes` は現状 `WorkoutLogForm.tsx:39`（`handleEstimateDuration` 内）からのみ呼ばれており、他に呼び出し箇所は存在しない（research report で全文grep確認済み）。今回のUI削除によりこの呼び出し箇所自体がなくなるため、関数を残すと「本番コードから到達不能なエクスポート関数」が残ることになる。
2. **依頼の趣旨に合致**: 依頼は「フォームの簡素化」であり、UIが不要と判断された秒数入力→時間換算という機能自体が丸ごと不要になったことを意味する。関連ロジックだけをコードベースに残すことは、依頼の意図（不要機能の除去）から見て中途半端であり、将来「使われていないのになぜ存在するか」の調査コストを生む。
3. **他エクスポートへの影響がないことを実装ファイルを読んで確認済み**: `calorie.ts` を実読した結果、`calculateCalories()` と `CALORIE_CORRECTION_FACTOR` は独立した実装であり、`estimateDurationMinutes()` を削除しても両者のロジック・シグネチャ・JSDocに一切依存関係がない（`estimateDurationMinutes` はファイル末尾に独立して追加された関数）。よって安全に切り離して削除できる。
4. **テストの整合性**: `tests/unit/calorie.test.ts` は1ファイル内に `describe("calculateCalories", ...)` と `describe("estimateDurationMinutes", ...)` の2ブロックが独立して存在する（L5-46 と L48-65）。関数を削除すれば対応するテストブロックを残す意味がなくなり（コンパイルエラーにもなる: `estimateDurationMinutes` のimportが解決できなくなる）、テストブロックごと削除するのが妥当。`calculateCalories` 側のテスト（L5-46）は無変更。

### 代替案（不採用）
「関数を残し、importだけ削除する」という最小スコープ案も検討したが、依頼スコープの解釈を狭く取りすぎると未使用のエクスポート関数と対応する4件のテストがコードベースに残り続け、次にこのファイルを読む開発者に「なぜ使われていない関数がexportされているのか」という無用な調査負担を与える。デッドコードを残さない方針を優先し不採用とした。

## 変更方針まとめ

| ファイル | 変更内容 |
|---|---|
| `src/components/WorkoutLogForm.tsx` | import文、state、ハンドラ関数、JSXブロック、リセット処理の5箇所を削除 |
| `src/lib/calorie.ts` | `estimateDurationMinutes` 関数定義（L31-39、直前のJSDocコメント含む）を削除。`calculateCalories`, `CALORIE_CORRECTION_FACTOR` は無変更 |
| `tests/unit/calorie.test.ts` | import文から `estimateDurationMinutes` を除去。`describe("estimateDurationMinutes", ...)` ブロックを削除。`describe("calculateCalories", ...)` ブロックは無変更 |
