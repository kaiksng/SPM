import { expect, test } from "@playwright/test";

test("shows the ConnectSphere foundation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "event request",
  );
  await expect(page.getByText("Foundation ready")).toBeVisible();
});

test("reports application health", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toMatchObject({
    status: "ok",
    service: "connectsphere",
  });
});
