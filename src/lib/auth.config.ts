// src/lib/auth.config.ts
// middleware（Edge Runtime）から参照する認証設定。
// prisma/bcryptを一切importしないこと（Edgeバンドルに含めるとlibsqlのWeb版クライアントが
// ローカルSQLiteの"file:"スキームを扱えずクラッシュするため。認証プロバイダーはauth.tsに置く）。
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
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
} satisfies NextAuthConfig;
