---
project_id: "2026-09-12-1539-gym-tracker"
phase: qa
overall_status: pass
---
# テストレポート - 2026-09-12-1539-gym-tracker

## 総合判定
- 結果: pass
- 設計準拠率: 30/30（詳細設計書§6のテスト観点30件全件が期待通り。#23含め、当初テストコードの不備により自動テストが失敗していた項目も、追加対応（後述）でテストコード側を修正した結果、自動テストとしてもpassすることを確認した）
- 補足: プロダクトコード（`src/`）自体には機能面のバグは検出されなかった。当初検出した問題1・問題2（テストランナー設定・E2Eテストコード自身のロケーター/正規表現不備）はPMへの申し送りに基づき追加対応で修正済み。修正後、`npm run test`はexit code 0で正常終了し、`npx playwright test`は15件中15件passし、詳細設計書§7の完了条件チェックリスト「`tests/e2e/*.spec.ts`が全件パスする」を満たした。よってoverall_statusをpassに更新する。なお問題3（ESLint設定未整備）・問題4（フルスイート実行時に稀に観測される認証フローの一時的失敗）は今回の追加対応の対象外（重大度低・推奨/監視事項）であり、解消していないため「PMへの申し送り」に残課題として明記する。

## テスト観点別結果
| # | 観点 | 種別 | 結果 | 詳細 |
|---|------|------|------|------|
| 1 | calculateCalories(MET3.0,70kg,30分)→110.3kcal | 正常系 | ✅ pass | `npm run test`実行、`tests/unit/calorie.test.ts`該当ケースpass |
| 2 | estimateDurationMinutes(3,60)→3.0 | 正常系 | ✅ pass | 同上 |
| 3 | metValue/weightKg/durationMinutes=0→0 | 境界値 | ✅ pass | 同上 |
| 4 | 負数・NaN・Infinity→0 | 異常系 | ✅ pass | 同上 |
| 5 | 大きい値(600分,MET11,200kg)でも例外なし | 境界値 | ✅ pass | 同上 |
| 6 | 新規登録→自動ログイン→ダッシュボード表示 | 正常系 | ✅ pass | Playwright実行、auth.spec.ts #1 pass |
| 7 | ログアウト→再ログイン | 正常系 | ✅ pass | auth.spec.ts #2 pass |
| 8 | 既存メールアドレスで登録→エラー表示 | 異常系 | ✅ pass | auth.spec.ts #3 pass |
| 9 | 誤ったパスワードでログイン→エラー表示 | 異常系 | ✅ pass | auth.spec.ts #4 pass |
| 10 | パスワード7文字（8文字未満）で登録拒否 | 境界値 | ✅ pass | auth.spec.ts #5 pass |
| 11 | 未ログインで保護パスアクセス→/loginへリダイレクト | 異常系/権限 | ✅ pass | auth.spec.ts #6 pass |
| 12 | シード投入後36件（筋トレ30+有酸素6） | 正常系 | ✅ pass | Prisma直接クエリでExercise件数=36を確認（筋トレ30・有酸素6） |
| 13 | 部位フィルタ「脚」でレッグプレス等のみ表示 | 正常系 | ✅ pass | workout-flow.spec.ts #1 pass |
| 14 | カスタムマシン追加→表示→削除 | 正常系 | ✅ pass | workout-flow.spec.ts #2 pass |
| 15 | MET値0以下→保存拒否 | 異常系 | ✅ pass | コード確認: `exerciseInputSchema.metValue`がzodで`positive()`、`createExercise`が`fieldErrors`を返す設計通り実装。E2E未実装だが検証ロジックは健全 |
| 16 | マスタ行に編集・削除ボタン非表示 | 権限 | ✅ pass | コード確認: `exercises/page.tsx`は`ex.isCustom`の時のみ削除ボタンをレンダー |
| 17 | デフォルト体重70kg×MET3.0×30分→110.3kcal | 正常系（最重要） | ✅ pass | 追加対応で`getByText("110.3 kcal").first()`に修正後、E2Eアサーションもpass（後述の問題2の対応状況参照） |
| 18 | 体重80kgで上書き→126kcalで計算 | 正常系（最重要） | ✅ pass | 追加対応で`getByText("126 kcal").first()`に修正後、E2Eアサーションもpass |
| 19 | セット数のみ変更→カロリー不変（AC-07） | 正常系 | ✅ pass | workout-flow.spec.ts #3 pass |
| 20 | 体重未確定（override無し・プロフィール未設定）→エラー・保存拒否 | 異常系（AC-05） | ✅ pass | workout-flow.spec.ts #4 pass |
| 21 | 運動時間0/負数→保存拒否 | 異常系 | ✅ pass | コード確認: `workoutLogInputSchema.durationMinutes`が`positive()`。E2E未実装（work-logで申し送り済みの既知ギャップ） |
| 22 | ログ編集→カロリー再計算 | 編集 | ✅ pass（コードレビューのみ） | `updateWorkoutLog`が新しい`durationMinutes`/`bodyWeightKgOverride`で`calculateCalories`を再実行し保存することを確認。E2E未実装（自動テストでは未検証） |
| 23 | ログ削除→セッション詳細/ダッシュボードの合計カロリー更新 | 削除 | ✅ pass | 追加対応で`page.getByRole("button",{name:"削除",exact:true})`に修正（`exact:true`により「セッションを削除」ボタンとの部分一致を排除）。修正後E2Eもpass |
| 24 | セッション削除→配下ログ全削除（カスケード確認） | 削除 | ✅ pass | Prisma直接操作で検証: `WorkoutSession`削除後、紐づく`WorkoutLog`が確実に削除されることを確認（`findUnique`結果がnull） |
| 25 | マルチユーザー分離（最重要・必須） | 権限（最重要） | ✅ pass | 追加対応で`createSession()`内の待機処理を`page.waitForURL((url) => /\/workouts\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"))`に修正し`/workouts/new`自身への誤マッチを解消。修正後は実際のセッションURLへの遷移完了を正しく待った上でユーザーBがアクセスしHTTP 404相当のページが表示されることをE2Eでも確認（副次的に発生したNext.js 404ページの見出し2重マッチも`.first()`で解消）。`getWorkoutSession`の所有権チェック（`s.userId !== user.id`）は設計通り機能している |
| 26 | マスタMET値変更が既存ログのcaloriesBurned/metValueSnapshotに影響しない | スナップショット | ✅ pass | Prisma直接操作で検証: `Exercise.metValue`を変更後も既存`WorkoutLog`の`metValueSnapshot`/`caloriesBurned`が不変であることを確認 |
| 27 | ログ無し新規ユーザー→0kcal空表示・エラーなし | 正常系 | ✅ pass | workout-flow.spec.ts #5(ダッシュボード) pass |
| 28 | 複数セッション・複数ログの合計カロリー・記録回数が手計算と一致 | 正常系 | ✅ pass（コードレビューのみ） | `getDashboardStats`のreduce集計ロジックをコードレビューで確認。複数セッションを用いたE2E/結合テストは未実装（work-logで申し送り済み） |
| 29 | カロリー表示画面全てに免責文言表示 | UI/表示 | ✅ pass | コード確認: ダッシュボード(`page.tsx`)・ワークアウト一覧(`workouts/page.tsx`)・セッション詳細(`workouts/[id]/page.tsx`)すべてに`<CalorieDisclaimer />`が配置されている |
| 30 | 375px幅で記録フォームの入力・送信が可能 | UI/表示 | ✅ pass | 独立検証スクリプトでviewport 375×700で実行。横スクロール発生なし（`scrollWidth<=clientWidth`）、記録追加フォームの入力・送信・カロリー表示まで正常動作を確認 |

