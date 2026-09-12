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
