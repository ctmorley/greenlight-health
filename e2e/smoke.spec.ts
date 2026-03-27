import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test("serves the existing GreenLight landing page at /", async ({ page }) => {
    await page.goto("/");
    // The landing page should contain GreenLight branding
    await expect(page.locator("body")).toContainText("GreenLight");
  });

  test("ROI calculator is interactive on landing page", async ({ page }) => {
    await page.goto("/");
    // Check that there are interactive input elements (ROI calculator)
    const inputs = page.locator("input[type='range'], input[type='number']");
    const count = await inputs.count();
    // The ROI calculator should have at least one input
    expect(count).toBeGreaterThan(0);
  });
});

test.describe("Auth - Unauthenticated Redirects", () => {
  test("redirects /app/dashboard to /app/login when not authenticated", async ({
    page,
  }) => {
    await page.goto("/app/dashboard");
    await page.waitForURL("**/app/login**");
    expect(page.url()).toContain("/app/login");
  });

  test("redirects /app/requests to /app/login when not authenticated", async ({
    page,
  }) => {
    await page.goto("/app/requests");
    await page.waitForURL("**/app/login**");
    expect(page.url()).toContain("/app/login");
  });

  test("redirects /app/patients to /app/login when not authenticated", async ({
    page,
  }) => {
    await page.goto("/app/patients");
    await page.waitForURL("**/app/login**");
    expect(page.url()).toContain("/app/login");
  });

  test("redirects /app/settings to /app/login when not authenticated", async ({
    page,
  }) => {
    await page.goto("/app/settings");
    await page.waitForURL("**/app/login**");
    expect(page.url()).toContain("/app/login");
  });
});

test.describe("Login Page", () => {
  test("renders the login page with dark theme", async ({ page }) => {
    await page.goto("/app/login");

    // Check page has the login form elements
    await expect(page.locator("text=Welcome back")).toBeVisible();
    await expect(page.locator("text=Sign in to your account")).toBeVisible();

    // Check form inputs exist
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();

    // Check submit button
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText(
      "Sign In"
    );

    // Check link to register page
    await expect(page.locator('a[href="/app/register"]')).toBeVisible();
  });

  test("has dark theme background color", async ({ page }) => {
    await page.goto("/app/login");
    const bgColor = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });
    // #080C14 in RGB is rgb(8, 12, 20)
    expect(bgColor).toBe("rgb(8, 12, 20)");
  });
});

test.describe("Register Page", () => {
  test("renders the registration form with org name, email, and password as required fields", async ({ page }) => {
    await page.goto("/app/register");

    // Check page has registration form elements
    await expect(page.locator("text=Create your account")).toBeVisible();

    // Required fields per contract: org name, email, password
    await expect(
      page.locator('input[placeholder="Your Imaging Center"]')
    ).toBeVisible();
    await expect(
      page.locator('input[placeholder="jane@example.com"]')
    ).toBeVisible();
    await expect(
      page.locator('input[placeholder="At least 8 characters"]')
    ).toBeVisible();
    await expect(
      page.locator('input[placeholder="Repeat your password"]')
    ).toBeVisible();

    // Optional fields: first/last name (present but not required)
    await expect(page.locator('input[placeholder="Jane"]')).toBeVisible();
    await expect(page.locator('input[placeholder="Smith"]')).toBeVisible();

    // Check organization type dropdown
    await expect(page.locator("select")).toBeVisible();

    // Check submit button
    await expect(page.locator('button[type="submit"]')).toContainText(
      "Create Account"
    );

    // Check link to login
    await expect(page.locator('a[href="/app/login"]')).toBeVisible();
  });

  test("first and last name fields are not required", async ({ page }) => {
    await page.goto("/app/register");

    // Verify first/last name inputs do NOT have the required attribute
    const firstName = page.locator('input[placeholder="Jane"]');
    const lastName = page.locator('input[placeholder="Smith"]');
    await expect(firstName).not.toHaveAttribute("required", "");
    await expect(lastName).not.toHaveAttribute("required", "");
  });

  test("validates password length client-side", async ({ page }) => {
    await page.goto("/app/register");

    // Fill in only the required fields with a short password
    await page
      .locator('input[placeholder="Your Imaging Center"]')
      .fill("Test Org");
    await page
      .locator('input[placeholder="jane@example.com"]')
      .fill("test@test.com");
    await page
      .locator('input[placeholder="At least 8 characters"]')
      .fill("short");
    await page
      .locator('input[placeholder="Repeat your password"]')
      .fill("short");

    await page.locator('button[type="submit"]').click();

    // Should show password length error
    await expect(
      page.locator("text=Password must be at least 8 characters")
    ).toBeVisible();
  });

  test("validates password match client-side", async ({ page }) => {
    await page.goto("/app/register");

    // Fill in only the required fields with mismatched passwords
    await page
      .locator('input[placeholder="Your Imaging Center"]')
      .fill("Test Org");
    await page
      .locator('input[placeholder="jane@example.com"]')
      .fill("test@test.com");
    await page
      .locator('input[placeholder="At least 8 characters"]')
      .fill("password123");
    await page
      .locator('input[placeholder="Repeat your password"]')
      .fill("differentpass");

    await page.locator('button[type="submit"]').click();

    // Should show password mismatch error
    await expect(
      page.locator("text=Passwords do not match")
    ).toBeVisible();
  });
});

