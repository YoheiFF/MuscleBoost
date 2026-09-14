---
project_id: "2026-09-14-1651-profile-weight-height"
phase: pm-report
overall_status: completed
created: "2026-09-14"
---

# 最終報告 - 2026-09-14-1651-profile-weight-height

## 依頼
記録画面ごとの体重上書き入力（`bodyWeightKgOverride`）を廃止し、カロリー計算は常にプロフィールの体重（`defaultWeightKg`）を使用する。
プロフィールに身長を新規追加（保存・表示のみ、計算には使わない）。

## 情報収集（Phase 1）
- `bodyWeightKgOverride`の影響範囲（schema/validation/types/workouts.ts/3コンポーネント/E2E4シナリオ）を特定。
- 開発DBが本番Turso DBと同一インスタンスという前プロジェクトからの制約を再確認。
- 列削除（DROP COLUMN）はリスクが高いため、「列は残置しコード側から完全廃止」を第一候補として申し送り。

## 設計（Phase 2）
- **`bodyWeightKgOverride`列はDBスキーマ上残置、アプリケーションコードから完全に参照・書き込みを廃止**（A1採用）。DROP COLUMN等の破壊的DDLは行わない。
- `User.heightCm Float?` を単純なALTER TABLEのみで追加。
- 体重解決ロジックを`src/lib/weight.ts`の`resolveWeightKgForCalorie()`に一元化し、エラー文言を統一。
- 詳細設計書: `.project/design/2026-09-14-1651-profile-weight-height/detailed-design.md`

## 実装（Phase 3）
- 15ファイルすべて設計書通りに完了。既存過去記録（`bodyWeightKgOverride`非NULLの13件）を破壊しないよう、UPDATE文の`data`にこの列を一切含めない実装を徹底。
- `npx tsc --noEmit` 0エラー、`npm run build`成功、`npm run test` 29/29 pass。
- work-log: `.project/engineering/2026-09-14-1651-profile-weight-height/work-log.md`

## テスト（Phase 4）
- 総合判定: **pass**（20/20）
- Playwright E2Eをこのプロジェクトで初めてローカルSQLite環境で実行し10/10 pass。
- ローカルdev.dbへの直接クエリで、既存13件の`caloriesBurned`/`metValueSnapshot`が一連の操作前後で完全に不変であることを実証済み。
- ブラウザ実機操作で、体重未設定時のエラー・体重上書き欄の完全撤去・身長の保存永続化・境界値バリデーション（-5、301）を確認済み。
- test-report: `.project/qa/2026-09-14-1651-profile-weight-height/test-report.md`

## QA中に発生したインシデント（実害なし）
QA中、devサーバーの再起動時に環境変数の上書きを忘れ、一瞬本番Turso DBに接続してしまう事象が発生。実行されたのは読み取りクエリ1件のみで書き込みは無く、実害なし。QAが即座に検知しローカルSQLiteへ再接続して対応を継続した。再発防止として、PMが`npm run dev:local`（ローカルSQLite固定の専用npm script、`scripts/dev-local.js`）を追加。

## 残課題
1. `heightCm`列追加マイグレーション（`prisma/migrations/20260914170000_add_user_height_cm/`）は本番Turso DBに未適用。
2. `bodyWeightKgOverride`列は本番に残存するが、アプリケーションコードから一切参照されないため実害なし。
3. `tests/e2e/auth.spec.ts`の1シナリオがローカル実行で不安定（本プロジェクトのスコープ外、要調査）。

## 次のアクション提案
本番反映時は、`ALTER TABLE "User" ADD COLUMN "heightCm" REAL;`のみのシンプルなマイグレーションであり、列削除・テーブル再構築を伴わないため既存データへのリスクは低い。他プロジェクト分とまとめて本番マイグレーション適用を実施する。