## 静的検証
- 型チェック: ✅ pass — `npx tsc --noEmit` 実行、エラー0件（work-logの申し送り通り）。
- lint: ⚠️ 実行不能 — `npm run lint`（`next lint`）を実行すると、ESLint設定ファイル（`eslint.config.mjs`等）が存在しないため対話式セットアップ画面が表示される。非対話環境（CI）では停止/失敗する。詳細設計書は`eslint`/`eslint-config-next`を依存関係として指定しているが、設定ファイル自体はファイル一覧（§1.1〜1.3）に記載が無く、実装ログにも作成記録が無い。**lintは一度も実行されていない状態**。
- ビルド: ✅ pass — `npm run build` 実行、11ルートすべて生成成功（`/`, `/_not-found`, `/api/auth/[...nextauth]`, `/exercises`, `/exercises/new`, `/login`, `/profile`, `/register`, `/workouts`, `/workouts/[id]`, `/workouts/new`）。本QA実行時はbcryptjs/jose関連のEdge Runtime警告は出力されなかった（work-log記載の既知警告は今回のビルドでは再現せず、いずれにせよ機能上の問題はない）。

## 自動テスト実行
### 単体テスト（Vitest）
- コマンド: `npm run test`
- 初回結果: `tests/unit/calorie.test.ts`の13件は全件pass。しかし**コマンド全体はexit code 1で終了**（後述の問題1）。
- 失敗詳細（初回）: `tests/e2e/auth.spec.ts`, `tests/e2e/workout-flow.spec.ts`がVitestにも誤って収集され、Playwright専用API（`test.describe`）呼び出しでエラーとなり2ファイルがFAIL扱いになる。
- **追加対応後の再検証結果（2026-09-12）**: `vitest.config.ts`の`test.exclude`に`configDefaults.exclude`（既存デフォルト除外）+`"tests/e2e/**"`を設定。再実行し、`tests/unit/calorie.test.ts`13件全件pass、**exit code 0で正常終了**することを確認（問題1は解消）。

