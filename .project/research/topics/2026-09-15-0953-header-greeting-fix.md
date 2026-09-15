---
project_id: "2026-09-15-0953-header-greeting-fix"
phase: research
created: "2026-09-15"
---
# 情報収集レポート: ヘッダーの不要な「名前さん」表記の削除とトップ画面の挨拶文へのユーザー名付与

## 結論サマリー
- ヘッダーの「〇〇 さん」は `src/components/Header.tsx:26` の `<span>{userName} さん</span>` であり、値自体はハードコードでも変数展開失敗でもなく、ログインユーザーの実名（`User.name`、必須・NOT NULL）を正しく表示している。「押せない」のは、リンクやボタンと並んで表示されているナビ行の中に、`href`も`onClick`もない**素の`<span>`（ラベル）が意図せず紛れて見える**ためで、実装バグではなく「クリックできないラベルがナビ項目のように見えてしまう」UI配置の問題。
- 「今日は何をしますか」は `src/app/page.tsx:7` の見出し `<h1>今日は何をしますか？`（末尾に「？」あり、依頼文とは微妙に異なる）。このページ（`TopPage`）は現在 props もセッション取得も無い同期のサーバーコンポーネントで、ユーザー名を一切参照していない。
- ユーザー名の取得元は一貫して `session.user.name`（NextAuth JWTセッション）。`src/lib/auth.ts:25` の `authorize()` が `prisma.user.findUnique` の `name`（`prisma/schema.prisma:15`、`String` 必須）をそのまま返し、`src/app/layout.tsx:15,20` が `auth()` で取得して `Header` に渡している。`TopPage` には渡っていないため、そこで挨拶文にユーザー名を出すには `TopPage` 自身が `auth()`（または `getCurrentUserOrThrow`）を呼んでセッションを取得する必要がある。
- `middleware.ts` により `/`（トップ画面）は未ログインではアクセス不可（`/login`,`/register`,`/api/auth` 以外は認証必須）。よって `TopPage` では「未ログイン時の表示」は通常発生しない。一方 `User.name` はDBスキーマ上必須（登録時 `registerSchema` で1〜50文字必須）のため、既存の正常アカウントでは名前欠落のフォールバックも基本的に不要。
- 2026-09-14-1651（体重・身長プロフィール機能）と同様、プロフィール関連の値は `src/app/actions/profile.ts` / `src/lib/session-guard.ts` の `getCurrentUserOrThrow()` パターンで取得しており、今回の実装もこのパターンに倣うのが一貫性がある。

## 確認済み事実
- ヘッダーの「〇〇 さん」表示箇所（出典: `src/components/Header.tsx:9-42`、該当行は26行目）。
  ```tsx
  <span className="text-gray-500">{userName} さん</span>
  ```
  `Header` は `userName: string | null` を props で受け取るだけの純粋な表示コンポーネントで、`onClick`・`href`・`<button>`のいずれも持たない `<span>`。同じ `<nav>` 内に `Link`（記録／マシン／プロフィール）と `<button type="submit">`（ログアウト）が並んでいるため、見た目上ナビ項目の一つに見えるが機能を持たない（出典: `Header.tsx:22-32`）。
- `userName` は `src/app/layout.tsx:15,20` で `const session = await auth();` → `<Header userName={session?.user?.name ?? null} />` として渡されている（出典: `layout.tsx:12-24`）。プレースホルダーではなく実際のセッション値。
- 「今日は何をしますか」の表示箇所（出典: `src/app/page.tsx:1-28`、見出しは7行目）。
  ```tsx
  <h1 className="text-xl font-bold">今日は何をしますか？</h1>
  ```
  `TopPage` はデフォルトエクスポートの同期関数コンポーネントで、引数なし・`async`でもない。ユーザー名や認証情報への参照は一切ない。
