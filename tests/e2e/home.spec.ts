import { expect, test } from "@playwright/test";

test("shows the ConnectSphere homepage", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("FIND YOUR");
  await expect(page.getByRole("link", { name: "Browse events" })).toBeVisible();
});

test("reports application health from the backend", async ({ request }) => {
  const response = await request.get("http://localhost:3001/health");
  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toMatchObject({
    status: "ok",
    service: "connectsphere-backend",
  });
});