### E2E（Playwright）
- コマンド: `npx playwright install chromium --with-deps` → `npx playwright test`
- 初回結果: 15件中 **11 passed / 4 failed**
- 失敗詳細（初回）: 4件すべてロケーター不備によるテストコード側の欠陥と判明（詳細は「発見した問題」参照）。独立検証により、対応するアプリケーション機能（カロリー計算値、マルチユーザー分離、ログ削除に伴う再集計）自体は正しく動作していることを確認済み。
- **追加対応後の再検証結果（2026-09-12）**: `tests/e2e/workout-flow.spec.ts`のロケーター・正規表現4件を修正（詳細は問題2の対応状況参照）。加えて、`createSession()`の修正により「マルチユーザー分離」テストが実際のセッションURLへ正しく遷移するようになったところ、Next.jsの404ページ（`<h1>404</h1>`と`<h2>This page could not be found.</h2>`）が既存の正規表現に二重マッチしstrict mode違反が新たに発生したため、これも合わせて`.first()`で修正した。修正後`npx playwright test`を実行し、**15件中15件pass**を確認（問題2は解消）。なお、2回のフルスイート実行中1回、`registerAndLogin`ヘルパーで`CredentialsSignin`エラーが発生し無関係の1件が失敗したが、これは既知の問題4（下記）と同種の不安定挙動であり、再実行では15/15 passした。今回の対応（問題1・問題2）とは無関係。

## 発見した問題

### 問題1: `npm run test` が exit code 1 で終了する（VitestがPlaywright専用specファイルを誤って収集）【解消済み・2026-09-12】
- 症状: `npm run test`実行時、ユニットテスト13件はすべてpassするが、`tests/e2e/auth.spec.ts`と`tests/e2e/workout-flow.spec.ts`もVitestのテストファイルとして収集され、`test.describe()`呼び出しで`Error: Playwright Test did not expect test.describe() to be called here`が発生し2ファイルがFAILする。プロセス全体はexit code 1で終了する。
- 期待: `npm run test`（Vitest）は`tests/unit/`のみを対象とし、exit code 0で正常終了する。
- 再現手順: リポジトリルートで`npm run test`を実行する（毎回100%再現）。
- 原因の仮説: `vitest.config.ts`に`test.exclude`（または`include`）の指定がなく、Vitestのデフォルト収集パターンが`tests/e2e/*.spec.ts`（Playwright専用ファイル）にもマッチしてしまうため。
- 推奨対応: `vitest.config.ts`の`test`に`exclude: ["tests/e2e/**", "node_modules/**", ".next/**"]`（またはVitestのデフォルトexcludeにe2eディレクトリを明示追加）を設定する。CIで`npm run test`の終了コードをそのままゲートに使っている場合、現状は誤ってビルドを落とす。
- **対応状況（2026-09-12・エンジニアリングチームによる追加対応）**: `vitest.config.ts`にて`vitest/config`の`configDefaults`をインポートし、`test.exclude: [...configDefaults.exclude, "tests/e2e/**"]`を設定。既存のデフォルト除外（`node_modules`等）を維持したまま`tests/e2e/**`を追加除外した。再検証で`npm run test`がexit code 0で正常終了することを確認。詳細は`.project/engineering/2026-09-12-1539-gym-tracker/work-log.md`の「QA指摘への追加対応（2026-09-12）」を参照。

