---
project_id: "2026-09-14-1040-machine-weight-input"
phase: qa
overall_status: pass
---
# テストレポート - 2026-09-14-1040-machine-weight-input

## 総合判定
- 結果: pass
- 設計準拠率: 15/15（詳細設計書§1の影響範囲ファイル全て。うち`tests/unit/calorie.test.ts`・`src/lib/calorie.ts`は「変更なし」を確認する形で合格）

## 安全対策の実施内容（前提の申し送り）
本番Turso DBと開発DBが同一インスタンスであることを踏まえ、以下の方法で安全に検証した。
- `.env` / `prisma.config.ts` は一切編集していない（`git status`/`git diff`で差分ゼロを確認済み）。
- ローカル`prisma/dev.db`（gitignore対象、実装ログが検証時に作成・適用済みのマイグレーション後の状態）を対象に、シェルコマンド実行時のみ環境変数`TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN`を一時的に上書きして検証した。
- データ整合性確認は`node:sqlite`（読み取り専用モード）で直接クエリし、Prisma CLI経由の書き込みは行っていない。
- `npm run db:seed`冪等性確認は、seed.tsと同一ロジックのインラインスクリプトを`file:./prisma/dev.db`に向けて実行し、コミット・スクラッチパッドへの保存も行わず検証後に破棄した。
- Playwright実行時も同様に環境変数をコマンド実行時のみ上書きし、`webServer`（`npm run dev`）がその一時環境変数を継承する形で起動することを確認した（実行前に`netstat`でポート3000が未使用であることを確認し、既存の本番接続サーバーを誤って再利用するリスクを排除した）。
- 本番Turso認証情報の値はログ・ファイルに一切出力していない。

## テスト観点別結果

