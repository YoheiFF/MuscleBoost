---
project_id: "2026-09-14-1651-profile-weight-height"
phase: design
doc: detailed-design
created: "2026-09-14"
---
# 詳細設計書: プロフィール体重・身長管理への一元化（MuscleBoost）

## 0. 参照
- `requirements.md`, `basic-design.md`（本プロジェクト、同ディレクトリ）
- 情報収集レポート: `C:\project\MuscleBoost\.project\research\topics\2026-09-14-1651-profile-weight-height.md`

---

## 1. 概要

本プロジェクトで実現されること:
1. トレーニング記録の追加・編集画面から「体重（kg・上書き、任意）」入力欄を削除し、カロリー計算は常にプロフィールの `defaultWeightKg` のみを使用するようにする。
2. `WorkoutLog.bodyWeightKgOverride` 列はDBスキーマ上に残すが（基本設計§2.1のA1採用）、アプリケーションコードのあらゆる箇所（バリデーション・Server Action・型定義・UI）から参照・書き込みを完全に除去する。
3. プロフィールに `heightCm`（身長、cm、Nullable）を新設し、保存・表示のみを行う。カロリー計算ロジックには一切関与させない。
4. 体重未設定時のエラーメッセージを `addWorkoutLog`/`updateWorkoutLog` 間で統一し、体重解決ロジックを再利用可能な純粋関数として切り出すことでテスト容易性を高める。
5. マイグレーションは `heightCm` 追加の `ALTER TABLE ... ADD COLUMN` 1本のみとする。

---

## 2. 影響範囲（編集／新規ファイル一覧）

| ファイル | 種別 | 変更概要 |
|---|---|---|
| `prisma/schema.prisma` | 変更 | `User.heightCm Float?` 追加。`WorkoutLog.bodyWeightKgOverride` に未使用化コメント追記（列自体は変更なし）。 |
| `prisma/migrations/<timestamp>_add_user_height_cm/migration.sql` | 新規 | `ALTER TABLE "User" ADD COLUMN "heightCm" REAL;` |
| `src/lib/validation.ts` | 変更 | `workoutLogInputSchema` から `bodyWeightKgOverride` 削除。`profileUpdateSchema` に `heightCm` 追加。 |
| `src/lib/weight.ts` | 新規 | 体重解決の純粋関数 `resolveWeightKgForCalorie()` を新設（テスト容易性向上、`addWorkoutLog`/`updateWorkoutLog`間の重複解消）。 |
| `src/types/index.ts` | 変更 | `WorkoutLogDTO` から `bodyWeightKgOverride` を削除。 |
| `src/app/actions/workouts.ts` | 変更 | `addWorkoutLog`/`updateWorkoutLog` の体重解決ロジックを `resolveWeightKgForCalorie()` 呼び出しに置換。Prisma create/update dataとDTOマッピングから `bodyWeightKgOverride` を除去。 |
| `src/app/actions/profile.ts` | 変更なし | `profileUpdateSchema` の変更に自動追随する実装のため、コード変更は不要（確認のみ）。 |
| `src/components/WorkoutLogForm.tsx` | 変更 | 体重上書き入力欄・状態を削除。`defaultWeightKg` propがnullの場合、警告メッセージを表示するよう用途を転用。 |
| `src/components/WorkoutSessionLogs.tsx` | 変更 | 編集モーダルの体重上書き入力欄・状態（`editBodyWeightKgOverride`）を削除。同様の未設定警告を追加。 |
| `src/components/WorkoutLogItem.tsx` | 変更 | `log.bodyWeightKgOverride` を使った条件表示を削除。 |
| `src/components/ProfileForm.tsx` | 変更 | 身長入力欄（`initialHeightCm` prop、`heightCm` state）を追加。 |
| `src/app/profile/page.tsx` | 変更 | `ProfileForm` に `initialHeightCm={dbUser?.heightCm ?? null}` を渡す。 |
| `tests/unit/weight.test.ts` | 新規 | `resolveWeightKgForCalorie()` の単体テスト。 |
| `tests/unit/calorie.test.ts` | 変更なし | `bodyWeightKgOverride`・fallbackロジックに依存していないため変更不要（確認のみ）。 |
| `tests/e2e/workout-flow.spec.ts` | 変更 | 体重上書きに依存する4シナリオを新しい挙動に合わせて書き換え（詳細は§12）。 |

---

## 3. ファイル別変更詳細

### 3.1 `prisma/schema.prisma`

**編集前（該当箇所抜粋）:**
```prisma
model User {
  id              String   @id @default(cuid())
  email           String   @unique
  passwordHash    String
  name            String
  defaultWeightKg Float?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  customExercises Exercise[]       @relation("UserCustomExercises")
  workoutSessions WorkoutSession[]
  weightLogs      WeightLog[]
}
```
```prisma
model WorkoutLog {
  ...
  secondsPerSetOverride Int?
  bodyWeightKgOverride  Float?
  ...
}
```

**編集後（期待形）:**
```prisma
model User {
  id              String   @id @default(cuid())
  email           String   @unique
  passwordHash    String
  name            String
  defaultWeightKg Float?
  // 身長(cm)。保存・表示専用。カロリー計算には一切使用しない。
  heightCm        Float?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  customExercises Exercise[]       @relation("UserCustomExercises")
  workoutSessions WorkoutSession[]
  weightLogs      WeightLog[]
}
```
```prisma
model WorkoutLog {
  ...
  secondsPerSetOverride Int?
  // 廃止済み・未使用列（2026-09-14-1651-profile-weight-height）。
  // 開発/本番DB共有によるDDLリスクを避けるため列は残置し、Nullableのまま維持する。
  // アプリケーションコードのいかなる箇所からも参照・書き込みしないこと。
  // カロリー計算は常に User.defaultWeightKg のみを使用する。
  bodyWeightKgOverride  Float?
  ...
}
```

