---
project_id: "2026-09-15-1023-same-day-session-continuity"
phase: qa
overall_status: pass
---
# テストレポート - 2026-09-15-1023-same-day-session-continuity

## 総合判定
- 結果: pass（PMによる修正確認後）
- 設計準拠率: 22/22（QA一次判定は21/22 partialだったが、指摘された`tests/e2e/workout-flow.spec.ts`および`detailed-design.md`§3.9の期待値誤り（`50.6 kcal`→`47.2 kcal`）をPMが修正し、該当テスト単独・`workout-flow.spec.ts`全16件・`auth.spec.ts`全6件（計22件）を`http://localhost:3000`のローカルSQLite環境で再実行し全件passを確認した。実装（9ファイル）自体は当初から設計書の記述と完全一致していることをコードdiffで確認済み）

## PM追記（2026-09-15、QA一次判定後）
- 修正: `tests/e2e/workout-flow.spec.ts:347`と`detailed-design.md`§3.9の`"50.6 kcal"`を`"47.2 kcal"`に修正（23.6kcal×2件=47.2kcalが正しい）。
- 再検証: ポート3000の`dev:local`サーバー（本セクション下部「補足」で指摘された本番DB接続の疑いがあったプロセスは、PMが別途ユーザー要望対応の過程で既に停止・`dev:local`で再起動済みであることを確認済み）に対し、`npx playwright test tests/e2e/workout-flow.spec.ts`（16件）・`tests/e2e/auth.spec.ts`（6件）を実行し、計22件全passを確認した。
- 以上により、QAが完了条件とした2点のうち(1)期待値修正は完了。(2)ポート3000の本番DB接続懸念は別途解消済みであることを確認したため、総合判定を pass に更新する。

## 事前確認: e2eテスト実行環境の安全性（重要）
作業ログのPM追記に従い、e2eテスト実行前に接続先DBを確認した。

- `playwright.config.ts` は `webServer.command: "npm run dev:local"` に修正済みであることを確認（設計通り）。
- `scripts/dev-local.js` は `TURSO_DATABASE_URL` をローカルSQLiteファイルへ明示的に上書きし、`TURSO_AUTH_TOKEN` を空にする実装であることをコードで確認（本番Turso誤接続防止策として妥当）。
- **しかし実行前にポート3000の使用状況を調査したところ、危険な状態を発見した。** `netstat`でポート3000をLISTENING中のプロセス（PID 10200）の起動元を遡ったところ、`cmd.exe /d /s /c "next dev"` であり、これは`package.json`の`"dev": "next dev"`（＝`.env`のデフォルト値である本番Turso DBに接続する設定）そのものだった。`dev:local`（`node scripts/dev-local.js`）経由の起動ではなかった。
  - `playwright.config.ts`は`reuseExistingServer: true`のため、このまま`npm run test:e2e`を実行すると、この危険な既存プロセス（本番Turso DB接続）にe2eの書き込み操作（ユーザー登録・セッション作成・削除等）が実行されてしまう状態だった。
  - この既存プロセスをQAの権限で終了させる操作（`taskkill`）は、Claude Codeの権限システムにより「他のワークロードへの干渉」として拒否された（ユーザーが別作業で使用中の可能性があるため、QAの判断でkillしない設計になっている）。
  - そのため、**この危険な既存プロセス（ポート3000, PID 10200）には一切触れず**、QA独自の隔離環境を用意した:
    1. プロジェクト全体を一時ディレクトリへコピー（`node_modules`はジャンクションで共有、`.next`・`.git`は除外）し、`.next`ビルドキャッシュの競合を回避。
    2. その隔離コピー内で `next dev -p 3100` を、`TURSO_DATABASE_URL` をローカルSQLiteファイルへ明示的に上書きし `TURSO_AUTH_TOKEN` を空にした環境変数で直接起動（本番Turso DBに接続する経路が一切無いことを確認した上で起動）。
    3. Playwright用の一時設定ファイル（`baseURL: http://localhost:3100`, `reuseExistingServer: true`）でこの隔離サーバーにのみ向けてe2eテストを実行した。
    4. テスト完了後、隔離サーバープロセスを停止し、一時ディレクトリ・一時設定ファイルを削除して後片付けした（リポジトリには一切残っていないことを`git status`で確認済み）。
  - **PMへの重要な申し送り**: ポート3000で「本番Turso DB接続の`next dev`」が現在も稼働中の可能性がある（QAはkillしていない）。誰かが誤ってこのプロセスに対して書き込み系のe2eテストや手動操作を行うと本番DBを汚染するリスクが残っている。ユーザー自身の判断でこのプロセスを終了するか、`dev:local`で起動し直すことを推奨する。

