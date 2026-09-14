---
project_id: "2026-09-14-1351-training-volume"
phase: qa
overall_status: pass
---
# テストレポート - 2026-09-14-1351-training-volume

## 総合判定
- 結果: pass
- 設計準拠率: 14/14（詳細設計書 §5 テスト観点）／完了条件チェックリスト §6 は 10/10 項目すべて充足

## 実装ファイルとの突き合わせ結果（要約）
以下の全ファイルについて、詳細設計書 §2 の「編集後の期待形」とリポジトリ上の実ファイルを1行単位で突き合わせ、**完全一致**を確認した。差異なし。

| ファイル | 確認結果 |
|---|---|
| `src/lib/volume.ts` | 新規作成。`calculateVolumeKg`・`LB_TO_KG_FACTOR`(0.45359237)を設計書§2.1と全文一致で実装。null/0/負数/NaN/Infinityの防御ロジック順序も設計書通り |
| `src/types/index.ts` | `WorkoutLogDTO`の`caloriesBurned`直後に`volumeKg: number`を追加。コメントも設計書通り |
| `src/app/actions/workouts.ts` | import追加。`addWorkoutLog`/`updateWorkoutLog`/`getWorkoutSession`の3箇所で`calculateVolumeKg()`を呼び出し。Prismaの`create`/`update`の`data`オブジェクトには`volumeKg`を含めていない（DB非保存を確認）。`createWorkoutSession`/`deleteWorkoutLog`/`deleteWorkoutSession`/`listWorkoutSessions`/`getDashboardStats`は無変更 |
| `src/components/WorkoutLogItem.tsx` | `log.weightValue === null`で分岐し「ボリューム: -（重さ未入力）」、非nullなら`{log.volumeKg} kg`＋LBの場合「（lb→kg換算）」注記を表示。設計書§2.4と一致 |
| `src/components/WorkoutSessionLogs.tsx` | `totalVolumeKg`を`totalCalories`と同一のreduceパターンで算出し、`flex flex-wrap gap-6`の横並び`<div>`で2指標を表示。`handleUpdate`/`handleDelete`等のロジックは無変更 |
| `src/lib/calorie.ts` | `git diff -- src/lib/calorie.ts`で差分ゼロを確認（無変更） |
| `prisma/schema.prisma` / `prisma/migrations/` | 本プロジェクトによる差分なし。現存する`M prisma/schema.prisma`（`weightValue`/`weightUnit`追加・`intensityCategory`削除）は会話開始時点のgit statusスナップショットで既に存在しており、別プロジェクト（2026-09-14-1040-machine-weight-input）由来であることを確認済み |