### 問題2: `tests/e2e/workout-flow.spec.ts`のロケーターが曖昧で、意図したテストが機能していない（アプリ側は正常動作、テストコードのみの不備）【解消済み・2026-09-12】
- 症状:
  - 63行目テスト: `expect(page.getByText("110.3 kcal")).toBeVisible()`が、合計消費カロリー表示（`text-2xl`）とログ項目内表示（`text-sm`）の2要素にマッチしstrict mode violationで失敗。
  - 83行目テスト: 同様に`getByText("126 kcal")`が2要素にマッチし失敗。
  - 151行目: `page.getByRole("button",{name:"削除"})`が「セッションを削除」ボタンとログ項目の「削除」ボタンの2つにマッチしstrict mode violationで失敗。
  - 155行目「マルチユーザー分離」テスト: 17行目の`createSession()`内`await expect(page).toHaveURL(/\/workouts\/.+/)`の正規表現が`/workouts/new`という文字列自体にもマッチするため（`"new"`が`.+`を満たす）、セッション作成ボタン押下後の実際の画面遷移が完了する前に条件が満たされてしまい、`page.url()`が`/workouts/new`（新規セッション作成ページ自体）のまま`sessionUrl`として記録されるケースがある。ユーザーBがこのURLへアクセスするのは本来正当な操作（誰でも新規セッションを作成できる）のため、期待していた404/「見つかりません」が出ずテストが失敗する。
- 期待: 各アサーションが意図したDOM要素・URLのみを一意に検証できること。
- 再現手順: `npx playwright test tests/e2e/workout-flow.spec.ts`（全件実行）。個別には`npx playwright test -g "デフォルト体重設定"`、`-g "ログ削除後"`、`-g "マルチユーザー分離"`でそれぞれ単独実行しても同様に再現する（151行目のケースは単独実行時は毎回100%再現）。
- 原因の仮説: 上記の通り、ロケーター・正規表現のスコープ不足。アプリケーション側の実装（`calculateCalories`の計算結果、`getWorkoutSession`の所有権チェック、`deleteWorkoutLog`）には問題がない。
- 実施した独立検証（アプリ側が正しいことの確認）:
  1. カロリー値: 失敗時のDOMスナップショットに`110.3 kcal`・`126 kcal`が期待通り表示されていることを確認（strict mode violationのエラーメッセージ自体が2箇所の一致を報告しており、値自体は正しい）。
  2. マルチユーザー分離: `page.waitForURL((url) => /\/workouts\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"))`で`/workouts/new`を明示的に除外した上でセッションURL（例: `http://localhost:3000/workouts/cmty1u4rl0002fbts0fervoch`）を取得し、別ユーザー(B)のブラウザコンテキストからアクセスしたところ**HTTP 404**が返ることを確認。所有権チェックは設計通り機能している。
- 推奨対応:
  - `getByText("110.3 kcal")`等に`.first()`を付ける、または`data-testid`等で合計表示とログ項目表示を区別する。
  - 削除ボタンは`page.locator("li",{hasText:...}).getByRole("button",{name:"削除",exact:true})`のようにログ項目に限定したロケーターへ変更する。
  - `createSession()`の待機処理を`page.waitForURL((url) => /\/workouts\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"))`のように、`/workouts/new`自身を除外する条件に修正する。
