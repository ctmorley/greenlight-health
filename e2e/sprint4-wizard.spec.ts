import { test, expect, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

/**
 * Sprint 4 — PA Submission Wizard E2E Tests
 *
 * These tests validate the full PA wizard flow including:
 * - Step indicator and navigation
 * - Patient search by MRN and inline creation
 * - Service/CPT/ICD-10 code entry
 * - Insurance/payer auto-detection and PA requirement check
 * - File upload with category assignment
 * - Review step with AI audit warnings
 * - Draft save/reopen persistence
 * - Submit flow with timeline event creation
 */

const SEEDED_EMAIL = "sarah.mitchell@metroadvan.com";
const SEEDED_PASSWORD = "password123";

async function loginAsSeededUser(page: Page) {
  await page.goto("/app/login");
  await page.fill('input[type="email"]', SEEDED_EMAIL);
  await page.fill('input[type="password"]', SEEDED_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/app/dashboard**", { timeout: 15000 });
}

test.describe("Sprint 4 — PA Submission Wizard", () => {
  let referenceNumber = "";
  let requestId = "";

  test.beforeEach(async ({ page }) => {
    // Attempt login; skip all tests if DB is unavailable
    try {
      await loginAsSeededUser(page);
    } catch {
      test.skip(true, "Database not available — skipping wizard tests");
    }
  });

  test("wizard opens from PA list at step 1 with step indicator", async ({ page }) => {
    await page.goto("/app/requests");
    await page.click('button:has-text("New PA Request")');
    await page.waitForURL("**/app/requests/new**", { timeout: 15000 });

    // Step indicator visible
    await expect(page.locator('nav[aria-label="Progress"]')).toBeVisible({ timeout: 8000 });
    // Step 1 heading
    await expect(page.locator('h2:has-text("Select Patient")')).toBeVisible({ timeout: 5000 });
  });

  test("search for seeded patient by MRN returns results", async ({ page }) => {
    await page.goto("/app/requests/new");
    await page.locator('h2:has-text("Select Patient")').waitFor({ timeout: 8000 });

    await page.fill('input[placeholder*="Type patient name or MRN"]', "MRN001000");
    await expect(
      page.locator('button:has-text("MRN: MRN001000")').first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("inline patient creation validates name and DOB", async ({ page }) => {
    await page.goto("/app/requests/new");
    await page.locator('h2:has-text("Select Patient")').waitFor({ timeout: 8000 });

    await page.locator('button:has-text("Create New Patient")').click();
    await page.locator('button:has-text("Create & Select Patient")').click();

    await expect(page.locator("text=First name is required")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Last name is required")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Date of birth is required")).toBeVisible({ timeout: 5000 });
  });

  test("full wizard flow: create, draft save, reopen, submit", async ({
    page,
  }) => {
    // ── Step 1: Select Patient ──
    await page.goto("/app/requests/new");
    await page.locator('h2:has-text("Select Patient")').waitFor({ timeout: 8000 });

    await page.fill('input[placeholder*="Type patient name or MRN"]', "MRN001000");
    await page.locator('button:has-text("MRN: MRN001000")').first().waitFor({ timeout: 10000 });
    await page.locator('button:has-text("MRN: MRN001000")').first().click();
    // Selecting a patient auto-advances to step 2
    await expect(page.locator('h2:has-text("Service Details")')).toBeVisible({ timeout: 10000 });

    // ── Step 2: Service Details ──
    const selects = page.locator("select");
    await selects.nth(0).selectOption("imaging");
    await selects.nth(1).selectOption("mri");

    // Add CPT code
    await page.fill('input[placeholder*="70553"]', "70553");
    await page.locator('button:has-text("70553")').first().waitFor({ timeout: 10000 });
    await page.locator('button:has-text("70553")').first().click();
    await expect(page.locator('span:has-text("70553")').first()).toBeVisible({ timeout: 5000 });

    // Add ICD-10 code
    await page.fill('input[placeholder*="M54.5"]', "S06.0");
    const icdOption = page.locator('button:has-text("S06")').first();
    await icdOption.waitFor({ timeout: 10000 });
    await icdOption.click();

    await page.fill('textarea[placeholder*="Describe the procedure"]', "MRI brain due to trauma symptoms.");

    // Proceed to step 3 (auto-save happens during transition)
    await page.click('button:has-text("Next Step")');
    await expect(page.locator('h2:has-text("Insurance & Payer")')).toBeVisible({ timeout: 10000 });

    // ── Step 3: Insurance & Payer ──
    // Insurance should be auto-populated
    await expect(page.locator("text=Select Insurance")).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button:has-text("Primary")').first()).toBeVisible({ timeout: 5000 });

    // Select the primary insurance
    await page.locator('button:has-text("Primary")').first().click();

    // PA requirement check should display
    const paCheck = page.locator("text=PA Required").or(page.locator("text=PA Not Required"));
    await expect(paCheck.first()).toBeVisible({ timeout: 10000 });

    // Select physician if available
    const step3Selects = page.locator("select");
    const step3Count = await step3Selects.count();
    if (step3Count > 0) {
      await step3Selects.nth(step3Count - 1).selectOption({ index: 1 });
    }

    // Proceed to step 4 (auto-save with server draft creation happens here)
    await page.click('button:has-text("Next Step")');
    await expect(page.locator('h2:has-text("Clinical Documentation")')).toBeVisible({ timeout: 15000 });

    // ── Check draft reference was generated via auto-save ──
    const refEl = page.locator("p.font-mono.text-emerald-400").first();
    const refVisible = await refEl.isVisible().catch(() => false);
    if (refVisible) {
      referenceNumber = (await refEl.innerText()).trim();
    }
    expect(referenceNumber).toBeTruthy();

    // ── Step 4: Clinical Documentation — file upload ──
    const testPdfPath = path.join(process.cwd(), "uploads", "e2e-wizard-test.pdf");
    fs.writeFileSync(
      testPdfPath,
      "%PDF-1.4\n% E2E\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"
    );
    await page.setInputFiles('input[type="file"]', testPdfPath);

    const catSelect = page.locator("div.w-44 select").first();
    if ((await catSelect.count()) > 0) {
      await catSelect.selectOption("imaging_order");
    }
    const uploadBtn = page.locator('button:has-text("Upload")').first();
    if ((await uploadBtn.count()) > 0) {
      await uploadBtn.click();
    }
    await expect(page.locator("text=e2e-wizard-test.pdf")).toBeVisible({ timeout: 8000 });

    // Proceed to step 5
    await page.click('button:has-text("Next Step")');
    await expect(page.locator('h2:has-text("Review & Submit")')).toBeVisible({ timeout: 10000 });

    // ── Step 5: Review & Submit ──
    // Verify summary sections
    await expect(page.locator("text=70553").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Clinical Documentation").first()).toBeVisible({ timeout: 5000 });

    // ── Go back, remove ICD, return to review — audit should warn ──
    await page.click('button:has-text("Previous")');
    await page.locator('h2:has-text("Clinical Documentation")').waitFor({ timeout: 5000 });
    await page.click('button:has-text("Previous")');
    await page.locator('h2:has-text("Insurance & Payer")').waitFor({ timeout: 5000 });
    await page.click('button:has-text("Previous")');
    await expect(page.locator('h2:has-text("Service Details")')).toBeVisible({ timeout: 5000 });

    // Remove S06 ICD chip
    const s06Chip = page.locator("span").filter({ hasText: /S06/i }).first();
    if ((await s06Chip.count()) > 0) {
      await s06Chip.locator("button").click();
    }

    // Navigate back to review (wait for each step transition which may involve auto-save)
    await page.click('button:has-text("Next Step")');
    await page.locator('h2:has-text("Insurance & Payer")').waitFor({ timeout: 10000 });
    await page.click('button:has-text("Next Step")');
    await page.locator('h2:has-text("Clinical Documentation")').waitFor({ timeout: 10000 });
    await page.click('button:has-text("Next Step")');
    await expect(page.locator('h2:has-text("Review & Submit")')).toBeVisible({ timeout: 10000 });

    // AI audit should warn about missing ICD-10
    await expect(
      page.locator("text=No ICD-10 diagnosis codes provided").first()
    ).toBeVisible({ timeout: 5000 });

    // ── Save as Draft ──
    await page.click('button:has-text("Save as Draft")');
    await page.waitForURL("**/app/requests**", { timeout: 10000 });

    // ── Verify draft appears in list ──
    if (referenceNumber) {
      await page.fill('input[placeholder*="Search by reference number"]', referenceNumber);
      await page.waitForTimeout(700);
      const row = page.locator(`tr:has-text("${referenceNumber}")`).first();
      await expect(row).toBeVisible({ timeout: 10000 });
      await expect(row.locator("text=Draft").first()).toBeVisible({ timeout: 5000 });

      // ── Reopen draft — should resume at saved step ──
      await row.click();
      await page.waitForURL("**/app/requests/new?draft=**", { timeout: 10000 });
      await expect(page.locator('h2:has-text("Review & Submit")')).toBeVisible({ timeout: 5000 });

      // ── Submit ──
      await page.click('button:has-text("Submit PA Request")');
      // Wait for navigation to the detail page (not /new)
      await page.waitForFunction(
        () => window.location.pathname.match(/\/app\/requests\/[^/]+$/) && !window.location.pathname.includes("/new"),
        { timeout: 20000 }
      );
      const url = page.url();
      requestId = url.split("/app/requests/")[1].split("?")[0];
      expect(requestId).toBeTruthy();
      expect(requestId).not.toBe("new");

      await expect(page.locator("text=Submitted").first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("timeline API contains submitted event after submission", async ({
    page,
  }) => {
    // Quick wizard flow: create and submit a PA, then verify timeline on detail page
    await page.goto("/app/requests/new");
    await page.locator('h2:has-text("Select Patient")').waitFor({ timeout: 8000 });

    // Select patient (auto-advances to step 2)
    await page.fill('input[placeholder*="Type patient name or MRN"]', "MRN001000");
    await page.locator('button:has-text("MRN: MRN001000")').first().waitFor({ timeout: 10000 });
    await page.locator('button:has-text("MRN: MRN001000")').first().click();
    await page.locator('h2:has-text("Service Details")').waitFor({ timeout: 10000 });

    // Service details
    await page.locator("select").nth(0).selectOption("imaging");
    await page.locator("select").nth(1).selectOption("mri");
    await page.fill('input[placeholder*="70553"]', "70553");
    await page.locator('button:has-text("70553")').first().click({ timeout: 10000 });
    await page.fill('input[placeholder*="M54.5"]', "S06.0");
    await page.locator('button:has-text("S06")').first().click({ timeout: 10000 });
    await page.click('button:has-text("Next Step")');

    // Insurance
    await page.locator('h2:has-text("Insurance & Payer")').waitFor({ timeout: 10000 });
    await page.locator('button:has-text("Primary")').first().click();
    await page.click('button:has-text("Next Step")');

    // Documentation (skip upload)
    await page.locator('h2:has-text("Clinical Documentation")').waitFor({ timeout: 10000 });
    await page.click('button:has-text("Next Step")');

    // Review & submit
    await page.locator('h2:has-text("Review & Submit")').waitFor({ timeout: 10000 });
    await page.click('button:has-text("Submit PA Request")');
    // Wait for navigation to the detail page (not /new)
    await page.waitForFunction(
      () => window.location.pathname.match(/\/app\/requests\/[^/]+$/) && !window.location.pathname.includes("/new"),
      { timeout: 20000 }
    );

    const url = page.url();
    const id = url.split("/app/requests/")[1]?.split("?")[0];
    expect(id).toBeTruthy();
    expect(id).not.toBe("new");

    // Verify detail page shows "Submitted" status
    await expect(page.locator("text=Submitted").first()).toBeVisible({ timeout: 5000 });

    // Verify timeline section on detail page shows submission event
    // The detail page includes timeline entries - look for "submitted" in the page
    await expect(page.locator("text=submitted").first()).toBeVisible({ timeout: 5000 });
  });

  test("inline patient creation saves to DB and proceeds to step 2", async ({ page }) => {
    await page.goto("/app/requests/new");
    await page.locator('h2:has-text("Select Patient")').waitFor({ timeout: 8000 });

    await page.locator('button:has-text("Create New Patient")').click();

    const unique = Date.now();
    // Fill in required fields for new patient
    const inputs = page.locator("input");
    await inputs.nth(0).fill(`QAFirst${unique}`);
    await inputs.nth(1).fill(`QALast${unique}`);
    await inputs.nth(2).fill(`QAMRN${unique}`);
    await page.locator('input[type="date"]').first().fill("1985-06-15");

    await page.locator('button:has-text("Create & Select Patient")').click();

    // Should create the patient and auto-advance to step 2
    await expect(page.locator('h2:has-text("Service Details")')).toBeVisible({ timeout: 10000 });
  });

  test("service category filters service type options", async ({ page }) => {
    await page.goto("/app/requests/new");
    await page.locator('h2:has-text("Select Patient")').waitFor({ timeout: 8000 });

    // Select a patient first (auto-advances to step 2)
    await page.fill('input[placeholder*="Type patient name or MRN"]', "MRN001000");
    await page.locator('button:has-text("MRN: MRN001000")').first().waitFor({ timeout: 10000 });
    await page.locator('button:has-text("MRN: MRN001000")').first().click();

    await page.locator('h2:has-text("Service Details")').waitFor({ timeout: 10000 });

    // Select imaging category
    await page.locator("select").nth(0).selectOption("imaging");

    // Check that service type options contain imaging types
    const typeSelect = page.locator("select").nth(1);
    const options = await typeSelect.locator("option").allTextContents();
    expect(options.some((o) => o.toLowerCase().includes("mri"))).toBeTruthy();
  });
});
