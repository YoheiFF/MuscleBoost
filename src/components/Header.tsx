// src/components/Header.tsx
import Link from "next/link";
import { signOut } from "@/lib/auth";

interface HeaderProps {
  userName: string | null; // nullの場合は未ログイン（ログイン/登録リンクを表示）
}

export default function Header({ userName }: HeaderProps) {
  async function handleLogout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="text-lg font-bold text-gray-900">
          MuscleBoost
        </Link>
        {userName ? (
          <nav className="flex flex-wrap items-center gap-4 text-sm">
            <Link href="/workouts">記録</Link>
            <Link href="/exercises">マシン</Link>
            <Link href="/profile">プロフィール</Link>
            <span className="text-gray-500">{userName} さん</span>
            <form action={handleLogout}>
              <button type="submit" className="text-blue-600 hover:underline">
                ログアウト
              </button>
            </form>
          </nav>
        ) : (
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/login">ログイン</Link>
            <Link href="/register">新規登録</Link>
          </nav>
        )}
      </div>
    </header>
  );
}