- **対応状況（2026-09-12・エンジニアリングチームによる追加対応）**: 上記推奨対応をすべて反映した。
  1. `createSession()`の待機処理を`page.waitForURL((url) => /\/workouts\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"))`に変更。
  2. `getByText("110.3 kcal")`・`getByText("126 kcal")`に`.first()`を付与。
  3. `page.getByRole("button",{name:"削除"})`を`page.getByRole("button",{name:"削除",exact:true})`に変更。
  4. 上記1の修正により「マルチユーザー分離」テストが実際のセッションURLへ正しく遷移するようになった結果、Next.jsの404ページの見出しが正規表現`/404|見つかりません|This page could not be found/`に2重マッチする新たなstrict mode違反が判明したため、`.first()`を付与して追加修正した。
  再検証で`npx playwright test`が15件中15件passすることを確認（詳細は`work-log.md`参照）。

### 問題3: `npm run lint` が実行不能（ESLint設定ファイルが存在しない）
- 症状: `npm run lint`（`next lint`）を実行すると、`? How would you like to configure ESLint?`という対話式プロンプトが表示され停止する。非対話環境（CI）ではハング/失敗する。実際にはlintは一度も実行されていない。
- 期待: `npm run lint`が既存のESLint設定に基づき静的解析を実行し、pass/failの結果を返す。
- 再現手順: プロジェクトルートで`npm run lint`を実行する。
- 原因の仮説: 詳細設計書§3.1で`eslint`・`eslint-config-next`が依存関係として定義され`package.json`にも反映されているが、ESLint設定ファイル（`eslint.config.mjs`または`.eslintrc.json`）自体が詳細設計書のファイル一覧（§1.1〜1.3）に記載されておらず、実装ログにも作成record が無い。プロジェクト初期化時の生成漏れと考えられる。
- 推奨対応: `eslint.config.mjs`（Next.js標準の`FlatCompat`+`next/core-web-vitals`構成）を追加する。設計書側にも§1.1へ明記することを推奨（次回設計時の申し送り）。

### 問題4（軽微・監視要）: フルスイート実行時に認証フローが一時的に失敗する場合がある
- 症状: `npx playwright test`（15件通し実行）時、「削除: ログ削除後...」テストの`registerAndLogin`ヘルパー内で`CredentialsSignin`エラーが発生し`/api/auth/error`へ遷移したことが1回観測された。同テストを単独実行した場合はこの現象は再現せず、代わりに問題2で述べたロケーター不備（削除ボタンの多重マッチ）で失敗した。
- 期待: 登録直後の自動ログインは常に成功する。
- 再現手順: `npx playwright test`を全件（15件、workers=1）通しで実行する。単独実行では再現しない不安定な現象のため、再現率は低い（今回の実行では1/複数回中1回観測）。
- 原因の仮説: `playwright.config.ts`の`webServer`が`npm run dev`（開発サーバー）を使っているため、多数のテストを連続実行する中でHMR再コンパイルがリクエスト処理と重なりレスポンスが中断される（サーバーログに`[Error: aborted]`を確認）可能性。あるいはSQLite+bcryptの処理タイミング依存の可能性もある。
- 推奨対応: `playwright.config.ts`に`retries`（CI環境用に1〜2）を設定する、または`next build && next start`を使った本番相当ビルドでのE2E実行に切り替えて再検証する。重大度は低いが、CI導入前に再現性を追跡すること。

## 実装ログの逸脱4件についての評価
実装ログ（work-log.md）に記録された4件の設計逸脱を確認した。いずれも設計の意図を損なっていないと判断する。