## テスト観点別結果
| # | 観点 | 種別 | 結果 | 詳細 |
|---|------|------|------|------|
| T-01 | 当日セッション無しユーザーが「①今日の記録をする」→`/workouts/today`→新規セッション詳細へ | 正常系 | pass | 隔離e2e「同じ日に複数回セッションを開始しても…」テスト前半で確認（`/workouts/today`→`/workouts/<id>`遷移、記録追加成功） |
| T-02 | 同日2回目の「①今日の記録をする」で既存セッションに合流し、先の記録が見える | 正常系 | pass | 同テストで`firstSessionUrl`と2回目遷移後のURLが一致、`23.6 kcal`が表示され続けることを確認 |
| T-03 | 合流後に記録追加すると合計カロリー・ボリュームが再計算される | 正常系 | fail（期待値の誤り） | 実際の挙動は正しい（2件目追加後、合計消費カロリーは`47.2 kcal`と正しく再計算されて表示された）。しかし設計書§3.9の新規テストコード上の期待値が`50.6 kcal`となっており誤り（23.6kcal×2の正しい合計は47.2kcal）。「発見した問題」参照 |
| T-04 | `/workouts/new`から「今日」の日時でfind-or-createが働き当日セッションに合流する | 正常系 | pass（コードレビュー） | `createWorkoutSession`は`resolveOrCreateSessionForDay`を経由し`/workouts/today`と全く同じロジックを使うため、`performedAt`が今日ならT-02と同じ挙動になることをコードで確認。専用の自動テストは無い（設計書§3.9も新規テスト追加はT-01/T-02/T-08/T-09相当の2件のみで、本観点は自動化対象外） |
| T-05 | `/workouts/new`で当日以外の過去日付を指定すると新規セッションが作られる | 正常系 | pass（コードレビュー） | `resolveOrCreateSessionForDay`は`performedAt`のJST暦日で検索するため、当日以外の日付なら別セッションになることをロジックで確認。自動テストは未実装（設計書スコープ外） |
| T-06 | 同じ過去日付を再度指定するとメモは反映されず既存セッションに合流 | 正常系 | pass（コードレビュー） | `resolveOrCreateSessionForDay`は`existing`が見つかった場合memoを無視する実装（`create`分岐に到達しない）ことをコードで確認。自動テストは未実装（設計書スコープ外） |
| T-07 | セッション統合後も合計カロリー等の集計表示が正しい | 正常系 | pass | 既存回帰e2e全件および新規テストの中間アサーションで、複数ログ集計値が正しく表示されることを確認（T-03の期待値記述ミスを除く） |
| T-08 | 削除確認ダイアログでOK→削除され`/workouts`へ | 正常系 | pass | 新規e2e「セッション削除時に確認ダイアログが表示され…」の後半（accept）で確認 |
| T-09 | 削除確認ダイアログでキャンセル→削除されず画面そのまま | 正常系 | pass | 同テスト前半（dismiss）で確認 |
| T-10 | 未ログインで`/workouts/today`に直接アクセス→`/login`にリダイレクト | 異常系 | pass | 隔離サーバーに対し`curl`で直接検証。`307 /login?callbackUrl=%2Fworkouts%2Ftoday`を確認 |
| T-11 | DBエラー時にNext.js標準エラー画面が表示されクラッシュしたまま放置されない | 異常系 | not tested | 設計書内で「結合テストレベル、可能であれば」と明記された任意項目。今回のQAでは自動化しておらず未実施（`resolveOrCreateSessionForDay`はcatchしない設計のため、Next.jsのエラーバウンダリに委ねる方針自体はコードレビューで確認済み） |
| T-12 | 他ユーザーの当日セッションが誤って再利用されない | 異常系 | pass | `resolveOrCreateSessionForDay`の`where`に`userId`が含まれることをコードで確認。既存の「マルチユーザー分離」e2eテストも隔離環境で pass |
| T-13 | JST 0:00ちょうどが当日開始として扱われる | 境界値 | pass | `tests/unit/date.test.ts`（Vitest）で確認 |
| T-14 | JST 23:59:59.999が前日に属し翌日に含まれない | 境界値 | pass | 同上 |
| T-15 | 月末月初をまたぐ場合の暦日判定 | 境界値 | pass | 同上 |
| T-16 | 年末年始をまたぐ場合の暦日判定 | 境界値 | pass | 同上 |
| T-17 | システム時刻操作によるJST日跨ぎでの新規セッション作成（手動） | 境界値 | not tested（設計許容） | 設計書で「自動化が難しければ設計上の期待動作としてQA記録に明記するに留めてよい」と明記。今回は自動化せず。`getJstDayRangeUtc`の単体テスト（T-13〜16）と`resolveOrCreateSessionForDay`のロジックから、日付が変われば別セッションになることは論理的に保証されている |
| T-18 | 同一JST暦日内の複数回ログ追加が同一セッションに集約される | 境界値 | pass | T-02/T-03のe2eテストの中間ステップ（同日内で2回に分けて記録追加）で確認 |
| T-19 | `npm run build`が型エラーなく成功する | 回帰確認 | pass | 隔離環境ではなくプロジェクト本体で`npm run build`実行。型チェック含め成功。`npx tsc --noEmit`でも別途0エラーを確認 |
| T-20 | `npm run test`（Vitest）が全件成功する | 回帰確認 | pass | 7ファイル・51テスト全pass（`tests/unit/date.test.ts`の新規7件含む） |
| T-21 | `npm run test:e2e`（Playwright）が全件成功する | 回帰確認 | fail | 隔離環境で22件中21件pass、1件fail（T-03と同一原因＝設計書のテスト期待値誤り）。実装の不具合ではない |
| T-22 | `tests/e2e/auth.spec.ts`等スコープ外テストに新規の失敗が発生していない | 回帰確認 | pass | 隔離環境で`auth.spec.ts`6件全pass、`workout-flow.spec.ts`内のスコープ外テスト（マシンマスタ2件、トップ画面2件）も全pass |

