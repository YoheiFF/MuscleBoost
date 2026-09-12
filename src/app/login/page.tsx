// src/app/login/page.tsx
import Link from "next/link";
import LoginForm from "@/components/LoginForm";

interface LoginPageProps {
  searchParams: Promise<{ callbackUrl?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { callbackUrl } = await searchParams;

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-xl font-bold">ログイン</h1>
      <LoginForm callbackUrl={callbackUrl} />
      <p className="mt-4 text-sm text-gray-500">
        アカウントをお持ちでない方は{" "}
        <Link href="/register" className="text-blue-600 hover:underline">
          新規登録
        </Link>
      </p>
    </div>
  );
}
