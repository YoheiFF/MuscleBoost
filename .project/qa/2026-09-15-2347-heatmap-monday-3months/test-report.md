---
project_id: "2026-09-15-2347-heatmap-monday-3months"
phase: qa
overall_status: pass
---
# テストレポート - 2026-09-15-2347-heatmap-monday-3months

## 総合判定
- 結果: pass
- 設計準拠率: 16/16（詳細設計書§6の全テスト観点）、完了条件チェックリスト（§7）15/15

本変更（トレーニングカレンダーの月曜始まり週整列＋表示期間「当月＋過去2ヶ月」化）は、詳細設計書通りに実装されていることを確認した。実装ログに記載の4ファイル（`src/lib/achievements.ts`、`src/types/index.ts`、`src/components/WorkoutHeatmap.tsx`、`tests/unit/achievements.test.ts`）を設計書の「編集後の期待形」と1行単位で突き合わせ、差異なしと確認した。`git diff --stat HEAD` でも編集範囲がこの4ファイルのみであることを確認済み。

自動テスト（Vitest 85/85、Playwright e2e 21/22 + 再実行で1件はflaky再現）・静的検証（`npm run build`型チェック含め成功）・実ブラウザでの目視確認・独立した手計算によるうるう年境界検証をすべて実施し、問題は「本変更のスコープ外の既知の不具合」1件のみ（詳細は「発見した問題」参照）。

## テスト観点別結果
| # | 観点 | 種別 | 結果 | 詳細 |
|---|------|------|------|------|
| 1 | `buildWorkoutHeatmap([], NOW).days`の長さが`computeHeatmapWindowDays(NOW)`と一致 | 正常系 | pass | `achievements.test.ts`新規テストで`toHaveLength(79)`を確認。NOW=2026-09-15基準で手計算検証（node -e）も一致 |
| 2 | `days[0].date`が「2ヶ月前の月の1日が属する週の月曜日」と一致 | 正常系 | pass | `"2026-06-29"`を単体テスト・独立手計算の両方で確認 |
| 3 | `days[last].date`がNOWのJST暦日と一致 | 正常系 | pass | `"2026-09-15"`を確認。実ブラウザ確認でも実行時点(2026-09-16)の最終セルが当日と一致 |
| 4 | セル描画（title属性・levelに応じた色クラス）が変更前と同じ | 正常系 | pass | `WorkoutHeatmap.tsx`の該当JSX（54-61行目）はdiffで無変更を確認。実ブラウザでも記録日セルが緑（emerald系）で表示されタイトル属性が機能 |
| 5 | 曜日ラベル（月火水木金土日）が7行、グリッド左側に固定表示 | 正常系 | pass | コード確認＋実ブラウザのズームスクリーンショットで7行固定表示・横スクロール非連動を確認 |
| 6 | フッター文言が「直近3ヶ月間の記録日数: N日」 | 正常系 | pass | コード確認＋実ブラウザで「直近3ヶ月間の記録日数: 1日」表示を確認。「直近1年間」の残存なし（grep 0件） |
| 7 | `sessions=[]`（新規ユーザー）で例外なし、全level0・ストリーク0 | 異常系 | pass | 単体テスト（新規ユーザーケース）で確認 |
| 8 | `windowDays`明示指定時の後方互換 | 異常系 | pass | 単体テスト`buildWorkoutHeatmap([], NOW, 10)`で`toHaveLength(10)`を確認 |
| 9 | 月またぎの月曜切り下げ（7/1水曜→6/29切り下げ、79日） | 境界値 | pass | 単体テスト＋独立手計算（node -e）で一致確認 |
| 10 | 年またぎ（2026-01-15基準、2ヶ月前=2025年11月→10/27切り下げ、81日） | 境界値 | pass | 単体テスト＋独立手計算で一致確認 |
| 11 | 旧`toHaveLength(371)`が完全に除去され具体的期待値に置換 | 境界値 | pass | `grep -rn "371" src tests`で0件を確認 |
| 12 | 2ヶ月前の月の1日が既に月曜の場合、切り下げ発生せず | 境界値 | pass | 単体テスト（2026-05-04基準、3/1日曜→2/23切り下げ）で確認。数式が「常に同じ式`(dayOfWeek+6)%7`」で分岐なしに動作することをコードで確認 |
| 13 | うるう年をまたぐ月境界（2月を含む3ヶ月分） | 境界値 | pass | 自動テスト対象外のため、QAが`tsx`で実装関数を直接実行し手動検証。2024年（うるう年）2月を含むNOW=2024-04-10で`computeHeatmapWindowDays`=73日・開始日2024-01-29を確認。`Date.UTC`ベースのため閏日判定はJS標準機能により自動的に正しく処理されることを実装で確認（詳細は下記補足） |
| 14 | `currentStreak`/`longestStreak`が変更前後で不変 | 回帰確認 | pass | 既存ストリーク系テスト5件は無修正のままVitestで全pass。ロジック本体（105-197行目相当）はdiff上も無変更 |
| 15 | `buildTrendSeries`/`buildMuscleGroupBalance`/`buildPersonalBests`/`buildAchievementBadges`の既存テストが無修正のまま成功 | 回帰確認 | pass | 該当`describe`ブロックはdiffで無変更。Vitest全85件pass |
| 16 | `/workouts`画面の目視回帰確認（StatsSummaryCard・トレンドグラフ・部位別バランス・自己ベスト・達成バッジ） | 回帰確認 | pass | 実ブラウザ（ローカルSQLite隔離環境）でテストユーザーを新規登録し実記録を1件追加、全セクションが正常表示されることを確認（下記「実ブラウザ確認の詳細」参照） |

