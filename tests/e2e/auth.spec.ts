import { expect, test } from "@playwright/test";

test("renders the login form", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("shows a validation error for a malformed email without calling Supabase", async ({
  page,
}) => {
  await page.goto("/login");

  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password", { exact: true }).fill("something");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Enter a valid email address")).toBeVisible();
});

test("redirects an unauthenticated visitor away from the protected workspace", async ({
  page,
}) => {
  await page.goto("/home");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("renders the signup form and validates mismatched passwords without calling Supabase", async ({
  page,
}) => {
  await page.goto("/signup");

  await expect(
    page.getByRole("heading", { name: "Create your account" }),
  ).toBeVisible();
  await expect(page.getByLabel("Full name")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Confirm password")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Role" })).toBeVisible();

  await page.getByLabel("Full name").fill("Jane Doe");
  await page.getByLabel("Email").fill("jane@example.com");
  await page.getByLabel("Password", { exact: true }).fill("password-one");
  await page.getByLabel("Confirm password").fill("password-two");
  await page.getByLabel("Confirm password").press("Tab");

  await expect(page.getByText("Passwords do not match")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create account" }),
  ).toBeDisabled();
});
