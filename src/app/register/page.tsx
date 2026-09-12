// src/app/register/page.tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { registerAction } from "@/app/actions/auth";
import type { ActionResult } from "@/types";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, formAction, pending] = useActionState<
    ActionResult<{ userId: string }> | undefined,
    FormData
  >(registerAction, undefined);

  useEffect(() => {
    if (state?.ok) {
      signIn("credentials", { email, password, redirect: false }).then(() => {
        router.push("/");
        router.refresh();
      });
    }
  }, [state, email, password, router]);

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-xl font-bold">新規登録</h1>
      <form action={formAction} className="flex flex-col gap-4">
        {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
        <div>
          <label htmlFor="register-name" className="block text-sm font-medium">表示名</label>
          <input
            id="register-name"
            name="name"
            type="text"
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          />
          {state && !state.ok && state.fieldErrors?.name && (
            <p className="text-xs text-red-600">{state.fieldErrors.name[0]}</p>
          )}
        </div>
        <div>
          <label htmlFor="register-email" className="block text-sm font-medium">メールアドレス</label>
          <input
            id="register-email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          />
          {state && !state.ok && state.fieldErrors?.email && (
            <p className="text-xs text-red-600">{state.fieldErrors.email[0]}</p>
          )}
        </div>
        <div>
          <label htmlFor="register-password" className="block text-sm font-medium">パスワード（8文字以上）</label>
          <input
            id="register-password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          />
          {state && !state.ok && state.fieldErrors?.password && (
            <p className="text-xs text-red-600">{state.fieldErrors.password[0]}</p>
          )}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {pending ? "登録中..." : "登録する"}
        </button>
      </form>
      <p className="mt-4 text-sm text-gray-500">
        既にアカウントをお持ちの方は{" "}
        <Link href="/login" className="text-blue-600 hover:underline">
          ログイン
        </Link>
      </p>
    </div>
  );
}