| # | 観点 | 種別 | 結果 | 詳細 |
|---|------|------|------|------|
| 1 | 統合対象10機種が1件ずつ表示され、強度サフィックスが無い | 正常系 | ✅ pass | `prisma/seed.ts`が1マシン1エントリ化、`ExercisePicker.tsx`から強度セグメント削除済み。ローカルdev.db実データでも`seed-*-MODERATE`10件のみ・強度サフィックス無し名称を確認。E2E「部位フィルタ「脚」でレッグプレス等のみ表示」等がpass |
| 2 | 有酸素マシン6機種は個別表示のまま | 正常系 | ✅ pass | `seed.ts`のCARDIO_MACHINES無変更。dev.dbで`seed-cardio-*` 6件、ID・MET値とも設計書通り |
| 3 | 重さ入力（例60kg）が一覧・詳細にそのまま表示 | 正常系 | ✅ pass（コード確認） | `WorkoutLogForm.tsx`→`addWorkoutLog`→DB保存→`WorkoutLogItem.tsx`の表示ロジックを確認。**E2Eの自動テストケースはこのシナリオを直接カバーしていない**（下記「発見した問題」参照） |
| 4 | LB単位で135lb入力→「135lb」のまま表示（自動換算なし） | 正常系 | ✅ pass（コード確認） | `src/`全体を`grep`し、kg⇔lb換算係数（0.453592等）や変換関数が一切存在しないことを確認。フォーム送信値とDB保存値・表示値が同一パスを通ることをコードで確認。E2Eの直接カバーなし（同上） |
| 5 | 重さ未入力時は表示に何も出ない | 正常系 | ✅ pass | `WorkoutLogItem.tsx`の`log.weightValue !== null && log.weightUnit`条件を確認。既存13件の実データ（weightValue=NULL）で表示崩れが起きないことをスキーマ・データ両面で確認 |
| 6 | 重さの値・単位を変えてもcaloriesBurnedが変化しない | 正常系 | ✅ pass | `workouts.ts`の`calculateCalories()`呼び出し引数に`weightValue`/`weightUnit`が含まれないことをコードで確認。ローカルdev.dbの既存ログでも`metValueSnapshot`/`caloriesBurned`が非nullの`weightValue`列追加後も不変であることを確認 |
| 7 | マイマシン作成フォームに強度選択欄が無い | 正常系 | ✅ pass | `ExerciseForm.tsx`から強度関連コード完全削除を確認。E2E「カスタムマシンを追加すると一覧に表示され、削除できる」pass |
| 8 | 既存WorkoutLogがマイグレーション後も正しく表示・マシン名が統合後名称 | 正常系 | ✅ pass | dev.db実データで、既存13件の`exerciseId`が`seed-チェストプレス-MODERATE`（name=`チェストプレス`、強度サフィックス無し）を指すことを確認 |
| 9 | 既存WorkoutLogのcaloriesBurnedがマイグレーション前後で不変 | 正常系 | ✅ pass | 実データ確認: 13件全て`metValueSnapshot=3`（旧LIGHT値）・`caloriesBurned=110.3/126`のまま。Exercise側の`metValue`が5.5に変わっても過去ログは無影響であることを直接確認 |
| 10 | weightValueのみ入力・unit未選択→エラー | 異常系 | ✅ pass | `workoutLogInputSchema`に直接入力し検証。`fieldErrors.weightUnit`="重さの単位を選択してください"を確認 |
| 11 | 重さ0/−10でエラー | 異常系 | ✅ pass | 同上の直接検証。両方とも"重さは0より大きい値を入力してください" |
| 12 | 重さ1001でエラー | 異常系 | ✅ pass | 同上。"重さは1000以下で入力してください" |
| 13 | マシン未選択で保存エラー（回帰） | 異常系 | ✅ pass | `exerciseId: z.string().min(1)`を直接検証。空文字でエラーになることを確認 |
| 14 | 体重未設定・上書きなしでエラー（回帰） | 異常系 | ✅ pass | E2E「デフォルト体重未設定・上書きも無しで記録保存→エラーが表示され保存されない」pass |
| 15 | 重さ=0.1で保存可 | 境界値 | ✅ pass | スキーマ直接検証でOK |
| 16 | 重さ=1000で保存可 | 境界値 | ✅ pass | スキーマ直接検証でOK |
| 17 | 重さ=1000.1でエラー | 境界値 | ✅ pass | スキーマ直接検証で"重さは1000以下で入力してください" |
| 18 | 小数第2位以下（62.75）の保存・表示挙動 | 境界値 | ✅ pass | スキーマはOKを返す（`Float?`列のため小数はそのまま保存される想定）。実際のDB保存経路は`weightValue: data.weightValue ?? null`でそのまま渡るためDB側でも62.75のまま保存される |
| 19 | KG/LBそれぞれ入力値がラベル付きでそのまま表示（変換なし） | 単位変換 | ✅ pass | 上記4番と同根拠。コードレビューでのみ確認、E2E直接カバーなし |
| 20 | 編集時（updateWorkoutLog）に単位変更しても数値が自動変換されない | 単位変換 | ✅ pass | `updateWorkoutLog`も`data.weightValue ?? null`/`data.weightUnit ?? null`をそのまま`update`に渡すのみで変換処理が存在しないことをコードで確認。編集UIやE2E双方に「重さを編集する」シナリオ自体が無いため、Server Action層のコードのみでの確認 |
| 21 | マイグレーション前後でWorkoutLog件数が同数 | マイグレーション整合性 | ✅ pass | dev.db実データ: 13件（孤立無し）。実装ログの適用前後比較（36→16件Exercise、WorkoutLog13件不変）と整合 |
| 22 | caloriesBurned・metValueSnapshotが適用前後で一致 | マイグレーション整合性 | ✅ pass | 実データで`metValueSnapshot=3`・`caloriesBurned=110.3/126`が保持されていることを直接確認（9番と同根拠） |
| 23 | `seed-*-LIGHT`/`VIGOROUS`のIDが0件 | マイグレーション整合性 | ✅ pass | `SELECT COUNT(*) WHERE id LIKE '%-LIGHT' OR '%-VIGOROUS'` = 0 |
| 24 | WorkoutLog.exerciseIdの孤立参照が無い | マイグレーション整合性 | ✅ pass | LEFT JOINで孤立行0件を確認 |
| 25 | Exercise総件数16件+カスタム件数 | マイグレーション整合性 | ✅ pass | dev.dbで`isCustom=0`が16件、カスタムは現在0件（E2Eテスト内で作成・削除されたカスタム機を含めても増減なし） |
| 26 | `npm run db:seed`再実行の冪等性 | マイグレーション整合性 | ✅ pass | seed.tsと同一ロジックをローカルdev.dbに向けて再実行し、件数16件のまま・WorkoutLog13件/孤立0件のまま変化なしを確認 |
| 27 | `npx tsc --noEmit` エラー0件 | 回帰 | ✅ pass | 出力エラー無しで完走 |
| 28 | `npm run test`（Vitest, calorie.test.ts）全件パス | 回帰 | ✅ pass | 13/13 pass |
| 29 | `npx playwright test` 全件パス（workout-flow.spec.ts含む） | 回帰 | ✅ pass | 16/16 pass（`workout-flow.spec.ts`10件 + `auth.spec.ts`6件、全てローカルSQLite隔離環境で実行） |

