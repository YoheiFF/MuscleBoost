---
project_id: "2026-09-15-0020-optional-duration-strength"
phase: design
document: requirements
created: "2026-09-15"
---

# 要件定義書: 運動時間の任意化（有酸素系は必須維持・筋トレ系は固定想定値で算出）

## 1. Why（背景・課題）
- 現状、`WorkoutLogForm.tsx`（記録追加）・`WorkoutSessionLogs.tsx`（記録編集）のいずれも、種目カテゴリを問わず運動時間（分）の入力を無条件必須としている（`workoutLogInputSchema`の`durationMinutes: z.number().positive().max(600)`）。
- ユーザーからのフィードバック: 「運動時間は必須ではなくてよい」「ランニングマシンやバイクなどの有酸素系は時間を必須入力とし、その他の筋トレマシンは時間は不要とし、固定の想定値を用いて計算するようにしたい」。筋トレ系はマシンごとに1セットの実施時間感覚が短く、都度ストップウォッチで計測して入力する運用コストが記録継続の妨げになっている。
- 消費カロリー計算式（`kcal = MET × 体重(kg) × 時間(h) × 1.05`、`src/lib/calorie.ts`の`calculateCalories()`）は`durationMinutes`を必須入力として受け取る設計のため、単純に入力欄を消すだけでは計算が成立しない。セット数・レップ数から運動時間を内部推定し、既存の計算式にそのまま投入することで、入力の手間を減らしつつ従来通りの指標（消費カロリー）を維持する。
- 情報収集の結果（`.project/research/topics/2026-09-15-0020-optional-duration-strength.md`）、有酸素/筋トレの判定は`Exercise.muscleGroup === "CARDIO"`のみで確定でき、シードデータ上あいまいな境界事例は存在しないことが確認済み。また「1repあたりの想定秒数」「セット間休憩の想定秒数」について厚労省等の公式な一次情報は存在せず、業界一般のトレーニング指導目安を採用し、暫定値であることをコード上に明記する方針とする。

## 2. What（ユーザー要件）
- UR-1: ユーザーは、**有酸素系種目**（`muscleGroup === "CARDIO"`。ランニングマシン・バイク等）を記録する際は、これまで通り運動時間（分）を入力する。未入力の場合はバリデーションエラーとなり保存できない。
- UR-2: ユーザーは、**筋トレ系種目**（`muscleGroup !== "CARDIO"`）を記録する際は、運動時間の入力を行わなくてよい。入力欄は表示されない、または入力しなくても保存できる。
- UR-3: 筋トレ系種目の消費カロリーは、ユーザーが入力済みの「セット数」「レップ数」から内部的に運動時間を推定した上で、既存のカロリー計算式により自動算出される。ユーザーは推定のための追加操作を一切必要としない。
- UR-4: ユーザーは、記録の一覧・詳細表示で、その記録の運動時間が「実際に入力した値」か「自動推定された値」かを区別できる（推定値には推定値である旨のラベルが表示される）。
- UR-5: 記録の編集画面（セッション詳細のモーダル）でも、追加画面と同様に有酸素系/筋トレ系に応じた運動時間欄の要否切り替えが行われる。

## 3. What（システム要件）
- SR-1: 種目の有酸素/筋トレ判定は`exercise.muscleGroup === "CARDIO"`の1条件のみで行う（`src/types/index.ts`に判定用の共通関数`isCardioMuscleGroup()`を新設し、UI・Server Actionの両方から同一ロジックを参照する）。`Exercise`テーブル・シードデータの変更は不要。
- SR-2: `workoutLogInputSchema`（`src/lib/validation.ts`）の`durationMinutes`は`positive().max(600)`の制約を維持したまま`.optional()`にする（値が渡された場合の範囲検証は維持し、渡されなかった場合のみ許容する）。
- SR-3: 有酸素系種目かどうかの必須判定は、Server Action（`addWorkoutLog`/`updateWorkoutLog`、`src/app/actions/workouts.ts`）が`exercise`をDBから取得した後に追加検証として実施する（Zodスキーマ単体では`muscleGroup`情報を持たないため完結させない。クライアント申告の`muscleGroup`をサーバーが信頼する設計は採用しない）。
  - 有酸素系かつ`durationMinutes`未入力 → `fieldErrors.durationMinutes`にエラーメッセージを設定し保存を拒否する。
  - 筋トレ系の場合 → クライアントから`durationMinutes`が送られてきても無視し、常にサーバー側で推定した値を使用する（改ざん・実装漏れに対する防御的設計）。
- SR-4: 筋トレ系種目の運動時間推定式・想定値定数は`src/lib/calorie.ts`に新規追加する（`CALORIE_CORRECTION_FACTOR`と同じファイル・同じ「コメントで根拠を明記した定数」というスタイルを踏襲する）。
  - `ESTIMATED_SECONDS_PER_REP`（1repあたりの想定秒数）
  - `ESTIMATED_REST_SECONDS_BETWEEN_SETS`（セット間休憩の想定秒数）
  - 推定関数`estimateDurationMinutesForStrength(setCount, repsPerSet): number`
  - いずれも「一般的なトレーニング指導目安に基づく暫定値であり、厚労省等の公式基準ではない」旨をコードコメントに明記する。
