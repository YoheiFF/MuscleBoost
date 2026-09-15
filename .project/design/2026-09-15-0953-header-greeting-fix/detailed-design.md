---
project_id: "2026-09-15-0953-header-greeting-fix"
phase: design
sub: detailed-design
created: "2026-09-15"
---
# 詳細設計書: ヘッダーの不要な「〇〇さん」表記の削除とトップ画面挨拶文へのユーザー名付与

本書は ClaudeCode に実装を依頼できる粒度で記述する。曖昧な表現（「適切に処理する」等）は用いない。実装者は本書の記述通りにファイルを編集すればよい。

前提ドキュメント:
- `requirements.md`（本プロジェクト内）
- `basic-design.md`（本プロジェクト内）
- 情報収集レポート: `C:\project\MuscleBoost\.project\research\topics\2026-09-15-0953-header-greeting-fix.md`

## 1. 概要

ログイン後の共通ヘッダーからクリックできない「〇〇さん」ラベルを削除し、代わりにトップ画面（`/`）の見出しにユーザーの実名を組み込んだ挨拶文「〇〇さん、今日は何をしますか？」を表示する。ユーザー名はプロフィール画面と同一パターン（`getCurrentUserOrThrow()` + `prisma.user.findUnique`）でDBから最新値を取得することで、プロフィール変更直後でも常に最新の名前が表示される。

## 2. 影響範囲（編集／新規ファイル一覧）

| No | ファイルパス | 種別 | 変更概要 |
|---|---|---|---|
| 1 | `src/components/Header.tsx` | 変更 | 「{userName} さん」の`<span>`表示行（既存26行目）を削除 |
| 2 | `src/app/page.tsx` | 変更 | `async`化し、DBからユーザー名を取得して見出しに組み込む |
| 3 | `tests/e2e/auth.spec.ts` | 変更 | 見出しテキストの厳密一致アサーション（18行目）を新文言に更新 |

新規作成ファイルはない。`src/lib/session-guard.ts`、`src/lib/auth.ts`、`src/lib/auth.config.ts`、`prisma/schema.prisma`、`src/app/layout.tsx` は編集対象外（変更なし）。

## 3. ファイル別変更詳細

### 3.1 `src/components/Header.tsx`（変更）

#### 編集前の関連箇所（現状、21〜32行目）
```tsx
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
  ...
```

#### 編集後の期待形
```tsx
{userName ? (
  <nav className="flex flex-wrap items-center gap-4 text-sm">
    <Link href="/workouts">記録</Link>
    <Link href="/exercises">マシン</Link>
    <Link href="/profile">プロフィール</Link>
    <form action={handleLogout}>
      <button type="submit" className="text-blue-600 hover:underline">
        ログアウト
      </button>
    </form>
  </nav>
) : (
  ...
```

#### 変更手順（pseudo-code）
1. `<span className="text-gray-500">{userName} さん</span>` の1行を削除する。
2. `HeaderProps`（`interface HeaderProps { userName: string | null; }`）は変更しない。
3. `userName ? (...) : (...)` の三項分岐構造、`userName`という変数自体、コンポーネント引数の分割代入 `({ userName }: HeaderProps)` は変更しない（未ログイン時の分岐に必須のため）。
4. `<span>`削除に伴い、`userName`変数が三項分岐の条件（`userName ? ... : ...`）以外で参照されなくなるが、これはビルドエラーにならない（条件式内で参照されているため未使用変数警告は発生しない）。lintエラーが出ないことを実装後に確認する。

#### 関数シグネチャ
変更なし。
```ts
interface HeaderProps {
  userName: string | null;
}
export default function Header({ userName }: HeaderProps): JSX.Element;
```

---

### 3.2 `src/app/page.tsx`（変更）

#### 編集前の関連箇所（現状、全文4〜7行目抜粋）
```tsx
export default function TopPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">今日は何をしますか？</h1>
```

#### 編集後の期待形
```tsx
// src/app/page.tsx（ログイン後の初期画面: 記録する／実績を確認する の選択メニュー）
import Link from "next/link";
import { getCurrentUserOrThrow } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";

export default async function TopPage() {
  const user = await getCurrentUserOrThrow();
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  const greeting = dbUser?.name ? `${dbUser.name}さん、今日は何をしますか？` : "今日は何をしますか？";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">{greeting}</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/workouts/new"
          className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-6 text-center hover:bg-gray-50"
        >
          <span className="text-3xl">💪</span>
          <span className="text-lg font-semibold text-gray-900">① 今日の記録をする</span>
          <span className="text-sm text-gray-500">ジムでのトレーニングを記録します</span>
        </Link>
        <Link
          href="/workouts"
          className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-6 text-center hover:bg-gray-50"
        >
          <span className="text-3xl">📊</span>
          <span className="text-lg font-semibold text-gray-900">② 今までの実績を確認する</span>
          <span className="text-sm text-gray-500">これまでのトレーニング履歴・消費カロリーを見ます</span>
        </Link>
      </div>
    </div>
  );
}
```

