---
project_id: "2026-09-15-0020-optional-duration-strength"
created: "2026-09-15"
overall_status: completed
---

# 最終報告: 2026-09-15-0020-optional-duration-strength

## 依頼
有酸素系種目（ランニングマシン・バイクなど）は運動時間（分）を引き続き必須入力とし、それ以外の筋トレ系マシンは運動時間の入力を不要にして、固定の想定値から消費カロリーを算出できるようにする。

## 情報収集
- 有酸素/筋トレの判定は `Exercise.muscleGroup === "CARDIO"` のみで確定可能（シードデータ上、境界事例なし）
- `durationMinutes` はDB上 `Float` 非null必須列だが、マイグレーション不要で「筋トレ系は推定値を計算して同じ列に保存」する設計が可能
- 1repあたりの秒数・セット間休憩秒数について公的な基準（厚労省等）は存在せず、業界一般の目安値を暫定採用する方針とした

## 設計
- 影響範囲: 11ファイル（新規1・変更10）+ 単体テスト3新規 + e2eテスト1更新
- 推定式: `推定分 = (セット数 × レップ数 × 3秒 + (セット数-1) × 60秒) / 60`（`ESTIMATED_SECONDS_PER_REP` / `ESTIMATED_REST_SECONDS_BETWEEN_SETS` として明示的な定数化、暫定値であることをコメント明記）
- サーバー側（Server Action）でCARDIO必須チェックと筋トレ系の推定計算を実施し、クライアントからの`durationMinutes`改ざんを防止
- DBマイグレーションなし。推定値かどうかは`Exercise.muscleGroup`から都度判定（DBフラグ追加なし）
- 詳細設計書: `.project/design/2026-09-15-0020-optional-duration-strength/detailed-design.md`

## 実装
完了: 全ファイル設計通り（差分不一致0件）
- `src/lib/calorie.ts`, `src/types/index.ts`, `src/lib/validation.ts`, `src/app/actions/workouts.ts`, `src/components/WorkoutLogForm.tsx`, `src/components/WorkoutSessionLogs.tsx`, `src/components/WorkoutLogItem.tsx` を変更
- 単体テスト3ファイル新規追加、e2eテスト更新・追加
- `src/lib/volume.ts`（トレーニングボリューム機能）への影響なしを確認済み
- work-log: `.project/engineering/2026-09-15-0020-optional-duration-strength/work-log.md`

## テスト
総合判定: **pass**
- 型チェック（`tsc --noEmit`）: エラーなし
- 単体テスト（vitest）: 6ファイル / 44テスト 全pass
- e2eテスト（Playwright）: **20/20 pass**（既存18件＋新規2件）
- 完了条件チェックリスト（設計書§6・全14項目）: 14/14 達成

QA初回で1件のe2eテスト失敗（フォームリセット挙動とテストコードの組み合わせによるテスト側の見落とし。実装は設計通りで問題なし）と、AC-4・編集モーダルのテストカバレッジ不足を発見。追加の実装フェーズでテスト側を修正・拡充し、再検証で全件passを確認した。
- test-report: `.project/qa/2026-09-15-0020-optional-duration-strength/test-report.md`

## 残課題
- 非CARDIO種目への`durationMinutes`改ざん防御はコードレビューでのみ確認済み（自動テストでの直接検証はなし）。優先度は低いが将来的に追加を検討してもよい。
- 本プロジェクトとは無関係だが、同セッション内で別途対応したローカル開発環境のバグ修正（`src/lib/auth.ts` / `src/middleware.ts` / `src/lib/auth.config.ts`）が未コミットのまま残っている。登録処理がローカルSQLite環境でクラッシュしていた問題（Edge Runtimeのmiddlewareがlibsqlクライアントの`file:`スキームを扱えなかったため）の修正であり、意図した変更。

## 次のアクション提案
- 動作確認: ローカルサーバー（http://localhost:3000）で、筋トレ系マシンの記録追加時に運動時間欄が表示されず自動でカロリーが算出されること、有酸素系マシンでは引き続き運動時間が必須であることをブラウザで確認いただけます。
- コミット・pushのご依頼があれば、今回の変更一式（本機能＋認証周りのローカル開発バグ修正）をまとめてコミットします。