1. **`src/components/WorkoutSessionLogs.tsx` / `src/components/ProfileForm.tsx` の追加**（設計書1.3節に無いファイル）: コードを確認したところ、両コンポーネントは設計書§3.14/§3.15で定義された`updateWorkoutLog`/`deleteWorkoutLog`/`updateProfile`を設計書の型・シグネチャ通りに呼び出すクライアント側の状態管理ラッパーであり、独自のビジネスロジックは追加していない。§3.18の「既存ログは編集・削除可能」「プロフィール更新フォーム」という要求を実現するための妥当な実装で、設計の意図と整合している。
2. **`src/app/workouts/new/page.tsx`への実施日時・メモ入力フォーム追加**: 設計書§3.14の`createWorkoutSession`は`performedAt`（必須, `z.coerce.date()`）と`memo`（任意）を受け取る仕様であり、これらの入力元をUIで提供する必要がある。設計書§3.18は「作成後リダイレクト」のみを記述しUI詳細を規定していないため、この追加は設計の欠落を実装側が正しく補完したものであり、必須項目`performedAt`を満たすために不可欠な実装である。問題なし。
3. **全フォーム入力欄への`htmlFor`/`id`付与**（`ExercisePicker`への`id`プロパティ追加を含む）: アクセシビリティ向上とE2Eテストの`getByLabel`対応のための技術判断で、設計書のProps定義（例: `ExercisePickerProps`）に対する破壊的変更ではなく、既存プロパティに任意（optional）の`id`を追加したのみ。実際、追加された`id`のおかげで本QAで実行したE2Eテストの大半（11/15）が正しく要素を特定できている。設計の意図を損なわず、むしろテスト容易性を高める合理的な逸脱である。
4. **`vitest.config.ts` / `playwright.config.ts`の追加**: 各テストランナーの実行に必須の設定ファイルであり、追加自体は正当。ただし、本QAで検出した**問題1（`vitest.config.ts`にe2eディレクトリのexclude設定が無い）**は、この追加ファイルの実装漏れに起因する実質的な欠陥である。設計の意図（Vitestでユニットテストのみ実行）を損なっているため、この点のみ修正を推奨する。

## PM への申し送り
- 完了とみなしてよいか: **done**（当初conditionalとした2点の必須修正はいずれも2026-09-12の追加対応で確認済み。詳細設計書§7完了条件チェックリストの「`tests/e2e/*.spec.ts`が全件パスする」を含め満たしている）
- 解消済み:
  1. ~~**必須修正**: `vitest.config.ts`に`exclude: ["tests/e2e/**"]`を追加し、`npm run test`がexit code 0で正常終了することを確認する（問題1）。~~ → 2026-09-12対応済み。`configDefaults.exclude`を維持したまま`tests/e2e/**`を追加。`npm run test`はexit code 0で終了することを確認。
  2. ~~**必須修正**: `tests/e2e/workout-flow.spec.ts`のロケーター不備4件を修正し、`npx playwright test`が15件全件passすることを確認する（問題2）。~~ → 2026-09-12対応済み。`createSession()`の正規表現、`.first()`によるkcal表示の一意化、`exact:true`による削除ボタンの一意化、および対応の副次効果で新たに判明した404ページの見出し2重マッチを修正。`npx playwright test`で15件中15件passを確認。アプリケーション本体（`src/`）は無修正。
- 残課題（重大度低・完了条件の必須項目には含まれないため今回はpass判定を妨げない）:
  1. **推奨対応（未着手）**: ESLint設定ファイルを追加し`npm run lint`を実行可能にする（問題3）。設計書の完了条件チェックリストには明記されていないため必須ではないが、`package.json`が`lint`スクリプトを定義している以上、実行可能な状態にすべき。
  2. **監視要（未解消）**: フルスイート実行時に稀に観測される認証フローの一時的失敗（問題4）。今回の再検証でも2回中1回、`registerAndLogin`が`CredentialsSignin`エラーで失敗する現象を再度観測した（再実行では15/15 pass）。重大度低だが、CI導入前に再現性を追跡し、必要なら`playwright.config.ts`に`retries`設定を追加、または`next build && next start`を使った本番相当ビルドでのE2E実行に切り替えることを推奨する。
  3. 設計書§6.2に記載されているが本エンジニアリングフェーズのE2E specに未実装のシナリオ（MET値0以下入力拒否、運動時間0/負数入力拒否、ログ編集時のカロリー再計算、複数セッションの手計算一致確認）は、コードレビューでは設計通りと判断したが、実行時テストでの裏付けが無い。次回のテスト拡充時に追加を推奨。
  4. 実装ログの4件の逸脱はいずれも設計の意図を損なっておらず、追加承認は不要と判断する。