- SR-5: 推定された運動時間は、有酸素系の場合とまったく同じ経路（`calculateCalories()`への`durationMinutes`引数、`prisma.workoutLog.create/update`の`durationMinutes`列）でそのまま使用・保存する。`WorkoutLog.durationMinutes`（`Float`・非null）のDBスキーマ・マイグレーションは変更しない。
- SR-6: 記録が「推定値」か「実測値」かをUIで区別するため、`WorkoutLogDTO`に`muscleGroup: MuscleGroup`を追加する。区別用の新しいDBフラグ列は追加しない（4章「設計判断」参照）。判定は表示側で`!isCardioMuscleGroup(log.muscleGroup)`により行う。
- SR-7: `WorkoutLogForm.tsx`（追加）・`WorkoutSessionLogs.tsx`（編集）の両方で、選択中の種目の`muscleGroup`に応じて運動時間入力欄の表示・非表示を切り替える。種目未選択時は運動時間欄を表示しない。
- SR-8: `src/lib/volume.ts`（トレーニングボリューム計算）・`src/components/ExercisePicker.tsx`・`prisma/schema.prisma`・`prisma/seed.ts`には一切変更を加えない。

## 4. 設計判断（確定事項）
- **判定基準**: `exercise.muscleGroup === "CARDIO"` の1条件のみ（追加フラグ列なし）。
- **推定式**: `推定時間(分) = (setCount × repsPerSet × ESTIMATED_SECONDS_PER_REP + (setCount - 1) × ESTIMATED_REST_SECONDS_BETWEEN_SETS) / 60`。最終セット後の休憩は含めない（休憩回数は「セット数-1」回）。
- **想定値**: `ESTIMATED_SECONDS_PER_REP = 3`（秒）、`ESTIMATED_REST_SECONDS_BETWEEN_SETS = 60`（秒）。根拠は詳細設計書2.1節を参照（一般的なトレーニング指導目安であり、厚労省等の公式一次情報ではないことをコードコメントに明記する）。
- **DBスキーマ**: `durationMinutes`列は無変更（非null Floatのまま）。筋トレ系は推定値をそのまま保存する。区別用フラグ列も追加しない（`WorkoutLogDTO.muscleGroup`から都度導出する）。理由・トレードオフは基本設計書3章を参照。
- **バリデーション方式**: Zodの`durationMinutes`は`optional()`化し、CARDIO必須チェックはServer Action内（`exercise`取得後）で実施する（研究レポート候補A）。
- **UI方式**: 運動時間入力欄は、選択中種目が有酸素系の場合のみ表示する（非表示方式。任意ラベル＋グレーアウトは採用しない）。

## 5. 非機能要件
- NFR-1: マイグレーション不要（Turso本番/開発DB共有環境における過去プロジェクトのDDLリスクを踏まえ、スキーマ変更を伴わない設計とする）。
- NFR-2: 既存の有酸素系の記録・カロリー計算結果に回帰がないこと（`calculateCalories()`のシグネチャ・ロジックは無変更）。
- NFR-3: `src/lib/volume.ts`（トレーニングボリューム機能）に一切影響を与えないこと。
- NFR-4: 新規ロジック（`estimateDurationMinutesForStrength`）は既存の`calculateCalories`/`calculateVolumeKg`と同水準のテストパターン（正常系・境界値・NaN/Infinity耐性）で単体テストを備える。
- NFR-5: 既存のコーディング規約（純粋関数を`lib`に、Server Actionでの計算→DTO格納、コンポーネントでの表示切替という既存パターン）を踏襲する。

## 6. スコープ外（明示的に対応しない事項）
- カスタム種目作成フォーム（`exercises/new`）の`muscleGroup`選択肢自体の変更（ユーザーが有酸素運動をCARDIO以外で登録するリスクは運用上のリスクとして許容する）。
- 過去に保存済みの`WorkoutLog`レコードの再計算・一括バッチ処理（読み取り時は保存済みの値をそのまま使う。再計算は行わない）。
- 運動時間の推定式・想定値をユーザーごと/種目ごとにカスタマイズできるようにする機能。
- `secondsPerSetOverride`（既に廃止済みの未使用列）への一切の変更・復活。
- `src/lib/volume.ts`・`src/components/ExercisePicker.tsx`・`prisma/schema.prisma`・`prisma/seed.ts`の変更。

## 7. 受け入れ条件（Acceptance Criteria）
- AC-1: 有酸素系種目（例: エアロバイク）を選択すると運動時間欄が表示され、未入力のまま保存しようとするとバリデーションエラー（`fieldErrors.durationMinutes`）が表示され保存されない。
- AC-2: 筋トレ系種目（例: チェストプレス）を選択すると運動時間欄が表示されない（または入力しなくても）、セット数・レップ数のみで保存でき、消費カロリーが自動算出される。
- AC-3: 筋トレ系種目の消費カロリーが、`estimateDurationMinutesForStrength(setCount, repsPerSet)`の結果を`calculateCalories()`に投入した値と一致する。
- AC-4: 記録一覧・詳細表示で、筋トレ系種目の運動時間表示に「推定値」であることが分かる表示が付く。有酸素系種目には付かない。
- AC-5: 既存の有酸素系記録のカロリー計算結果・表示に変化がない（回帰なし）。
- AC-6: `src/lib/volume.ts`・`tests/unit/volume.test.ts`に差分がない。
- AC-7: `src/lib/calorie.ts`の既存export（`CALORIE_CORRECTION_FACTOR`, `CalorieCalcInput`, `calculateCalories`）のシグネチャ・実装に変更がない（新規exportの追加のみ）。
- AC-8: 新規`tests/unit/duration-estimate.test.ts`が正常系・境界値（setCount=1の休憩ゼロ、0/負数/NaN/Infinity/非整数）を網羅し、全てパスする。
- AC-9: `tests/e2e/workout-flow.spec.ts`が本改修に合わせて更新され、全シナリオがパスする（更新内容は詳細設計書6章を参照）。
- AC-10: 本機能の実装に伴うPrismaマイグレーションファイルが生成されない。