**処理ロジック**: DDLはなし（Prismaスキーマ定義のみの変更）。`heightCm` はモデル内の位置として `defaultWeightKg` の直後に配置し、既存の体重系フィールドと隣接させることで可読性を保つ。

---

### 3.2 `prisma/migrations/<timestamp>_add_user_height_cm/migration.sql`（新規）

- ディレクトリ名は実装時のタイムスタンプ（`YYYYMMDDHHMMSS`形式、14桁）を使用し、既存最新マイグレーション `20260914020356_merge_exercise_intensity_and_workout_weight` より新しい値にする（例: `20260914170000_add_user_height_cm`。実装時刻に合わせて実際の値を採番すること）。

**ファイル内容（確定）:**
```sql
-- AlterTable
ALTER TABLE "User" ADD COLUMN "heightCm" REAL;
```

**適用方針**: 基本設計§5.1の運用方針に従う。実装フェーズではこのSQLファイルを作成するのみとし、ローカルからTursoへの直接適用は行わない。ローカル検証を行う場合は `prisma.config.ts` を一時的にローカルSQLite向けに書き換えて確認し、検証後に必ず元に戻す。

---

### 3.3 `src/lib/validation.ts`

**編集前（該当箇所抜粋）:**
```ts
export const workoutLogInputSchema = z
  .object({
    exerciseId: z.string().min(1),
    setCount: z.number().int().positive("セット数は1以上の整数で入力してください").max(50),
    repsPerSet: z.number().int().positive("レップ数は1以上の整数で入力してください").max(200),
    durationMinutes: z.number().positive("運動時間は0より大きい値を入力してください").max(600),
    bodyWeightKgOverride: z.number().positive().max(400).optional(),
    weightValue: z
      .number()
      .positive("重さは0より大きい値を入力してください")
      .max(1000, "重さは1000以下で入力してください")
      .optional(),
    weightUnit: z.enum(WEIGHT_UNITS).optional(),
  })
  .superRefine((data, ctx) => { ... });

export const profileUpdateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  defaultWeightKg: z.number().positive().max(400).optional(),
});
```

**編集後（期待形）:**
```ts
export const workoutLogInputSchema = z
  .object({
    exerciseId: z.string().min(1),
    setCount: z.number().int().positive("セット数は1以上の整数で入力してください").max(50),
    repsPerSet: z.number().int().positive("レップ数は1以上の整数で入力してください").max(200),
    durationMinutes: z.number().positive("運動時間は0より大きい値を入力してください").max(600),
    weightValue: z
      .number()
      .positive("重さは0より大きい値を入力してください")
      .max(1000, "重さは1000以下で入力してください")
      .optional(),
    weightUnit: z.enum(WEIGHT_UNITS).optional(),
  })
  .superRefine((data, ctx) => { ... }); // superRefineの中身は無変更（weightValue/weightUnitのペア制約のみ）

export const profileUpdateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  defaultWeightKg: z.number().positive().max(400).optional(),
  heightCm: z.number().positive().max(300).optional(),
});
```

**処理ロジック**:
- `workoutLogInputSchema` から `bodyWeightKgOverride` 行を削除するのみ（他フィールド・`superRefine`は無変更）。
- `profileUpdateSchema` に `heightCm` を追加。バリデーション範囲は `positive()`（0より大きい）かつ `max(300)`（300cm以下）。既存の `defaultWeightKg` と同じく「メッセージ省略・正の数・上限のみ」というコードベースの既存パターンを踏襲する。

---

### 3.4 `src/lib/weight.ts`（新規）

体重解決ロジックを純粋関数として切り出す。DB非依存にすることで、Server Actionのテストがしづらい既存の制約（Tursoへの接続が必須でローカルE2Eが動かせない）を受けずに、ロジック自体を `tests/unit/` でテストできるようにする。

**関数シグネチャ:**
```ts
// src/lib/weight.ts
export const DEFAULT_WEIGHT_REQUIRED_ERROR =
  "体重が未設定です。プロフィールでデフォルト体重を設定してから記録してください。";

export type WeightResolutionResult =
  | { ok: true; weightKg: number }
  | { ok: false; error: string };

/**
 * カロリー計算に使う体重(kg)を解決する。
 * プロフィールのデフォルト体重(User.defaultWeightKg)が未設定(null/undefined)の場合はエラーを返す。
 * 記録側での体重上書きは廃止されたため、このプロジェクト以降は本関数が体重解決の唯一の経路となる。
 */
export function resolveWeightKgForCalorie(
  defaultWeightKg: number | null | undefined
): WeightResolutionResult {
  if (defaultWeightKg === null || defaultWeightKg === undefined) {
    return { ok: false, error: DEFAULT_WEIGHT_REQUIRED_ERROR };
  }
  return { ok: true, weightKg: defaultWeightKg };
}
```

**処理ロジック（pseudo-code、上記の通りそのまま実装可能な粒度）:**
1. 引数 `defaultWeightKg` が `null` または `undefined` なら `{ ok: false, error: DEFAULT_WEIGHT_REQUIRED_ERROR }` を返す。
2. それ以外（数値、0を含む）なら `{ ok: true, weightKg: defaultWeightKg }` を返す。
   - 注: `defaultWeightKg` が `0` になるケースは `profileUpdateSchema` の `positive()` 制約により通常発生しないが、関数自体は「0は未設定ではない」という前提で額面通りに扱う（既存の `weightKg === null` 判定パターンを踏襲し、0を特別扱いしない）。

---

### 3.5 `src/types/index.ts`

