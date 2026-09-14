---
project_id: "2026-09-14-1727-remove-seconds-per-set"
phase: design
created: "2026-09-14"
---
# 詳細設計: 秒数入力欄・自動計算ボタンの削除

## 編集対象ファイル一覧

1. `src/components/WorkoutLogForm.tsx`
2. `src/lib/calorie.ts`
3. `tests/unit/calorie.test.ts`

変更しないファイル（確認済み・対応不要）: `src/components/WorkoutSessionLogs.tsx`, `src/app/actions/workouts.ts`, `src/lib/validation.ts`, `src/types/index.ts`, `prisma/schema.prisma`, `tests/e2e/workout-flow.spec.ts`

---

## 1. `src/components/WorkoutLogForm.tsx`

以下4箇所を削除する（行番号は削除前の現状ファイルに対応）。

### 1-1. L7: import文の削除
```diff
- import { estimateDurationMinutes } from "@/lib/calorie";
```
（`calorie.ts` からのimportが本ファイルには他になく、行ごと削除する）

### 1-2. L29: state宣言の削除
```diff
- const [secondsPerSet, setSecondsPerSet] = useState("");
```

### 1-3. L36-43: コメント＋`handleEstimateDuration`関数の削除
```diff
- // 「セット数×秒数から時間を計算」補助ボタン。運動時間欄はユーザーが直接編集可能な値であり、
- // 送信時は最終的にフォームに表示されている値を送る。
- function handleEstimateDuration() {
-   const estimated = estimateDurationMinutes(Number(setCount), Number(secondsPerSet));
-   if (estimated > 0) {
-     setDurationMinutes(String(estimated));
-   }
- }
-
```
（直後の空行1行も含め、`handleSubmit` 関数の直前まで削除してよい）

### 1-4. L71: リセット処理内の削除
```diff
    setDurationMinutes("");
-   setSecondsPerSet("");
    setWeightValue("");
```

### 1-5. L128-148: JSXブロック全体の削除
```diff
-      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-end">
-        <div>
-          <label htmlFor="workout-log-seconds-per-set" className="block text-sm font-medium">
-            1セットあたり秒数（任意）
-          </label>
-          <input
-            id="workout-log-seconds-per-set"
-            type="number"
-            value={secondsPerSet}
-            onChange={(e) => setSecondsPerSet(e.target.value)}
-            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
-          />
-        </div>
-        <button
-          type="button"
-          onClick={handleEstimateDuration}
-          className="rounded border border-gray-300 px-3 py-2 text-sm"
-        >
-          セット数×秒数から時間を計算
-        </button>
-      </div>
```
- 直前の「セット数・レップ数」グリッド（L104-127、無変更）と直後の「運動時間（分）」ブロック（L149-162、無変更）はそのまま維持。ブロック丸ごと削除するだけで、前後の `<div className="grid ...">` の依存関係はない（research report確認済み）。

### 削除後に確認すること
- `secondsPerSet` / `setSecondsPerSet` / `handleEstimateDuration` / `estimateDurationMinutes` のいずれの識別子もファイル内に残っていないこと。
- `durationMinutes` state、`id="workout-log-duration"` の入力欄、`fieldErrors.durationMinutes` の表示ロジックは無変更のまま残っていること。

---

## 2. `src/lib/calorie.ts`

### 削除要否: 削除する（理由は basic-design.md「`estimateDurationMinutes()` の扱いの決定」参照）。

### 削除範囲: L31-39（関数直前のJSDocコメント含む、関数全体）
```diff
- /**
-  * セット数×1セットあたり想定秒数から運動時間(分)を逆算する任意の補助関数。
-  * 必須機能ではない（FR-15）。UIの「時間を自動入力」ボタン用。
-  */
- export function estimateDurationMinutes(setCount: number, secondsPerSet: number): number {
-   if (!Number.isFinite(setCount) || setCount <= 0) return 0;
-   if (!Number.isFinite(secondsPerSet) || secondsPerSet <= 0) return 0;
-   return Math.round(((setCount * secondsPerSet) / 60) * 10) / 10;
- }
```
- ファイル末尾の関数のため、削除後はファイルが `calculateCalories` 関数（L17-29）で終わる形になる。末尾に不要な空行が残らないよう整える。
- **`CALORIE_CORRECTION_FACTOR`（L4）、`CalorieCalcInput`インターフェース（L6-10）、`calculateCalories`関数（L17-29）には一切手を加えないこと。**

