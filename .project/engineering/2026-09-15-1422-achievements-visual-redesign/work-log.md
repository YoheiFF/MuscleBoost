---
project_id: "2026-09-15-1422-achievements-visual-redesign"
phase: engineering
---
# 実装ログ - 2026-09-15-1422-achievements-visual-redesign

## 編集ファイル一覧
| ファイル | 操作 | 完了 | 備考 |
|---------|------|------|------|
| src/lib/date.ts | 編集 | ✅ | 既存関数はそのまま、末尾に4関数を追記 |
| src/lib/achievements.ts | 新規 | ✅ | 純粋集計関数5種＋定数群 |
| src/app/actions/achievements.ts | 新規 | ✅ | getAchievementsData()（"use server"） |
| src/types/index.ts | 変更 | ✅ | 新規DTO9種＋MUSCLE_GROUP_CHART_COLORS追加 |
| src/components/WorkoutHeatmap.tsx | 新規 | ✅ | Server Component |
| src/components/TrendChart.tsx | 新規 | ✅ | Client Component（Recharts AreaChart） |
| src/components/MuscleBalanceChart.tsx | 新規 | ✅ | Client Component（Recharts PieChart） |
| src/components/PersonalBestList.tsx | 新規 | ✅ | Server Component |
| src/components/AchievementBadges.tsx | 新規 | ✅ | Server Component |
| src/app/workouts/page.tsx | 変更 | ✅ | 新規5コンポーネントの組み込み |
| package.json | 変更 | ✅ | recharts ^2.15.0 追加 |
| package-lock.json | 変更（自動） | ✅ | npm installで再生成（recharts@2.15.4を含む） |
| tests/unit/date.test.ts | 変更 | ✅ | 新規4関数のテスト追加（17テストに増加） |
| tests/unit/achievements.test.ts | 新規 | ✅ | 20テスト追加 |

## ファイル別詳細

### src/lib/date.ts
- 操作: 編集
- 設計書参照: detailed-design.md §3.1
- 実装内容: 既存の`getPeriodRange`, `JST_OFFSET_MS`, `getJstDayRangeUtc`はそのまま維持し、末尾に`getJstDateKey`, `addDays`, `getJstWeekRangeUtc`, `getJstMonthRangeUtc`を追記した。
- 設計との差異: なし（設計書のコードをそのまま追記）。

### src/lib/achievements.ts
- 操作: 新規
- 設計書参照: detailed-design.md §3.2
- 実装内容: `buildWorkoutHeatmap`, `buildTrendSeries`, `buildMuscleGroupBalance`, `buildPersonalBests`, `buildAchievementBadges`の5純粋関数と、閾値・ウィンドウ日数等の定数を実装。すべてDB非依存で`now: Date`を引数として受け取る設計に準拠。
- 設計との差異: なし（設計書のコードをそのまま実装）。

### src/app/actions/achievements.ts
- 操作: 新規
- 設計書参照: detailed-design.md §3.3
- 実装内容: `getCurrentUserOrThrow()`で認証確認後、`prisma.workoutSession.findMany`を1回だけ呼び出し、`AchievementSessionInput[]`に詰め替えてから`src/lib/achievements.ts`の5関数に処理を委譲。`buildWorkoutHeatmap`→`buildTrendSeries`→`buildMuscleGroupBalance`→`buildPersonalBests`→`buildAchievementBadges`（heatmap依存のため最後）の順で呼び出し。
- 設計との差異: なし。

### src/types/index.ts
- 操作: 変更
- 設計書参照: detailed-design.md §3.4
- 実装内容: `MUSCLE_GROUP_LABELS`直後に`MUSCLE_GROUP_CHART_COLORS`を追加。`DashboardStatsDTO`と`ActionResult`の間に`HeatmapDayDTO`, `WorkoutHeatmapDTO`, `TrendPointDTO`, `TrendSeriesDTO`, `MuscleGroupBalanceDTO`, `PersonalBestDTO`, `AchievementBadgeDTO`, `AchievementBadgesDTO`, `AchievementsDataDTO`の9型を追加。
- 設計との差異: なし。既存の型・定数・関数は一切変更していない（差分確認済み）。

### src/components/WorkoutHeatmap.tsx
- 操作: 新規
- 設計書参照: detailed-design.md §3.5
- 実装内容: 371日を7日ずつのチャンクに分割し、Tailwind Gridで自前描画するServer Component。`"use client"`は付与していない。
- 設計との差異: なし。

### src/components/TrendChart.tsx
- 操作: 新規
- 設計書参照: detailed-design.md §3.6
- 実装内容: `useState`で週/月・カロリー/ボリュームを切替。Recharts `AreaChart`で描画。データなし時は空状態メッセージ。
- 設計との差異: なし。

### src/components/MuscleBalanceChart.tsx
- 操作: 新規
- 設計書参照: detailed-design.md §3.7
- 実装内容: `useState`で頻度/ボリュームを切替。Recharts `PieChart`（ドーナツ化）で描画。`MUSCLE_GROUP_CHART_COLORS`で固定配色。
- 設計との差異: なし。

### src/components/PersonalBestList.tsx
- 操作: 新規
- 設計書参照: detailed-design.md §3.8
- 実装内容: `buildPersonalBests`のソート済み配列をそのままリスト表示。NEWタグ、部位ラベル、最大重量/ボリュームを表示。
- 設計との差異: なし。

### src/components/AchievementBadges.tsx
- 操作: 新規
- 設計書参照: detailed-design.md §3.9
- 実装内容: `BadgeChip`サブコンポーネントで達成済み(amber)/未達成(グレー+opacity-50)を切替。連続日数6件・累計セッション数6件をグリッド表示。
- 設計との差異: なし。