**編集前（該当箇所抜粋）:**
```ts
export interface WorkoutLogDTO {
  id: string;
  exerciseId: string;
  exerciseName: string;
  setCount: number;
  repsPerSet: number;
  durationMinutes: number;
  bodyWeightKgOverride: number | null;
  weightValue: number | null;
  weightUnit: WeightUnit | null;
  metValueSnapshot: number;
  caloriesBurned: number;
  volumeKg: number;
}
```

**編集後（期待形）:**
```ts
export interface WorkoutLogDTO {
  id: string;
  exerciseId: string;
  exerciseName: string;
  setCount: number;
  repsPerSet: number;
  durationMinutes: number;
  weightValue: number | null;
  weightUnit: WeightUnit | null;
  metValueSnapshot: number;
  caloriesBurned: number;
  volumeKg: number;
}
```

**処理ロジック**: `bodyWeightKgOverride: number | null;` の行を削除するのみ。他のフィールド・コメントは無変更。`ExerciseDTO`、`WeightLogDTO`等、身長・体重上書きに無関係な型は変更しない（身長は既存の `ProfileForm` propsで直接 `number | null` を受け渡す設計とし、専用DTOは新設しない。理由: プロフィール画面は現状 `prisma.user.findUnique` の結果を直接分解してpropsに渡す設計であり、`UserDTO`のような型は元々存在しないため、既存パターンに合わせる）。

---

### 3.6 `src/app/actions/workouts.ts`

**編集前（該当箇所抜粋、`addWorkoutLog`）:**
```ts
const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
const weightKg = data.bodyWeightKgOverride ?? dbUser?.defaultWeightKg ?? null;
if (weightKg === null) {
  return { ok: false, error: "体重を入力してください（プロフィールでデフォルト体重を設定するか、この記録で体重を入力してください）" };
}
```
```ts
const log = await prisma.workoutLog.create({
  data: {
    workoutSessionId: sessionId,
    exerciseId: data.exerciseId,
    setCount: data.setCount,
    repsPerSet: data.repsPerSet,
    durationMinutes: data.durationMinutes,
    bodyWeightKgOverride: data.bodyWeightKgOverride ?? null,
    weightValue: data.weightValue ?? null,
    weightUnit: data.weightUnit ?? null,
    metValueSnapshot: exercise.metValue,
    caloriesBurned,
  },
});
```
```ts
data: {
  log: {
    id: log.id,
    ...
    bodyWeightKgOverride: log.bodyWeightKgOverride,
    weightValue: log.weightValue,
    ...
  },
},
```

**編集後（期待形、`addWorkoutLog`）:**
```ts
import { resolveWeightKgForCalorie } from "@/lib/weight";
// ...(既存の他importに追加)

const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
const weightResolution = resolveWeightKgForCalorie(dbUser?.defaultWeightKg);
if (!weightResolution.ok) {
  return { ok: false, error: weightResolution.error };
}
const weightKg = weightResolution.weightKg;
```
```ts
const log = await prisma.workoutLog.create({
  data: {
    workoutSessionId: sessionId,
    exerciseId: data.exerciseId,
    setCount: data.setCount,
    repsPerSet: data.repsPerSet,
    durationMinutes: data.durationMinutes,
    weightValue: data.weightValue ?? null,
    weightUnit: data.weightUnit ?? null,
    metValueSnapshot: exercise.metValue,
    caloriesBurned,
  },
});
```
```ts
data: {
  log: {
    id: log.id,
    exerciseId: log.exerciseId,
    exerciseName: exercise.name,
    setCount: log.setCount,
    repsPerSet: log.repsPerSet,
    durationMinutes: log.durationMinutes,
    weightValue: log.weightValue,
    weightUnit: log.weightUnit as WeightUnit | null,
    metValueSnapshot: log.metValueSnapshot,
    caloriesBurned: log.caloriesBurned,
    volumeKg,
  },
},
```

`bodyWeightKgOverride` を **`prisma.workoutLog.create` の `data` から完全に省略する**（明示的に `null` を書き込む必要すらない。カラム自体にDBのデフォルト値`NULL`が使われる。今後のこの列への書き込みが二度と発生しないようにする、という設計意図を明確にするため）。

**`updateWorkoutLog` も同一パターンで修正:**

**編集前:**
```ts
const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
const weightKg = data.bodyWeightKgOverride ?? dbUser?.defaultWeightKg ?? null;
if (weightKg === null) {
  return { ok: false, error: "体重を入力してください" };
}
```
```ts
const updated = await prisma.workoutLog.update({
  where: { id: logId },
  data: {
    exerciseId: data.exerciseId,
    setCount: data.setCount,
    repsPerSet: data.repsPerSet,
    durationMinutes: data.durationMinutes,
    bodyWeightKgOverride: data.bodyWeightKgOverride ?? null,
    weightValue: data.weightValue ?? null,
    weightUnit: data.weightUnit ?? null,
    metValueSnapshot: exercise.metValue,
    caloriesBurned,
  },
});
```
DTOマッピングも `bodyWeightKgOverride: updated.bodyWeightKgOverride,` を含む。

**編集後:**
```ts
const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
const weightResolution = resolveWeightKgForCalorie(dbUser?.defaultWeightKg);
if (!weightResolution.ok) {
  return { ok: false, error: weightResolution.error };
}
const weightKg = weightResolution.weightKg;
```
```ts
const updated = await prisma.workoutLog.update({
  where: { id: logId },
  data: {
    exerciseId: data.exerciseId,
    setCount: data.setCount,
    repsPerSet: data.repsPerSet,
    durationMinutes: data.durationMinutes,
    weightValue: data.weightValue ?? null,
    weightUnit: data.weightUnit ?? null,
    metValueSnapshot: exercise.metValue,
    caloriesBurned,
  },
});
```
DTOマッピングから `bodyWeightKgOverride: updated.bodyWeightKgOverride,` の行を削除。

