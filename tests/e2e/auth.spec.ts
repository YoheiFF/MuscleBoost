// tests/e2e/auth.spec.ts
import { test, expect } from "@playwright/test";

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

test.describe("認証", () => {
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

  test("ログアウト後、再ログインできる", async ({ page }) => {
    const email = uniqueEmail("relogin");
    await page.goto("/register");
    await page.getByLabel("表示名").fill("テストユーザー2");
    await page.getByLabel("メールアドレス").fill(email);
    await page.getByLabel("パスワード（8文字以上）").fill("password123");
    await page.getByRole("button", { name: "登録する" }).click();
    await expect(page).toHaveURL("/");

    await page.getByRole("button", { name: "ログアウト" }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel("メールアドレス").fill(email);
    await page.getByLabel("パスワード").fill("password123");
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(page).toHaveURL("/");
  });

  test("既存メールアドレスで登録→エラーメッセージ表示", async ({ page }) => {
    const email = uniqueEmail("dup");
    await page.goto("/register");
    await page.getByLabel("表示名").fill("重複ユーザー");
    await page.getByLabel("メールアドレス").fill(email);
    await page.getByLabel("パスワード（8文字以上）").fill("password123");
    await page.getByRole("button", { name: "登録する" }).click();
    await expect(page).toHaveURL("/");
    await page.getByRole("button", { name: "ログアウト" }).click();

    await page.goto("/register");
    await page.getByLabel("表示名").fill("重複ユーザー2");
    await page.getByLabel("メールアドレス").fill(email);
    await page.getByLabel("パスワード（8文字以上）").fill("password123");
    await page.getByRole("button", { name: "登録する" }).click();
    await expect(page.getByText("このメールアドレスは既に登録されています")).toBeVisible();
  });

  test("誤ったパスワードでログイン→エラーメッセージ表示", async ({ page }) => {
    const email = uniqueEmail("wrongpw");
    await page.goto("/register");
    await page.getByLabel("表示名").fill("パスワード確認ユーザー");
    await page.getByLabel("メールアドレス").fill(email);
    await page.getByLabel("パスワード（8文字以上）").fill("password123");
    await page.getByRole("button", { name: "登録する" }).click();
    await expect(page).toHaveURL("/");
    await page.getByRole("button", { name: "ログアウト" }).click();

    await page.goto("/login");
    await page.getByLabel("メールアドレス").fill(email);
    await page.getByLabel("パスワード").fill("wrongpassword");
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(page.getByText("メールアドレスまたはパスワードが正しくありません")).toBeVisible();
  });

  test("パスワード7文字（8文字未満）で登録拒否", async ({ page }) => {
    const email = uniqueEmail("shortpw");
    await page.goto("/register");
    await page.getByLabel("表示名").fill("短パスワードユーザー");
    await page.getByLabel("メールアドレス").fill(email);
    await page.getByLabel("パスワード（8文字以上）").fill("short12");
    await page.getByRole("button", { name: "登録する" }).click();
    await expect(page.getByText("パスワードは8文字以上で入力してください")).toBeVisible();
  });

  test("未ログイン状態で保護パスに直接アクセス→/loginへリダイレクトされる", async ({ page }) => {
    for (const path of ["/", "/workouts", "/profile", "/exercises"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    }
  });
});
