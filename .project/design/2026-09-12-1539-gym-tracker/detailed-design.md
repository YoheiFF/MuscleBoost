---
project_id: "2026-09-12-1539-gym-tracker"
phase: design
doc: detailed-design
created: "2026-09-12"
---

# 詳細設計書: ジムトレーニング消費カロリー管理システム（MuscleBoost）

本書はClaudeCodeに実装依頼する際、複数回投げても同じ実装が得られる粒度で記述する。曖昧語（「適切に処理」等）は使用しない。

前提ドキュメント: `requirements.md`, `basic-design.md`（本書はこの2つに矛盾しないこと）

---

## 0. 概要

C:\project\MuscleBoost にゼロベースでNext.js(App Router) + TypeScript + Prisma + SQLite + Auth.js(NextAuth v5)構成のWebアプリを新規構築する。ユーザーはメール/パスワードでログインし、ジムのマシン（エクササイズ）ごとにセット数・レップ数・運動時間を記録すると、MET値ベースで消費カロリーが自動計算・保存される。複数ユーザーが各自のデータのみアクセス可能。

計算式（確定）:
```
kcal = MET値 × 体重(kg) × (運動時間(分) / 60) × 1.05
```
- `1.05` は `CALORIE_CORRECTION_FACTOR` として `src/lib/calorie.ts` に定数定義する。
- 結果は小数第1位に四捨五入する（`Math.round(raw * 10) / 10`）。

---

## 1. 影響範囲（新規/変更ファイル一覧）

現状 `C:\project\MuscleBoost` はアプリケーションコードが存在しないため、以下は**全て新規作成**である。

### 1.1 プロジェクト設定
| ファイル | 種別 |
|---|---|
| `package.json` | 新規 |
| `tsconfig.json` | 新規 |
| `next.config.ts` | 新規 |
| `postcss.config.mjs` | 新規 |
| `.env.example` | 新規 |
| `.gitignore` | 新規 |
| `README.md` | 新規（セットアップ手順記載。任意だが推奨） |

### 1.2 Prisma
| ファイル | 種別 |
|---|---|
| `prisma/schema.prisma` | 新規 |
| `prisma/seed.ts` | 新規 |

### 1.3 アプリケーションコード（`src/`）
| ファイル | 種別 |
|---|---|
| `src/middleware.ts` | 新規 |
| `src/app/layout.tsx` | 新規 |
| `src/app/globals.css` | 新規 |
| `src/app/page.tsx` | 新規（ダッシュボード） |
| `src/app/login/page.tsx` | 新規 |
| `src/app/register/page.tsx` | 新規 |
| `src/app/api/auth/[...nextauth]/route.ts` | 新規 |
| `src/app/exercises/page.tsx` | 新規 |
| `src/app/exercises/new/page.tsx` | 新規 |
| `src/app/workouts/page.tsx` | 新規 |
| `src/app/workouts/new/page.tsx` | 新規 |
| `src/app/workouts/[id]/page.tsx` | 新規 |
| `src/app/profile/page.tsx` | 新規 |
| `src/app/actions/auth.ts` | 新規 |
| `src/app/actions/exercises.ts` | 新規 |
| `src/app/actions/workouts.ts` | 新規 |
| `src/app/actions/profile.ts` | 新規 |
| `src/lib/prisma.ts` | 新規 |
| `src/lib/auth.ts` | 新規 |
| `src/lib/calorie.ts` | 新規 |
| `src/lib/validation.ts` | 新規 |
| `src/lib/session-guard.ts` | 新規 |
| `src/lib/date.ts` | 新規（週間/月間集計の日付範囲計算ユーティリティ） |
| `src/types/index.ts` | 新規 |
| `src/components/CalorieDisclaimer.tsx` | 新規 |
| `src/components/Header.tsx` | 新規 |
| `src/components/WorkoutLogForm.tsx` | 新規 |
| `src/components/WorkoutLogItem.tsx` | 新規 |
| `src/components/ExerciseForm.tsx` | 新規 |
| `src/components/ExercisePicker.tsx` | 新規 |
| `src/components/StatsSummaryCard.tsx` | 新規 |
| `src/components/WeightLogForm.tsx` | 新規 |

### 1.4 テスト
| ファイル | 種別 |
|---|---|
| `tests/unit/calorie.test.ts` | 新規（Vitest） |
| `tests/e2e/auth.spec.ts` | 新規（Playwright） |
| `tests/e2e/workout-flow.spec.ts` | 新規（Playwright） |

---

## 2. データ構造定義（`prisma/schema.prisma`）

### 2.1 設計方針（重要）
- SQLiteコネクタは Prisma の `enum` をサポートしないため、区分値（部位・強度カテゴリ）は **`String` カラム + アプリ層TypeScript Union型 + Zod** で表現する。PostgreSQL移行時もスキーマ変更不要にするため。
- 全ての子テーブルは `userId` を直接的または`WorkoutSession`経由の間接的な形で追跡可能にし、所有権チェックを常に可能にする。
- MET値は記録時点でスナップショットを取り、マスタ変更の影響を過去記録に及ぼさない。

### 2.2 スキーマ全文

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite" // 本番PostgreSQL移行時は "postgresql" に変更し DATABASE_URL を接続文字列に変更する
  url      = env("DATABASE_URL")
}

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

model Exercise {
  id                String   @id @default(cuid())
  name              String
  // MuscleGroup: "CHEST" | "BACK" | "LEGS" | "SHOULDERS" | "ARMS" | "ABS" | "FULL_BODY" | "CARDIO"
  muscleGroup       String
  // IntensityCategory: "LIGHT" | "MODERATE" | "VIGOROUS" | "HIGH_INTENSITY"
  intensityCategory String
  metValue          Float
  description       String?
  isCustom          Boolean  @default(false)
  createdByUserId   String?
  createdByUser     User?    @relation("UserCustomExercises", fields: [createdByUserId], references: [id], onDelete: Cascade)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  workoutLogs WorkoutLog[]

  @@index([createdByUserId])
  @@index([muscleGroup])
}

model WorkoutSession {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  performedAt DateTime
  memo        String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  logs WorkoutLog[]

  @@index([userId, performedAt])
}