**注意（既存データへの非破壊性）**: `update` の `data` に `bodyWeightKgOverride` キーを含めないことで、Prismaは当該列を一切UPDATE文に含めない。過去にその行の `bodyWeightKgOverride` が非NULLだった場合でも、編集操作によってその値が消える（NULL化される）ことはない。これは基本設計§2.5「過去記録への非破壊性」の要件を満たすために重要な実装ポイントであり、**誤って `bodyWeightKgOverride: null` を明示的にdataへ含めてはならない**（含めるとPrismaがUPDATE文で明示的にNULLを書き込んでしまい、既存の過去データが消える）。

**`getWorkoutSession` のDTOマッピング（編集前抜粋）:**
```ts
const logs: WorkoutLogDTO[] = s.logs.map((l) => ({
  id: l.id,
  exerciseId: l.exerciseId,
  exerciseName: l.exercise.name,
  setCount: l.setCount,
  repsPerSet: l.repsPerSet,
  durationMinutes: l.durationMinutes,
  bodyWeightKgOverride: l.bodyWeightKgOverride,
  weightValue: l.weightValue,
  ...
}));
```
**編集後**: `bodyWeightKgOverride: l.bodyWeightKgOverride,` の行のみ削除。他は無変更（`caloriesBurned`・`metValueSnapshot`はDBから読んだ値をそのまま返すため、表示不変性が保たれる）。

---

### 3.7 `src/app/actions/profile.ts`（変更なし・確認事項）

`updateProfile` は `profileUpdateSchema.safeParse(input).data` をそのまま `prisma.user.update` の `data` に渡す薄い実装のため、`profileUpdateSchema` に `heightCm` を追加すれば（§3.3）このファイルのコードは一切変更せずに `heightCm` の保存に対応できる。実装フェーズではこのファイルを変更しないこと（変更すると意図しない副作用を生む可能性があるため、「触らない」という判断そのものを明記する）。

---

### 3.8 `src/components/WorkoutLogForm.tsx`

**編集前（該当箇所抜粋）:**
```tsx
const [bodyWeightKgOverride, setBodyWeightKgOverride] = useState("");
```
```tsx
const result = await addWorkoutLog(sessionId, {
  exerciseId,
  setCount: Number(setCount),
  repsPerSet: Number(repsPerSet),
  durationMinutes: Number(durationMinutes),
  bodyWeightKgOverride: bodyWeightKgOverride ? Number(bodyWeightKgOverride) : undefined,
  weightValue: weightValue ? Number(weightValue) : undefined,
  weightUnit: weightValue ? weightUnit : undefined,
});
```
```tsx
setBodyWeightKgOverride("");
```
```tsx
<div>
  <label htmlFor="workout-log-weight-override" className="block text-sm font-medium">
    体重（kg・上書き、任意）
  </label>
  <input
    id="workout-log-weight-override"
    type="number"
    step="0.1"
    value={bodyWeightKgOverride}
    onChange={(e) => setBodyWeightKgOverride(e.target.value)}
    placeholder={defaultWeightKg ? String(defaultWeightKg) : "未設定"}
    className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
  />
  {fieldErrors.bodyWeightKgOverride && (
    <p className="text-xs text-red-600">{fieldErrors.bodyWeightKgOverride[0]}</p>
  )}
</div>
```

**編集後（期待形）:**
1. `bodyWeightKgOverride` の `useState` 宣言を削除。
2. `handleSubmit` 内の `addWorkoutLog` 呼び出しから `bodyWeightKgOverride` キーを削除:
```tsx
const result = await addWorkoutLog(sessionId, {
  exerciseId,
  setCount: Number(setCount),
  repsPerSet: Number(repsPerSet),
  durationMinutes: Number(durationMinutes),
  weightValue: weightValue ? Number(weightValue) : undefined,
  weightUnit: weightValue ? weightUnit : undefined,
});
```
3. フォームリセット処理から `setBodyWeightKgOverride("");` を削除。
4. 体重上書き入力欄の `<div>` ブロックを丸ごと削除する。
5. `defaultWeightKg` propの用途を転用し、`error` 表示のすぐ下に警告バナーを追加する（`defaultWeightKg === null` の時のみ表示。プロフィール未設定を記録前に案内するUI）:
```tsx
{error && <p className="text-sm text-red-600">{error}</p>}
{defaultWeightKg === null && (
  <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
    体重が未設定です。
    <a href="/profile" className="ml-1 underline">
      プロフィール
    </a>
    でデフォルト体重を設定してください。
  </p>
)}
```
6. `WorkoutLogFormProps` インターフェースの `defaultWeightKg: number | null;` は変更しない（propとして引き続き受け取るが、用途がplaceholder表示→警告表示に変わる）。

**処理ロジック（フォーム送信フロー、変更後）:**
1. ユーザーがマシン・セット数・レップ数・時間・(任意で)重さを入力し送信。
2. `addWorkoutLog(sessionId, {...})` を呼ぶ（体重は一切含まない）。
3. `result.ok === false` の場合、`error` state にサーバー側のエラーメッセージ（体重未設定時は `DEFAULT_WEIGHT_REQUIRED_ERROR` の文言）をセットして表示する。既存のエラー表示ロジックは変更不要（サーバー側の文言変更のみで動作する）。
4. 成功時は既存通りフォームをリセットし `onCreated`/`router.refresh()` を呼ぶ。

---

### 3.9 `src/components/WorkoutSessionLogs.tsx`