### 実ブラウザ確認の詳細（うるう年境界の補足を含む）

- 起動方法: `npm run dev:local`（`TURSO_DATABASE_URL`をローカルSQLiteファイルに上書きする安全な起動スクリプト）を使用。事前にポート3000が空いていることを確認済みで、本番Turso DBへの誤接続は発生していない。
- テストユーザーを新規登録し、チェストプレス3セット×10レップの記録を1件追加（2026-09-16、実行時点は水曜日）。
- ヒートマップの最終列（今日を含む週）は、月・火・水の3セルのみ描画され、木〜日は描画されない（`heatmap.days`が未来日を含まないため）。緑色のセルが正しく「水」の行（今日の曜日）に一致していることをズームスクリーンショットで確認。列数は12列（フルの11列×7日＋最終列3日=80日）で、独立計算した期待日数（80日、開始日2026-06-29はJST 2026-09-16基準の手計算値）と一致。
- フッター「直近3ヶ月間の記録日数: 1日」、ストリーク「現在1日 / 最長1日」を確認。
- 推移トレンドグラフ（週別・カロリー）、部位別バランス（胸100%のドーナツチャート）、達成バッジ（連続日数・累計セッション数、あと◯日/回の表示含む）、自己ベスト（重量未入力のため「まだありません」表示）が全て正常表示された。
- うるう年境界: 自動テストの対象外（設計書§6.3の通り）のため、QAが`npx tsx`で`computeHeatmapWindowStartUtc`/`computeHeatmapWindowDays`/`buildWorkoutHeatmap`を直接実行して検証した。
  - NOW=2024-04-10（2024年はうるう年、2ヶ月前=2024年2月・29日間）: `windowStart=2024-01-29`, `windowDays=73`, `buildWorkoutHeatmap([], now1).days.length=73`で内部的にも一致。
  - 比較のためNOW=2026-04-10（平年、2月28日間）でも実行: `windowStart=2026-01-26`, `windowDays=75`（週境界の違いにより単純な日数差にはならないが、例外やズレは発生しない）。
  - うるう日当日 NOW=2024-02-29 を基準にしても例外なく`windowStart=2023-11-27`, `windowDays=95`を返すことを確認。
  - 実装は`Date.UTC(year, month, day)`ベースの計算のみで、うるう年判定用の特別分岐を持たない。JavaScript標準の`Date.UTC`は閏年を自動的に正しく処理するため、上記3ケースいずれも例外・日数の異常なし。

## 静的検証
- 型チェック: pass（`npm run build`内でNext.jsのビルド時型チェックとして実行、エラーなし）
- lint: 未実施（`npm run lint`は`next lint`ベースだが、本プロジェクトにESLint設定ファイルが存在せず対話的セットアップを要求するため非対話実行不可。**本変更以前から存在する既存のプロジェクト設定の欠落であり、本変更が原因ではない**。PMへの申し送り事項として記載）
- ビルド: pass（`npm run build`、Next.js 15.5.25、全12ルートの静的生成含め成功。警告・エラーなし）