model WorkoutLog {
  id                    String         @id @default(cuid())
  workoutSessionId      String
  workoutSession        WorkoutSession @relation(fields: [workoutSessionId], references: [id], onDelete: Cascade)
  exerciseId            String
  exercise              Exercise       @relation(fields: [exerciseId], references: [id])
  setCount              Int
  repsPerSet            Int
  durationMinutes       Float
  secondsPerSetOverride Int?
  bodyWeightKgOverride  Float?
  metValueSnapshot      Float
  caloriesBurned        Float
  createdAt             DateTime       @default(now())
  updatedAt             DateTime       @updatedAt

  @@index([workoutSessionId])
  @@index([exerciseId])
}

model WeightLog {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  weightKg   Float
  recordedAt DateTime
  createdAt  DateTime @default(now())

  @@index([userId, recordedAt])
}
```

### 2.3 TypeScript側の型定義（`src/types/index.ts`）

```ts
// src/types/index.ts

export const MUSCLE_GROUPS = [
  "CHEST", "BACK", "LEGS", "SHOULDERS", "ARMS", "ABS", "FULL_BODY", "CARDIO",
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const INTENSITY_CATEGORIES = [
  "LIGHT", "MODERATE", "VIGOROUS", "HIGH_INTENSITY",
] as const;
export type IntensityCategory = (typeof INTENSITY_CATEGORIES)[number];

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  CHEST: "胸", BACK: "背中", LEGS: "脚", SHOULDERS: "肩",
  ARMS: "腕", ABS: "腹", FULL_BODY: "全身", CARDIO: "有酸素",
};

export const INTENSITY_LABELS: Record<IntensityCategory, string> = {
  LIGHT: "軽度", MODERATE: "中等度", VIGOROUS: "高強度", HIGH_INTENSITY: "最高強度",
};

export interface ExerciseDTO {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  intensityCategory: IntensityCategory;
  metValue: number;
  description: string | null;
  isCustom: boolean;
  createdByUserId: string | null;
}

export interface WorkoutLogDTO {
  id: string;
  exerciseId: string;
  exerciseName: string;
  setCount: number;
  repsPerSet: number;
  durationMinutes: number;
  bodyWeightKgOverride: number | null;
  metValueSnapshot: number;
  caloriesBurned: number;
}

export interface WorkoutSessionSummaryDTO {
  id: string;
  performedAt: string; // ISO date string
  memo: string | null;
  logCount: number;
  totalCalories: number;
}

export interface WorkoutSessionDetailDTO extends WorkoutSessionSummaryDTO {
  logs: WorkoutLogDTO[];
}

export interface WeightLogDTO {
  id: string;
  weightKg: number;
  recordedAt: string;
}

export interface DashboardStatsDTO {
  periodDays: number;
  totalCalories: number;
  sessionCount: number;
  logCount: number;
  from: string;
  to: string;
}

/** Server Actionの共通戻り値型 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };
```

---

## 3. ファイル別変更詳細

### 3.1 `package.json`（新規）

編集前: 存在しない。
編集後の期待形（依存関係は最新の安定メジャーを想定。実装時は各パッケージの最新安定版に合わせてよいが、メジャーバージョンの整合性は保つこと）:

```json
{
  "name": "muscle-boost",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "db:migrate": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts",
    "db:studio": "prisma studio",
    "postinstall": "prisma generate"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "next-auth": "^5.0.0-beta.25",
    "@prisma/client": "^6.0.0",
    "bcryptjs": "^2.4.3",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@types/bcryptjs": "^2.4.6",
    "typescript": "^5",
    "prisma": "^6.0.0",
    "tailwindcss": "^4",
    "@tailwindcss/postcss": "^4",
    "tsx": "^4.19.0",
    "vitest": "^2.1.0",
    "playwright": "^1.60.0",
    "@playwright/test": "^1.60.0",
    "eslint": "^9",
    "eslint-config-next": "^15.0.0"
  }
}
```

補足: `prisma.seed` 設定はPrisma 6では`package.json`直下の`"prisma": {"seed": "tsx prisma/seed.ts"}`セクションを別途追加する（`prisma db seed`コマンド用）。

```json
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
```

### 3.2 `tsconfig.json`（新規）
- Next.js標準の`create-next-app`が生成する設定に準拠。`baseUrl`/`paths`で `@/*` → `./src/*` のエイリアスを設定する。

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### 3.3 `.env.example`（新規）
```
DATABASE_URL="file:./dev.db"
AUTH_SECRET="replace-with-openssl-rand-base64-32-output"
```
実運用では `.env` を作成し `openssl rand -base64 32` 等で生成した値を`AUTH_SECRET`に設定する。`.env`は`.gitignore`に含める。

### 3.4 `.gitignore`（新規）
```
node_modules
.next
out
.env
.env*.local
prisma/dev.db
prisma/dev.db-journal
*.tsbuildinfo
```

### 3.5 `src/lib/prisma.ts`（新規）
Prisma Clientのシングルトン化（Next.js開発時のHMRによる複数インスタンス生成を防止する公式パターン）。

```ts
// src/lib/prisma.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

### 3.6 `src/lib/calorie.ts`（新規）
**カロリー計算の中核。副作用なしの純粋関数のみを置く（テスト容易性のため他モジュールに依存させない）。**

```ts
// src/lib/calorie.ts

/** 厚生労働省の実務基準に基づく補正係数。将来変更する場合はここのみ変更する。 */
export const CALORIE_CORRECTION_FACTOR = 1.05;

export interface CalorieCalcInput {
  metValue: number;       // > 0
  weightKg: number;       // > 0
  durationMinutes: number; // > 0
}

/**
 * kcal = MET × 体重(kg) × 時間(h) × CALORIE_CORRECTION_FACTOR
 * 入力値が不正（0以下、NaN、Infinity）な場合は 0 を返す（呼び出し側は事前にZodで検証済みである前提だが、防御的に実装する）。
 * 戻り値は小数第1位に四捨五入する。
 */
