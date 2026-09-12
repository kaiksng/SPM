import { expect, test, type Page } from "@playwright/test";

const ownerEmail = process.env.PB02_OWNER_EMAIL;
const ownerPassword = process.env.PB02_OWNER_PASSWORD;
const otherEmail = process.env.PB02_OTHER_EMAIL;
const otherPassword = process.env.PB02_OTHER_PASSWORD;
const evidenceDirectory = process.env.PB02_EVIDENCE_DIR;
const sharedCredentialsAvailable = Boolean(
  ownerEmail && ownerPassword && otherEmail && otherPassword,
);

async function startFreshSession(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test("PB-02 shared draft journey", async ({ page }) => {
  test.skip(
    !sharedCredentialsAvailable,
    "Set the four PB02 credential environment variables for shared-environment execution.",
  );

  const title = `[Kai Test] PB-02 ${Date.now()}`;
  let draftCreated = false;

  try {
    await startFreshSession(page, ownerEmail!, ownerPassword!);
    await page.goto("/events/new");
    await page.getByLabel(/Event name/).fill(title);
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page).toHaveURL(/\/events$/);
    await expect(page.getByText("Draft saved.")).toBeVisible();
    draftCreated = true;

    const draftCard = page.locator("article").filter({ hasText: title });
    await expect(draftCard.getByText("draft", { exact: true })).toBeVisible();
    await draftCard.getByRole("link", { name: "Continue editing" }).click();
    const editUrl = page.url();

    await page.getByLabel("Purpose").fill("Verify PB-02 shared persistence");
    await page.getByLabel("Description").fill("Created by the PB-02 execution case.");
    await page.getByLabel("Event category").fill("Briefing");
    await page.getByLabel("Expected attendance").fill("120");
    await page.getByLabel("Starts").fill("2026-09-25T10:00");
    await page.getByLabel("Ends").fill("2026-09-25T12:00");
    await page.getByLabel("Preferred location").fill("Seminar Room");
    await page.getByLabel("Minimum capacity").fill("120");
    await page.getByLabel("Room layout").fill("Classroom");
    await page.getByLabel("Required facilities").fill("Projector, Microphone");
    await page.getByLabel("Accessibility needs").fill("Step-free access");
    await page.getByRole("button", { name: "Add equipment" }).click();
    await page.getByLabel("Equipment", { exact: true }).fill("Laptop");
    await page.getByLabel("Quantity", { exact: true }).fill("2");
    await page.getByLabel("Technical notes", { exact: true }).fill("HDMI capable");
    await page.getByLabel("Attendee registration is required").check();
    await page.getByLabel("Registration opens").fill("2026-09-14T09:00");
    await page.getByLabel("Registration closes").fill("2026-09-24T18:00");
    await page.getByLabel("Registration capacity").fill("120");
    await page.getByLabel("Enable waiting list").check();
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft updated.")).toBeVisible();

    await page.locator("article").filter({ hasText: title }).getByRole(
      "link",
      { name: "Continue editing" },
    ).click();
    await expect(page.getByLabel("Purpose")).toHaveValue(
      "Verify PB-02 shared persistence",
    );
    await expect(page.getByLabel("Expected attendance")).toHaveValue("120");
    await expect(page.getByLabel("Equipment", { exact: true })).toHaveValue("Laptop");
    await expect(page.getByLabel("Enable waiting list")).toBeChecked();

    if (evidenceDirectory) {
      await page.screenshot({
        path: `${evidenceDirectory}/pb02-draft-form-desktop.png`,
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: `${evidenceDirectory}/pb02-draft-form-mobile.png`,
        fullPage: true,
      });
      await page.setViewportSize({ width: 1280, height: 720 });
    }

    await startFreshSession(page, otherEmail!, otherPassword!);
    await page.goto(editUrl);
    await expect(page.getByRole("heading", { name: "Draft unavailable" })).toBeVisible();
    await expect(page.getByLabel(/Event name/)).not.toBeVisible();
  } finally {
    if (draftCreated) {
      await startFreshSession(page, ownerEmail!, ownerPassword!);
      await page.goto("/events");
      const draftCard = page.locator("article").filter({ hasText: title });
      const draftVisible = await draftCard
        .waitFor({ state: "visible", timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (draftVisible) {
        await draftCard.getByRole("button", { name: `Delete ${title}` }).click();
        await page.getByRole("button", { name: "Delete draft" }).click();
        await expect(draftCard).not.toBeVisible();
      }
    }
  }
});