- `TopPage`（`src/app/page.tsx`）は `src/app/layout.tsx:21` の `<main>{children}</main>` に描画される兄弟コンポーネントであり、`layout.tsx`が取得した `session` を props 経由では受け取っていない（Next.js App Routerの`layout`→`children`の仕組み上、追加propsを注入する仕組みは無い）。ユーザー名を使うには`TopPage`自身が認証情報を取得する必要がある。
- ユーザー名の一次ソース: `src/lib/auth.ts:9-29` の `Credentials` プロバイダー `authorize()` が `prisma.user.findUnique({ where: { email } })` で取得した `user.name` をそのままセッション対象として返す（`return { id: user.id, email: user.email, name: user.name }`、25行目）。
- `prisma/schema.prisma:11-16` の `User` モデルで `name String`（必須・NOT NULL、デフォルト値なし）。登録時 `src/lib/validation.ts:5-9` の `registerSchema` が `name: z.string().min(1).max(50)` を必須にしており、`src/app/actions/auth.ts:9-33` の `registerAction` がそのまま `prisma.user.create` に渡す。→ 通常フローで名前が空/未設定になることはない。
- プロフィール編集時も同様のスキーマ（`src/lib/validation.ts:62-66` `profileUpdateSchema`）で `name` は1〜50文字（optional=部分更新可だが、送信時は空文字を許可しない）。`src/app/actions/profile.ts:9-17` の `updateProfile` が `prisma.user.update` する。ただしセッションのJWTは更新時に即時反映されない可能性がある（後述リスク）。
- `src/lib/session-guard.ts:12-18` の `getCurrentUserOrThrow()` は `id`と`email`のみを返す設計で、`name`は含まれていない。プロフィール画面（`src/app/profile/page.tsx:8-13`）は`name`表示のために別途 `prisma.user.findUnique` でDBから直接取得している（`session.user.name`を使っていない）。これは「セッション由来のnameが古い可能性がある」ことを示唆する実装（要検証扱いで下記に記載）。
- `middleware.ts:8-18` により `/`（トップ画面）を含む大半のパスは未ログイン時 `/login` にリダイレクトされる（`PUBLIC_PATHS = ["/login", "/register"]` と `/api/auth` のみ公開）。したがって `TopPage` は常にログイン済みの状態でのみレンダリングされる。
- `auth.config.ts:11-20` のカスタム `session` callback は `session.user.id = token.id` のみを明示的に設定しており、`name`/`email`はNextAuthのデフォルト挙動（`token`の標準クレームを`session.user`にマージする処理）に依存している。現状ヘッダーで `session.user.name` が正しく表示できている（`layout.tsx:20`）ことから、この既定マージは実際に機能していることが確認できる。

## 推測・未確認
- プロフィール画面（`/profile`）で表示名を変更した直後、トップページやヘッダーの挨拶に**即座に新しい名前が反映されるか**は未検証。JWTセッション戦略（`auth.config.ts:8` `session: { strategy: "jwt" }`）かつ `jwt` callback（`auth.config.ts:12-15`）はサインイン時の`user`オブジェクトからのみ`token.id`を更新しており、`name`変更時にトークンを再発行・更新するロジックが無いため、**プロフィールで名前を変更してもログアウト/再ログインするまでJWT内の`name`が古いままになる可能性が高い**（要検証: 実機での確認が望ましい）。もし今回の改修でトップページの挨拶が`session.user.name`をそのまま使う設計にする場合、この既存の潜在的な鮮度問題を引き継ぐ点は設計者に申し送りが必要。
- 依頼文の「今日は何をしますか」と実際の見出し文言「今日は何をしますか？」（末尾「？」の有無）の差異は、依頼者が正確な文言を意識せず伝えた可能性が高く、実装上は既存の「？」付き文言を維持しつつ前にユーザー名を付ける（例:「〇〇さん、今日は何をしますか？」）のが妥当と推測されるが、確定は設計フェーズでの確認事項。

## 既存コードベースの関連箇所
- `src/components/Header.tsx`: ヘッダー全体。ログイン時は記録/マシン/プロフィールへの`Link`、削除対象の「{userName} さん」`<span>`、ログアウト`<button>`を表示。未ログイン時はログイン/登録リンクのみ。
- `src/app/layout.tsx`: ルートレイアウト。`auth()`でセッションを取得し`Header`にuserNameを渡す唯一の箇所。`TopPage`は`children`として描画されるのみでpropsは渡らない。
- `src/app/page.tsx`: ログイン後の初期画面（トップ画面）。「今日は何をしますか？」の見出しと「記録する/実績を確認する」への2つの導線カードを表示。今回、ユーザー名を取得してヘッダー文言化する変更の主対象。
- `src/lib/auth.ts`: NextAuthの設定本体。Credentialsプロバイダーの`authorize()`が`User.name`をセッション用ユーザーオブジェクトに含める。
- `src/lib/auth.config.ts`: Edge Runtime向け認証設定（`jwt`/`session` callback）。`name`のセッションへの伝播はNextAuth既定動作に依存。
- `src/lib/session-guard.ts`: `getCurrentUserOrThrow()`。`id`/`email`のみ返す。`name`が必要な場合は別途DBまたは`auth()`のセッションから取得する必要がある。
- `src/app/profile/page.tsx` / `src/components/ProfileForm.tsx` / `src/app/actions/profile.ts`: 既存のプロフィール機能（2026-09-14-1651で追加）。`name`・`defaultWeightKg`・`heightCm`の取得・更新パターンの参考実装。DBから直接`prisma.user.findUnique`して`name`を渡している点が、トップ画面での名前取得方法を検討する上での参考になる（セッションを使うか、DB直読みするか）。
- `prisma/schema.prisma`: `User.name`は`String`必須列。フォールバック処理が本質的に不要であることの裏付け。
- `src/middleware.ts`: `/`への未ログインアクセスを`/login`にリダイレクトする実装。トップ画面が常にログイン済み前提で良いことの裏付け。