export function calculateCalories(input: CalorieCalcInput): number {
  const { metValue, weightKg, durationMinutes } = input;
  if (
    !Number.isFinite(metValue) || metValue <= 0 ||
    !Number.isFinite(weightKg) || weightKg <= 0 ||
    !Number.isFinite(durationMinutes) || durationMinutes <= 0
  ) {
    return 0;
  }
  const hours = durationMinutes / 60;
  const raw = metValue * weightKg * hours * CALORIE_CORRECTION_FACTOR;
  return Math.round(raw * 10) / 10;
}

/**
 * セット数×1セットあたり想定秒数から運動時間(分)を逆算する任意の補助関数。
 * 必須機能ではない（FR-15）。UIの「時間を自動入力」ボタン用。
 */
export function estimateDurationMinutes(setCount: number, secondsPerSet: number): number {
  if (!Number.isFinite(setCount) || setCount <= 0) return 0;
  if (!Number.isFinite(secondsPerSet) || secondsPerSet <= 0) return 0;
  return Math.round(((setCount * secondsPerSet) / 60) * 10) / 10;
}
```

### 3.7 `src/lib/validation.ts`（新規）
Zodスキーマを集約。Server Actionsはこれらを`safeParse`で使う。

```ts
// src/lib/validation.ts
import { z } from "zod";
import { MUSCLE_GROUPS, INTENSITY_CATEGORIES } from "@/types";

export const registerSchema = z.object({
  email: z.string().email("メールアドレスの形式が正しくありません"),
  password: z.string().min(8, "パスワードは8文字以上で入力してください"),
  name: z.string().min(1, "表示名を入力してください").max(50),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const exerciseInputSchema = z.object({
  name: z.string().min(1, "マシン名を入力してください").max(80),
  muscleGroup: z.enum(MUSCLE_GROUPS),
  intensityCategory: z.enum(INTENSITY_CATEGORIES),
  metValue: z.number().positive("MET値は0より大きい値を入力してください").max(30),
  description: z.string().max(500).optional(),
});

export const workoutSessionInputSchema = z.object({
  performedAt: z.coerce.date(),
  memo: z.string().max(300).optional(),
});

export const workoutLogInputSchema = z.object({
  exerciseId: z.string().min(1),
  setCount: z.number().int().positive("セット数は1以上の整数で入力してください").max(50),
  repsPerSet: z.number().int().positive("レップ数は1以上の整数で入力してください").max(200),
  durationMinutes: z.number().positive("運動時間は0より大きい値を入力してください").max(600),
  bodyWeightKgOverride: z.number().positive().max(400).optional(),
});

export const profileUpdateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  defaultWeightKg: z.number().positive().max(400).optional(),
});

export const weightLogInputSchema = z.object({
  weightKg: z.number().positive().max(400),
  recordedAt: z.coerce.date().optional(), // 省略時は現在時刻
});
```

### 3.8 `src/lib/auth.ts`（新規）
NextAuth v5設定。Credentials Providerのみ。JWTセッション戦略（Credentialsを使う場合、NextAuthはdatabase戦略を許可しないためJWT必須）。

```ts
// src/lib/auth.ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validation";

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.id = token.id as string;
      return session;
    },
  },
});
```

補足: `next-auth`のデフォルト型に`session.user.id`が無いため、`src/types/next-auth.d.ts`（新規）で以下のようにモジュール拡張する。

```ts
// src/types/next-auth.d.ts
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}
```
（この1ファイルを1.3節の一覧に追加すること。）

### 3.9 `src/lib/session-guard.ts`（新規）
全Server Actionの先頭で使う認可ヘルパー。

```ts
// src/lib/session-guard.ts
import { auth } from "@/lib/auth";

export class UnauthorizedError extends Error {
  constructor() {
    super("ログインが必要です");
    this.name = "UnauthorizedError";
  }
}

/** ログイン済みユーザーのID・emailを返す。未ログインならUnauthorizedErrorをthrowする。 */
export async function getCurrentUserOrThrow(): Promise<{ id: string; email: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new UnauthorizedError();
  }
  return { id: session.user.id, email: session.user.email ?? "" };
}
```

### 3.10 `src/lib/date.ts`（新規）
```ts
// src/lib/date.ts

/** 現在時刻から指定日数前のISO日時文字列と現在時刻を返す（ダッシュボード集計用） */
export function getPeriodRange(days: number): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to };
}
```

### 3.11 `prisma/seed.ts`（新規）
マシンマスタの初期データ投入。要件5-2に基づき、主要な筋トレマシン10種は軽度/中等度/高強度の3レベル、有酸素マシンは厚労省メッツ表準拠の速度/ワット帯ごとに個別レコードとする。

```ts
// prisma/seed.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 筋トレマシン: Compendium of Physical Activities の
// "Weight lifting, light/moderate effort"=3.0, "Resistance training, multiple exercises, 8-15 reps, varied resistance"=5.5,
// "Weight lifting (power lifting/body building), vigorous effort"=6.0 を根拠に3段階を割り当てる。
const STRENGTH_MACHINES: Array<{ name: string; muscleGroup: string }> = [
  { name: "チェストプレス", muscleGroup: "CHEST" },
  { name: "ラットプルダウン", muscleGroup: "BACK" },
  { name: "レッグプレス", muscleGroup: "LEGS" },
  { name: "レッグエクステンション", muscleGroup: "LEGS" },
  { name: "レッグカール", muscleGroup: "LEGS" },
  { name: "ショルダープレス", muscleGroup: "SHOULDERS" },
  { name: "アブドミナルクランチ", muscleGroup: "ABS" },
  { name: "シーテッドロー", muscleGroup: "BACK" },
  { name: "ケーブルクロスオーバー", muscleGroup: "CHEST" },
  { name: "スミスマシン", muscleGroup: "FULL_BODY" },
];

const STRENGTH_LEVELS: Array<{ suffix: string; intensityCategory: string; metValue: number; description: string }> = [
  { suffix: "（軽度）", intensityCategory: "LIGHT", metValue: 3.0, description: "Compendium: Weight lifting, light or moderate effort" },
  { suffix: "（中等度）", intensityCategory: "MODERATE", metValue: 5.5, description: "Compendium: Resistance training, multiple exercises, 8-15 reps, varied resistance" },
  { suffix: "（高強度）", intensityCategory: "VIGOROUS", metValue: 6.0, description: "Compendium: Weight lifting (power lifting/body building), vigorous effort" },
];

