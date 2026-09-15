---
project_id: "2026-09-15-2347-heatmap-monday-3months"
phase: engineering
---
# 実装ログ - 2026-09-15-2347-heatmap-monday-3months

## 編集ファイル一覧
| ファイル | 操作 | 完了 | 備考 |
|---------|------|------|------|
| src/lib/achievements.ts | 変更 | ✅ | `computeHeatmapWindowStartUtc`/`computeHeatmapWindowDays`追加、`HEATMAP_WINDOW_DAYS`削除、`buildWorkoutHeatmap`デフォルト引数を動的算出に変更、`subtractJstMonths`移設、import追加 |
| src/types/index.ts | 変更 | ✅ | `WorkoutHeatmapDTO`のJSDoc/フィールドコメント3箇所を「371日」表記から可変長表記に修正 |
| src/components/WorkoutHeatmap.tsx | 変更 | ✅ | 曜日ラベル列（月〜日）追加、フッター文言「直近1年間」→「直近3ヶ月間」、冒頭コメント修正 |
| tests/unit/achievements.test.ts | 変更 | ✅ | `toHaveLength(371)`を`79`＋先頭/末尾日付検証に置き換え、windowDays明示指定の後方互換テスト追加、月またぎ・年またぎの境界値テスト3件を新規describeブロックで追加 |

## ファイル別詳細

### src/lib/achievements.ts
- 操作: 変更
- 設計書参照: detailed-design.md §4.1
- 実装内容:
  - import文に`getJstDayRangeUtc`を追加（設計(a)通り）。
  - `HEATMAP_WINDOW_DAYS`定数とそのコメントを削除（設計(b)通り）。
  - `computeHeatmapLevel`の直後・`buildWorkoutHeatmap`の直前に、`subtractJstMonths`（旧位置から移設、内容は無変更）、`computeHeatmapWindowStartUtc`、`computeHeatmapWindowDays`を追加（設計(c)通り）。
  - `buildWorkoutHeatmap`のJSDocを更新し、デフォルト引数を`windowDays: number = computeHeatmapWindowDays(now)`に変更（本体ロジックは1文字も変更せず）（設計(d)通り）。
  - 旧`formatMonthLabel`直後にあった`subtractJstMonths`の重複定義を削除（設計(e)通り）。
- 設計との差異: なし。設計書の編集後コードをそのまま反映。

### src/types/index.ts
- 操作: 変更
- 設計書参照: detailed-design.md §4.2
- 実装内容: `WorkoutHeatmapDTO`のJSDocコメントと`days`/`totalActiveDays`フィールドコメントから「371」の記述を除去し、可変長・「先頭は必ず月曜日、末尾は必ず今日」という説明に置き換え。`HeatmapDayDTO`・フィールド名・型は無変更。
- 設計との差異: なし。

### src/components/WorkoutHeatmap.tsx
- 操作: 変更（ファイル全文置き換え）
- 設計書参照: detailed-design.md §4.3
- 実装内容:
  - `WEEKDAY_LABELS`（月火水木金土日）定数を追加し、グリッド左側に固定表示の曜日ラベル列を追加。
  - 本体を`flex gap-2`で「曜日ラベル列（shrink-0、overflow対象外）」＋「週の列部分（overflow-x-auto、従来通り）」の2ブロック構成に変更。
  - フッター文言を「直近1年間の記録日数」→「直近3ヶ月間の記録日数」に修正。
  - 冒頭コメントを、月曜始まり整列済みであることを説明する内容に修正（「厳密な整列は行わない」という事実と異なる記述を除去）。
  - 週チャンク分割ロジック（`for (let i = 0; i < heatmap.days.length; i += 7)`）自体は無変更。
- 設計との差異: なし。

### tests/unit/achievements.test.ts
- 操作: 変更
- 設計書参照: detailed-design.md §4.4
- 実装内容:
  - import文に`computeHeatmapWindowStartUtc`/`computeHeatmapWindowDays`（`@/lib/achievements`）、`getJstDateKey`（`@/lib/date`）を追加。
  - `buildWorkoutHeatmap`の最初のテスト（新規ユーザー・記録0件）の期待値を`toHaveLength(371)`から`toHaveLength(79)`＋先頭日付`"2026-06-29"`/末尾日付`"2026-09-15"`の検証に置き換え。
  - `buildWorkoutHeatmap`の`describe`ブロック末尾に「windowDaysを明示的に渡した場合の後方互換テスト」を追加。
  - `buildWorkoutHeatmap`の`describe`ブロック直後に`computeHeatmapWindowStartUtc`/`computeHeatmapWindowDays`用の新規`describe`ブロックを追加（月またぎ・切り下げ不要ケース・年またぎの3テスト）。
  - 設計書の補足指示に従い、テスト追加前に`node -e "console.log(new Date(Date.UTC(2026,2,1)).getUTCDay())"`で2026-03-01の曜日を確認 → `0`（日曜）を確認済み。設計書記載の期待値（2026-02-23）と一致するため、設計書通りの値をそのまま採用。
  - 他の`describe`ブロック（`buildTrendSeries`/`buildMuscleGroupBalance`/`buildPersonalBests`/`buildAchievementBadges`）は無修正。
- 設計との差異: なし。

## 全体サマリー
- 影響範囲: 4ファイル（設計書記載の通り、新規ファイル追加なし）
- 設計通り完了: 4ファイル
- 部分完了・要相談: 0ファイル
- 検証結果:
  - `Grep`で`src`配下・`tests`配下を再検索し、"371"が0件であることを確認済み。
  - `npm run build`（型チェック含む）: エラーなく成功（Next.js 15.5.25、全12ルートの静的生成含め成功）。
  - `npm run test`（Vitest）: 全8ファイル・85テストすべて成功（achievements.test.ts単体で24テスト成功、既存のストリーク系5テスト・buildTrendSeries以降の既存describeブロックは無修正のまま全て成功 = 回帰なし）。
- 次フェーズ（QA）への申し送り:
  - `/workouts`のローカル目視確認は未実施（本フェーズはコード実装・自動テストまでが担当範囲。detailed-design.md §7の最終チェックリスト項目「`/workouts`をローカルで開き...目視確認する」はQAフェーズで実施すること）。
  - 境界値テスト（月またぎ・年またぎ・切り下げ不要ケース）は`tests/unit/achievements.test.ts`の新規`describe("computeHeatmapWindowStartUtc / computeHeatmapWindowDays", ...)`で自動テスト化済み、全て成功。
  - うるう年をまたぐ月境界（2月を含む3ヶ月分）については、設計書§6.3が求める「QAチームが少なくとも1ケース目視確認」を推奨（本フェーズでは自動テストの対象外）。
  - `/workouts`画面での`StatsSummaryCard`・セッション履歴・トレンドグラフ・部位別バランス・自己ベスト・達成バッジの回帰目視確認（設計書§6.4）もQAフェーズで実施すること。