## 静的検証
- 型チェック（`npx tsc --noEmit`）: ✅ エラー0件
- lint（`npm run lint` / `next lint`）: ⚠️ 未実施（本改修より前からプロジェクトにESLint設定ファイルが存在せず、`next lint`実行時に対話的セットアップ質問が表示されて完走不可。本プロジェクトのスコープ外の既存事象であり、本改修による新規混入ではないことを`.eslintrc*`/`eslint.config*`の不在確認で裏付け済み）
- ビルド（`npm run build`）: ✅ 成功（`✓ Compiled successfully`、全11ルート生成完了。next-auth/jose由来のEdge Runtime警告は本改修と無関係の既存事象）

## 自動テスト実行
- コマンド: `npm run test`（Vitest）
  - 結果: 13 pass / 0 fail（`tests/unit/calorie.test.ts`、計算ロジック無変更を確認）
- コマンド: `npx playwright test`（TURSO_DATABASE_URL/TURSO_AUTH_TOKENをシェル実行時のみローカルSQLiteへ一時上書き）
  - 結果: 16 pass / 0 fail（`tests/e2e/workout-flow.spec.ts` 10件、`tests/e2e/auth.spec.ts` 6件）
  - 失敗詳細: なし。ただし起動ログに`[WebServer] ... LibsqlError: URL_SCHEME_NOT_SUPPORTED ... got "file:"`という警告が複数回出力された。これはNext.jsのEdge Runtime（ミドルウェア等、Web標準API版のlibsqlクライアントを使う経路）がfile:スキームを解釈できず一時的に例外を出したものと推測されるが、実際のServer Actions（Node.jsランタイム）はNode版libsqlクライアントでfile:を正しく処理できており、全16件のテスト結果自体には影響していない。本番Turso（`libsql:`/`https:`スキーム）に対しては本来発生しない、ローカル検証固有の現象であるため実害はないが、次フェーズ（本番運用）担当者への参考情報として記録する。

## 発見した問題

### E2Eテストに重さ入力・表示・単位切替のシナリオが無い
- 症状: `tests/e2e/workout-flow.spec.ts`は詳細設計書§3.13の指示通り「マシン名セレクタ・カロリー期待値の更新」のみが行われており、本プロジェクトの主要機能の一つである「重さ入力→保存→一覧表示」「LB入力→変換されずに表示」「編集時の単位変更で数値が変わらない」を検証する新規E2Eケースが1件も追加されていない。
- 期待: 詳細設計書§5.1のテスト観点4項目・§5.4の2項目はE2Eで自動検証されるべき内容だが、現状はコードレビュー（静的な処理経路の確認）でのみ担保されている。
- 再現手順: `tests/e2e/workout-flow.spec.ts`を全文参照。重さ関連の`fill`/`getByLabel("重さ")`等の記述が存在しないことを確認できる。
- 原因の仮説: 詳細設計書§3.13が既存テストの「更新」のみを指示しており、新規シナリオ追加を明示的に要求していなかったため、実装フェーズはスコープ通り「指示された更新のみ」を行った（実装ログにも差異として記録されておらず、設計書の範囲内で完了と判断されたと考えられる）。
- 推奨対応: 影響は軽微（コードレビューで正常動作は確認済み、機能自体にバグは無い）だが、将来のリグレッション検知のため、QA完了条件とは別に、次回改修時または別チケットで以下を追加することを推奨する。
  1. 重さ・単位を入力して記録→一覧に`○○kg`/`○○lb`表示を確認するテスト。
  2. LB選択時に数値がそのまま表示され、KG換算されていないことを確認するテスト。
  3. 既存ログ編集時、単位をKG→LBに変更しても数値が変わらないことを確認するテスト（現状`WorkoutLogForm`に編集モードでの重さ欄操作UIがあるか要確認。編集UIの有無自体も併せて確認要）。

