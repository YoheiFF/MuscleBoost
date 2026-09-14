---
project_id: "2026-09-14-1651-profile-weight-height"
phase: design
doc: requirements
created: "2026-09-14"
---
# 要件定義書: プロフィール体重・身長管理への一元化

## 0. 参照
- 情報収集レポート: `C:\project\MuscleBoost\.project\research\topics\2026-09-14-1651-profile-weight-height.md`
- 依頼原文（PMからの入力）: 記録画面ごとの体重上書き入力（`WorkoutLog.bodyWeightKgOverride`）を完全に廃止し、カロリー計算は常にプロフィールの体重（`User.defaultWeightKg`）を使用する。プロフィールに身長（新規 `heightCm`）を追加し、保存・表示のみ行う。

---

## 1. Why（背景・課題）

- 現状、トレーニング記録の追加・編集フォームには「体重（kg・上書き、任意）」という記録単位の入力欄があり、`WorkoutLog.bodyWeightKgOverride` に保存される。カロリー計算は `bodyWeightKgOverride ?? defaultWeightKg ?? null` というfallbackで決定される（`src/app/actions/workouts.ts`）。
- この「記録ごとに体重を上書きできる」仕組みは、体重をプロフィールと記録画面の2箇所で管理することになり、
  - ユーザーが記録のたびに体重入力を求められる／忘れると意図せずプロフィール値にfallbackする、という体験上の分かりにくさがある。
  - 体重の「正」がどちらか（プロフィールか記録上書きか）が曖昧になり、実績画面での体重推移の解釈が難しくなる。
- 依頼者の意図は「体重はプロフィールで一元管理し、記録画面では体重を意識しなくてよいようにする」こと。あわせて、プロフィールに身長を追加し、将来的なBMI等の指標表示や単純な記録用途に備える（ただし今回は保存・表示のみで、計算ロジックには一切使わない）。

## 2. What（ユーザー要件）

| ID | 要件 |
|---|---|
| UR-1 | トレーニング記録の追加・編集画面から「体重（kg・上書き、任意）」入力欄が無くなっている。 |
| UR-2 | カロリー計算は常にプロフィールのデフォルト体重（`User.defaultWeightKg`）のみを使用する。記録ごとの体重指定はできない。 |
| UR-3 | プロフィール画面に身長の入力欄があり、保存・表示ができる。身長はカロリー計算には一切使用されない。 |
| UR-4 | プロフィールに体重が未設定のまま記録を保存しようとすると、分かりやすいエラーメッセージが表示され、記録は保存されない（既存の「未設定ならエラー」という挙動は維持する）。 |
| UR-5 | 既に保存されている過去の記録（体重上書きを使って保存されたものを含む）は、これまで通りの消費カロリー・MET値が表示され続ける。過去記録の表示内容がこの改修によって変わらない。 |

## 3. システム要件

| ID | 要件 |
|---|---|
| SR-1 | `src/app/actions/workouts.ts` の `addWorkoutLog`/`updateWorkoutLog` から `bodyWeightKgOverride` を参照する分岐を削除し、体重は `dbUser.defaultWeightKg` のみで解決する。 |
| SR-2 | `src/lib/validation.ts` の `workoutLogInputSchema` から `bodyWeightKgOverride` フィールドを削除する。`profileUpdateSchema` に `heightCm` を追加する。 |
| SR-3 | `src/types/index.ts` の `WorkoutLogDTO` から `bodyWeightKgOverride` を削除する。 |
| SR-4 | UIコンポーネント（`WorkoutLogForm.tsx`, `WorkoutSessionLogs.tsx`, `WorkoutLogItem.tsx`）から体重上書き関連の入力欄・状態・表示を削除する。 |
| SR-5 | `prisma/schema.prisma` の `User` モデルに `heightCm Float?` を追加する。`WorkoutLog.bodyWeightKgOverride` 列自体はDBスキーマ上に残す（詳細は基本設計で確定）。 |
| SR-6 | `src/components/ProfileForm.tsx` に身長の入力欄を追加し、`src/app/actions/profile.ts` の `updateProfile` が身長を保存できるようにする。 |
| SR-7 | `tests/unit/calorie.test.ts` は `bodyWeightKgOverride` という名称・fallbackロジックをテストしていないため変更不要（要再確認）。`tests/e2e/workout-flow.spec.ts` の体重上書き関連シナリオを、新しい挙動（プロフィールのデフォルト体重のみ）に沿って書き換える。 |

## 4. 非機能要件

| ID | 要件 |
|---|---|
| NFR-1 | 開発DBと本番DBが同一のTursoインスタンスである制約下で、本番データを破壊しないマイグレーション運用にする（前プロジェクト `2026-09-14-1040-machine-weight-input` と同じ運用方針を踏襲）。 |
| NFR-2 | 既存WorkoutLogの `caloriesBurned`/`metValueSnapshot`（スナップショット済み値）は、本改修によって一切書き換えない。表示ロジックもこれらの列をそのまま読むだけで変更しない。 |
| NFR-3 | `bodyWeightKgOverride` 列を物理削除する場合に必要となる「本番データ件数の事前確認」「破壊的DDLの検証」のような高リスク作業は、要件上必須ではない限り避ける（低リスクな実現方法を優先する）。 |
| NFR-4 | 身長の妥当な入力範囲をバリデーションで制限し、明らかに異常な値（負数・極端な値）の保存を防ぐ。 |

## 5. スコープ外

- `WorkoutLog.bodyWeightKgOverride` 列のDBからの物理削除（DROP COLUMN／テーブル再構築）は本プロジェクトのスコープ外とする（基本設計で理由を確定）。
- 身長の履歴管理（`WeightLog`のような時系列テーブル新設）はスコープ外。`User.heightCm` は単一の現在値のみを保持する。
- BMI等、身長を使った計算機能の追加はスコープ外（「計算には一切使用しない」という要件に明記されている）。
- `.github/workflows/deploy.yml` のデプロイフロー自体の再設計はスコープ外（既に前プロジェクトで `prisma migrate deploy` ステップが追加済み・作業ツリーに存在しており、本プロジェクトはこれをそのまま利用する）。

## 6. 受け入れ条件（Acceptance Criteria）

1. トレーニング記録の追加フォーム（`WorkoutLogForm.tsx`）およびログ編集モーダル（`WorkoutSessionLogs.tsx`）に体重入力欄が存在しない。
2. プロフィールでデフォルト体重を設定した状態で記録を保存すると、`defaultWeightKg` を使ったカロリーが計算・保存される（記録側で体重を指定する手段が無いことを確認する）。
3. プロフィールに体重が未設定のまま記録を保存しようとすると、記録は保存されず、分かりやすいエラーメッセージが表示される。
4. プロフィール画面に身長入力欄があり、入力した値が保存後に再表示される。
5. 身長を入力してもカロリー計算結果に影響しない（既存のカロリー計算テストがすべて変更なしでパスする）。
6. 過去に体重上書きを使って保存された記録（`bodyWeightKgOverride` に値が入っている行）を表示しても、消費カロリー・MET値の表示が変わらない。
7. `prisma/schema.prisma` に破壊的変更（列削除）が含まれない。マイグレーションは `heightCm` 追加の `ALTER TABLE ... ADD COLUMN` のみで完結する。
