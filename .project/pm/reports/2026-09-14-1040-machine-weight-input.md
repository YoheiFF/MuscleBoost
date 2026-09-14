---
project_id: "2026-09-14-1040-machine-weight-input"
phase: pm-report
overall_status: completed
created: "2026-09-14"
---

# 最終報告 - 2026-09-14-1040-machine-weight-input

## 依頼
マシン選択のプルダウンが「マシン名×強度レベル（軽度/中等度/高強度）」で複数選択肢に分かれているのを1マシン1エントリに統一し、
代わりにトレーニング記録に「重さ」（KG/ポンド）の記録用入力欄を新設する（重さはカロリー計算には使わず記録用のみ、とユーザー確認済み）。

## 情報収集（Phase 1）
- プルダウンはExerciseテーブルの直接反映であり、UIフィルタだけでなくデータモデル変更が必要と判明。
- 実際に3強度で重複しているのは筋トレ系10機種（30件）のみ。有酸素6機種は既に1機種1エントリ相当。
- `WorkoutLog.metValueSnapshot`が記録時点のMET値をコピー保存しているため、マスタの統合・変更は過去記録の表示に影響しない。
- `WorkoutLog.exerciseId`にFK制約（onDelete: Restrict）があり、重複エントリ削除前に既存参照の再ポイントが必須と判明。
- デプロイフロー（GitHub Actions）に`prisma migrate deploy`が組み込まれておらず、本番反映時は明示的な対応が必要と判明。
- 詳細: `.project/research/topics/2026-09-14-1040-machine-weight-input.md`

## 設計（Phase 2）
- 強度統合方針: 各マシンの「中等度（MODERATE）」レコードを代表として存続させ、軽度・高強度を削除。`Exercise.intensityCategory`列自体を廃止。
- 重量フィールド: `WorkoutLog.weightValue Float?` + `weightUnit String?`（"KG"/"LB"）を新設。**単位変換は行わず入力値をそのまま保存・表示**（ユーザー確認済み仕様通り）。
- 既存`WorkoutLog.exerciseId`はマイグレーションSQL内で「再ポイント→重複削除→残存レコードのリネーム→スキーマDDL」の順で処理し、FK制約を満たしたまま安全に移行する方針を確定。
- `.github/workflows/deploy.yml`に`npx prisma migrate deploy`を追加（本番適用は別途ユーザー確認のうえ実施）。
- 影響範囲・詳細設計書: `.project/design/2026-09-14-1040-machine-weight-input/detailed-design.md`（要件定義書・基本設計書も同ディレクトリ）

## 実装（Phase 3）
- 詳細設計書通り、14ファイル（schema.prisma、seed.ts、マイグレーションSQL、types/validation、Server Actions、UIコンポーネント、E2Eテスト、deploy.yml等）を編集・新規作成。
- `src/lib/calorie.ts`（カロリー計算ロジック）は無変更を確認（設計通りカロリー計算に重さを反映しない）。
- **重要な安全対応**: 開発DBが本番Turso DBと同一インスタンスであると判明したため、`.env`・本番DBには一切触れず、ローカルSQLite（`prisma/dev.db`）に限定してマイグレーション適用・シード再実行・データ整合性検証を実施。
- work-log: `.project/engineering/2026-09-14-1040-machine-weight-input/work-log.md`

## テスト（Phase 4）
- 総合判定: **pass**（設計準拠率 15/15ファイル）
- `npx tsc --noEmit`: 0エラー / `npm run build`: 成功 / `npm run test`(Vitest): 13/13 pass
- `npx playwright test`: 16/16 pass（本番DBに接続しないよう、コマンド実行時のみ環境変数を一時上書きしてローカルSQLiteで実行）
- マイグレーション整合性（Exercise 36→16件、孤立参照0件、既存WorkoutLogのcaloriesBurned/metValueSnapshot不変、seed再実行の冪等性）をローカルDBで確認済み。
- 正常系・異常系・境界値（重さ0/負数/1001/1000.1、単位未選択等）を含む29観点すべてpass。
- test-report: `.project/qa/2026-09-14-1040-machine-weight-input/test-report.md`

## 残課題
1. **E2Eテストに重さ入力・単位切替の直接シナリオが無い**（コードレビューでは正常動作を確認済みだが、リグレッション検知用のE2E追加を推奨）
2. **本番Turso DBへの`prisma migrate deploy`実適用は未実施**。本プロジェクトではコード変更のみ行い、実際の本番マイグレーション適用はユーザー確認のうえ別作業とする方針とした。
3. `npm run lint`は本改修以前からの既存事象（ESLint未設定）として引き続き未解決。

## 本番反映にあたっての注意事項（QAからの申し送り）
- 本番`migrate deploy`実行前に、本番DBの`Exercise.id`が`seed-${machine}-LIGHT/MODERATE/VIGOROUS`形式と完全一致するか確認必須（一致しない場合はマイグレーションSQLをそのまま使えない）。
- デプロイ順序は `git reset --hard` → `npm install` → `npx prisma migrate deploy` → `npm run build` → `pm2 restart`。migrate完了〜pm2 restart完了の数秒間、旧Prisma Clientが新スキーマに対しエラーになり得るリスクは許容済みだが、低トラフィック帯でのデプロイを推奨。
- 本番適用後、`npm run db:seed`実行で件数16件（+カスタム機）のまま変化しないことを本番相当環境で確認することを推奨。

## 次のアクション提案
1. 作業ログ（本プロジェクト分・および前回の`2026-09-12-1539-gym-tracker`の未コミット分）をコミットする
2. ユーザーの最終確認のうえ、本番Turso DBへの`prisma migrate deploy`適用とGitHubへのプッシュ（自動デプロイ）を実施する
3. 余力があればE2Eに重さ入力・単位切替シナリオを追加する
