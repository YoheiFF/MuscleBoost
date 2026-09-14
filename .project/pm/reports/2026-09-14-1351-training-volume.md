---
project_id: "2026-09-14-1351-training-volume"
phase: pm-report
overall_status: completed
created: "2026-09-14"
---

# 最終報告 - 2026-09-14-1351-training-volume

## 依頼
既存のトレーニング記録（重さ・セット数・レップ数）から「トレーニングボリューム」（重さ×セット×レップ）を算出し、
記録ごと・セッション合計で表示する。集計はKG前提（ユーザー確認済み）。カロリー計算ロジックには影響を与えない。

## 情報収集（Phase 1）
- 「トレーニングボリューム = 重さ×セット数×レップ数」は業界標準の定義であることをWeb検索で確認。
- 既存`WorkoutLog`の実フィールド名（`setCount`, `repsPerSet`, `weightValue`, `weightUnit`）を確認。
- カロリー計算が「lib関数 → Server Action → コンポーネントでreduce集計」の3層パターンで実装されていることを確認し、新指標も同パターンで実装可能と判断。
- Turso本番/開発DB共有によるマイグレーションリスクを踏まえ、「DBスキーマ変更を伴わない都度計算方式」を第一候補として申し送り。
- 詳細: `.project/research/topics/2026-09-14-1351-training-volume.md`

## 設計（Phase 2）
- **DBスキーマ変更なし・都度計算方式を採用**（マイグレーション不要）。
- LB単位の記録は `1lb = 0.45359237kg` でKG換算してから合算し、常にKGの単一値で合計表示（記録ごとの表示では換算した旨を注記）。
- 重さ未入力（null）の記録はボリューム0扱いとし、UI上は「重さ未入力」として0kgと視覚的に区別。
- 影響範囲: `src/lib/volume.ts`（新規）、`src/types/index.ts`・`src/app/actions/workouts.ts`・`src/components/WorkoutLogItem.tsx`・`src/components/WorkoutSessionLogs.tsx`（変更）、`tests/unit/volume.test.ts`（新規）。`src/lib/calorie.ts`・`prisma/`は変更なし。
- 詳細設計書: `.project/design/2026-09-14-1351-training-volume/detailed-design.md`

## 実装（Phase 3）
- 詳細設計書通り、6ファイルすべて完了。
- `src/lib/calorie.ts`・`prisma/schema.prisma`は無変更（`git diff`で確認）。DB書き込み・マイグレーション操作は一切実施せず。
- `npx tsc --noEmit`: 0エラー / `npm run build`: 成功 / `npm run test`: 25/25 pass（新規12件＋既存13件、無回帰）
- work-log: `.project/engineering/2026-09-14-1351-training-volume/work-log.md`

## テスト（Phase 4）
- 総合判定: **pass**（設計準拠率14/14、完了条件チェックリスト10/10）
- 静的検証・単体テストは全てpass。ライブでのブラウザ確認は、ローカルSQLite代替環境でMiddleware(Edge Runtime)のlibsqlクライアントが`file:`スキーム非対応というインフラ上の既存課題により実施できなかったため、結合観点（KG/LB混在集計・未入力混在・0件セッション等）はコードレビューで担保。
- test-report: `.project/qa/2026-09-14-1351-training-volume/test-report.md`

## 残課題
1. ローカルSQLite代替環境でのMiddleware `file:`スキーム非対応により、認証必須画面のライブ確認ができない（インフラ上の既存課題。本番Turso URLでは発生しない）。
2. Playwright E2Eは本番DB接続リスク回避のため今回も未実施（静的検証・単体テストで代替）。
3. 前プロジェクト（`2026-09-14-1040-machine-weight-input`）からの申し送り課題（E2Eへの重さ入力シナリオ追加、`npm run lint`未設定）は引き続き未対応。

## 次のアクション提案
1. 本プロジェクト分の変更をコミットする
2. ユーザー自身の目視確認をご希望であれば、前回同様ローカルSQLiteに向けたdevサーバーでブラウザから実際にボリューム表示を確認可能（認証Middleware以外は問題なく動作する見込み）
3. まとめて前プロジェクト分含めコミット・本番反映のタイミングをご確認
