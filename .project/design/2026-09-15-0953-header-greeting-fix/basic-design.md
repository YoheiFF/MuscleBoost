---
project_id: "2026-09-15-0953-header-greeting-fix"
phase: design
sub: basic-design
created: "2026-09-15"
---
# 基本設計書: ヘッダーの不要な「〇〇さん」表記の削除とトップ画面挨拶文へのユーザー名付与

前提: `requirements.md`（本プロジェクト内）を満たす設計。既存アーキテクチャ（Next.js App Router / NextAuth / Prisma）は変更しない。該当範囲のみを記述する。

## 1. 全体アーキテクチャ（該当範囲）

```
[ブラウザ]
   │  GET /
   ▼
[middleware.ts] ── 未ログイン判定 ── 未ログイン → /login へリダイレクト
   │ ログイン済み
   ▼
[src/app/layout.tsx] (RootLayout, async Server Component)
   │  await auth() → session
   │
   ├─▶ [src/components/Header.tsx] (Server Component)
   │        props: { userName: session?.user?.name ?? null }
   │        ※ 変更点: 「{userName} さん」の<span>表示を削除するのみ
   │
   └─▶ {children} = [src/app/page.tsx] (TopPage, ★async化する)
            │
            ├─▶ getCurrentUserOrThrow()  … src/lib/session-guard.ts（既存・変更なし）
            │        └─▶ auth() でセッション確認、{id, email} を返す
            │
            └─▶ prisma.user.findUnique({ where: { id } })  … src/lib/prisma.ts（既存）
                     └─▶ DBから最新の User.name を取得
            │
            └─▶ 見出し描画: `${name}さん、今日は何をしますか？`
```

- `Header` と `TopPage` は互いに独立した兄弟コンポーネント（`layout.tsx` の `children`）であり、Next.js App Routerの仕組み上、`layout.tsx` が取得した `session` を `props` 経由で `TopPage` に渡す手段はない。そのため `TopPage` は自身で認証情報を取得する（情報収集レポート確認済み事実）。
- `Header` は表示ロジックの削除のみで、データフロー・propsインターフェースに変更はない。

## 2. アーキテクチャ判断: ユーザー名取得方式

情報収集レポートの比較表（候補A/B/C）を踏まえ、本設計では **候補B（`getCurrentUserOrThrow()` + `prisma.user.findUnique` によるDB直読み）を採用する**。

| 判断項目 | 内容 |
|---|---|
| 採用方式 | `TopPage` を `async` 化し、`getCurrentUserOrThrow()` でユーザーIDを取得後、`prisma.user.findUnique({ where: { id } })` で `name` をDBから直接取得する |
| 不採用: 候補A（`session.user.name` をそのまま使用） | 実装は最小だが、NextAuthのJWTセッション戦略（`auth.config.ts`）はプロフィール変更時にトークンを再発行しないため、プロフィールで名前を変更した直後に挨拶文が古い名前のまま表示される（要件 UR-3 / AC-3 を満たせない） |
| 不採用: 候補C（表示のみ調整） | 依頼内容（削除）と不一致のため不採用 |
| 一貫性への効果 | `src/app/profile/page.tsx`（既存・2026-09-14-1651で追加）が既に同一パターン（`getCurrentUserOrThrow()` → `prisma.user.findUnique`）を採用しており、実装パターンをコードベース内で統一できる |
| 性能への影響 | 追加クエリは主キー検索1回のみ。トップ画面は元々軽量な静的リンク集ページであり、影響は軽微と判断 |

## 3. モジュール分割・変更範囲

| モジュール | 種別 | 変更内容概要 |
|---|---|---|
| `src/components/Header.tsx` | 変更 | 「{userName} さん」の`<span>`表示行を削除。他は変更なし |
| `src/app/page.tsx` | 変更 | `async`化。`getCurrentUserOrThrow`と`prisma.user.findUnique`でnameを取得し見出しに反映 |
| `tests/e2e/auth.spec.ts` | 変更 | 見出しテキストの厳密一致アサーションを新文言に更新 |

新規作成するモジュール・ファイルは無い（既存2ファイルの編集＋既存テスト1ファイルの更新のみ）。

## 4. データフロー

1. ブラウザが `/` にGETリクエスト。
2. `middleware.ts`（既存・変更なし）がセッションCookieを検証し、未ログインなら `/login` へリダイレクト。ログイン済みなら通過。
3. `RootLayout`（`layout.tsx`、既存・変更なし）が `auth()` を呼び `session` を取得し、`Header` に `userName` を渡す。
4. `Header`（変更）は `userName` の有無でナビ分岐するが、「さん」表示行は描画しない。
5. `TopPage`（変更）が `async` 関数として実行され、内部で:
   a. `getCurrentUserOrThrow()` を呼びユーザー`id`を取得（未ログインなら`UnauthorizedError`をthrow。通常フローでは`middleware`が保証するため到達しない防御的コード）。
   b. `prisma.user.findUnique({ where: { id } })` でDBから最新の`User`レコード（`name`含む）を取得。
   c. `name`（空文字/未取得時はフォールバック）を使って見出し文字列を組み立てる。
6. レンダリングされたHTMLがブラウザに返却される。

## 5. I/F 定義

### 5.1 `Header` コンポーネント（変更なし・確認のみ）
```ts
interface HeaderProps {
  userName: string | null;
}
export default function Header({ userName }: HeaderProps): JSX.Element;
```
- 呼び出し元（`layout.tsx`）からのpropsの型・意味は変更しない。表示内容のみ削減する。

### 5.2 `TopPage` コンポーネント（変更）
```ts
export default async function TopPage(): Promise<JSX.Element>;
```
- 引数なし（Next.js App RouterのPage Componentとしての規約に従う。`params`/`searchParams`は本ページでは不要のため受け取らない）。
- 内部で使用する既存I/F:
  - `getCurrentUserOrThrow(): Promise<{ id: string; email: string }>`（`src/lib/session-guard.ts`、変更なし）
  - `prisma.user.findUnique({ where: { id: string } }): Promise<User | null>`（Prisma Client、変更なし）

### 5.3 外部I/Fへの影響
- 外部API・DBスキーマへの変更は無い。既存の`User`テーブル・既存のNextAuth設定をそのまま利用する。

## 6. 影響を受けないもの（明示）
- `middleware.ts`（認証ガード）: 変更なし。
- `src/lib/auth.ts` / `src/lib/auth.config.ts`（NextAuth設定）: 変更なし。JWTの`name`鮮度問題は本設計（DB直読み方式）を採用することで回避されるため、`auth.config.ts`側の対処（トークン再発行ロジック追加など）は本プロジェクトのスコープ外。
- `src/lib/session-guard.ts`: 変更なし（`id`/`email`のみ返す既存仕様のまま。`name`は`TopPage`側でDBから別途取得する）。
- `prisma/schema.prisma`: 変更なし。