## 静的検証
- 型チェック: pass（`npx tsc --noEmit` エラー0件。`npm run build`内の型チェックも成功）
- lint: 未実施（`npm run lint`＝`next lint`が本プロジェクトに未設定のESLint設定の対話的初期化を要求し、非対話環境では完了できなかった。本プロジェクトに`.eslintrc`等の設定ファイルが存在しないのは今回の変更以前からの既存状態であり、本プロジェクトのスコープ外の問題と判断。PMへの申し送り事項とする）
- ビルド: pass（`npm run build`成功。`/workouts/today`ルートが正しく生成されていることを確認。`prisma/schema.prisma`の変更なし＝マイグレーション未発生も確認）

## 自動テスト実行
- コマンド: `npm run test`（Vitest）
- 結果: pass 51 / fail 0（7ファイル）
- 失敗詳細: なし

- コマンド: `npx playwright test`（隔離環境: `http://localhost:3100`、ローカルSQLite接続、プロジェクトの一時コピー上で実行）
- 結果: pass 21 / fail 1（22件）
- 失敗詳細: 「同じ日に複数回セッションを開始しても、同一セッションに記録が合流する」テストの最終アサーション`expect(page.getByText("50.6 kcal")).toBeVisible()`がタイムアウト。実際の画面には`47.2 kcal`が表示されていた（ページスナップショットで確認）。詳細は「発見した問題」を参照。

## 発見した問題

### 新規e2eテストケースの期待値計算誤り（design/実装は設計書通りだが設計書自体の数値が誤り）
- 症状: `tests/e2e/workout-flow.spec.ts`の「同じ日に複数回セッションを開始しても、同一セッションに記録が合流する」テストが、最後のアサーション`await expect(page.getByText("50.6 kcal")).toBeVisible();`（詳細設計書 `detailed-design.md` §3.9 行573付近および実装ファイル同箇所）で失敗する。
- 期待: 同一セッションに23.6kcal相当のログ（MET5.5×70kg×3.5分×1.05＝23.58125kcal、表示丸め23.6kcal）を2件追加した場合の合計消費カロリーは、23.58125×2＝47.1625を小数第1位に丸めた **47.2 kcal** になるべき（`listWorkoutSessions`/`getWorkoutSession`の`Math.round(sum*10)/10`ロジックは本プロジェクトで変更しておらず、既存の正しい丸め処理のまま）。
- 再現手順:
  1. QA隔離環境（ローカルSQLite、`http://localhost:3100`）でユーザー登録しデフォルト体重70kgを設定
  2. `/workouts/today`経由でチェストプレス（MET5.5、3セット×10レップ）を1件記録（23.6kcal表示、セッションURLを記録）
  3. `/profile`に一度遷移後、再度`/workouts/today`にアクセス（同一セッションURLに合流することを確認）
  4. 同じ内容（チェストプレス、3セット×10レップ）をもう1件記録
  5. 画面上の「合計消費カロリー」表示を確認すると`47.2 kcal`であり、テストが期待する`50.6 kcal`とは一致しない
