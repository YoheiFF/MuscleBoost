# MuscleBoost

ジムトレーニング消費カロリー管理システム。Next.js (App Router) + TypeScript + Prisma + SQLite + Auth.js (NextAuth v5) 構成。

## セットアップ

```powershell
npm install
Copy-Item .env.example .env
# .env の AUTH_SECRET を openssl rand -base64 32 等で生成した値に置き換える
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

開発サーバー: http://localhost:3000

## テスト

```powershell
npm run test        # Vitest（単体テスト）
npm run test:e2e    # Playwright（E2E テスト）
```

## 計算式

```
kcal = MET値 × 体重(kg) × (運動時間(分) / 60) × 1.05
```

表示される消費カロリーはMET値に基づく目安であり、個人差があります。