## テスト観点別結果
| # | 観点 | 種別 | 結果 | 詳細 |
|---|------|------|------|------|
| 1 | 正常系(KG): 80kg×3セット×10レップ=2400kg | 正常系 | ✅ pass | `tests/unit/volume.test.ts`で自動検証、pass |
| 2 | 正常系(LB): 100lb×3×10→kg換算後1360.8kg | 正常系 | ✅ pass | LB_TO_KG_FACTOR経由の換算含め自動検証、pass |
| 3 | 定数確認: `LB_TO_KG_FACTOR === 0.45359237` | 正常系 | ✅ pass | 自動検証、pass |
| 4 | 境界値: `weightValue===null`／`weightUnit===null`(非null weightValue)で0を返す | 境界値 | ✅ pass | 自動検証、pass（設計書の防御順序と実装が一致） |
| 5 | 境界値: `setCount=0`,`repsPerSet=0`,`weightValue=0`で0を返す | 境界値 | ✅ pass | 自動検証、pass |
| 6 | 境界値: 負数（setCount/repsPerSet/weightValue）で0を返す | 異常系/境界値 | ✅ pass | 自動検証、pass |
| 7 | 境界値: NaN・Infinityで0を返す（例外なし） | 異常系/境界値 | ✅ pass | 自動検証、pass |
| 8 | 境界値: 大きな値(setCount=50,repsPerSet=200,weightValue=1000)でも有限値を返す | 境界値 | ✅ pass | 自動検証、pass |
| 9 | 既存`tests/unit/calorie.test.ts`が無回帰でパスすること | 無回帰 | ✅ pass | 13件全パス（`calorie.ts`無変更のため当然の結果） |
| 10 | 既存`tests/e2e/workout-flow.spec.ts`がDOM変更で壊れないこと | 無回帰 | ✅ pass（静的確認） | 全アサーションを精読。`getByText("合計消費カロリー")`等の既存テキストは変更されておらず、`<div>`のラップ変更（flex化）やボリューム表示`<p>`追加はセレクタに影響しない。「ボリューム」文言への依存も無し。ただし実行自体は未実施（下記「発見した問題」参照） |
| 11 | KG/LB混在セッションで記録ごと表示・合計が期待通り | 結合(手動観点) | ✅ pass（コードレビュー） | `calculateVolumeKg`が単体テストで単位混在の換算を保証済み。`WorkoutSessionLogs.tsx`の`reduce`は単位を意識せず`volumeKg`（既にkg換算済み値）を単純合算するのみのため、混在時も正しく合算される。ライブ確認は環境制約により未実施（下記参照） |
| 12 | 重さ未入力の記録が「未入力」表示になり合計に影響しない | 結合(手動観点) | ✅ pass（コードレビュー） | `calculateVolumeKg`はnullで0を返し合計に加算されない。`WorkoutLogItem.tsx`は`weightValue===null`を別判定し「-（重さ未入力）」表示、0kgとの混同を防止 |
| 13 | 記録0件セッションで「合計トレーニングボリューム 0 kg」が例外なく表示 | 境界値/結合 | ✅ pass（コードレビュー） | `logs.reduce((sum,l)=>sum+l.volumeKg,0)`は初期値0のため空配列でも例外なく`0`を返す |
| 14 | 記録編集直後、再取得なしで`volumeKg`表示が即時更新される | 結合(手動観点) | ✅ pass（コードレビュー） | `updateWorkoutLog`が新しい`volumeKg`を含むDTOを返し、`WorkoutSessionLogs.tsx`の`handleUpdate`が`setLogs(prev=>prev.map(...))`で該当ログをレスポンスDTOに丸ごと置換するため、`totalVolumeKg`もstate更新に伴い自動再計算される |

## 静的検証
- 型チェック: ✅ `npx tsc --noEmit` エラーなし
- lint: ✅（間接確認） `npm run build`内の「Linting and checking validity of types」ステップがエラーなく完了。単独の`npm run lint`（`next lint`）はESLint設定が未作成のためインタラクティブ設定を要求し非対話環境では完走不可（本プロジェクト由来の問題ではなく、リポジトリに元々ESLint設定ファイルが存在しないための既存の状態。ビルド時lintは通っているため機能上の問題なし）
- ビルド: ✅ `npm run build` 成功（全11ルート生成、型チェック含め正常終了）

## 自動テスト実行
- コマンド: `npm run test`（Vitest）
- 結果: pass 25 / fail 0（`tests/unit/volume.test.ts` 12件 + `tests/unit/calorie.test.ts` 13件、全件パス）
- 失敗詳細: なし

## ブラウザ相当の動作確認（結合観点）について
安全上の注意に従い、シェルコマンド実行時のみ`TURSO_DATABASE_URL='file:./prisma/dev.db'`／`TURSO_AUTH_TOKEN=''`を環境変数で上書きし、`.env`ファイル自体は一切変更せずにdevサーバーを起動して確認を試みた（`.env`への変更なしをgit statusで確認済み）。

- 事前確認: `git status`で`.env`に差分がないこと、devサーバー起動が終了時にポート3001上のプロセスのみを終了させ、既存で稼働中だった無関係なプロセス（ポート3000, PID 16776, 本セッションが起動したものではない）には一切手を触れていないことを確認済み。
- 結果: サーバー自体は起動し（`Ready in 2s`）、`/register`は200を返しページは描画されたが、認証ミドルウェアがDBへ接続しようとした時点で以下のランタイムエラーが発生した。
  ```
  LibsqlError: URL_SCHEME_NOT_SUPPORTED: The client that uses Web standard APIs
  supports only "libsql:", "wss:", "ws:", "https:" and "http:" URLs, got "file:".
  ```
  これは`@prisma/adapter-libsql`のEdgeランタイム（Web標準API版）クライアントが`file:`スキームのローカルSQLiteを受け付けないことによるもので、Next.jsのMiddleware（`src/middleware.ts`相当、Edge Runtimeで動作）がリクエストのたびにDBへアクセスする実装になっているためと推測される。
