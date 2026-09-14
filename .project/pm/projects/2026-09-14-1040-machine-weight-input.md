---
project_id: "2026-09-14-1040-machine-weight-input"
created: "2026-09-14"
status: completed
request_summary: "マシン選択肢を1マシン1エントリに統一し、重さ(KG/ポンド)の記録用入力欄を新設する"
---

# プロジェクト: 2026-09-14-1040-machine-weight-input

## 依頼サマリー
マシン種類のプルダウンが「マシン名×強度レベル」で複数選択肢に分かれているのを1マシン1エントリに統一し、
代わりにトレーニング記録に「重さ」（KG/ポンド）の記録用入力欄を新設する。重さはカロリー計算には使わず記録用のみ。

## 進捗テーブル
| フェーズ | 状態 | 成果物 | 完了時刻 |
|---------|------|--------|---------|
| 1. 情報収集 | done | research/topics/2026-09-14-1040-machine-weight-input.md | 2026-09-14 |
| 2. 上流工程 | done | design/2026-09-14-1040-machine-weight-input/ | 2026-09-14 |
| 3. 開発 | done | engineering/2026-09-14-1040-machine-weight-input/work-log.md | 2026-09-14 |
| 4. QA | done (pass) | qa/2026-09-14-1040-machine-weight-input/test-report.md | 2026-09-14 |
| 5. PM 集約 | done | pm/reports/2026-09-14-1040-machine-weight-input.md | 2026-09-14 |

## 最終判定
completed（QA総合判定: pass、設計準拠率15/15。ただし本番Turso DBへの`prisma migrate deploy`実適用はユーザー確認後の別作業として未実施）
