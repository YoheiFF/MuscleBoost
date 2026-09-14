---
project_id: "2026-09-14-1651-profile-weight-height"
created: "2026-09-14"
status: completed
request_summary: "記録画面の体重上書き入力を廃止し、プロフィールの体重（既存）＋新規の身長でユーザー単位の情報管理に一元化する"
---

# プロジェクト: 2026-09-14-1651-profile-weight-height

## 依頼サマリー
記録画面ごとの体重上書き入力（`bodyWeightKgOverride`）を廃止し、カロリー計算は常にプロフィールの体重（`defaultWeightKg`）を使用する。
プロフィールに身長を新規追加（保存・表示のみ、計算には使わない）。

## 進捗テーブル
| フェーズ | 状態 | 成果物 | 完了時刻 |
|---------|------|--------|---------|
| 1. 情報収集 | done | research/topics/2026-09-14-1651-profile-weight-height.md | 2026-09-14 |
| 2. 上流工程 | done | design/2026-09-14-1651-profile-weight-height/ | 2026-09-14 |
| 3. 開発 | done | engineering/2026-09-14-1651-profile-weight-height/work-log.md | 2026-09-14 |
| 4. QA | done (pass) | qa/2026-09-14-1651-profile-weight-height/test-report.md | 2026-09-14 |
| 5. PM 集約 | done | pm/reports/2026-09-14-1651-profile-weight-height.md | 2026-09-14 |

## 最終判定
completed（QA総合判定: pass、20/20。既存過去データの非破壊性をDB直接確認で実証済み。QA中にローカル検証環境でdevサーバーが一時的に本番Turso DBに接続してしまうインシデントが発生したが、書き込みは発生せず実害なし。再発防止のnpm scriptをPMが追加）
