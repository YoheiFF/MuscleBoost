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