// 有酸素マシン: 厚労省「健康づくりのための身体活動基準」参考資料 運動のメッツ表 準拠
const CARDIO_MACHINES: Array<{ name: string; intensityCategory: string; metValue: number; description: string }> = [
  { name: "エアロバイク（30〜50W）", intensityCategory: "LIGHT", metValue: 3.5, description: "厚労省メッツ表: 自転車エルゴメーター(30〜50ワット)" },
  { name: "トレッドミル（速歩 93m/分）", intensityCategory: "MODERATE", metValue: 4.3, description: "厚労省メッツ表: やや速歩（平地、93m/分）" },
  { name: "トレッドミル（ジョギング）", intensityCategory: "VIGOROUS", metValue: 7.0, description: "厚労省メッツ表: ジョギング" },
  { name: "エアロバイク（90〜100W）", intensityCategory: "VIGOROUS", metValue: 6.8, description: "厚労省メッツ表: 自転車エルゴメーター(90〜100ワット)" },
  { name: "ランニングマシン（134m/分）", intensityCategory: "HIGH_INTENSITY", metValue: 8.3, description: "厚労省メッツ表: ランニング(134m/分)" },
  { name: "クロストレーナー", intensityCategory: "VIGOROUS", metValue: 8.0, description: "Compendium: Circuit training, including some aerobic movement with minimal rest" },
];

