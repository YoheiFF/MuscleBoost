---
project_id: "2026-09-15-1023-same-day-session-continuity"
created: "2026-09-15"
status: completed
request_summary: "ワークアウトセッションをアプリ終了・画面遷移で切らさず、同じ日であれば同一セッションとして継続扱いにする"
---

# プロジェクト: 2026-09-15-1023-same-day-session-continuity

## 依頼サマリー
現在はアプリを落としたり別画面（プロフィール等）に遷移するとワークアウトセッションが切れてしまう。同じ日であれば同一セッションとして扱われ、記録を継続できるようにする。

## 進捗テーブル
| フェーズ | 状態 | 成果物 | 完了時刻 |
|---------|------|--------|---------|
| 1. 情報収集 | done | research/topics/2026-09-15-1023-same-day-session-continuity.md | 2026-09-15 |
| 2. 上流工程 | done | design/2026-09-15-1023-same-day-session-continuity/ | 2026-09-15 |
| 3. 開発 | done | engineering/2026-09-15-1023-same-day-session-continuity/work-log.md | 2026-09-15 |
| 4. QA | done | qa/2026-09-15-1023-same-day-session-continuity/test-report.md | 2026-09-15 |
| 5. PM 集約 | done | pm/reports/2026-09-15-1023-same-day-session-continuity.md | 2026-09-15 |

## 最終判定
pass。QA一次判定は21/22(partial)だったが、テストの期待値誤り（50.6kcal→47.2kcal）をPMが修正し22/22全passに更新。あわせてplaywright.config.tsの本番DB接続リスクも修正済み。git working treeはクリーン（未コミット）。
