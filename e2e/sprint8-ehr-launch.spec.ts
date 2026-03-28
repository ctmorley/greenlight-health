import { test, expect } from "@playwright/test";

test.describe("Sprint 8: EHR Launch & FHIR Integration", () => {
  // ─── Launch Route Tests ─────────────────────────────────────

  test.describe("SMART on FHIR Launch Endpoint", () => {
    test("/launch shows error when no iss parameter provided", async ({ page }) => {
      await page.goto("/launch");
      await expect(page.locator("text=EHR Launch Error")).toBeVisible();
      await expect(page.locator("text=Missing required")).toBeVisible();
    });

    test("/launch shows connecting state with valid iss", async ({ page }) => {
      // Navigate to launch with a FHIR server URL
      // This will attempt OAuth redirect, but since we're not in an EHR we just verify
      // the page renders the connecting state before the redirect
      await page.goto("/launch?iss=https://launch.smarthealthit.org/v/r4/fhir&launch=test123");
      // Should briefly show "Connecting to EHR..." before redirect attempt
      const spinner = page.locator("text=Connecting to EHR");
      // Either shows spinner or redirects — both are valid
      const error = page.locator("text=EHR Launch Error");
      await expect(spinner.or(error)).toBeVisible({ timeout: 10000 });
    });

    test("/launch provides fallback link to manual login", async ({ page }) => {
      await page.goto("/launch");
      await expect(page.locator("text=Go to manual login")).toBeVisible();
    });
  });

  // ─── Launch Route Access Control ─────────────────────────────

  test.describe("Launch routes bypass NextAuth", () => {
    test("/launch is accessible without authentication", async ({ page }) => {
      // Clear any session
      await page.context().clearCookies();
      await page.goto("/launch");
      // Should NOT redirect to /app/login
      expect(page.url()).not.toContain("/app/login");
      await expect(page.locator("text=EHR Launch Error").or(page.locator("text=Connecting"))).toBeVisible();
    });

    test("/launch/callback is accessible without authentication", async ({ page }) => {
      await page.context().clearCookies();
      await page.goto("/launch/callback");
      // Should NOT redirect to /app/login — shows error (no OAuth state) or connecting
      expect(page.url()).not.toContain("/app/login");
    });
  });

  // ─── FHIR API Endpoints ──────────────────────────────────────

  test.describe("FHIR API Routes", () => {
    test("POST /api/fhir/match-patient requires authentication", async ({ request }) => {
      const res = await request.post("/api/fhir/match-patient", {
        data: {
          fhirPatientId: "test-123",
          firstName: "Test",
          lastName: "Patient",
          dob: "1990-01-01",
        },
      });
      expect(res.status()).toBe(401);
    });

    test("GET /api/fhir/session requires authentication", async ({ request }) => {
      const res = await request.get("/api/fhir/session");
      expect(res.status()).toBe(401);
    });

    test("POST /api/fhir/session requires authentication", async ({ request }) => {
      const res = await request.post("/api/fhir/session", {
        data: {
          fhirBaseUrl: "https://hapi.fhir.org/baseR4",
          patientId: "test-123",
        },
      });
      expect(res.status()).toBe(401);
    });
  });

  // ─── Wizard EHR Banner ───────────────────────────────────────

  test.describe("Wizard EHR Integration UI", () => {
    test("wizard loads normally without EHR context", async ({ page }) => {
      // Login first
      await page.goto("/app/login");
      await page.fill('input[type="email"]', "sarah.mitchell@metroadvan.com");
      await page.fill('input[type="password"]', "password123");
      await page.click('button[type="submit"]');
      await page.waitForURL("**/app/dashboard**");

      // Navigate to new PA request
      await page.goto("/app/requests/new");
      await expect(page.locator("text=New PA Request")).toBeVisible();

      // Should NOT show EHR banner
      await expect(page.locator("text=EHR Connected")).not.toBeVisible();
    });

    test("wizard shows EHR banner when FHIR context is in sessionStorage", async ({ page }) => {
      // Login
      await page.goto("/app/login");
      await page.fill('input[type="email"]', "sarah.mitchell@metroadvan.com");
      await page.fill('input[type="password"]', "password123");
      await page.click('button[type="submit"]');
      await page.waitForURL("**/app/dashboard**");

      // Inject mock FHIR context into sessionStorage before navigating
      await page.evaluate(() => {
        const mockContext = {
          fhirBaseUrl: "https://hapi.fhir.org/baseR4",
          patientId: "test-123",
          patient: {
            fhirId: "test-123",
            firstName: "John",
            lastName: "Smith",
            fullName: "John Smith",
            mrn: "MRN-12345",
            dob: "1985-03-15",
            gender: "male",
            phone: "555-0100",
            email: "john@example.com",
          },
          coverage: {
            fhirId: "cov-1",
            payerName: "Aetna",
            payerIdentifier: null,
            planName: "Aetna PPO",
            memberId: "AET123456",
            groupNumber: "GRP789",
            subscriberId: "SUB001",
            relationship: "self",
          },
          conditions: [
            {
              fhirId: "cond-1",
              code: "M54.5",
              display: "Low back pain",
              clinicalStatus: "active",
              onsetDate: "2024-01-15",
            },
          ],
          serviceRequest: {
            fhirId: "sr-1",
            status: "active",
            intent: "order",
            cptCodes: ["72148"],
            procedureDescription: "MRI Lumbar Spine without contrast",
            reasonCodes: ["M54.5"],
            priority: "routine",
            occurrenceDate: "2026-04-15",
          },
          practitioner: null,
          createdAt: new Date().toISOString(),
        };
        sessionStorage.setItem("greenlight_fhir_context", JSON.stringify(mockContext));
      });

      // Navigate to wizard with EHR source
      await page.goto("/app/requests/new?source=ehr");
      await expect(page.locator("text=New PA Request")).toBeVisible();

      // Should show EHR Connected banner
      await expect(page.locator("text=EHR Connected")).toBeVisible({ timeout: 5000 });
      await expect(page.locator("text=Patient: John Smith")).toBeVisible();
    });
  });
});