## 採用候補と比較
| 候補 | メリット | デメリット | 推奨度 |
|---|---|---|---|
| A. `TopPage`を`async`関数化し`auth()`を直接呼んでセッションの`session.user.name`を挨拶文に使う | 実装が最小限。`layout.tsx`と同じ`auth()`呼び出しパターンで一貫性が高い | プロフィールで名前変更後、再ログインするまで表示が更新されない可能性あり（既存のJWT鮮度問題を引き継ぐ） | ★★★★☆（最小変更・既存パターン踏襲） |
| B. `TopPage`を`async`関数化し`getCurrentUserOrThrow()`でid取得後、`prisma.user.findUnique`で最新の`name`をDBから直接取得する（`profile/page.tsx`と同じ方式） | 常に最新の名前が表示される。プロフィール変更直後でも正しく反映 | DBアクセスが1回増える（トップ画面は軽量ページなので影響は軽微）。`getCurrentUserOrThrow`は`UnauthorizedError`をthrowする設計のため、ミドルウェアが必ずログインを保証している前提が崩れた場合のエラーハンドリングを検討する必要がある | ★★★★★（正確性と既存プロフィール機能との実装一貫性を両立） |
| C. ヘッダーの「〇〇さん」表示はそのまま残し、単にクリック不可に見えないようスタイルだけ調整する | 変更範囲が最小 | 依頼内容（「不要なので削除」）に反する。依頼者の意図と合わない | ★☆☆☆☆（非推奨、依頼文と不一致） |

## 制約・前提・リスク
- `/`は認証必須ルートのため、`TopPage`内で`session`が`null`になるケースは通常想定不要だが、直接ミドルウェアを経由しないテスト環境やSSR/キャッシュの特殊なタイミングでは理論上`null`になり得る点は防御的に`session?.user?.name`のようなオプショナルチェーンで書くこと。
- `User.name`はDBスキーマ上必須のため空文字/未設定は通常発生しないが、万一の空文字ケース（バリデーションをすり抜けた既存データ等）に備え、挨拶文側でも空文字時のフォールバック文言（例: 名前部分を省略して「今日は何をしますか？」のみ表示）を検討しておくと安全（依頼文にも「ユーザー名が未設定の場合のフォールバック」が例示されている）。
- JWTセッション戦略のため、プロフィールで名前を変更した直後に挨拶文の名前が即時更新されない可能性がある（候補Aを採用する場合の既知の制約。候補Bならこの問題を回避できる）。
- ヘッダー変更は`Header.tsx`の`userName` propそのものは残し（未ログイン時のログイン/登録リンク分岐に必要）、表示している`<span>{userName} さん</span>`の1行のみを削除するのが最小差分になる。`userName` propを完全に削除するとログイン判定の分岐（`userName ? ... : ...`）が壊れるため、propの削除ではなく表示行のみの削除にとどめること。
- テスト影響: `tests/e2e/`配下（`auth.spec.ts`, `workout-flow.spec.ts`）でヘッダーの「さん」表記やトップページの見出しテキストをアサーションしている可能性がある（未確認・要grep）。見出し文言変更時はE2Eテストの文言アサーションも合わせて調査・更新が必要。

## 設計者への申し送り
- 挨拶文の文言は「〇〇さん、今日は何をしますか？」のように、既存の見出し末尾の「？」を維持する形が既存トーンと自然（依頼文には「？」がないが、既存実装に合わせるかは設計時に確認・決定すること）。
- ユーザー名取得方法は候補B（`getCurrentUserOrThrow` + `prisma.user.findUnique`でDB直読み、`profile/page.tsx`と同一パターン）を推奨。理由: プロフィール画面がすでにこの方式を採用しており実装の一貫性が高く、名前変更直後の表示鮮度問題も回避できる。
- `Header.tsx`の変更は`userName`表示の`<span>`（26行目）を削除するのみに留め、`userName` propおよびログイン/未ログイン分岐ロジックはそのまま残すこと（ログアウトボタンや他ナビリンクの表示条件に影響するため）。
- `TopPage`（`src/app/page.tsx`）を`async`コンポーネントに変更する必要がある。現在の実装は同期関数のため、`auth()`または`getCurrentUserOrThrow`のいずれを使うにしても`async`化と`await`の追加が必須。
- E2Eテスト（`tests/e2e/auth.spec.ts`, `tests/e2e/workout-flow.spec.ts`）にヘッダーの「さん」表記やトップ画面見出しの文言に依存するアサーションがないか実装前に確認し、あれば併せて更新すること。
