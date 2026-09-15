---
project_id: "2026-09-15-2347-heatmap-monday-3months"
created: "2026-09-16"
overall_status: completed
---

# 最終報告: 2026-09-15-2347-heatmap-monday-3months

## 依頼
トレーニングカレンダー（実績画面のヒートマップ）が単純な7日チャンクで曜日が日によってずれる問題を、月曜始まりの暦週（月〜日の7行）に整列する。あわせて表示期間を直近1年から「当月＋過去2ヶ月＝合計3ヶ月分」に変更する。

## 情報収集の要点
- 月曜始まり週境界の算出関数は既に`src/lib/date.ts`に実装済み（`getJstWeekRangeUtc`、JST安全な変換式）で、新規実装不要・再利用のみで対応可能と判明。
- ストリーク（連続日数）計算は表示期間から独立しており、表示グリッドの変更による影響を受けないことを確認。
- 「当月＋過去2ヶ月」は暦月ベース（2ヶ月前の月の1日→月曜まで切り下げ）で算出する方式を採用。

## 設計
影響範囲: 4ファイル（変更のみ、新規なし）
- `src/lib/achievements.ts`: 新規関数`computeHeatmapWindowStartUtc`/`computeHeatmapWindowDays`を追加、旧`HEATMAP_WINDOW_DAYS=371`定数を削除
- `src/types/index.ts`: コメント修正
- `src/components/WorkoutHeatmap.tsx`: 曜日ラベル（月〜日）追加、UI文言修正
- `tests/unit/achievements.test.ts`: 既存371件テストの更新＋月またぎ・年またぎの境界値テスト3件追加
- 月曜切り下げによる表示日数の最大6日程度のはみ出しは仕様として許容することを要件定義で確定
詳細設計書: .project/design/2026-09-15-2347-heatmap-monday-3months/detailed-design.md

## 実装
完了: 4ファイル / 全4ファイル（設計通り完了、差異なし）
work-log: .project/engineering/2026-09-15-2347-heatmap-monday-3months/work-log.md

## テスト
総合判定: **pass**（設計準拠率16/16、完了条件チェックリスト15/15）
- 型チェック・ビルド: pass
- Vitest単体テスト: 85件全pass（achievements.test.ts単体24件）
- うるう年境界（2024年2月29日）を実装コードに対し直接検証、正しく動作することを確認
- 実際にローカルSQLite環境でブラウザ確認: 月曜始まりの曜日ラベルとセルの対応、今日のセルが正しい行に来ること、表示期間・フッター文言が正しいことを目視確認済み
- Playwright e2e回帰確認: 21/22 pass。1件（auth.spec.tsの重複メール登録テスト）が3回に1回程度の頻度で発生する既存のフレーキーテスト（NextAuth/devサーバーのタイミング起因）で、本プロジェクトの変更ファイル（4ファイルとも無関係）とは無関係と判断
test-report: .project/qa/2026-09-15-2347-heatmap-monday-3months/test-report.md

## 残課題
- `npm run lint`が本プロジェクトにESLint設定ファイルが無いため非対話環境で実行できない（既存の環境課題、対象外）
- `tests/e2e/auth.spec.ts`の重複メール登録テストに既存のフレーキーネス（本プロジェクト起因ではない）を確認。別途原因調査を推奨
- git working treeはクリーン。未コミット。

## 次のアクション提案
- 内容を確認の上、コミット・GitHubへのプッシュ（本番デプロイ）を実施することを推奨
