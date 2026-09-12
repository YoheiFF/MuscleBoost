// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "MuscleBoost",
  description: "ジムトレーニング消費カロリー管理システム",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  return (
    <html lang="ja">
      <body>
        <Header userName={session?.user?.name ?? null} />
        <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