async function main() {
  for (const machine of STRENGTH_MACHINES) {
    for (const level of STRENGTH_LEVELS) {
      const name = `${machine.name}${level.suffix}`;
      await prisma.exercise.upsert({
        where: { id: `seed-${machine.name}-${level.intensityCategory}` },
        update: {},
        create: {
          id: `seed-${machine.name}-${level.intensityCategory}`,
          name,
          muscleGroup: machine.muscleGroup,
          intensityCategory: level.intensityCategory,
          metValue: level.metValue,
          description: level.description,
          isCustom: false,
        },
      });
    }
  }

  for (const cardio of CARDIO_MACHINES) {
    await prisma.exercise.upsert({
      where: { id: `seed-cardio-${cardio.name}` },
      update: {},
      create: {
        id: `seed-cardio-${cardio.name}`,
        name: cardio.name,
        muscleGroup: "CARDIO",
        intensityCategory: cardio.intensityCategory,
        metValue: cardio.metValue,
        description: cardio.description,
        isCustom: false,
      },
    });
  }

  console.log("シードデータ投入完了: マシンマスタ", STRENGTH_MACHINES.length * STRENGTH_LEVELS.length + CARDIO_MACHINES.length, "件");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

注: `upsert`の`where.id`に固定文字列IDを使うことで、シード再実行時の重複作成を防止する（冪等性の確保）。

### 3.12 `src/app/actions/auth.ts`（新規）
```ts
// src/app/actions/auth.ts
"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validation";
import type { ActionResult } from "@/types";

export async function registerAction(
  _prev: ActionResult<{ userId: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ userId: string }>> {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { ok: false, error: "入力内容を確認してください", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    return { ok: false, error: "このメールアドレスは既に登録されています" };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.user.create({
    data: { email: parsed.data.email, passwordHash, name: parsed.data.name },
  });

  return { ok: true, data: { userId: user.id } };
}
```
処理フロー:
1. FormDataをZodで検証。失敗時は`fieldErrors`付きで返却（画面はこれをフィールド単位で表示）。
2. email重複チェック。重複時はエラー文言を返す（登録成功/失敗の応答時間差でメール存在を推測されるリスクは本アプリの脅威モデルでは許容する）。
3. bcryptjsでハッシュ化（コストファクタ10）。
4. `User`作成。
5. 呼び出し元（`register/page.tsx`）が成功時に`signIn("credentials", {...})`とリダイレクトを行う。

### 3.13 `src/app/actions/exercises.ts`（新規）
```ts
// src/app/actions/exercises.ts
"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserOrThrow } from "@/lib/session-guard";
import { exerciseInputSchema } from "@/lib/validation";
import type { ActionResult, ExerciseDTO, MuscleGroup, IntensityCategory } from "@/types";

function toDTO(row: {
  id: string; name: string; muscleGroup: string; intensityCategory: string;
  metValue: number; description: string | null; isCustom: boolean; createdByUserId: string | null;
}): ExerciseDTO {
  return {
    ...row,
    muscleGroup: row.muscleGroup as MuscleGroup,
    intensityCategory: row.intensityCategory as IntensityCategory,
  };
}

/** マスタ + 自分のカスタムマシンを一覧取得（他人のカスタムは含めない） */
export async function listExercises(filter?: { muscleGroup?: MuscleGroup }): Promise<ExerciseDTO[]> {
  const user = await getCurrentUserOrThrow();
  const rows = await prisma.exercise.findMany({
    where: {
      AND: [
        filter?.muscleGroup ? { muscleGroup: filter.muscleGroup } : {},
        { OR: [{ isCustom: false }, { createdByUserId: user.id }] },
      ],
    },
    orderBy: [{ isCustom: "asc" }, { muscleGroup: "asc" }, { name: "asc" }],
  });
  return rows.map(toDTO);
}

export async function createExercise(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUserOrThrow();
  const parsed = exerciseInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力内容を確認してください", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const created = await prisma.exercise.create({
    data: { ...parsed.data, isCustom: true, createdByUserId: user.id },
  });
  return { ok: true, data: { id: created.id } };
}

export async function deleteCustomExercise(id: string): Promise<ActionResult> {
  const user = await getCurrentUserOrThrow();
  const target = await prisma.exercise.findUnique({ where: { id } });
  if (!target || !target.isCustom || target.createdByUserId !== user.id) {
    return { ok: false, error: "対象のマシンが見つかりません" };
  }
  await prisma.exercise.delete({ where: { id } });
  return { ok: true, data: undefined };
}
```
エラー処理:
- 未ログイン: `getCurrentUserOrThrow`が`UnauthorizedError`をthrow → 呼び出し元のpage.tsxはError Boundary/redirectで処理（`middleware.ts`で通常は到達しない想定だが二重防御とする）。
- マスタ（`isCustom=false`）削除試行、他人のカスタム削除試行: 存在しないものとして扱い「対象のマシンが見つかりません」を返す（所有権の有無を漏らさない）。

### 3.14 `src/app/actions/workouts.ts`（新規、最重要ファイル）
```ts
// src/app/actions/workouts.ts
"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserOrThrow } from "@/lib/session-guard";
import { calculateCalories } from "@/lib/calorie";
import { getPeriodRange } from "@/lib/date";
import { workoutSessionInputSchema, workoutLogInputSchema } from "@/lib/validation";
import type {
  ActionResult, WorkoutSessionSummaryDTO, WorkoutSessionDetailDTO,
  WorkoutLogDTO, DashboardStatsDTO,
} from "@/types";

export async function createWorkoutSession(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUserOrThrow();
  const parsed = workoutSessionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力内容を確認してください", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const session = await prisma.workoutSession.create({
    data: { userId: user.id, performedAt: parsed.data.performedAt, memo: parsed.data.memo },
  });
  return { ok: true, data: { id: session.id } };
}

/** ワークアウトログ追加。カロリーはここで計算し保存する（アプリ内で唯一のカロリー計算箇所）。 */
export async function addWorkoutLog(sessionId: string, input: unknown): Promise<ActionResult<{ log: WorkoutLogDTO }>> {
  const user = await getCurrentUserOrThrow();

  const session = await prisma.workoutSession.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== user.id) {
    return { ok: false, error: "対象のセッションが見つかりません" };
  }

  const parsed = workoutLogInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力内容を確認してください", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;

  const exercise = await prisma.exercise.findUnique({ where: { id: data.exerciseId } });
  if (!exercise) {
    return { ok: false, error: "対象のマシンが見つかりません" };
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  const weightKg = data.bodyWeightKgOverride ?? dbUser?.defaultWeightKg ?? null;
  if (weightKg === null) {
    return { ok: false, error: "体重を入力してください（プロフィールでデフォルト体重を設定するか、この記録で体重を入力してください）" };
  }

  const caloriesBurned = calculateCalories({
    metValue: exercise.metValue,
    weightKg,
    durationMinutes: data.durationMinutes,
  });

  const log = await prisma.workoutLog.create({
    data: {
      workoutSessionId: sessionId,
      exerciseId: data.exerciseId,
      setCount: data.setCount,
      repsPerSet: data.repsPerSet,
      durationMinutes: data.durationMinutes,
      bodyWeightKgOverride: data.bodyWeightKgOverride ?? null,
      metValueSnapshot: exercise.metValue,
      caloriesBurned,
    },
  });

  return {
    ok: true,
    data: {
      log: {
        id: log.id,
        exerciseId: log.exerciseId,
        exerciseName: exercise.name,
        setCount: log.setCount,
        repsPerSet: log.repsPerSet,
        durationMinutes: log.durationMinutes,
        bodyWeightKgOverride: log.bodyWeightKgOverride,
        metValueSnapshot: log.metValueSnapshot,
        caloriesBurned: log.caloriesBurned,
      },
    },
  };
}

/** ログ更新（体重・時間等を変更した場合、カロリーを再計算する） */
export async function updateWorkoutLog(logId: string, input: unknown): Promise<ActionResult<{ log: WorkoutLogDTO }>> {
  const user = await getCurrentUserOrThrow();

  const existing = await prisma.workoutLog.findUnique({
    where: { id: logId },
    include: { workoutSession: true, exercise: true },
  });
  if (!existing || existing.workoutSession.userId !== user.id) {
    return { ok: false, error: "対象の記録が見つかりません" };
  }

  const parsed = workoutLogInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力内容を確認してください", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  const weightKg = data.bodyWeightKgOverride ?? dbUser?.defaultWeightKg ?? null;
  if (weightKg === null) {
    return { ok: false, error: "体重を入力してください" };
  }

  // MET値はマスタの現在値を使う（マシン変更されていなければスナップショットは既存値のまま維持してもよいが、
  // ここでは編集時点の最新マスタ値で再計算し、metValueSnapshotも更新する: 編集操作は「今の情報で直す」行為とみなす）。
  const exercise = existing.exerciseId === data.exerciseId
    ? existing.exercise
    : await prisma.exercise.findUnique({ where: { id: data.exerciseId } });
  if (!exercise) {
    return { ok: false, error: "対象のマシンが見つかりません" };
  }

  const caloriesBurned = calculateCalories({
    metValue: exercise.metValue,
    weightKg,
    durationMinutes: data.durationMinutes,
  });

  const updated = await prisma.workoutLog.update({
    where: { id: logId },
    data: {
      exerciseId: data.exerciseId,
      setCount: data.setCount,
      repsPerSet: data.repsPerSet,
      durationMinutes: data.durationMinutes,
      bodyWeightKgOverride: data.bodyWeightKgOverride ?? null,
      metValueSnapshot: exercise.metValue,
      caloriesBurned,
    },
  });

  return {
    ok: true,
    data: {
      log: {
        id: updated.id,
        exerciseId: updated.exerciseId,
        exerciseName: exercise.name,
        setCount: updated.setCount,
        repsPerSet: updated.repsPerSet,
        durationMinutes: updated.durationMinutes,
        bodyWeightKgOverride: updated.bodyWeightKgOverride,
        metValueSnapshot: updated.metValueSnapshot,
        caloriesBurned: updated.caloriesBurned,
      },
    },
  };
}

export async function deleteWorkoutLog(logId: string): Promise<ActionResult> {
  const user = await getCurrentUserOrThrow();
  const existing = await prisma.workoutLog.findUnique({
    where: { id: logId },
    include: { workoutSession: true },
  });
  if (!existing || existing.workoutSession.userId !== user.id) {
    return { ok: false, error: "対象の記録が見つかりません" };
  }
  await prisma.workoutLog.delete({ where: { id: logId } });
  return { ok: true, data: undefined };
}

export async function deleteWorkoutSession(sessionId: string): Promise<ActionResult> {
  const user = await getCurrentUserOrThrow();
  const existing = await prisma.workoutSession.findUnique({ where: { id: sessionId } });
  if (!existing || existing.userId !== user.id) {
    return { ok: false, error: "対象のセッションが見つかりません" };
  }
  await prisma.workoutSession.delete({ where: { id: sessionId } }); // WorkoutLogはonDelete:Cascadeで自動削除
  return { ok: true, data: undefined };
}

export async function listWorkoutSessions(): Promise<WorkoutSessionSummaryDTO[]> {
  const user = await getCurrentUserOrThrow();
  const sessions = await prisma.workoutSession.findMany({
    where: { userId: user.id },
    include: { logs: true },
    orderBy: { performedAt: "desc" },
  });
  return sessions.map((s) => ({
    id: s.id,
    performedAt: s.performedAt.toISOString(),
    memo: s.memo,
    logCount: s.logs.length,
    totalCalories: Math.round(s.logs.reduce((sum, l) => sum + l.caloriesBurned, 0) * 10) / 10,
  }));
}

export async function getWorkoutSession(id: string): Promise<WorkoutSessionDetailDTO | null> {
  const user = await getCurrentUserOrThrow();
  const s = await prisma.workoutSession.findUnique({
    where: { id },
    include: { logs: { include: { exercise: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!s || s.userId !== user.id) return null;

  const logs: WorkoutLogDTO[] = s.logs.map((l) => ({
    id: l.id,
    exerciseId: l.exerciseId,
    exerciseName: l.exercise.name,
    setCount: l.setCount,
    repsPerSet: l.repsPerSet,
    durationMinutes: l.durationMinutes,
    bodyWeightKgOverride: l.bodyWeightKgOverride,
    metValueSnapshot: l.metValueSnapshot,
    caloriesBurned: l.caloriesBurned,
  }));

  return {
    id: s.id,
    performedAt: s.performedAt.toISOString(),
    memo: s.memo,
    logCount: logs.length,
    totalCalories: Math.round(logs.reduce((sum, l) => sum + l.caloriesBurned, 0) * 10) / 10,
    logs,
  };
}

export async function getDashboardStats(periodDays: 7 | 30): Promise<DashboardStatsDTO> {
  const user = await getCurrentUserOrThrow();
  const { from, to } = getPeriodRange(periodDays);

  const sessions = await prisma.workoutSession.findMany({
    where: { userId: user.id, performedAt: { gte: from, lte: to } },
    include: { logs: true },
  });

  const totalCalories = sessions.reduce(
    (sum, s) => sum + s.logs.reduce((sSum, l) => sSum + l.caloriesBurned, 0),
    0
  );
  const logCount = sessions.reduce((sum, s) => sum + s.logs.length, 0);

  return {
    periodDays,
    totalCalories: Math.round(totalCalories * 10) / 10,
    sessionCount: sessions.length,
    logCount,
    from: from.toISOString(),
    to: to.toISOString(),
  };
}
```

**処理フロー詳細（`addWorkoutLog`、最重要ロジック）**:
1. `getCurrentUserOrThrow()` でログインユーザーを取得。未ログインなら例外→呼び出し元でエラー表示。
2. `sessionId`で`WorkoutSession`を取得し、`session.userId === user.id`を確認（他人のセッションへのログ追加を防止）。不一致・存在しない場合は「対象のセッションが見つかりません」で終了。
3. `workoutLogInputSchema`で入力検証。
4. `exerciseId`から`Exercise`を取得。存在しなければエラー。
5. 体重解決: `input.bodyWeightKgOverride ?? user.defaultWeightKg ?? null`。両方無ければエラーで終了（FR-13, AC-05）。
6. `calculateCalories()`で計算。
7. `WorkoutLog`を作成し、`metValueSnapshot`（計算時点のMET値）と`caloriesBurned`を保存。
8. DTOに変換して返却。

### 3.15 `src/app/actions/profile.ts`（新規）
```ts
// src/app/actions/profile.ts
"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserOrThrow } from "@/lib/session-guard";
import { profileUpdateSchema, weightLogInputSchema } from "@/lib/validation";
import type { ActionResult, WeightLogDTO } from "@/types";

export async function updateProfile(input: unknown): Promise<ActionResult> {
  const user = await getCurrentUserOrThrow();
  const parsed = profileUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力内容を確認してください", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  await prisma.user.update({ where: { id: user.id }, data: parsed.data });
  return { ok: true, data: undefined };
}

export async function addWeightLog(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUserOrThrow();
  const parsed = weightLogInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力内容を確認してください", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const log = await prisma.weightLog.create({
    data: {
      userId: user.id,
      weightKg: parsed.data.weightKg,
      recordedAt: parsed.data.recordedAt ?? new Date(),
    },
  });
  return { ok: true, data: { id: log.id } };
}

export async function listWeightLogs(): Promise<WeightLogDTO[]> {
  const user = await getCurrentUserOrThrow();
  const rows = await prisma.weightLog.findMany({
    where: { userId: user.id },
    orderBy: { recordedAt: "desc" },
  });
  return rows.map((r) => ({ id: r.id, weightKg: r.weightKg, recordedAt: r.recordedAt.toISOString() }));
}
```

### 3.16 `src/middleware.ts`（新規）
```ts
// src/middleware.ts
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/register"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || pathname.startsWith("/api/auth");
  if (!req.auth && !isPublic) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

### 3.17 `src/app/api/auth/[...nextauth]/route.ts`（新規）
```ts
// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
```

### 3.18 画面コンポーネント（`src/app/**/page.tsx`）

各ページはServer Componentとして初期データをActions経由（直接importして`await`）で取得し、フォーム部分はClient Componentに切り出す。以下に各ページの責務と主要propsを定義する。

#### `src/app/login/page.tsx`
- Server Component。`searchParams.callbackUrl`を受け取る。
- フォーム送信は`"use client"`の`<LoginForm callbackUrl={...} />`（`src/components`に追加せずpage内にインライン定義してもよいが、テスト容易性のため`src/components/LoginForm.tsx`として切り出す。**1.3節に `src/components/LoginForm.tsx` を追加**）。
- `LoginForm`は`next-auth/react`の`signIn("credentials", { email, password, redirect: false })`を呼び、成功時は`router.push(callbackUrl ?? "/")`、失敗時はエラーメッセージ表示。

#### `src/app/register/page.tsx`
- `useActionState(registerAction, undefined)`（React 19）でフォーム状態管理。
- 成功時（`state.ok === true`）、クライアント側で`signIn("credentials", {...})`を呼び自動ログイン後`/`へ遷移。

#### `src/app/page.tsx`（ダッシュボード）
- Server Component。`getDashboardStats(7)`, `getDashboardStats(30)`, `listWorkoutSessions()`（先頭5件のみ表示用にslice）を並列取得（`Promise.all`）。
- `<StatsSummaryCard periodLabel="直近7日" stats={weekStats} />` 等を表示。
- `<CalorieDisclaimer />` を必ず表示。

#### `src/app/exercises/page.tsx`
- `searchParams.muscleGroup`で絞り込み。`listExercises({ muscleGroup })`を呼び一覧表示。
- 部位フィルタのUIはタブまたはセレクトボックス（`MUSCLE_GROUPS`をmapして生成）。
- 「マイマシンを追加」ボタンで`/exercises/new`へ。

#### `src/app/exercises/new/page.tsx`
- `<ExerciseForm />`（Client Component）。`createExercise`をServer Action経由で呼び、成功時`/exercises`へリダイレクト。

#### `src/app/workouts/page.tsx`
- `listWorkoutSessions()`を呼び一覧表示（日付降順）。各行は`/workouts/[id]`へのリンク。
- 「新規セッション」ボタンで`/workouts/new`。

#### `src/app/workouts/new/page.tsx`
- `createWorkoutSession`実行後、返却された`id`で`/workouts/[id]`へリダイレクトし、そこでログ追加を行うフローとする（セッション作成とログ追加を2段階に分離し、実装・UIをシンプルにする）。

#### `src/app/workouts/[id]/page.tsx`
- `getWorkoutSession(params.id)`。`null`の場合は`notFound()`（Next.jsの404）。
- `<WorkoutLogForm sessionId exercises={await listExercises()} />` でログ追加。
- 既存ログは`<WorkoutLogItem log={...} onEdit onDelete />`で一覧表示、編集・削除は`updateWorkoutLog`/`deleteWorkoutLog`をServer Actionとして呼ぶ。
- セッション全体の削除ボタンあり（`deleteWorkoutSession`）。

#### `src/app/profile/page.tsx`
- 現在のユーザー情報（表示名・デフォルト体重）と`listWeightLogs()`を表示。
- `<WeightLogForm />`で体重履歴追加、プロフィール更新フォームで`updateProfile`呼び出し。

### 3.19 主要コンポーネントのProps定義

```ts
// src/components/WorkoutLogForm.tsx
"use client";
interface WorkoutLogFormProps {
  sessionId: string;
  exercises: ExerciseDTO[];
  defaultWeightKg: number | null;
  onCreated?: (log: WorkoutLogDTO) => void;
}
```
- セット数・レップ数・運動時間(分)の入力欄、マシン選択（`ExercisePicker`）、体重上書き入力欄（任意、placeholderに`defaultWeightKg`を表示）。
- 「セット数×秒数から時間を計算」補助ボタン: `estimateDurationMinutes(setCount, secondsPerSet)`を呼び、運動時間欄に反映（ユーザーが直接編集可能な値であり、送信時は最終的にフォームに表示されている値を送る）。
- 送信時 `addWorkoutLog(sessionId, input)` を呼び、結果が`ok:false`ならエラーメッセージ表示、`ok:true`なら`onCreated`でリスト更新。

```ts
// src/components/WorkoutLogItem.tsx
interface WorkoutLogItemProps {
  log: WorkoutLogDTO;
  onEdit: (log: WorkoutLogDTO) => void;
  onDelete: (id: string) => void;
}
```

```ts
// src/components/ExerciseForm.tsx
"use client";
interface ExerciseFormProps {
  onCreated?: (id: string) => void;
}
```

```ts
// src/components/ExercisePicker.tsx
interface ExercisePickerProps {
  exercises: ExerciseDTO[];
  value: string; // exerciseId
  onChange: (exerciseId: string) => void;
}
```

```ts
// src/components/StatsSummaryCard.tsx
interface StatsSummaryCardProps {
  periodLabel: string;
  stats: DashboardStatsDTO;
}
```

```ts
// src/components/WeightLogForm.tsx
"use client";
interface WeightLogFormProps {
  onCreated?: (log: WeightLogDTO) => void;
}
```

```ts
// src/components/CalorieDisclaimer.tsx
// props無し。固定文言「表示される消費カロリーはMET値に基づく目安であり、個人差があります。」を表示する。
```

```ts
// src/components/Header.tsx
interface HeaderProps {
  userName: string | null; // nullの場合は未ログイン（ログイン/登録リンクを表示）
}
```

---

## 4. 初期セットアップ手順

ClaudeCodeが実装時に実行するコマンド列（Windows/PowerShell前提）:

```powershell
# 1. Next.jsプロジェクトの依存関係インストール（package.json/tsconfig.json等は本書の内容で作成済みとする）
npm install

# 2. Prisma初期化・マイグレーション
npx prisma migrate dev --name init

# 3. シードデータ投入
npm run db:seed

# 4. 開発サーバー起動確認（動作確認用。ClaudeCode実装時は起動のみ確認しすぐ停止してよい）
npm run dev
```

`.env` はコピーして作成する:
```powershell
Copy-Item .env.example .env
```
`AUTH_SECRET` は `openssl rand -base64 32`（または`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`）で生成した値に置き換える。

---

## 5. エラーハンドリング方針（全体規約）

| 状況 | 方針 |
|---|---|
| 未ログインでの保護ページアクセス | `middleware.ts`が`/login?callbackUrl=...`へリダイレクト |
| 未ログインでのServer Action直接呼び出し（万一の防御） | `getCurrentUserOrThrow()`が`UnauthorizedError`をthrow。呼び出し元Client Componentはtry/catchし「ログインが必要です」を表示後`/login`へ誘導 |
| 他人のリソースへのアクセス（存在確認込み） | 404/所有権不一致を区別せず「対象が見つかりません」で統一（存在有無の推測を防ぐ） |
| Zodバリデーション失敗 | `{ ok:false, error, fieldErrors }`を返し、フォームは該当フィールド直下にエラー文言を表示 |
| 体重未確定（override無し・プロフィール未設定） | `addWorkoutLog`が明示的エラー文言を返す（AC-05） |
| email重複登録 | 「このメールアドレスは既に登録されています」を`registerAction`が返す |
| DB接続エラー・予期しない例外 | Server Action内でcatchし`console.error(err)`でログ出力後、`{ ok:false, error: "サーバーエラーが発生しました。時間をおいて再度お試しください" }`を返す（スタックトレース等の内部情報はクライアントに返さない） |
| マスタ（`isCustom=false`）の編集・削除試行 | `deleteCustomExercise`が対象なしとして扱いエラーを返す。UI側もマスタ行には編集・削除ボタンを表示しない（二重防御） |

---

## 6. テスト観点（QAチーム用）

### 6.1 単体テスト（`tests/unit/calorie.test.ts`, Vitest）
正常系:
- `calculateCalories({metValue:3.0, weightKg:70, durationMinutes:30})` → `110.25`を四捨五入した`110.3`（Math.round(110.25*10)/10 = 1102.5→1103? 要検算し実装時にテストで確定。設計時点の期待値算出根拠: 3.0×70×0.5×1.05=110.25、`Math.round(1102.5)/10=110.3`）となることを確認。
- `estimateDurationMinutes(3, 60)` → `3.0`（3セット×60秒/セット=180秒=3分）。

異常系・境界値:
- `metValue=0` / `weightKg=0` / `durationMinutes=0` → `0`を返す。
- 負数・`NaN`・`Infinity`を渡した場合 → `0`を返す（防御的挙動の確認）。
- 非常に大きい値（`durationMinutes=600`, `metValue=11`, `weightKg=200`）でも例外を起こさず数値を返す。

### 6.2 結合・E2E（`tests/e2e/*.spec.ts`, Playwright）

**認証**
- 正常系: 新規登録→自動ログイン→ダッシュボード表示。
- 正常系: ログアウト後、再ログインできる。
- 異常系: 既存メールアドレスで登録→エラーメッセージ表示。
- 異常系: 誤ったパスワードでログイン→エラーメッセージ表示。
- 境界値: パスワード7文字（8文字未満）で登録拒否。
- アクセス制御: 未ログイン状態で`/`, `/workouts`, `/profile`に直接アクセス→`/login`へリダイレクトされる。

**マシンマスタ**
- 正常系: シード投入後、マシン一覧に36件（筋トレ30件＋有酸素6件）表示される。
- 正常系: 部位フィルタ「脚」でレッグプレス等のみ表示される。
- 正常系: カスタムマシンを追加すると一覧に表示され、削除できる。
- 異常系: MET値に0以下の値を入力→保存拒否。
- 権限: マスタ由来の行に編集・削除ボタンが表示されない。

**トレーニング記録（最重要）**
- 正常系: プロフィールでデフォルト体重70kgを設定→MET3.0のマシンでセット3・レップ10・時間30分を記録→カロリーが期待値通り計算・表示される。
- 正常系: 体重を記録時に80kgで上書き→カロリーがデフォルト体重ではなく80kgで計算される。
- 正常系: セット数のみ変更（時間は同じ）→カロリー表示が変化しない（AC-07の検証）。
- 異常系: デフォルト体重未設定・上書きも無しで記録保存→「体重を入力してください」エラーが表示され保存されない。
- 異常系: 運動時間に0または負数を入力→保存拒否。
- 編集: 既存ログの運動時間を変更→保存後カロリーが再計算される。
- 削除: ログ削除後、セッション詳細・ダッシュボードの合計カロリーが更新される。
- 削除: セッション削除後、配下の全ログも削除される（カスケード確認）。
- **マルチユーザー分離（重要・必須）**: ユーザーA・Bを作成し、Aで作成したセッション/ログ/カスタムマシンのIDをBのブラウザ（別セッション）で直接URL指定してアクセス・編集・削除しようとした場合、いずれも「見つかりません」となり操作できないことを確認する。
- マスタ変更の非影響: 管理者相当の操作（シード再実行やDB直接更新）でExerciseのMET値を変更しても、既存の`WorkoutLog.caloriesBurned`・`metValueSnapshot`は変わらないことを確認する（DBレベルの確認で可）。

**ダッシュボード**
- 正常系: 直近7日間・30日間のいずれもログが無い新規ユーザーでは「0kcal」等の空表示になり、エラーにならない。
- 正常系: 複数セッション・複数ログがある場合の合計カロリー・記録回数の集計が手計算と一致する。

**UI/表示**
- カロリーが表示される全画面（ダッシュボード、セッション詳細、ログ一覧）に免責文言が表示されていることを確認する。
- 幅375pxのビューポートで記録フォームの入力・送信が問題なく行えることを確認する。

---

## 7. 完了条件チェックリスト

- [ ] `package.json`に定義した全依存関係がインストールされ、`npm run build`がエラーなく完了する。
- [ ] `prisma migrate dev`でSQLiteスキーマが作成され、`prisma/dev.db`が生成される。
- [ ] `npm run db:seed`実行後、Exerciseテーブルに36件（筋トレ30件＋有酸素6件）のレコードが存在する。
- [ ] 新規登録→ログイン→ログアウトが一連で動作する。
- [ ] 未ログイン状態で保護パスにアクセスすると`/login`へリダイレクトされる。
- [ ] トレーニングログ作成時、要件5-2の計算式でカロリーが正しく計算・保存される（単体テストで検証済み）。
- [ ] 体重未確定時にエラーとなり保存が拒否される。
- [ ] 他ユーザーのリソースへの直接ID指定アクセスが全て拒否される（Server Action・ページの両方で確認）。
- [ ] マスタのMET値変更が既存ログの`caloriesBurned`に影響しない（スナップショット方式の確認）。
- [ ] カロリー表示画面全てに免責文言が表示される。
- [ ] `tests/unit/calorie.test.ts`が全件パスする。
- [ ] `tests/e2e/*.spec.ts`が全件パスする。
- [ ] レスポンシブ表示（375px幅）で主要操作（記録追加・編集・削除）が可能である。
- [ ] `.env`・`prisma/dev.db`が`.gitignore`に含まれ、リポジトリに含まれない。