### src/app/workouts/page.tsx
- 操作: 変更
- 設計書参照: detailed-design.md §3.10
- 実装内容: `getAchievementsData()`を`Promise.all`に追加し、`WorkoutHeatmap`→(`TrendChart`と`MuscleBalanceChart`の`lg:grid-cols-2`グリッド)→`AchievementBadges`→`PersonalBestList`の順で`StatsSummaryCard`グリッドの直後・`CalorieDisclaimer`の直前に追加。既存の履歴一覧・StatsSummaryCard等は無変更。
- 設計との差異: なし。

### package.json / package-lock.json
- 操作: 変更
- 設計書参照: detailed-design.md §3.11
- 実装内容: `dependencies`に`"recharts": "^2.15.0"`を`react-dom`と`zod`の間に追加。`npm install`実行によりpackage-lock.jsonが再生成され、実際にインストールされたバージョンは`recharts@2.15.4`（`^2.15.0`の範囲内）。
- 設計との差異: `npm install`の`postinstall`スクリプト（`prisma generate`）が`EPERM: operation not permitted, rename ... query_engine-windows.dll.node`エラーで失敗した。原因調査の結果、開発機上で稼働中の別node.exeプロセス（ユーザーの手動確認用dev serverと推測）がPrismaクエリエンジンDLLをロックしていたためと判断。`prisma/schema.prisma`は本プロジェクトで変更しておらず、`package-lock.json`の差分にも`@prisma/client`・`prisma`関連パッケージの変更は含まれていない（`git diff package-lock.json`で確認済み）ため、既存の生成済みPrismaクライアント（2026-09-12生成、バージョン6.19.3、node_modules/@prisma/client配下に現存）をそのまま使用する方針とした。`npm run build`・`npm run test`はいずれも問題なく成功しており、実害は無い。QA/次回作業者への申し送り: もしPrismaクライアントの再生成が必要になった場合は、稼働中のdevサーバーを一時停止してから`npx prisma generate`を再実行すること。

### tests/unit/date.test.ts
- 操作: 変更
- 設計書参照: detailed-design.md §3.12
- 実装内容: import文に`getJstDateKey`, `addDays`, `getJstWeekRangeUtc`, `getJstMonthRangeUtc`を追加し、それぞれの`describe`ブロック（境界値テスト含む）を追記。
- 設計との差異: なし。

### tests/unit/achievements.test.ts
- 操作: 新規
- 設計書参照: detailed-design.md §3.13
- 実装内容: `buildWorkoutHeatmap`, `buildTrendSeries`, `buildMuscleGroupBalance`, `buildPersonalBests`, `buildAchievementBadges`の5関数について、記録0件・JST日付境界・KG/LB混在・NEW判定境界値等を含む20テストケースを実装。
- 設計との差異: なし。

## 検証結果

### 型チェック
`npx tsc --noEmit` → エラー0件で成功。

### 単体テスト（Vitest）
`npm run test` → 8ファイル・81テスト全件成功（既存61テスト + 新規date.test.ts追加分5テスト + achievements.test.ts新規20テスト。内訳: date.test.tsは既存6+新規11=17テスト）。

```
✓ tests/unit/calorie.test.ts (9 tests)
✓ tests/unit/duration-estimate.test.ts (12 tests)
✓ tests/unit/volume.test.ts (12 tests)
✓ tests/unit/date.test.ts (17 tests)
✓ tests/unit/muscle-group.test.ts (2 tests)
✓ tests/unit/weight.test.ts (4 tests)
✓ tests/unit/achievements.test.ts (20 tests)
✓ tests/unit/validation.test.ts (5 tests)

Test Files  8 passed (8)
     Tests  81 passed (81)
```

### ビルド（Next.js）
`npm run build` → 成功（型エラーなし、Lintエラーなし、全12ルートの静的/動的生成に成功）。`/workouts`ルートのFirst Load JSは111kB（route固有）/ 217kB（合計）で、Recharts導入前と比べて増加しているが、TrendChart/MuscleBalanceChartのみがClient Componentであり設計通り（ヒートマップ・自己ベスト・バッジはServer Componentのまま）。

### e2eテスト（Playwright）
未実施。理由: 依頼文の注意事項「本番Turso DBに接続した状態で書き込み系操作を絶対に行わないこと」に従い、ローカルSQLite接続であることの確認が必要な作業のため、本自動実装フェーズでは実施せず次フェーズ（QA）に委ねる。

## 全体サマリー
- 影響範囲: 14ファイル（設計書「2. 影響範囲」の全件）
- 設計通り完了: 14ファイル
- 部分完了・要相談: 0ファイル。ただし`npm install`の`postinstall`（`prisma generate`）が環境要因（稼働中devサーバーによるDLLロック）で失敗した点を上記「package.json / package-lock.json」節に記録した。schema.prisma未変更のため実装・ビルド・テストへの影響はない。
- 次フェーズ（QA）への申し送り:
  - detailed-design.md §6「テスト観点」T-01〜T-25を実施すること。特にT-13（JST日付境界ストリーク）・T-15（KG/LB混在自己ベスト）は単体テストで担保済みだが、実画面での目視確認も推奨。
  - T-24（Playwright e2e）は本フェーズで未実施。実行前に必ずローカルSQLite接続（`npm run dev:local`等）であることを確認し、本番Turso DBに書き込みが発生しないことを担保してから実施すること。
  - T-25（スマートフォン幅375px表示確認）は目視確認が必要なため、QAフェーズで実施すること。
  - `npm install`実行時に稼働中のdevサーバープロセスがPrismaクエリエンジンDLLをロックし`postinstall`が失敗する事象を確認した。今後同様の作業を行う場合は、事前にdevサーバーを一時停止するか、影響がないことを確認の上で許容すること。