**編集前（該当箇所抜粋）:**
```tsx
const [editBodyWeightKgOverride, setEditBodyWeightKgOverride] = useState("");
```
```tsx
function startEdit(log: WorkoutLogDTO) {
  setEditingLog(log);
  setEditExerciseId(log.exerciseId);
  setEditSetCount(String(log.setCount));
  setEditRepsPerSet(String(log.repsPerSet));
  setEditDurationMinutes(String(log.durationMinutes));
  setEditBodyWeightKgOverride(log.bodyWeightKgOverride ? String(log.bodyWeightKgOverride) : "");
  setEditError(null);
}
```
```tsx
const result = await updateWorkoutLog(editingLog.id, {
  exerciseId: editExerciseId,
  setCount: Number(editSetCount),
  repsPerSet: Number(editRepsPerSet),
  durationMinutes: Number(editDurationMinutes),
  bodyWeightKgOverride: editBodyWeightKgOverride ? Number(editBodyWeightKgOverride) : undefined,
});
```
```tsx
<input
  type="number"
  step="0.1"
  value={editBodyWeightKgOverride}
  onChange={(e) => setEditBodyWeightKgOverride(e.target.value)}
  placeholder="体重（kg・上書き、任意）"
  className="rounded border border-gray-300 px-3 py-2"
/>
```

**編集後（期待形）:**
1. `editBodyWeightKgOverride` の `useState` を削除。
2. `startEdit` から `setEditBodyWeightKgOverride(...)` の行を削除。
3. `handleUpdate` 内の `updateWorkoutLog` 呼び出しから `bodyWeightKgOverride` キーを削除:
```tsx
const result = await updateWorkoutLog(editingLog.id, {
  exerciseId: editExerciseId,
  setCount: Number(editSetCount),
  repsPerSet: Number(editRepsPerSet),
  durationMinutes: Number(editDurationMinutes),
});
```
4. 編集モーダル内の体重上書き `<input>` を削除する。
5. 編集モーダル内、`editError` 表示のすぐ下に、`WorkoutLogForm.tsx` と同様の警告バナーを追加する（既にpropとして受け取っている `defaultWeightKg` を利用）:
```tsx
{editError && <p className="mb-2 text-sm text-red-600">{editError}</p>}
{defaultWeightKg === null && (
  <p className="mb-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
    体重が未設定です。
    <a href="/profile" className="ml-1 underline">
      プロフィール
    </a>
    でデフォルト体重を設定してください。
  </p>
)}
```
6. `WorkoutSessionLogsProps` の `defaultWeightKg: number | null;` は変更しない（既存通り `WorkoutLogForm` へ渡すのに加え、編集モーダルの警告表示にも使う）。

---

### 3.10 `src/components/WorkoutLogItem.tsx`

**編集前:**
```tsx
<p className="text-sm text-gray-500">
  {log.setCount}セット × {log.repsPerSet}レップ / {log.durationMinutes}分
  {log.bodyWeightKgOverride ? ` / 体重${log.bodyWeightKgOverride}kg` : ""}
  {log.weightValue !== null && log.weightUnit ? ` / 重さ${log.weightValue}${WEIGHT_UNIT_LABELS[log.weightUnit]}` : ""}
</p>
```

**編集後:**
```tsx
<p className="text-sm text-gray-500">
  {log.setCount}セット × {log.repsPerSet}レップ / {log.durationMinutes}分
  {log.weightValue !== null && log.weightUnit ? ` / 重さ${log.weightValue}${WEIGHT_UNIT_LABELS[log.weightUnit]}` : ""}
</p>
```

**処理ロジック**: `{log.bodyWeightKgOverride ? ... : ""}` の1行を削除するのみ。`WorkoutLogDTO`から当該フィールドが削除される（§3.5）ため、この行を残すとコンパイルエラーになる＝削除が必須。

---

### 3.11 `src/components/ProfileForm.tsx`

**編集前（該当箇所抜粋）:**
```tsx
interface ProfileFormProps {
  initialName: string;
  initialDefaultWeightKg: number | null;
}

export default function ProfileForm({ initialName, initialDefaultWeightKg }: ProfileFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [defaultWeightKg, setDefaultWeightKg] = useState(
    initialDefaultWeightKg !== null ? String(initialDefaultWeightKg) : ""
  );
  ...
  const result = await updateProfile({
    name: name || undefined,
    defaultWeightKg: defaultWeightKg ? Number(defaultWeightKg) : undefined,
  });
  ...
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      ...
      <div>
        <label htmlFor="profile-default-weight" className="block text-sm font-medium">デフォルト体重 (kg)</label>
        <input ... />
      </div>
      <button type="submit" ...>{submitting ? "保存中..." : "更新する"}</button>
    </form>
  );
}
```

**編集後（期待形）:**
```tsx
interface ProfileFormProps {
  initialName: string;
  initialDefaultWeightKg: number | null;
  initialHeightCm: number | null;
}

export default function ProfileForm({
  initialName,
  initialDefaultWeightKg,
  initialHeightCm,
}: ProfileFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [defaultWeightKg, setDefaultWeightKg] = useState(
    initialDefaultWeightKg !== null ? String(initialDefaultWeightKg) : ""
  );
  const [heightCm, setHeightCm] = useState(
    initialHeightCm !== null ? String(initialHeightCm) : ""
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    const result = await updateProfile({
      name: name || undefined,
      defaultWeightKg: defaultWeightKg ? Number(defaultWeightKg) : undefined,
      heightCm: heightCm ? Number(heightCm) : undefined,
    });

    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">プロフィールを更新しました</p>}
      <div>
        <label htmlFor="profile-name" className="block text-sm font-medium">表示名</label>
        <input
          id="profile-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
        />
      </div>
      <div>
        <label htmlFor="profile-default-weight" className="block text-sm font-medium">デフォルト体重 (kg)</label>
        <input
          id="profile-default-weight"
          type="number"
          step="0.1"
          value={defaultWeightKg}
          onChange={(e) => setDefaultWeightKg(e.target.value)}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
        />
      </div>
      <div>
        <label htmlFor="profile-height" className="block text-sm font-medium">身長 (cm)</label>
        <input
          id="profile-height"
          type="number"
          step="0.1"
          value={heightCm}
          onChange={(e) => setHeightCm(e.target.value)}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
      >
        {submitting ? "保存中..." : "更新する"}
      </button>
    </form>
  );
}
```