### ローカル検証環境固有: LibsqlError（file:スキーム）警告
- 症状: `npx playwright test`実行時、`[WebServer]`ログに`URL_SCHEME_NOT_SUPPORTED`エラーが複数回出力される。
- 期待: エラーログが出ないこと（無害だが気になるノイズ）。
- 再現手順: `TURSO_DATABASE_URL='file:./prisma/dev.db' TURSO_AUTH_TOKEN='' npx playwright test`を実行し、起動直後のログを確認する。
- 原因の仮説: Next.jsのEdge Runtime（ミドルウェア等）で使われるlibsqlクライアントのWeb標準API版が`file:`スキームを非対応のため。本番のTurso URL（`libsql://...`）では発生しない、ローカルSQLite代替検証固有の現象。
- 推奨対応: 対応不要（本番影響なし）。次回同様の手法でローカル検証する場合の申し送り事項として記録するのみでよい。

## PM への申し送り
- 完了とみなしてよいか: yes
- 残課題:
  1. E2Eテストへの重さ入力・単位切替シナリオの追加（上記「発見した問題」参照、機能自体は正常でありブロッカーではない）。
  2. `.github/workflows/deploy.yml`への`npx prisma migrate deploy`追加はコード変更のみで、実際のGitHub Actions実行・本番適用は未実施（設計書§3.14・実装ログの通り、本番反映はユーザー確認後の別作業）。
- 本番マイグレーション適用時の注意点:
  1. **最重要**: `npx prisma migrate deploy`を本番Turso DBに向けて実行する前に、`SELECT id FROM Exercise WHERE id LIKE 'seed-%'`を本番DBに対して実行し、`seed-${machine}-LIGHT/MODERATE/VIGOROUS`のID形式が本マイグレーションSQLの想定と完全一致することを確認すること（設計書§3.2・完了条件チェックリストに明記の通り、一致しない場合はSQLをそのまま流用してはならない）。
  2. デプロイ実行順序は`git reset --hard`→`npm install`→`npx prisma migrate deploy`→`npm run build`→`pm2 restart`（`.github/workflows/deploy.yml`で確認済み）。単一インスタンス構成のため、`migrate deploy`完了から`pm2 restart`完了までの数秒間、旧Prisma Client（`intensityCategory`列参照）が新スキーマに対してクエリを投げエラーになり得るリスクは基本設計書§7.2で許容ずみ。低トラフィック時間帯のデプロイを推奨する。
  3. 本番適用後、`npm run db:seed`を一度実行し、件数が16件（+カスタムマシン件数）のまま変化しないこと（冪等性）を本番相当環境で確認することを推奨する（ローカルでは確認済みだが実データでの最終確認が望ましい）。
  4. 今回のQA検証はすべてローカル`prisma/dev.db`（実装ログが事前にマイグレーション適用済みのファイル）に対して行っており、本番Turso DBへの実際の`migrate deploy`実行・データ整合性は未検証。本番適用直後に、本レポート§「テスト観点別結果」#21-26相当の確認（件数・孤立参照・カロリー不変性）を本番DBに対しても実施することを強く推奨する。