---

## 3. `tests/unit/calorie.test.ts`

### 削除要否: 削除する（`estimateDurationMinutes` を calorie.ts から削除するため、importが解決不能になり必須）。

### 3-1. import文の修正（L3）
```diff
- import { calculateCalories, estimateDurationMinutes, CALORIE_CORRECTION_FACTOR } from "@/lib/calorie";
+ import { calculateCalories, CALORIE_CORRECTION_FACTOR } from "@/lib/calorie";
```

### 3-2. テストブロックの削除（L48-65）
```diff
-
- describe("estimateDurationMinutes", () => {
-   it("3セット×60秒/セット=180秒=3分", () => {
-     expect(estimateDurationMinutes(3, 60)).toBe(3.0);
-   });
-
-   it("setCount=0の場合は0を返す", () => {
-     expect(estimateDurationMinutes(0, 60)).toBe(0);
-   });
-
-   it("secondsPerSet=0の場合は0を返す", () => {
-     expect(estimateDurationMinutes(3, 0)).toBe(0);
-   });
-
-   it("負数の場合は0を返す", () => {
-     expect(estimateDurationMinutes(-3, 60)).toBe(0);
-     expect(estimateDurationMinutes(3, -60)).toBe(0);
-   });
- });
```
- `describe("calculateCalories", ...)` ブロック（L5-46）は無変更のまま残す。

---

## テスト観点

### 正常系
- 運動記録追加フォーム（`WorkoutLogForm`）が表示され、「1セットあたり秒数（任意）」入力欄・「セット数×秒数から時間を計算」ボタンが画面上に存在しないこと。
- 「運動時間（分）」欄（`id="workout-log-duration"`）に直接数値を入力でき、入力値が保持されること。
- マシン選択・セット数・レップ数・運動時間（分）・重さ（任意）を入力してフォームを送信し、従来通り `addWorkoutLog()` が呼ばれ記録が追加されること（既存のe2eテスト `tests/e2e/workout-flow.spec.ts` でカバーされる範囲、変更不要で通ること）。
- バリデーションエラー時、`fieldErrors.durationMinutes` 等の既存エラー表示が従来通り機能すること。

### 回帰
- `tests/unit/calorie.test.ts` の `calculateCalories` 関連テスト（9ケース）が全件変更なくパスすること。
- `tests/e2e/workout-flow.spec.ts` が全件パスすること（このテストは元々秒数UIを操作していないため、影響なし）。
- プロジェクト全体の型チェック・lint（`estimateDurationMinutes`, `secondsPerSet` 等の未使用/未解決識別子がないこと）が通ること。
- `estimateDurationMinutes` という識別子がコードベース全体（`src/`, `tests/`）から検索して0件になること。

## 完了条件チェックリスト

- [ ] `src/components/WorkoutLogForm.tsx`: L7 importの削除
- [ ] `src/components/WorkoutLogForm.tsx`: L29 `secondsPerSet` state削除
- [ ] `src/components/WorkoutLogForm.tsx`: L36-43 `handleEstimateDuration`関数（コメント込み）削除
- [ ] `src/components/WorkoutLogForm.tsx`: L71 `setSecondsPerSet("")` 削除
- [ ] `src/components/WorkoutLogForm.tsx`: L128-148 JSXブロック削除
- [ ] `src/components/WorkoutLogForm.tsx`: 「運動時間（分）」欄が無変更で残っていることを確認
- [ ] `src/lib/calorie.ts`: `estimateDurationMinutes`関数（コメント込み、L31-39）削除
- [ ] `src/lib/calorie.ts`: `calculateCalories`, `CALORIE_CORRECTION_FACTOR`, `CalorieCalcInput` が無変更であることを確認
- [ ] `tests/unit/calorie.test.ts`: import文から`estimateDurationMinutes`除去
- [ ] `tests/unit/calorie.test.ts`: `describe("estimateDurationMinutes", ...)`ブロック削除
- [ ] `tests/unit/calorie.test.ts`: `describe("calculateCalories", ...)`ブロックが無変更であることを確認
- [ ] 単体テスト全件パス（`vitest`）
- [ ] e2eテスト全件パス（`tests/e2e/workout-flow.spec.ts`）
- [ ] 型チェック・lintエラーなし
- [ ] コードベース全体で`estimateDurationMinutes`, `secondsPerSet`（本フォームのローカルstateとしての用法）の識別子が0件であることをgrepで確認