**処理ロジック**: `defaultWeightKg` と全く同じ入力パターン（空文字=未入力/未送信、数値入力時のみ `updateProfile` のペイロードに含める）を `heightCm` にもそのまま適用する。既存の `fieldErrors` 表示は本フォームには実装されていない（既存コードのまま。身長のバリデーションエラーは `error`（トップレベルの汎用エラー文言）としてのみ表示される。既存の `defaultWeightKg` と同じ挙動であり、本改修による新たな非対称は生まない）。

---

### 3.12 `src/app/profile/page.tsx`

**編集前:**
```tsx
<ProfileForm initialName={dbUser?.name ?? ""} initialDefaultWeightKg={dbUser?.defaultWeightKg ?? null} />
```

**編集後:**
```tsx
<ProfileForm
  initialName={dbUser?.name ?? ""}
  initialDefaultWeightKg={dbUser?.defaultWeightKg ?? null}
  initialHeightCm={dbUser?.heightCm ?? null}
/>
```

**処理ロジック**: `prisma.user.findUnique` の戻り値に `heightCm` が自動的に含まれるようになる（Prisma Clientはスキーマ変更後に `prisma generate` で型が更新される）。追加のクエリ変更は不要。

---

## 4. データ構造定義

### 4.1 `WorkoutLogInput`（`workoutLogInputSchema` の推論型、変更後）
```ts
type WorkoutLogInput = {
  exerciseId: string;
  setCount: number;       // 整数, 1〜50
  repsPerSet: number;     // 整数, 1〜200
  durationMinutes: number;// 0より大きい, 〜600
  weightValue?: number;   // 0より大きい, 〜1000（任意、weightUnitとペア必須）
  weightUnit?: "KG" | "LB"; // 任意、weightValueとペア必須
};
```
（`bodyWeightKgOverride` フィールドは存在しない。）

### 4.2 `ProfileUpdateInput`（`profileUpdateSchema` の推論型、変更後）
```ts
type ProfileUpdateInput = {
  name?: string;           // 1〜50文字
  defaultWeightKg?: number;// 0より大きい, 〜400
  heightCm?: number;       // 0より大きい, 〜300（新規）
};
```

### 4.3 `WorkoutLogDTO`（変更後、`bodyWeightKgOverride`削除済み）
```ts
interface WorkoutLogDTO {
  id: string;
  exerciseId: string;
  exerciseName: string;
  setCount: number;
  repsPerSet: number;
  durationMinutes: number;
  weightValue: number | null;
  weightUnit: WeightUnit | null;
  metValueSnapshot: number;
  caloriesBurned: number;
  volumeKg: number;
}
```

### 4.4 `WeightResolutionResult`（新規、`src/lib/weight.ts`）
```ts
type WeightResolutionResult =
  | { ok: true; weightKg: number }
  | { ok: false; error: string };
```

### 4.5 `User`（Prismaモデル、変更後の該当フィールドのみ）
```prisma
model User {
  ...
  defaultWeightKg Float?
  heightCm        Float?  // 新規
  ...
}
```

---

## 5. エラー処理方針

| ケース | 発生箇所 | 処理 |
|---|---|---|
| 記録保存・更新時、プロフィールの `defaultWeightKg` が未設定 | `addWorkoutLog`/`updateWorkoutLog`（`resolveWeightKgForCalorie()`の戻り値が`ok:false`） | `ActionResult<{...}>` として `{ ok: false, error: "体重が未設定です。プロフィールでデフォルト体重を設定してから記録してください。" }` を返す。カロリー計算・DB書き込みは一切行わない（早期return）。 |
| `workoutLogInputSchema` のバリデーション失敗（セット数・時間等） | `addWorkoutLog`/`updateWorkoutLog`（`safeParse`失敗時） | 既存通り `{ ok: false, error: "入力内容を確認してください", fieldErrors: ... }`。本改修による変更なし。`bodyWeightKgOverride`関連の`fieldErrors`表示コード（`WorkoutLogForm.tsx`の`fieldErrors.bodyWeightKgOverride`参照）は削除必須（§3.8）。 |
| `profileUpdateSchema` のバリデーション失敗（身長が負数・300cm超など） | `updateProfile`（`safeParse`失敗時） | 既存通り `{ ok: false, error: "入力内容を確認してください", fieldErrors: ... }`。`ProfileForm.tsx`は`fieldErrors`を表示しない既存仕様のまま（`error`の汎用文言のみ表示）。 |
| 身長に0以下・極端な値（300cm超）を入力 | Zod (`profileUpdateSchema.heightCm`) | `positive()`/`max(300)`違反として`safeParse`が失敗し、上記の「バリデーション失敗」ケースに合流する。個別のカスタムエラーメッセージは付与しない（既存の`defaultWeightKg`と同じ簡潔さを踏襲）。 |
| 過去記録（`bodyWeightKgOverride`が非NULL）の表示・編集 | `getWorkoutSession`, `updateWorkoutLog` | 例外は発生しない。当該列はDTOマッピング・UPDATE文のいずれからも参照されなくなるため、存在ごと無視されるだけで、読み取り・表示は`caloriesBurned`等の他列を通じて従来通り行われる。 |

---

## 6. テスト観点

### 6.1 単体テスト（Vitest）

**`tests/unit/weight.test.ts`（新規）:**