- 影響: この制約により、認証が必要な画面（セッション作成・記録追加等、Server Action経由の操作）をローカルSQLiteに向けてcurl/ブラウザ相当で実行することができなかった。加えて、本アプリはServer Actionを多用しており、Server Actionの呼び出しは内部的に生成されるアクション参照ID（ビルド時ハッシュ）と特殊なmultipartエンコーディングを要するため、Playwrightを使わずcurl等で認証済みフローを再現することは現実的ではないと判断した。
- 対応: 上記の理由により、結合観点（#11〜#14）はライブ確認ではなく、コードレビュー（実装ロジックの精読）と単体テストで担保された`calculateVolumeKg`の正しさの組み合わせにより間接的に検証した（上表参照）。これは本プロジェクトのコード自体の欠陥ではなく、既存の認証基盤（Edge Middleware + libsqlアダプタ）がローカルSQLite（`file:`スキーム）と組み合わせて使えないという既存環境の制約である。

## 発見した問題

### ローカルSQLite(`file:`スキーム)でのdevサーバー起動時、認証Middlewareがエラーを起こす
- 症状: `TURSO_DATABASE_URL='file:./prisma/dev.db'`でdevサーバーを起動すると、`/register`など公開ページ自体は表示できるが、Middleware実行時に`LibsqlError: URL_SCHEME_NOT_SUPPORTED`が発生する（`unhandledRejection`としてログに記録される）。
- 期待: CLAUDE.mdおよび本QA依頼書の「安全上の注意」に記載の手順通り、`file:./prisma/dev.db`への向き先変更でローカル動作確認ができること。
- 再現手順:
  1. `TURSO_DATABASE_URL='file:./prisma/dev.db' TURSO_AUTH_TOKEN='' npm run dev`でサーバーを起動
  2. 任意のページにアクセス（Middlewareを通過する経路）
  3. サーバーログに`LibsqlError: URL_SCHEME_NOT_SUPPORTED`が出力される
- 原因の仮説: `@prisma/adapter-libsql`／`@libsql/client`がNext.js MiddlewareのEdge Runtime向けに「Web標準APIクライアント」を解決しており、そのクライアントは`file:`スキームを受け付けない仕様（Node.js版クライアントのみ`file:`をサポート）。Middleware自体がDBアクセスを伴う実装（セッション検証等）になっているため、Edge Runtime経由のリクエストで必ず発生すると推測される。
- 推奨対応: 本プロジェクト（トレーニングボリューム機能）のスコープ外の既存環境課題のため、今回は修正せずPMへ申し送りとする。次回ローカル動作確認が必要なプロジェクトのために、(a) Middlewareのランタイムを`nodejs`に指定する、(b) ローカル確認時は`libsql:file:...`形式のURLを使う、(c) better-sqlite3ベースの別アダプタをローカル専用に用意する、等の対応を検討・別途ドキュメント化することを推奨する。
- 本プロジェクトへの影響: この問題は本プロジェクト（ボリューム機能）が原因ではなく、認証基盤側の既存制約である。ボリューム計算ロジック自体は単体テスト・型チェック・ビルド・コードレビューで十分に検証できているため、本プロジェクトの完了判定には影響しない。

## PM への申し送り
- 完了とみなしてよいか: yes
  - 詳細設計書の全ファイルが期待形と完全一致、単体テスト12件（新規）+13件（既存）全パス、`tsc --noEmit`／`npm run build`ともにエラーなし。`calorie.ts`・`prisma/schema.prisma`への非干渉も確認済み。
- 残課題:
  1. `tests/e2e/workout-flow.spec.ts`のPlaywright実行そのものは今回も未実施（本番Turso DB接続リスク回避のため）。静的レビューでは既存セレクタへの影響は見当たらないが、次にPlaywrightを安全に実行できる環境（例: ローカルSQLite向けのMiddleware修正後）ができた時点で一度実行し、無回帰を最終確認することを推奨する。
  2. 上記「発見した問題」の通り、ローカルSQLite(`file:`)でのdevサーバー起動時にMiddlewareがエラーを起こす既存環境課題がある。今回のQAでは実害（機能停止）は確認されなかった（公開ページは描画された）が、認証必須画面での動作確認ができないため、今後のQA効率化のために別途対応を検討されたい。
  3. 詳細設計書§5.3の結合観点4点（KG/LB混在、未入力混在、0件、編集直後の即時反映）は、コードレビューでは全て設計通りと判断したが、実機/E2Eでの最終確認は上記課題により未実施。次回E2E実行可能になった際にPlaywrightケースとして追加することを推奨する。