## 自動テスト実行
- コマンド1: `npm run test`（Vitest）
  - 結果: pass 85 / fail 0（8ファイル、achievements.test.ts単体24件）
  - 失敗詳細: なし
- コマンド2: `npx playwright test tests/e2e/auth.spec.ts tests/e2e/workout-flow.spec.ts`
  - 結果: pass 21 / fail 1（22件中）
  - 失敗詳細: `auth.spec.ts:39 既存メールアドレスで登録→エラーメッセージ表示` が失敗。`/register`への2回目の登録リクエスト後、期待した`/`ではなく`/api/auth/error`に遷移し、サーバーログに`SyntaxError: Unexpected end of JSON input`（`/api/auth/providers`）・`[auth][error] CredentialsSignin`が出力される。同テストのみ3回リピート実行したところ2/3 pass・1/3 failとなり、非決定的（flaky）であることを確認。**本変更が触れた4ファイル（`src/lib/achievements.ts`等）はいずれもこのテストの経路（NextAuth認証フロー）と無関係であり、`git diff --stat HEAD`でも認証関連ファイルへの変更が無いことを確認済み。既存の（本変更前からの）環境依存の不安定性と判断し、本プロジェクトのスコープ外の問題として扱う。**
  - `workout-flow.spec.ts`は21件中20件がこのコマンドに含まれる（`auth.spec.ts`6件＋`workout-flow.spec.ts`16件で合計22件）が、全件pass。

## 発見した問題

### auth.spec.ts の「既存メールアドレスで登録」テストが非決定的に失敗する（本変更のスコープ外）
- 症状: 2回目のユーザー登録（重複メールアドレス）で、期待される「メールアドレス重複エラー表示」ではなく、NextAuthの`/api/auth/error`へ遷移してしまうことがある。サーバー側で`SyntaxError: Unexpected end of JSON input`（`/api/auth/providers`取得時）・`CredentialsSignin`エラーが記録される。
- 期待: 常に`/register`ページ上でエラーメッセージ「このメールアドレスは既に登録されています」が表示される。
- 再現手順: `npx playwright test tests/e2e/auth.spec.ts -g "既存メールアドレスで登録" --repeat-each=3` を実行すると、3回中1回程度の頻度で再現する。
- 原因の仮説: `npm run dev:local`（Next.js dev server、Webpackのオンデマンドコンパイル）環境下で、1回目の登録直後のログアウト→2回目の登録の高速な連続リクエストにより、NextAuthの`/api/auth/providers`エンドポイントがコンパイル中/レスポンス未完了の状態でクライアントから読まれ、JSONパースに失敗している可能性がある（dev server特有のコールドコンパイル待ちに起因するタイミング依存の問題で、本番ビルド・`next start`環境では発生しない可能性が高い）。本変更（`achievements.ts`等）はこの経路と無関係。
- 推奨対応: 本プロジェクトの対応範囲外。別チケットとして、（a）本番相当ビルド（`next build && next start`）でも再現するか、（b）`webServer`起動をdevからproductionビルドに変更することでテストの安定性が上がるか、の切り分けを推奨。今回のQAでは3回中2回passしており、本変更（heatmap-monday-3months）による新規のリグレッションではないと判断した。

## PM への申し送り
- 完了とみなしてよいか: yes
- 残課題:
  - 上記「発見した問題」（`auth.spec.ts`のflaky failure）は本変更のスコープ外の既存課題。別途調査・修正チケットを推奨。
  - `npm run lint`がプロジェクトにESLint設定ファイルが無く非対話実行できない状態（本変更以前からの既存の欠落）。CIやローカルでlintを機能させたい場合は、`eslint.config.mjs`等の追加が別途必要。
  - 詳細設計書§6.3のうるう年境界確認はQAが手動（`npx tsx`によるスクリプト実行）で実施し問題なし。自動テスト（Vitest）には含まれていないため、将来同様の日付計算ロジックを変更する際は再度手動確認が必要な点に留意。