| # | ケース | 入力 | 期待結果 |
|---|---|---|---|
| 1 | 正常系: デフォルト体重が設定済み | `resolveWeightKgForCalorie(70)` | `{ ok: true, weightKg: 70 }` |
| 2 | 異常系: デフォルト体重が`null` | `resolveWeightKgForCalorie(null)` | `{ ok: false, error: DEFAULT_WEIGHT_REQUIRED_ERROR }` |
| 3 | 異常系: デフォルト体重が`undefined`（ユーザーレコード自体が万一見つからない場合を想定） | `resolveWeightKgForCalorie(undefined)` | `{ ok: false, error: DEFAULT_WEIGHT_REQUIRED_ERROR }` |
| 4 | 境界値: 非常に小さい正の値 | `resolveWeightKgForCalorie(0.1)` | `{ ok: true, weightKg: 0.1 }` |

**`tests/unit/calorie.test.ts`（変更なし・確認のみ）:**
- 既存の全テストケースは `calculateCalories`/`estimateDurationMinutes` という純粋関数のみを対象とし、`weightKg`引数を直接渡す設計のため、本改修による影響は無い。実装フェーズでこのファイルを変更しないこと（変更が必要になった場合は設計との齟齬なので設計を見直す）。

### 6.2 E2Eテスト（Playwright, `tests/e2e/workout-flow.spec.ts`）— 詳細は§7で個別に書き換え内容を確定する。

### 6.3 手動確認観点（実装後の動作確認チェックリスト）
- [ ] プロフィールでデフォルト体重を未設定のまま記録を追加しようとすると、エラーメッセージ「体重が未設定です。プロフィールでデフォルト体重を設定してから記録してください。」が表示され、記録が保存されない。
- [ ] プロフィールでデフォルト体重を設定後、記録を追加すると、そのデフォルト体重を使ってカロリーが計算される（記録側に体重入力欄が存在しないことも目視確認）。
- [ ] 記録編集モーダルにも体重入力欄が存在しない。
- [ ] プロフィール画面で身長を入力→保存→画面再読み込み後も入力値が保持されている。
- [ ] 身長の値を変えても、既存記録・新規記録のカロリー表示に一切変化がない。
- [ ] 身長に負数や301以上を入力すると保存が拒否される（エラー表示）。
- [ ] （可能であれば本番相当データで）过去に`bodyWeightKgOverride`に値が入っている記録を表示し、カロリー・MET値の表示が改修前と変わらないことを確認する。

---

## 7. E2Eテスト書き換え方針（`tests/e2e/workout-flow.spec.ts`）

対象は `test.describe("トレーニング記録（最重要）", ...)` 内の5シナリオ。

### 7.1 「デフォルト体重設定→MET5.5マシンで記録→カロリーが期待値通り計算される」（維持、変更なし）
- 体重上書き欄を使っていないため、**そのまま維持**する。

### 7.2 「体重を記録時に上書き→デフォルト体重ではなく上書き体重でカロリーが計算される」（削除し、代替シナリオへ置換）
- `.getByLabel("体重（kg・上書き、任意）")` を使用しているため、この欄自体が無くなり**成立しなくなる**。このテストブロックを削除する。
- 代替として、次のシナリオを新設する（体重の「値」がプロフィール経由でのみ反映されることを確認する目的）:
```ts
test("プロフィールのデフォルト体重を変更すると、以降の記録に反映される", async ({ page }) => {
  const email = uniqueEmail("weightchange");
  await registerAndLogin(page, "体重変更ユーザー", email);

  await page.goto("/profile");
  await page.getByLabel("デフォルト体重 (kg)").fill("70");
  await page.getByRole("button", { name: "更新する" }).click();
  await expect(page.getByText("プロフィールを更新しました")).toBeVisible();

  await createSession(page);
  await selectExerciseByName(page, "チェストプレス");
  await page.getByLabel("セット数").fill("3");
  await page.getByLabel("レップ数").fill("10");
  await page.getByLabel("運動時間（分）").fill("30");
  await page.getByRole("button", { name: "記録を追加" }).click();
  // MET5.5 × 70kg × 0.5h × 1.05 = 202.1kcal
  await expect(page.getByText("202.1 kcal").first()).toBeVisible();

  await page.goto("/profile");
  await page.getByLabel("デフォルト体重 (kg)").fill("80");
  await page.getByRole("button", { name: "更新する" }).click();
  await expect(page.getByText("プロフィールを更新しました")).toBeVisible();

  await createSession(page);
  await selectExerciseByName(page, "チェストプレス");
  await page.getByLabel("セット数").fill("3");
  await page.getByLabel("レップ数").fill("10");
  await page.getByLabel("運動時間（分）").fill("30");
  await page.getByRole("button", { name: "記録を追加" }).click();
  // MET5.5 × 80kg × 0.5h × 1.05 = 231.0kcal
  await expect(page.getByText("231 kcal").first()).toBeVisible();
});
```

### 7.3 「セット数のみ変更（時間は同じ）→カロリー表示が変化しない」（書き換え）
- 体重上書き欄の `fill("70")` を2箇所とも削除し、代わりにテスト冒頭でプロフィールのデフォルト体重を70に設定する手順を追加する:
```ts
test("セット数のみ変更（時間は同じ）→カロリー表示が変化しない", async ({ page }) => {
  const email = uniqueEmail("setonly");
  await registerAndLogin(page, "セット数比較ユーザー", email);

  await page.goto("/profile");
  await page.getByLabel("デフォルト体重 (kg)").fill("70");
  await page.getByRole("button", { name: "更新する" }).click();
  await expect(page.getByText("プロフィールを更新しました")).toBeVisible();

  await createSession(page);
  await selectExerciseByName(page, "チェストプレス");
  await page.getByLabel("セット数").fill("3");
  await page.getByLabel("レップ数").fill("10");
  await page.getByLabel("運動時間（分）").fill("30");
  await page.getByRole("button", { name: "記録を追加" }).click();
  await expect(page.getByText("202.1 kcal").first()).toBeVisible();

  await page.getByLabel("セット数").fill("5");
  await page.getByLabel("レップ数").fill("10");
  await page.getByLabel("運動時間（分）").fill("30");
  await page.getByRole("button", { name: "記録を追加" }).click();

  await expect(page.getByText("202.1 kcal")).toHaveCount(2);
});
```

