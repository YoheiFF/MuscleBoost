---
project_id: "2026-09-15-2347-heatmap-monday-3months"
created: "2026-09-15"
status: completed
request_summary: "トレーニングカレンダー（ヒートマップ）を月曜始まりの暦週（7行）に整列し、表示期間を当月＋過去2ヶ月=合計3ヶ月分に変更する"
---

# プロジェクト: 2026-09-15-2347-heatmap-monday-3months

## 依頼サマリー
実績画面のカレンダーヒートマップが単純な7日チャンクで曜日が揃っていない問題を、月曜始まりの暦週（月〜日の7行）に整列する。また表示期間を直近1年から当月＋過去2ヶ月（合計3ヶ月分）に変更する。

## 進捗テーブル
| フェーズ | 状態 | 成果物 | 完了時刻 |
|---------|------|--------|---------|
| 1. 情報収集 | done | research/topics/2026-09-15-2347-heatmap-monday-3months.md | 2026-09-16 |
| 2. 上流工程 | done | design/2026-09-15-2347-heatmap-monday-3months/ | 2026-09-16 |
| 3. 開発 | done | engineering/2026-09-15-2347-heatmap-monday-3months/work-log.md | 2026-09-16 |
| 4. QA | done | qa/2026-09-15-2347-heatmap-monday-3months/test-report.md | 2026-09-16 |
| 5. PM 集約 | done | pm/reports/2026-09-15-2347-heatmap-monday-3months.md | 2026-09-16 |

## 最終判定
pass。設計準拠率16/16、完了条件15/15。単体テスト85件全pass、e2e回帰21/22pass（1件は既存のフレーキーテストで本変更とは無関係）。git working treeはクリーン（未コミット）。
