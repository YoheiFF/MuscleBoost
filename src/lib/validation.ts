// src/lib/validation.ts
import { z } from "zod";
import { MUSCLE_GROUPS, WEIGHT_UNITS } from "@/types";

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
  metValue: z.number().positive("MET値は0より大きい値を入力してください").max(30),
  description: z.string().max(500).optional(),
});

export const workoutSessionInputSchema = z.object({
  performedAt: z.coerce.date(),
  memo: z.string().max(300).optional(),
});

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
  .superRefine((data, ctx) => {
    if (data.weightValue !== undefined && data.weightUnit === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weightUnit"],
        message: "重さの単位を選択してください",
      });
    }
    if (data.weightValue === undefined && data.weightUnit !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weightValue"],
        message: "重さの値を入力してください",
      });
    }
  });

export const profileUpdateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  defaultWeightKg: z.number().positive().max(400).optional(),
  heightCm: z.number().positive().max(300).optional(),
});

export const weightLogInputSchema = z.object({
  weightKg: z.number().positive().max(400),
  recordedAt: z.coerce.date().optional(), // 省略時は現在時刻
});
