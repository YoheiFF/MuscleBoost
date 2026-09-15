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

/**
 * 記録編集モーダル内のマシン選択欄（追加フォームと同じ aria-label="マシン" を持つが、
 * 編集モーダルには <label htmlFor> の関連付けが無いため、モーダルのコンテナ内に
 * スコープしてから選択する必要がある）で、表示名の一部が一致する最初のオプションを選択する。
 */
async function selectEditExerciseByName(page: Page, namePart: string): Promise<void> {
  const modal = page.locator("div", { hasText: "記録を編集" }).last();
  const select = modal.getByLabel("マシン");
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
  test("デフォルト体重設定→MET5.5マシンで記録→カロリーが期待値通り計算される", async ({ page }) => {
    const email = uniqueEmail("workout");
    await registerAndLogin(page, "記録ユーザー", email);

    await page.goto("/profile");
    await page.getByLabel("デフォルト体重 (kg)").fill("70");
    await page.getByRole("button", { name: "更新する" }).click();
    await expect(page.getByText("プロフィールを更新しました")).toBeVisible();

    await createSession(page);
    await selectExerciseByName(page, "チェストプレス");
    await page.getByLabel("セット数").fill("3");
    await page.getByLabel("レップ数").fill("10");
    // 筋トレ系（非CARDIO）は運動時間欄が表示されないため入力しない。
    await page.getByRole("button", { name: "記録を追加" }).click();

    // 推定運動時間 = (3*10*3 + 2*60)/60 = 3.5分
    // MET5.5 × 70kg × (3.5/60)h × 1.05 = 23.58125 → 23.6kcal
    // QA指摘対応: 「合計消費カロリー」表示とログ項目内表示の2箇所に同じテキストが出るため
    // strict mode違反になっていた。ここでは表示されていること自体の確認が目的のため .first() で一意化する。
    await expect(page.getByText("23.6 kcal").first()).toBeVisible();
  });

  test("プロフィールのデフォルト体重を変更すると、以降の記録に反映される", async ({ page }) => {
    const email = uniqueEmail("weightchange");
    await registerAndLogin(page, "体重変更ユーザー", email);

    await page.goto("/profile");
    await page.getByLabel("デフォルト体重 (kg)").fill("70");
    await page.getByRole("button", { name: "更新する" }).click();
    await expect(page.getByText("プロフィールを更新しました")).toBeVisible();

    await createSession(page);
    await selectExerciseByName(page, "チェストプレス");
    await page.getByLabel("セット数").fill("3");
    await page.getByLabel("レップ数").fill("10");
    await page.getByRole("button", { name: "記録を追加" }).click();
    // 推定運動時間3.5分。MET5.5 × 70kg × (3.5/60)h × 1.05 = 23.6kcal
    await expect(page.getByText("23.6 kcal").first()).toBeVisible();

    await page.goto("/profile");
    await page.getByLabel("デフォルト体重 (kg)").fill("80");
    await page.getByRole("button", { name: "更新する" }).click();
    await expect(page.getByText("プロフィールを更新しました")).toBeVisible();

    await createSession(page);
    await selectExerciseByName(page, "チェストプレス");
    await page.getByLabel("セット数").fill("3");
    await page.getByLabel("レップ数").fill("10");
    await page.getByRole("button", { name: "記録を追加" }).click();
    // MET5.5 × 80kg × (3.5/60)h × 1.05 = 27kcal
    await expect(page.getByText("27 kcal").first()).toBeVisible();
  });

  test("有酸素系: セット数のみ変更（運動時間は同じ入力値）→カロリー表示が変化しない", async ({ page }) => {
    const email = uniqueEmail("setonly");
    await registerAndLogin(page, "セット数比較ユーザー", email);

    await page.goto("/profile");
    await page.getByLabel("デフォルト体重 (kg)").fill("70");
    await page.getByRole("button", { name: "更新する" }).click();
    await expect(page.getByText("プロフィールを更新しました")).toBeVisible();

    await createSession(page);
    // 有酸素系は運動時間がセット数に依存しない（ユーザー入力値のまま）ことを確認するため、
    // CARDIOマシン（エアロバイク 30〜50W、MET3.5）を使う。
    await selectExerciseByName(page, "30〜50W");
    await page.getByLabel("セット数").fill("3");
    await page.getByLabel("レップ数").fill("10");
    await page.getByLabel("運動時間（分）").fill("30");
    await page.getByRole("button", { name: "記録を追加" }).click();
    // MET3.5 × 70kg × 0.5h × 1.05 = 128.625 → 128.6kcal
    await expect(page.getByText("128.6 kcal").first()).toBeVisible();

    // QA指摘対応: 1件目の記録追加成功後、WorkoutLogFormは全フィールド（マシン選択含む）を
    // リセットする既存仕様があるため、2件目を送信する前にマシンを再選択する必要がある。
    await selectExerciseByName(page, "30〜50W");
    await page.getByLabel("セット数").fill("5");
    await page.getByLabel("レップ数").fill("10");
    await page.getByLabel("運動時間（分）").fill("30");
    await page.getByRole("button", { name: "記録を追加" }).click();

    await expect(page.getByText("128.6 kcal")).toHaveCount(2);
  });

  test("有酸素系マシンで運動時間を未入力のまま保存しようとするとエラーになり保存されない", async ({ page }) => {
    const email = uniqueEmail("cardiorequired");
    await registerAndLogin(page, "有酸素必須確認ユーザー", email);

    await page.goto("/profile");
    await page.getByLabel("デフォルト体重 (kg)").fill("70");
    await page.getByRole("button", { name: "更新する" }).click();
    await expect(page.getByText("プロフィールを更新しました")).toBeVisible();

    await createSession(page);
    await selectExerciseByName(page, "30〜50W");
    await page.getByLabel("セット数").fill("3");
    await page.getByLabel("レップ数").fill("10");
    // 運動時間（分）は意図的に未入力のまま送信する
    await page.getByRole("button", { name: "記録を追加" }).click();

    await expect(page.getByText("有酸素系のマシンでは運動時間の入力が必須です")).toBeVisible();
    await expect(page.getByText("まだ記録がありません。")).toBeVisible();
  });

  test("筋トレ系マシンを選択すると運動時間欄が表示されない", async ({ page }) => {
    const email = uniqueEmail("nofield");
    await registerAndLogin(page, "欄非表示確認ユーザー", email);

    await createSession(page);
    await selectExerciseByName(page, "チェストプレス");
    await expect(page.getByLabel("運動時間（分）")).toHaveCount(0);
  });

  test("記録一覧: 筋トレ系の運動時間には「（推定値）」が付き、有酸素系には付かない（AC-4）", async ({ page }) => {
    const email = uniqueEmail("estimatelabel");
    await registerAndLogin(page, "推定値表示確認ユーザー", email);

    await page.goto("/profile");
    await page.getByLabel("デフォルト体重 (kg)").fill("70");
    await page.getByRole("button", { name: "更新する" }).click();
    await expect(page.getByText("プロフィールを更新しました")).toBeVisible();

    await createSession(page);

    // 筋トレ系（非CARDIO）: チェストプレス 3セット×10レップ → 推定運動時間3.5分。
    // durationMinutesはサーバー推定値のため「（推定値）」ラベルが付与される。
    await selectExerciseByName(page, "チェストプレス");
    await page.getByLabel("セット数").fill("3");
    await page.getByLabel("レップ数").fill("10");
    await page.getByRole("button", { name: "記録を追加" }).click();
    await expect(page.getByText("3セット × 10レップ / 3.5分（推定値）")).toBeVisible();

    // 有酸素系（CARDIO）: エアロバイク(30〜50W)・運動時間30分はユーザー入力値のため
    // 「（推定値）」ラベルは付与されない。
    await selectExerciseByName(page, "30〜50W");
    await page.getByLabel("セット数").fill("3");
    await page.getByLabel("レップ数").fill("10");
    await page.getByLabel("運動時間（分）").fill("30");
    await page.getByRole("button", { name: "記録を追加" }).click();
    await expect(page.getByText("3セット × 10レップ / 30分", { exact: true })).toBeVisible();
    await expect(page.getByText("30分（推定値）")).toHaveCount(0);
  });

  test("編集モーダル: 種目をCARDIO⇔非CARDIOに変更すると運動時間欄の表示が切り替わる", async ({ page }) => {
    const email = uniqueEmail("edittoggle");
    await registerAndLogin(page, "編集切替確認ユーザー", email);

    await page.goto("/profile");
    await page.getByLabel("デフォルト体重 (kg)").fill("70");
    await page.getByRole("button", { name: "更新する" }).click();
    await expect(page.getByText("プロフィールを更新しました")).toBeVisible();

    await createSession(page);
    await selectExerciseByName(page, "チェストプレス");
    await page.getByLabel("セット数").fill("3");
    await page.getByLabel("レップ数").fill("10");
    await page.getByRole("button", { name: "記録を追加" }).click();
    await expect(page.getByText("23.6 kcal").first()).toBeVisible();

    await page.getByRole("button", { name: "編集", exact: true }).click();
    await expect(page.getByText("記録を編集")).toBeVisible();

    // 編集対象は筋トレ系（チェストプレス）のため、運動時間欄は表示されない。
    await expect(page.getByPlaceholder("運動時間（分）")).toHaveCount(0);

    // 種目を有酸素系（エアロバイク 30〜50W）に変更すると、運動時間欄が表示される。
    await selectEditExerciseByName(page, "30〜50W");
    await expect(page.getByPlaceholder("運動時間（分）")).toBeVisible();

    // 再び筋トレ系（チェストプレス）に戻すと、運動時間欄は非表示に戻る。
    await selectEditExerciseByName(page, "チェストプレス");
    await expect(page.getByPlaceholder("運動時間（分）")).toHaveCount(0);
  });

  test("デフォルト体重未設定・上書きも無しで記録保存→エラーが表示され保存されない", async ({ page }) => {
    const email = uniqueEmail("noweight");
    await registerAndLogin(page, "体重未設定ユーザー", email);

    await createSession(page);
    await selectExerciseByName(page, "チェストプレス");
    await page.getByLabel("セット数").fill("3");
    await page.getByLabel("レップ数").fill("10");
    await page.getByRole("button", { name: "記録を追加" }).click();

    await expect(page.getByText("体重が未設定です")).toBeVisible();
    await expect(page.getByText("まだ記録がありません。")).toBeVisible();
  });

  test("削除: ログ削除後、セッション詳細の合計カロリーが更新される", async ({ page }) => {
    const email = uniqueEmail("deletelog");
    await registerAndLogin(page, "削除確認ユーザー", email);

    await page.goto("/profile");
    await page.getByLabel("デフォルト体重 (kg)").fill("70");
    await page.getByRole("button", { name: "更新する" }).click();
    await expect(page.getByText("プロフィールを更新しました")).toBeVisible();

    await createSession(page);
    await selectExerciseByName(page, "チェストプレス");
    await page.getByLabel("セット数").fill("3");
    await page.getByLabel("レップ数").fill("10");
    await page.getByRole("button", { name: "記録を追加" }).click();
    await expect(page.getByText("合計消費カロリー")).toBeVisible();
    await expect(page.getByText("23.6 kcal").first()).toBeVisible();

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

  test("同じ日に複数回セッションを開始しても、同一セッションに記録が合流する", async ({ page }) => {
    const email = uniqueEmail("samedaycontinuity");
    await registerAndLogin(page, "同日継続確認ユーザー", email);

    await page.goto("/profile");
    await page.getByLabel("デフォルト体重 (kg)").fill("70");
    await page.getByRole("button", { name: "更新する" }).click();
    await expect(page.getByText("プロフィールを更新しました")).toBeVisible();

    // 1回目: /workouts/today 経由でセッションを開始し、1件記録する
    await page.goto("/workouts/today");
    await page.waitForURL((url) => /\/workouts\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new") && !url.pathname.endsWith("/today"));
    const firstSessionUrl = page.url();
    await selectExerciseByName(page, "チェストプレス");
    await page.getByLabel("セット数").fill("3");
    await page.getByLabel("レップ数").fill("10");
    await page.getByRole("button", { name: "記録を追加" }).click();
    await expect(page.getByText("23.6 kcal").first()).toBeVisible();

    // 2回目: 別画面（プロフィール）に一度移動してから、再び /workouts/today 経由で記録を始める
    await page.goto("/profile");
    await page.goto("/workouts/today");
    await page.waitForURL((url) => /\/workouts\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new") && !url.pathname.endsWith("/today"));

    // 同一セッションに合流しているため、1回目に追加した記録がそのまま見えている
    await expect(page).toHaveURL(firstSessionUrl);
    await expect(page.getByText("23.6 kcal").first()).toBeVisible();

    // 2件目を追加すると、同一セッション内に2件の記録が積み上がる（合計 47.2kcal）
    await selectExerciseByName(page, "チェストプレス");
    await page.getByLabel("セット数").fill("3");
    await page.getByLabel("レップ数").fill("10");
    await page.getByRole("button", { name: "記録を追加" }).click();
    await expect(page.getByText("47.2 kcal")).toBeVisible(); // 合計消費カロリー表示
  });

  test("セッション削除時に確認ダイアログが表示され、キャンセルすると削除されない", async ({ page }) => {
    const email = uniqueEmail("deleteconfirm");
    await registerAndLogin(page, "削除確認ダイアログユーザー", email);

    await page.goto("/profile");
    await page.getByLabel("デフォルト体重 (kg)").fill("70");
    await page.getByRole("button", { name: "更新する" }).click();
    await expect(page.getByText("プロフィールを更新しました")).toBeVisible();

    await createSession(page);
    await selectExerciseByName(page, "チェストプレス");
    await page.getByLabel("セット数").fill("3");
    await page.getByLabel("レップ数").fill("10");
    await page.getByRole("button", { name: "記録を追加" }).click();
    await expect(page.getByText("23.6 kcal").first()).toBeVisible();

    const sessionUrl = page.url();
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "セッションを削除" }).click();
    // キャンセルしたのでページ遷移せず、記録も残ったまま
    await expect(page).toHaveURL(sessionUrl);
    await expect(page.getByText("23.6 kcal").first()).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "セッションを削除" }).click();
    await expect(page).toHaveURL("/workouts");
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
