import { expect, test, type Page } from "@playwright/test";

const ownerEmail = process.env.PB03_OWNER_EMAIL;
const ownerPassword = process.env.PB03_OWNER_PASSWORD;
const evidenceDirectory = process.env.PB03_EVIDENCE_DIR;
const sharedCredentialsAvailable = Boolean(ownerEmail && ownerPassword);

async function startFreshSession(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Organisers land on their first nav section (getRoleDestination).
  await expect(page).toHaveURL(/\/events$/);
}

/**
 * Covers the organiser side of PB-03: completing a draft, submitting it, and
 * confirming the Requested state and permitted pre-approval edit (AC04, AC05,
 * AC07). Assignment now happens automatically on submission (PB-04) and the
 * organiser's card names the assigned coordinator, but this spec does not yet
 * sign in as the coordinator — there is no coordinator-facing page to view the
 * request against (that is PB-05/PB-06 territory). TC-PB04-08 in
 * docs/testing/sprint-1-test-cases.md tracks adding that leg once such a page
 * exists; until then, PB-04's assignment mechanics are covered at the
 * database level by pb04_coordinator_assignment.test.sql.
 */
test("PB-03 shared submission journey", async ({ page }) => {
  test.skip(
    !sharedCredentialsAvailable,
    "Set PB03_OWNER_EMAIL and PB03_OWNER_PASSWORD for shared-environment execution.",
  );

  const title = `[Shernice Test] PB-03 ${Date.now()}`;
  let requestCreated = false;

  try {
    await startFreshSession(page, ownerEmail!, ownerPassword!);
    await page.goto("/events/new");
    await page.getByLabel(/Event name/).fill(title);
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page).toHaveURL(/\/events$/);
    await expect(page.getByText("Draft saved.")).toBeVisible();
    requestCreated = true;

    // AC06: an incomplete request is blocked and every affected field is shown.
    await page.locator("article").filter({ hasText: title }).getByRole(
      "link",
      { name: "Submit request" },
    ).click();
    await page.getByRole("button", { name: "Submit request" }).click();
    await expect(
      page.getByText("Describe the purpose of the event before submitting"),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Confirm that each optional requirement is provided or not required",
      ),
    ).toBeVisible();

    // Complete every mandatory field, then submit successfully.
    await page.getByLabel(/^Purpose/).selectOption("Meeting");
    await page.getByLabel(/^Description/).fill("Created by the PB-03 execution case.");
    await page.getByLabel(/^Expected attendance/).fill("120");
    await page.getByLabel(/^Starts/).fill("2099-01-01T10:00");
    await page.getByLabel(/^Ends/).fill("2099-01-01T12:00");
    await page.getByLabel(/^Preferred location/).selectOption("Bugis");
    await page
      .getByLabel(/Each optional requirement above is provided/)
      .check();
    await page.getByRole("button", { name: "Submit request" }).click();
    await expect(page).toHaveURL(/\/events$/);
    await expect(page.getByText("Event request submitted.")).toBeVisible();

    // AC04/AC05: the card shows Requested and its submission time.
    const requestCard = page.locator("article").filter({ hasText: title });
    await expect(requestCard.getByText("requested", { exact: true })).toBeVisible();
    await expect(requestCard.getByText(/^Submitted/)).toBeVisible();
    await expect(
      requestCard.getByRole("link", { name: "Continue editing" }),
    ).not.toBeVisible();
    await expect(
      requestCard.getByRole("button", { name: `Delete ${title}` }),
    ).not.toBeVisible();
    // PB-04 AC01/AC02: assignment happens automatically on submission, and
    // the organiser can see who was assigned.
    await expect(requestCard.getByText(/^Coordinator: /)).toBeVisible();

    if (evidenceDirectory) {
      await page.screenshot({
        path: `${evidenceDirectory}/pb03-requested-card-desktop.png`,
        fullPage: true,
      });
    }

    // AC07: the organiser can still correct a Requested event before approval.
    await requestCard.getByRole("link", { name: "Edit request" }).click();
    await page.getByLabel(/^Expected attendance/).fill("130");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft updated.")).toBeVisible();
    await expect(
      page.locator("article").filter({ hasText: title }).getByText(
        "requested",
        { exact: true },
      ),
    ).toBeVisible();
  } finally {
    if (requestCreated) {
      // Requested requests cannot be deleted through this workflow (AC06 of
      // PB-02 restricts delete to Draft). Leave a note for manual cleanup by
      // the database owner rather than silently leaving shared-environment
      // clutter unaccounted for.
      console.warn(
        `PB-03 shared test left a Requested record that must be cleaned up manually: "${title}"`,
      );
    }
  }
});