### 7.4 「デフォルト体重未設定・上書きも無しで記録保存→エラーが表示され保存されない」（文言更新のみ）
- テスト自体は本改修後も有効なシナリオ。期待するエラーテキストを新しい統一文言に更新する:
```ts
await expect(page.getByText("体重が未設定です")).toBeVisible();
await expect(page.getByText("まだ記録がありません。")).toBeVisible();
```
（`getByText`は既定で部分一致のため、`"体重が未設定です"`という先頭部分文字列での検証で足りる。）

### 7.5 「削除: ログ削除後、セッション詳細の合計カロリーが更新される」（書き換え）
- 体重上書き欄の `fill("70")` を削除し、事前にプロフィールでデフォルト体重70を設定する手順を追加する:
```ts
test("削除: ログ削除後、セッション詳細の合計カロリーが更新される", async ({ page }) => {
  const email = uniqueEmail("deletelog");
  await registerAndLogin(page, "削除確認ユーザー", email);

  await page.goto("/profile");
  await page.getByLabel("デフォルト体重 (kg)").fill("70");
  await page.getByRole("button", { name: "更新する" }).click();
  await expect(page.getByText("プロフィールを更新しました")).toBeVisible();

  await createSession(page);
  await selectExerciseByName(page, "チェストプレス");
  await page.getByLabel("セット数").fill("3");
  await page.getByLabel("レップ数").fill("10");
  await page.getByLabel("運動時間（分）").fill("30");
  await page.getByRole("button", { name: "記録を追加" }).click();
  await expect(page.getByText("合計消費カロリー")).toBeVisible();
  await expect(page.getByText("202.1 kcal").first()).toBeVisible();

  await page.getByRole("button", { name: "削除", exact: true }).click();
  await expect(page.getByText("まだ記録がありません。")).toBeVisible();
});
```

### 7.6 「マルチユーザー分離」テスト（変更なし）
- 体重上書きに依存しないため、変更不要。

### 7.7 補足
- 新設の身長入力に対する専用E2Eシナリオの追加は必須要件ではない（要件は「保存・表示のみ」であり、既存のプロフィールフォーム送信テストパターンと同型のため、リスクが低い）。ただし手動確認観点（§6.3）でカバーする。実装者の裁量で、`ProfileForm`の送信テストとして1シナリオ追加してもよい（推奨、必須ではない）。
- E2Eはこれまで一度もローカル実行できていない（Turso本番相当DBへの接続が必須のため）という前プロジェクトからの制約が継続する。本改修のE2E書き換えもコードレビューによる静的検証にとどめ、実行確認はQAフェーズ・本番相当環境で行う。

---

## 8. 完了条件チェックリスト

- [ ] `prisma/schema.prisma`: `User.heightCm Float?` が追加されている。`WorkoutLog.bodyWeightKgOverride` は削除されておらず、未使用化コメントが付与されている。
- [ ] `prisma/migrations/<timestamp>_add_user_height_cm/migration.sql` が新規作成され、内容が `ALTER TABLE "User" ADD COLUMN "heightCm" REAL;` のみである。
- [ ] `src/lib/validation.ts`: `workoutLogInputSchema` に `bodyWeightKgOverride` が存在しない。`profileUpdateSchema` に `heightCm` が追加されている。
- [ ] `src/lib/weight.ts` が新規作成され、`resolveWeightKgForCalorie()` と `DEFAULT_WEIGHT_REQUIRED_ERROR` がエクスポートされている。
- [ ] `src/types/index.ts`: `WorkoutLogDTO` に `bodyWeightKgOverride` が存在しない。
- [ ] `src/app/actions/workouts.ts`: `addWorkoutLog`/`updateWorkoutLog`双方が`resolveWeightKgForCalorie()`を使用し、体重未設定時のエラー文言が両関数で完全に一致している。Prismaの`create`/`update`の`data`および全DTOマッピング箇所（3箇所: create結果, update結果, getWorkoutSession）から`bodyWeightKgOverride`が除去されている。
- [ ] `src/app/actions/profile.ts` に変更が無い（差分ゼロであることを確認）。
- [ ] `src/components/WorkoutLogForm.tsx`: 体重上書き入力欄が存在しない。`defaultWeightKg`が`null`の場合に警告メッセージが表示される。
- [ ] `src/components/WorkoutSessionLogs.tsx`: 編集モーダルに体重上書き入力欄が存在しない。
- [ ] `src/components/WorkoutLogItem.tsx`: `bodyWeightKgOverride`を参照するコードが存在しない。
- [ ] `src/components/ProfileForm.tsx`: 身長入力欄が追加され、`initialHeightCm` propを受け取り初期表示に反映している。
- [ ] `src/app/profile/page.tsx`: `ProfileForm`に`initialHeightCm`が渡されている。
- [ ] `tests/unit/weight.test.ts` が新規作成され、§6.1の4ケースが実装されている。
- [ ] `tests/unit/calorie.test.ts` に変更が無い。
- [ ] `tests/e2e/workout-flow.spec.ts` が§7の内容に沿って書き換えられている（削除1件・新設1件・書き換え2件・文言更新1件・変更なし2件）。
- [ ] `npx tsc --noEmit`（またはプロジェクトのlint/typecheckコマンド）が通り、`bodyWeightKgOverride`参照の消し漏れによる型エラーが無いことを確認する。
- [ ] `npm run test`（Vitest, 単体テストのみ）が全てパスする。
- [ ] 本番Tursoへのマイグレーション適用・pushは本プロジェクトの実装フェーズでは実施しない（ユーザー確認後の別作業とする旨をエンジニアリングフェーズのwork-logに明記する）。