`workouts/new` へのカード・`workouts` へのカードのJSX（8〜25行目相当）は内容・クラス名とも一切変更しない。差分は import 追加・関数シグネチャの`async`化・`greeting`変数の導入・`<h1>`内の式のみ。

#### 関数シグネチャ
```ts
export default async function TopPage(): Promise<JSX.Element>;
```
- 引数なし。Next.js App Routerの規約上、`params`/`searchParams`はこのページでは不要なため受け取らない。

#### 処理フロー（箇条書き・曖昧表現なし）
1. `getCurrentUserOrThrow()`（`src/lib/session-guard.ts`、既存・変更なし）を呼び出し、`{ id: string; email: string }` を取得する。
   - 内部で`auth()`によりセッションを検証し、`session?.user?.id`が存在しなければ`UnauthorizedError`をthrowする。
   - 本ページは`middleware.ts`によって未ログイン時は`/login`にリダイレクトされるため、通常のリクエストフローでは`UnauthorizedError`は発生しない（防御的な安全策として残す）。
2. `prisma.user.findUnique({ where: { id: user.id } })`（`src/lib/prisma.ts`のPrisma Client、既存・変更なし）を呼び出し、`User | null` を取得する。
3. 挨拶文用の文字列 `greeting` を以下のロジックで組み立てる:
   - `dbUser?.name` が truthy（非空文字列）の場合: `` `${dbUser.name}さん、今日は何をしますか？` ``
   - `dbUser`が`null`、または`dbUser.name`が空文字列の場合: `"今日は何をしますか？"`（名前部分を省略した既存文言のみ）
4. `<h1 className="text-xl font-bold">{greeting}</h1>` として描画する。
5. 以降のJSX（2枚の導線カード）は既存のまま描画する。

#### エラー処理
- `getCurrentUserOrThrow()`が`UnauthorizedError`をthrowした場合: 呼び出し元でcatchしない。Next.jsのServer Component標準のエラー境界（`error.tsx`が存在すればそれ、無ければNext.jsのデフォルトエラー画面）に伝播させる。理由: `middleware.ts`が`/`への未ログインアクセスを既に`/login`へリダイレクトしているため、このパスへ到達すること自体が異常系であり、個別のtry/catchによる特別なUI出し分けは過剰設計と判断する。
- `prisma.user.findUnique`が例外を投げた場合（DB接続断など）: 呼び出し元でcatchしない。Next.jsの標準エラー処理に伝播させる（本ページに限らず既存の`profile/page.tsx`と同じ方針）。
- `dbUser`が`null`（ユーザーがDB上で削除済みなど、セッションはあるがレコードが存在しない極端なケース）: 例外にせず、上記フロー3.の分岐により名前を省略した文言にフォールバックする（クラッシュさせない）。
- `dbUser.name`が空文字列（バリデーションをすり抜けた既存データ等、理論上のケース）: 上記フロー3.の分岐によりフォールバックする。

---

### 3.3 `tests/e2e/auth.spec.ts`（変更）

#### 編集前の関連箇所（現状、9〜18行目）
```ts
test("新規登録→自動ログイン→トップ画面表示", async ({ page }) => {
  const email = uniqueEmail("register");
  await page.goto("/register");
  await page.getByLabel("表示名").fill("テストユーザー");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード（8文字以上）").fill("password123");
  await page.getByRole("button", { name: "登録する" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "今日は何をしますか？" })).toBeVisible();
});
```

#### 編集後の期待形
```ts
test("新規登録→自動ログイン→トップ画面表示", async ({ page }) => {
  const email = uniqueEmail("register");
  await page.goto("/register");
  await page.getByLabel("表示名").fill("テストユーザー");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード（8文字以上）").fill("password123");
  await page.getByRole("button", { name: "登録する" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "テストユーザーさん、今日は何をしますか？" })).toBeVisible();
});
```

#### 変更手順
1. 18行目のアサーション文字列を、登録時に入力した表示名（12行目 `.fill("テストユーザー")`）に合わせて `"テストユーザーさん、今日は何をしますか？"` に変更する。
2. 他のテスト（「ログアウト後、再ログインできる」等）はトップ画面見出しをアサートしていないため変更不要（`Grep`で確認済み。`tests/e2e/workout-flow.spec.ts`にも該当アサーションなし）。
3. ヘッダーの「さん」表記に対するアサーションはE2Eテスト内に存在しないため、Header関連の追加テスト変更は不要（確認済み）。

## 4. データ構造定義

本変更で新規の型・スキーマ定義は追加しない。使用する既存の型は以下の通り。