- 原因の仮説: 詳細設計書§3.9のテストコード内のコメント「2件目を追加すると、同一セッション内に2件の記録が積み上がる（合計 50.6kcal）」および対応するアサーション値`"50.6 kcal"`が、設計時点での計算ミスである（23.6kcal×2=47.2kcalが正しく、50.6kcalという数値の根拠が設計書中に見当たらない）。実装エージェントは設計書のテストコードを「そのまま新規作成」する方針（work-log.md記載）で忠実に転記したため、設計段階の誤りがそのままテストコードに引き継がれた。アプリケーション本体（`resolveOrCreateSessionForDay`・カロリー集計ロジック）自体に不具合はない。
- 推奨対応: `tests/e2e/workout-flow.spec.ts`の該当行を次のように修正する。
  ```ts
  await expect(page.getByText("47.2 kcal")).toBeVisible(); // 合計消費カロリー表示（23.6kcal × 2件 = 47.2kcal）
  ```
  あわせて詳細設計書`detailed-design.md`§3.9のコメント「（合計 50.6kcal）」も「（合計 47.2kcal）」に修正し、設計書と実装の整合を取ることを推奨する（今後同一設計書を再利用する際の再現性のため）。

### 補足（バグではないが申し送り事項）: ポート3000に本番DB接続の`next dev`が現在も稼働中の可能性
- 症状: QA開始時点でポート3000を占有していたプロセスは`npm run dev`（＝本番Turso DB接続）経路で起動されており、`dev:local`ではなかった。
- 期待: 開発中に起動しっぱなしにするサーバーは常に`npm run dev:local`であるべき（`.env`のデフォルトが本番DBのため）。
- 再現手順: 任意のタイミングで`netstat -ano`でポート3000のPIDを特定し、`Get-CimInstance Win32_Process`でその祖先プロセスの`CommandLine`を辿ると`cmd.exe /d /s /c "next dev"`が見つかる。
- 原因の仮説: 過去のセッションやユーザー自身の手動操作で`npm run dev`（`dev:local`ではない方）を起動したまま放置されている可能性。
- 推奨対応: ユーザー自身でこのプロセスを確認し、必要なら終了して`dev:local`で起動し直すことを推奨する（QA権限では安全のためkillできない設計になっている）。

## 設計書の曖昧さ
- 特になし。詳細設計書は関数シグネチャ・処理フロー・エラー処理まで具体的に記述されており、実装との対応関係を機械的に検証できた。唯一の問題は上記「発見した問題」に記載した新規e2eテストの期待値の単純な計算ミスであり、仕様解釈の曖昧さではない。

## PM への申し送り
- 完了とみなしてよいか: conditional
  - 条件: `tests/e2e/workout-flow.spec.ts`内の`"50.6 kcal"`を`"47.2 kcal"`に修正し（設計書側の該当箇所も合わせて修正）、修正後に該当テストが単独でpassすることを確認すること。実装本体（9ファイル中、テストファイル以外の8ファイル）は設計書通りで機能面の問題は無い。
- 残課題:
  1. `tests/e2e/workout-flow.spec.ts`の期待値誤り（`50.6 kcal`→`47.2 kcal`）の修正。
  2. ポート3000で本番Turso DB接続の`next dev`が稼働中である可能性がある件、ユーザーへの確認・後始末（QA権限では対応不可）。
  3. `npm run lint`がESLint未設定のため対話プロンプトで止まる件（本プロジェクトの既存課題。今回のプロジェクトスコープ外だが、CI等で`next lint`を使う場合は事前に非対話でのESLint設定完了が必要）。
  4. T-11（DBエラー時のNext.js標準エラー画面確認）・T-17（システム時刻操作によるJST日跨ぎの手動確認）は設計書が明示的に許容する通り自動化未実施のまま。
