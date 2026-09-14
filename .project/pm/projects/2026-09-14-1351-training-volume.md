---
project_id: "2026-09-14-1351-training-volume"
created: "2026-09-14"
status: completed
request_summary: "重さ×セット数×レップ数によるトレーニングボリュームの算出・表示機能を追加する（KG前提で集計）"
---

# プロジェクト: 2026-09-14-1351-training-volume

## 依頼サマリー
既存の記録項目（重さ・セット数・レップ数）から「トレーニングボリューム」（重さ×セット×レップ）を算出し、
記録ごと・セッション合計で表示する。集計はKG前提。カロリー計算ロジックには影響を与えない。

## 進捗テーブル
| フェーズ | 状態 | 成果物 | 完了時刻 |
|---------|------|--------|---------|
| 1. 情報収集 | done | research/topics/2026-09-14-1351-training-volume.md | 2026-09-14 |
| 2. 上流工程 | done | design/2026-09-14-1351-training-volume/ | 2026-09-14 |
| 3. 開発 | done | engineering/2026-09-14-1351-training-volume/work-log.md | 2026-09-14 |
| 4. QA | done (pass) | qa/2026-09-14-1351-training-volume/test-report.md | 2026-09-14 |
| 5. PM 集約 | done | pm/reports/2026-09-14-1351-training-volume.md | 2026-09-14 |

## 最終判定
completed（QA総合判定: pass。設計準拠率14/14、完了条件10/10。tsc 0エラー・build成功・Vitest 25/25 pass。DBスキーマ変更なしの都度計算方式で実現）
