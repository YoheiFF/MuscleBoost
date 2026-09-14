---
project_id: "2026-09-14-1727-remove-seconds-per-set"
phase: engineering
---
# 実装ログ - 2026-09-14-1727-remove-seconds-per-set

## 編集ファイル一覧
| ファイル | 操作 | 完了 | 備考 |
|---------|------|------|------|
| `src/components/WorkoutLogForm.tsx` | 編集 | ✅ | import削除・`secondsPerSet` state削除・`handleEstimateDuration`削除・リセット処理削除・JSXブロック削除 |
| `src/lib/calorie.ts` | 編集 | ✅ | `estimateDurationMinutes()`関数（JSDoc含む）削除 |
| `tests/unit/calorie.test.ts` | 編集 | ✅ | import修正・`describe("estimateDurationMinutes", ...)`ブロック削除 |

## ファイル別詳細

### `src/components/WorkoutLogForm.tsx`
- L7: `import { estimateDurationMinutes } from "@/lib/calorie";` を削除。
- L29: `const [secondsPerSet, setSecondsPerSet] = useState("");` を削除。
- L36-44: コメント＋`handleEstimateDuration`関数（直後の空行含む）を削除。`handleSubmit`関数はそのまま直下に続く。
- L71: リセット処理内の `setSecondsPerSet("");` を削除。
- L128-148: 「1セットあたり秒数（任意）」入力欄と「セット数×秒数から時間を計算」ボタンを含む `<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-end">` ブロック全体を削除。
- 確認: `secondsPerSet` / `setSecondsPerSet` / `handleEstimateDuration` / `estimateDurationMinutes` の識別子はファイル内に残っていない（grep 0件）。
- 確認: `durationMinutes` state、`id="workout-log-duration"` 入力欄、`fieldErrors.durationMinutes` 表示ロジックは無変更のまま維持されている。

### `src/lib/calorie.ts`
- L31-39（`estimateDurationMinutes`関数本体＋直前のJSDocコメント）を削除。ファイル末尾は `calculateCalories` 関数で終わる形になり、不要な空行は残していない。
- `CALORIE_CORRECTION_FACTOR`、`CalorieCalcInput`インターフェース、`calculateCalories`関数には一切手を加えていない。

### `tests/unit/calorie.test.ts`
- import文を `import { calculateCalories, CALORIE_CORRECTION_FACTOR } from "@/lib/calorie";` に修正（`estimateDurationMinutes` を除去）。
- `describe("estimateDurationMinutes", ...)` ブロック（4テスト）を削除。
- `describe("calculateCalories", ...)` ブロック（9テスト）は無変更のまま維持。

## 検証結果
- `npx tsc --noEmit`: エラーなし（型チェック通過）。
- `npm run build`: ビルド成功（`✓ Compiled successfully` / `✓ Generating static pages (11/11)`）。lint・型チェックともに通過。
- `npm run test`（Vitest）: 全件パス。
  - `tests/unit/weight.test.ts` 4 tests passed
  - `tests/unit/calorie.test.ts` 9 tests passed（`estimateDurationMinutes`関連4件は削除済みのため対象外、`calculateCalories`関連9件は無変更で全件パス）
  - `tests/unit/volume.test.ts` 12 tests passed
  - Test Files 3 passed (3) / Tests 25 passed (25)
- コードベース全体で `estimateDurationMinutes` / `secondsPerSet` をgrep検索し、`src/`・`tests/`ともに0件を確認。
- e2eテスト（`tests/e2e/workout-flow.spec.ts`）は本タスクの指示範囲外のため未実行（依頼指示は「`npm run test`（Vitest）を実行」のみを求めていたため）。設計書は当該ファイルの変更不要・秒数UIを操作しない旨を確認済みと記載。

## 全体サマリー
詳細設計書の行レベル指示に従い、`WorkoutLogForm.tsx` から「1セットあたり秒数（任意）」入力欄・「セット数×秒数から時間を計算」ボタン・関連state（`secondsPerSet`）・ハンドラ（`handleEstimateDuration`）を削除し、「運動時間（分）」欄はそのまま残した。`src/lib/calorie.ts` の `estimateDurationMinutes()` 関数を削除し、`calculateCalories()` 等の他エクスポートには一切変更を加えていない。`tests/unit/calorie.test.ts` から対応するimportとテストブロックを削除した。型チェック（`tsc --noEmit`）、本番ビルド（`next build`）、単体テスト（Vitest 25件）すべて成功。コードベース全体でのgrep確認により、削除対象の識別子（`estimateDurationMinutes`, `secondsPerSet`）が0件であることを確認した。DBスキーマ・マイグレーション・`.env`には一切触れていない。
