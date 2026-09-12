// tests/e2e/workout-flow.spec.ts
import { test, expect, type Page } from "@playwright/test";

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

async function registerAndLogin(page: Page, name: string, email: string): Promise<void> {
  await page.goto("/register");
  await page.getByLabel("表示名").fill(name);
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード（8文字以上）").fill("password123");
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page).toHaveURL("/");
}

async function createSession(page: Page): Promise<void> {
  await page.goto("/workouts/new");
  await page.getByRole("button", { name: "セッションを作成して記録を始める" }).click();
  // QA指摘対応: 旧正規表現 /\/workouts\/.+/ は "/workouts/new" 自身にもマッチしてしまい、
  // 実際のセッションURL（/workouts/<id>）への遷移完了前に誤って条件を満たすことがあった。
  // そのため /workouts/new を明示的に除外した上でセッション詳細URLへの遷移を待つ。
  await page.waitForURL((url) => /\/workouts\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"));
}

/** マシン選択欄で、表示名の一部が一致する最初のオプションを選択する。 */
async function selectExerciseByName(page: Page, namePart: string): Promise<void> {
  const select = page.getByLabel("マシン");
  const optionValue = await select.locator("option", { hasText: namePart }).first().getAttribute("value");
  if (!optionValue) {
    throw new Error(`マシン選択肢が見つかりません: ${namePart}`);
  }
  await select.selectOption(optionValue);
}

test.describe("マシンマスタ", () => {
  test("シード投入後、部位フィルタ「脚」でレッグプレス等のみ表示される", async ({ page }) => {
    const email = uniqueEmail("exlist");
    await registerAndLogin(page, "マシン確認ユーザー", email);

    await page.goto("/exercises?muscleGroup=LEGS");
    await expect(page.getByText("レッグプレス").first()).toBeVisible();
    await expect(page.getByText("チェストプレス")).toHaveCount(0);
  });

  test("カスタムマシンを追加すると一覧に表示され、削除できる", async ({ page }) => {
    const email = uniqueEmail("customex");
    await registerAndLogin(page, "カスタムマシンユーザー", email);

    await page.goto("/exercises/new");
    await page.getByLabel("マシン名").fill("マイオリジナルマシン");
    await page.getByLabel("MET値").fill("4.5");
    await page.getByRole("button", { name: "マシンを追加" }).click();
    await expect(page).toHaveURL("/exercises");
    await expect(page.getByText("マイオリジナルマシン")).toBeVisible();

    await page
      .locator("li", { hasText: "マイオリジナルマシン" })
      .getByRole("button", { name: "削除" })
      .click();
    await expect(page.getByText("マイオリジナルマシン")).toHaveCount(0);
  });
});

test.describe("トレーニング記録（最重要）", () => {
  test("デフォルト体重設定→MET3.0マシンで記録→カロリーが期待値通り計算される", async ({ page }) => {
    const email = uniqueEmail("workout");
    await registerAndLogin(page, "記録ユーザー", email);

    await page.goto("/profile");
    await page.getByLabel("デフォルト体重 (kg)").fill("70");
    await page.getByRole("button", { name: "更新する" }).click();
    await expect(page.getByText("プロフィールを更新しました")).toBeVisible();

    await createSession(page);
    await selectExerciseByName(page, "チェストプレス（軽度）");
    await page.getByLabel("セット数").fill("3");
    await page.getByLabel("レップ数").fill("10");
    await page.getByLabel("運動時間（分）").fill("30");
    await page.getByRole("button", { name: "記録を追加" }).click();

    // MET3.0 × 70kg × 0.5h × 1.05 = 110.25 → 110.3kcal
    // QA指摘対応: 「合計消費カロリー」表示とログ項目内表示の2箇所に同じテキストが出るため
    // strict mode違反になっていた。ここでは表示されていること自体の確認が目的のため .first() で一意化する。
    await expect(page.getByText("110.3 kcal").first()).toBeVisible();
  });

  test("体重を記録時に上書き→デフォルト体重ではなく上書き体重でカロリーが計算される", async ({ page }) => {
    const email = uniqueEmail("override");
    await registerAndLogin(page, "上書きユーザー", email);

    await createSession(page);
    await selectExerciseByName(page, "チェストプレス（軽度）");
    await page.getByLabel("セット数").fill("3");
    await page.getByLabel("レップ数").fill("10");
    await page.getByLabel("運動時間（分）").fill("30");
    await page.getByLabel("体重（kg・上書き、任意）").fill("80");
    await page.getByRole("button", { name: "記録を追加" }).click();

    // MET3.0 × 80kg × 0.5h × 1.05 = 126.0kcal
    // QA指摘対応: 合計消費カロリー表示とログ項目内表示の2箇所にマッチするため .first() で一意化する。
    await expect(page.getByText("126 kcal").first()).toBeVisible();
  });

  test("セット数のみ変更（時間は同じ）→カロリー表示が変化しない", async ({ page }) => {
    const email = uniqueEmail("setonly");
    await registerAndLogin(page, "セット数比較ユーザー", email);

    await createSession(page);
    await selectExerciseByName(page, "チェストプレス（軽度）");
    await page.getByLabel("セット数").fill("3");
    await page.getByLabel("レップ数").fill("10");
    await page.getByLabel("運動時間（分）").fill("30");
    await page.getByLabel("体重（kg・上書き、任意）").fill("70");
    await page.getByRole("button", { name: "記録を追加" }).click();
    await expect(page.getByText("110.3 kcal").first()).toBeVisible();

    await page.getByLabel("セット数").fill("5");
    await page.getByLabel("レップ数").fill("10");
    await page.getByLabel("運動時間（分）").fill("30");
    await page.getByLabel("体重（kg・上書き、任意）").fill("70");
    await page.getByRole("button", { name: "記録を追加" }).click();

    // 2件とも同じ運動時間・体重・MET値のため、カロリーは同一(110.3kcal)になるはず
    await expect(page.getByText("110.3 kcal")).toHaveCount(2);
  });

  test("デフォルト体重未設定・上書きも無しで記録保存→エラーが表示され保存されない", async ({ page }) => {
    const email = uniqueEmail("noweight");
    await registerAndLogin(page, "体重未設定ユーザー", email);

    await createSession(page);
    await selectExerciseByName(page, "チェストプレス（軽度）");
    await page.getByLabel("セット数").fill("3");
    await page.getByLabel("レップ数").fill("10");
    await page.getByLabel("運動時間（分）").fill("30");
    await page.getByRole("button", { name: "記録を追加" }).click();

    await expect(page.getByText("体重を入力してください")).toBeVisible();
    await expect(page.getByText("まだ記録がありません。")).toBeVisible();
  });

  test("削除: ログ削除後、セッション詳細の合計カロリーが更新される", async ({ page }) => {
    const email = uniqueEmail("deletelog");
    await registerAndLogin(page, "削除確認ユーザー", email);

    await createSession(page);
    await selectExerciseByName(page, "チェストプレス（軽度）");
    await page.getByLabel("セット数").fill("3");
    await page.getByLabel("レップ数").fill("10");
    await page.getByLabel("運動時間（分）").fill("30");
    await page.getByLabel("体重（kg・上書き、任意）").fill("70");
    await page.getByRole("button", { name: "記録を追加" }).click();
    await expect(page.getByText("合計消費カロリー")).toBeVisible();
    await expect(page.getByText("110.3 kcal").first()).toBeVisible();

    // QA指摘対応: name:"削除" は部分一致のため「セッションを削除」ボタンにもマッチしてしまう。
    // exact:true にすることでログ項目の「削除」ボタン（アクセシブルネームが完全に一致する方）のみに絞る。
    await page.getByRole("button", { name: "削除", exact: true }).click();
    await expect(page.getByText("まだ記録がありません。")).toBeVisible();
  });

  test("マルチユーザー分離: 他ユーザーのセッションへ直接URLアクセスできない", async ({ page, browser }) => {
    const emailA = uniqueEmail("userA");
    await registerAndLogin(page, "ユーザーA", emailA);
    await createSession(page);
    const sessionUrl = page.url();

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const emailB = uniqueEmail("userB");
    await registerAndLogin(pageB, "ユーザーB", emailB);

    await pageB.goto(sessionUrl);
    // QA指摘対応の副作用: createSession()の正規表現修正により、このテストは実際のセッションURLへ
    // 正しく遷移した上でユーザーBがアクセスするようになった。Next.jsの404ページは
    // <h1>404</h1>と<h2>This page could not be found.</h2>の両方が正規表現にマッチし
    // strict mode違反となるため、.first()で一意化する。
    await expect(pageB.getByText(/404|見つかりません|This page could not be found/).first()).toBeVisible();

    await contextB.close();
  });
});

test.describe("トップ画面・実績", () => {
  test("ログイン後のトップ画面に記録・実績への2つの選択肢が表示される", async ({ page }) => {
    const email = uniqueEmail("topmenu");
    await registerAndLogin(page, "新規ユーザー", email);

    await expect(page.getByRole("link", { name: /今日の記録をする/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /今までの実績を確認する/ })).toBeVisible();
  });

  test("記録が無い新規ユーザーでは実績画面が0kcalの空表示になり、エラーにならない", async ({ page }) => {
    const email = uniqueEmail("emptydash");
    await registerAndLogin(page, "新規ユーザー", email);

    await page.getByRole("link", { name: /今までの実績を確認する/ }).click();
    await expect(page).toHaveURL("/workouts");
    await expect(page.getByText("0 kcal").first()).toBeVisible();
    await expect(page.getByText("まだ記録がありません。")).toBeVisible();
  });
});