```ts
// src/lib/session-guard.ts（既存・変更なし）
interface CurrentUser {
  id: string;
  email: string;
}
function getCurrentUserOrThrow(): Promise<CurrentUser>;

// Prisma Client が自動生成する型（prisma/schema.prisma より・変更なし）
type User = {
  id: string;
  email: string;
  passwordHash: string;
  name: string;              // NOT NULL、1〜50文字（登録・更新時にZodでバリデーション済み）
  defaultWeightKg: number | null;
  heightCm: number | null;
  createdAt: Date;
  updatedAt: Date;
};

// src/app/page.tsx 内のローカル変数（新規導入、型定義ファイルへの追加は不要）
const greeting: string; // `${dbUser.name}さん、今日は何をしますか？` または "今日は何をしますか？"
```

## 5. エラー処理方針（まとめ）

| ケース | 発生箇所 | 対応 |
|---|---|---|
| 未ログイン状態で`TopPage`が実行される（理論上、middlewareが保証するため通常到達しない） | `getCurrentUserOrThrow()` | `UnauthorizedError`をthrowしたまま伝播させる（catchしない） |
| DB接続エラー等で`prisma.user.findUnique`が例外を投げる | `TopPage` | 例外をそのまま伝播させる（catchしない。Next.js標準のエラー処理に委ねる） |
| `dbUser`が`null`（セッションはあるがDBにレコードが無い） | `TopPage` | 名前部分を省略し「今日は何をしますか？」のみ表示（フォールバック、非エラー扱い） |
| `dbUser.name`が空文字列 | `TopPage` | 同上（フォールバック） |

## 6. テスト観点（QAチーム用）

### 正常系
- T-01: ログイン済み状態で `/` を開くと、見出しに「（登録済みの表示名）さん、今日は何をしますか？」が表示される。
- T-02: ヘッダー内に「〇〇さん」という文言（`<span>`）が一切表示されない（DOM上に存在しないことを確認する。テキスト検索で見つからないことをアサートする）。
- T-03: ヘッダーの「記録」「マシン」「プロフィール」リンク、および「ログアウト」ボタンは変更前と同様に表示・機能する（クリックで遷移／ログアウトできる）。
- T-04: プロフィール画面（`/profile`）で表示名を変更して保存した直後、`/` に遷移すると、トップ画面の見出しに変更後の新しい名前が反映される（再ログイン不要であることを確認する = AC-3の直接検証）。
- T-05: 未ログイン時のヘッダー（ログイン/登録リンクのみ表示される分岐）に表示・動作の変化がない。

### 異常系
- T-06: （結合テストレベル、可能であれば）DBから該当ユーザーレコードが取得できない状況をモックし、`TopPage`が例外でクラッシュせず「今日は何をしますか？」のみを表示することを確認する。
- T-07: 未ログイン状態で `/` に直接アクセスすると、`middleware.ts`により`/login`にリダイレクトされ、`TopPage`のレンダリングエラーがユーザーに露出しないことを確認する（既存の`auth.spec.ts`「未ログイン状態で保護パスに直接アクセス」テストで担保済み。回帰確認のみでよい）。

### 境界値
- T-08: `User.name`が1文字（バリデーション上の最小値）の場合、見出しが「（1文字の名前）さん、今日は何をしますか？」と正しく連結される。
- T-09: `User.name`が50文字（バリデーション上の最大値）の場合、見出しの折り返し・レイアウト崩れが無いことを目視確認する（`text-xl font-bold`のみで`truncate`等の指定は無いため、長い名前では複数行に折り返される想定。致命的なレイアウト崩れが無ければ許容）。
- T-10: 名前に全角スペースや絵文字などマルチバイト・特殊文字が含まれる場合でも、見出し文字列の連結（テンプレートリテラル）が正しく行われる（XSS等の問題は元々JSXの自動エスケープにより発生しない点を確認する）。

### 回帰確認
- T-11: `npm run build` が型エラーなく成功する（`page.tsx`の`async`化に伴う型整合性を確認）。
- T-12: `npm run test:e2e`（Playwright）が全件成功する（`auth.spec.ts`更新後のアサーションを含む）。
- T-13: `npm run test`（Vitest、既存の単体テストがあれば）に本変更で新規に失敗するテストが無い。

## 7. 完了条件チェックリスト

- [ ] `src/components/Header.tsx` から「{userName} さん」の`<span>`表示行が削除されている
- [ ] `Header`の`HeaderProps`、ログイン判定の三項分岐、他のナビ要素（リンク・ログアウトボタン）に変更がない
- [ ] `src/app/page.tsx` の `TopPage` が `async function` になっている
- [ ] `TopPage` が `getCurrentUserOrThrow()` と `prisma.user.findUnique` を用いてDBから最新の`name`を取得している
- [ ] 見出しが `${name}さん、今日は何をしますか？` の形式（既存の「？」を維持）で表示される
- [ ] `name`が取得できない・空文字の場合に「今日は何をしますか？」にフォールバックする実装が入っている
- [ ] `tests/e2e/auth.spec.ts` の見出しアサーションが新文言に更新されている
- [ ] `npm run build` が成功する
- [ ] `npm run test:e2e` が成功する
- [ ] 本書「6. テスト観点」の全項目（T-01〜T-13）を実施し、結果を記録した