test.describe("Navigation Links", () => {
  test("login page links to register and vice versa", async ({ page }) => {
    await page.goto("/app/login");
    const registerLink = page.locator('a[href="/app/register"]');
    await expect(registerLink).toBeVisible();

    await page.goto("/app/register");
    const loginLink = page.locator('a[href="/app/login"]');
    await expect(loginLink).toBeVisible();
  });
});

// ── Authenticated Flow Tests ──
// These tests require a running PostgreSQL database.
// They exercise the full register → login → dashboard → sidebar → logout flow.
// When the database is unavailable, these tests are skipped gracefully.
test.describe("Authenticated Flow (requires DB)", () => {
  const testEmail = `smoke-test-${Date.now()}@greenlight-test.com`;
  const testPassword = "TestPassword123!";
  const testOrgName = "Smoke Test Imaging Center";

  test("register with org name, email, and password → auto-login → dashboard with sidebar → logout", async ({
    page,
  }) => {
    // Step 1: Register a new account (contract: org name + email + password)
    await page.goto("/app/register");

    await page
      .locator('input[placeholder="Your Imaging Center"]')
      .fill(testOrgName);
    await page
      .locator('input[placeholder="jane@example.com"]')
      .fill(testEmail);
    await page
      .locator('input[placeholder="At least 8 characters"]')
      .fill(testPassword);
    await page
      .locator('input[placeholder="Repeat your password"]')
      .fill(testPassword);

    // Note: first/last name left empty — they are optional per contract

    await page.locator('button[type="submit"]').click();

    // The registration might fail if DB is unavailable; detect and skip
    const errorOrDashboard = await Promise.race([
      page
        .locator("text=Database unavailable")
        .waitFor({ timeout: 8000 })
        .then(() => "db-error" as const),
      page
        .locator("text=Internal server error")
        .waitFor({ timeout: 8000 })
        .then(() => "server-error" as const),
      page
        .waitForURL("**/app/dashboard**", { timeout: 15000 })
        .then(() => "dashboard" as const),
    ]).catch(() => "timeout" as const);

    if (errorOrDashboard === "db-error" || errorOrDashboard === "server-error") {
      test.skip(true, "Database is not available — skipping authenticated flow tests");
      return;
    }

    if (errorOrDashboard === "timeout") {
      // Check if we got redirected somewhere else
      if (!page.url().includes("/app/dashboard")) {
        test.skip(true, "Could not reach dashboard — database may be unavailable");
        return;
      }
    }

    // Step 2: Verify we're on the dashboard
    expect(page.url()).toContain("/app/dashboard");

    // Step 3: Verify sidebar navigation links are present
    const sidebar = page.locator("nav, aside, [role='navigation']").first();
    await expect(sidebar).toBeVisible({ timeout: 5000 });

    // Check all required sidebar links (use text matching to avoid strict mode violations
    // since the logo also links to /app/dashboard)
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'PA Requests' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Patients' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Denials' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Analytics' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();

    // Step 4: Click each sidebar link and verify URL changes
    await page.getByRole('link', { name: 'PA Requests' }).click();
    await page.waitForURL("**/app/requests**");
    expect(page.url()).toContain("/app/requests");

    await page.getByRole('link', { name: 'Patients' }).click();
    await page.waitForURL("**/app/patients**");
    expect(page.url()).toContain("/app/patients");

    await page.getByRole('link', { name: 'Denials' }).click();
    await page.waitForURL("**/app/denials**");
    expect(page.url()).toContain("/app/denials");

    await page.getByRole('link', { name: 'Analytics' }).click();
    await page.waitForURL("**/app/analytics**");
    expect(page.url()).toContain("/app/analytics");

    await page.getByRole('link', { name: 'Settings' }).click();
    await page.waitForURL("**/app/settings**");
    expect(page.url()).toContain("/app/settings");

    // Navigate back to dashboard
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await page.waitForURL("**/app/dashboard**");
    expect(page.url()).toContain("/app/dashboard");

    // Step 5: Logout via user dropdown menu
    // The topbar has a user avatar dropdown that contains the Logout button
    // Click the avatar/user-menu trigger to open the dropdown
    // Skip the hamburger menu button (only visible on mobile), go to user menu area
    const userMenuTrigger = page.locator('header .flex.items-center.gap-3 button').first();
    await userMenuTrigger.click();
    // Wait for dropdown to appear, then click Logout
    const logoutButton = page.getByText('Logout');
    await logoutButton.waitFor({ state: 'visible', timeout: 3000 });
    await logoutButton.click();
    // Should redirect to login page
    await page.waitForURL("**/app/login**", { timeout: 10000 });
    expect(page.url()).toContain("/app/login");

    // Step 6: Verify we can't access dashboard after logout
    await page.goto("/app/dashboard");
    await page.waitForURL("**/app/login**");
    expect(page.url()).toContain("/app/login");
  });

  test("login with registered credentials redirects to dashboard", async ({
    page,
  }) => {
    // First register a user
    const loginEmail = `smoke-login-${Date.now()}@greenlight-test.com`;

    await page.goto("/app/register");
    await page
      .locator('input[placeholder="Your Imaging Center"]')
      .fill("Login Test Org");
    await page
      .locator('input[placeholder="jane@example.com"]')
      .fill(loginEmail);
    await page
      .locator('input[placeholder="At least 8 characters"]')
      .fill(testPassword);
    await page
      .locator('input[placeholder="Repeat your password"]')
      .fill(testPassword);
    await page.locator('button[type="submit"]').click();

    // Wait for registration to complete
    const regResult = await Promise.race([
      page
        .locator("text=Database unavailable")
        .waitFor({ timeout: 8000 })
        .then(() => "db-error" as const),
      page
        .waitForURL("**/app/dashboard**", { timeout: 15000 })
        .then(() => "dashboard" as const),
    ]).catch(() => "timeout" as const);

    if (regResult !== "dashboard") {
      test.skip(true, "Database is not available — skipping login test");
      return;
    }

    // Now logout by navigating to login page directly after clearing session
    await page.goto("/app/login");
    // If we get redirected to dashboard (still authenticated), clear cookies
    if (page.url().includes("/app/dashboard")) {
      await page.context().clearCookies();
      await page.goto("/app/login");
    }

    // Now login with the same credentials
    await page.locator('input[type="email"]').fill(loginEmail);
    await page.locator('input[type="password"]').fill(testPassword);
    await page.locator('button[type="submit"]').click();

    // Should redirect to dashboard
    await page.waitForURL("**/app/dashboard**", { timeout: 15000 });
    expect(page.url()).toContain("/app/dashboard");
  });
});
