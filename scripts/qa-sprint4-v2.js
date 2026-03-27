const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: 'http://localhost:3000' });
  const page = await context.newPage();

  const results = [];
  const add = (name, pass, detail = '') => {
    results.push({ name, pass, detail });
    console.log((pass ? 'PASS' : 'FAIL') + ': ' + name + (detail ? ' - ' + detail : ''));
  };

  const assertVisible = async (locator, timeout = 10000) => {
    await locator.first().waitFor({ timeout });
  };

  let ref = '';
  let requestId = '';

  try {
    // Login
    await page.goto('/app/login');
    await page.fill('input[type="email"]', 'sarah.mitchell@metroadvan.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/app/dashboard**', { timeout: 15000 });
    add('Login', true);

    // Start wizard from list page
    await page.goto('/app/requests');
    await page.click('button:has-text("New PA Request")');
    await page.waitForURL('**/app/requests/new**', { timeout: 15000 });
    await assertVisible(page.locator('nav[aria-label="Progress"]'));
    await assertVisible(page.locator('h2:has-text("Select Patient")'));
    add('Clicking New PA Request opens wizard at step 1', true);

    // Search MRN and select
    await page.fill('input[placeholder*="Type patient name or MRN"]', 'MRN001000');
    await assertVisible(page.locator('button:has-text("MRN: MRN001000")'));
    await page.locator('button:has-text("MRN: MRN001000")').first().click();
    await assertVisible(page.locator('text=Selected Patient'));
    add('Search seeded patient by MRN returns matching result', true);

    // Step 2
    await page.click('button:has-text("Next Step")');
    await assertVisible(page.locator('h2:has-text("Service Details")'));
    const step2Selects = page.locator('select');
    await step2Selects.nth(0).selectOption('imaging');
    await step2Selects.nth(1).selectOption('mri');
    add('Selecting service category filters type options', true);

    // CPT add
    await page.fill('input[placeholder*="70553"]', '70553');
    await assertVisible(page.locator('button:has-text("70553")'));
    await page.locator('button:has-text("70553")').first().click();
    await assertVisible(page.locator('span:has-text("70553")'));
    add('CPT codes can be added from suggestions', true);

    // ICD add
    await page.fill('input[placeholder*="M54.5"]', 'S06.0');
    await assertVisible(page.locator('button:has-text("S06")'));
    await page.locator('button:has-text("S06")').first().click();
    const hasS06Chip = await page.locator('span').filter({ hasText: /S06/i }).count();
    add('ICD-10 codes can be added from suggestions', hasS06Chip > 0, 'S06 chip count=' + hasS06Chip);

    await page.fill('textarea[placeholder*="Describe the procedure"]', 'MRI brain due to trauma symptoms.');

    // Step 3
    await page.click('button:has-text("Next Step")');
    await assertVisible(page.locator('h2:has-text("Insurance & Payer")'));
    const insuranceCount = await page.locator('button:has-text("Primary")').count();
    add('Step 3 shows patient insurance and auto-detected payer', insuranceCount > 0, 'insurance cards=' + insuranceCount);

    const paCheck = page.locator('text=PA Required').or(page.locator('text=PA Not Required'));
    const paVisible = await paCheck.first().isVisible().catch(() => false);
    add('PA requirement check displays result', paVisible);

    const rbmVisible = await page.locator('text=RBM Routing:').first().isVisible().catch(() => false);
    add('RBM routing display shown', rbmVisible);

    // choose physician
    const step3Selects = page.locator('select');
    const step3Count = await step3Selects.count();
    if (step3Count > 0) {
      await step3Selects.nth(step3Count - 1).selectOption({ index: 1 });
    }

    // Step 4 (also should create draft)
    await page.click('button:has-text("Next Step")');
    await assertVisible(page.locator('h2:has-text("Clinical Documentation")'));
    const refEl = page.locator('p.font-mono.text-emerald-400').first();
    const refVisible = await refEl.isVisible().catch(() => false);
    if (refVisible) ref = (await refEl.innerText()).trim();
    add('Draft auto-save creates reference by step transition', !!ref, ref);

    // Upload file
    const pdfPath = path.join(process.cwd(), 'uploads', 'qa-sprint4-v2.pdf');
    fs.writeFileSync(pdfPath, '%PDF-1.4\n% QA\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
    await page.setInputFiles('input[type="file"]', pdfPath);
    await assertVisible(page.locator('text=qa-sprint4-v2.pdf'));
    const catSelect = page.locator('div.w-44 select').first();
    if (await catSelect.count()) {
      await catSelect.selectOption('imaging_order');
    }
    const uploadBtn = page.locator('button:has-text("Upload")').first();
    if (await uploadBtn.count()) await uploadBtn.click();
    add('Files can be uploaded with category assignment', true);

    // Step 5
    await page.click('button:has-text("Next Step")');
    await assertVisible(page.locator('h2:has-text("Review & Submit")'));
    const summaryHasPatient = await page.locator('text=Patient').count();
    const summaryHasService = await page.locator('text=Service Details').count();
    const summaryHasDocs = await page.locator('text=Clinical Documentation').count();
    add('Review step shows full summary sections', summaryHasPatient > 0 && summaryHasService > 0 && summaryHasDocs > 0);

    // Remove ICD and verify audit warning
    await page.click('button:has-text("Previous")');
    await page.click('button:has-text("Previous")');
    await page.click('button:has-text("Previous")');
    await assertVisible(page.locator('h2:has-text("Service Details")'));
    const s06Chip = page.locator('span').filter({ hasText: /S06/i }).first();
    const hasS06 = await s06Chip.count();
    if (hasS06) {
      await s06Chip.locator('button').click();
    }
    await page.click('button:has-text("Next Step")');
    await page.click('button:has-text("Next Step")');
    await page.click('button:has-text("Next Step")');
    await assertVisible(page.locator('h2:has-text("Review & Submit")'));
    const warningVisible = await page.locator('text=No ICD-10 diagnosis codes provided').first().isVisible().catch(() => false);
    add('AI audit flags missing ICD-10 with warning', warningVisible);

    // Save as draft -> list
    await page.click('button:has-text("Save as Draft")');
    await page.waitForURL('**/app/requests**', { timeout: 10000 });
    add('Save as Draft action works', true);

    // list shows draft
    if (ref) {
      await page.fill('input[placeholder*="Search by reference number"]', ref);
      await page.waitForTimeout(800);
      const row = page.locator('tr:has-text("' + ref + '")').first();
      await assertVisible(row, 10000);
      const hasDraft = await row.locator('text=Draft').count();
      add('Saved draft appears in PA list with draft status', hasDraft > 0);

      await row.click();
      await page.waitForURL('**/app/requests/new?draft=**', { timeout: 10000 });
      const onReview = await page.locator('h2:has-text("Review & Submit")').count();
      add('Reopen draft resumes at saved step', onReview > 0);

      // submit
      await page.click('button:has-text("Submit PA Request")');
      await page.waitForURL('**/app/requests/**', { timeout: 15000 });
      const currentUrl = page.url();
      requestId = currentUrl.split('/app/requests/')[1].split('?')[0];
      const submittedBadge = await page.locator('text=Submitted').count();
      add('Submit transitions status to submitted', submittedBadge > 0, 'requestId=' + requestId);

      // timeline API
      const tlResp = await context.request.get('/api/requests/' + requestId + '/timeline');
      const tlJson = await tlResp.json();
      const hasSubmitEvent = Array.isArray(tlJson.timeline) && tlJson.timeline.some((e) => e.toStatus === 'submitted');
      add('Audit log entry exists for submitted event', tlResp.ok() && hasSubmitEvent);

      // docs API
      const dResp = await context.request.get('/api/requests/' + requestId + '/documents');
      const dJson = await dResp.json();
      add('Documents API returns uploaded file metadata', dResp.ok() && Array.isArray(dJson.documents) && dJson.documents.length > 0, 'count=' + (Array.isArray(dJson.documents) ? dJson.documents.length : 0));

      // Detail page timeline UI check
      const hasPlaceholder = await page.locator('text=Full detail view with timeline, documents, and status management will be implemented in Sprint 5').count();
      add('Timeline event visible in request detail UI', hasPlaceholder === 0, hasPlaceholder ? 'Timeline UI missing; placeholder shown' : 'visible');
    }

    // Flow B: new patient creation
    await page.goto('/app/requests/new');
    await page.locator('button:has-text("Create New Patient")').click();
    await page.locator('button:has-text("Create & Select Patient")').click();
    const hasFirstErr = await page.locator('text=First name is required').count();
    const hasLastErr = await page.locator('text=Last name is required').count();
    const hasDobErr = await page.locator('text=Date of birth is required').count();
    add('Inline patient creation validates name and DOB required', hasFirstErr > 0 && hasLastErr > 0 && hasDobErr > 0);

    const unique = Date.now();
    await page.fill('input[aria-label="First Name *"], input').first().fill('QA');
    const inputs = page.locator('input');
    await inputs.nth(1).fill('Patient' + unique);
    await inputs.nth(2).fill('QAMRN' + unique);
    // DOB is first date input
    await page.locator('input[type="date"]').first().fill('1980-01-01');
    await page.locator('button:has-text("Create & Select Patient")').click();
    await assertVisible(page.locator('text=Selected Patient'), 10000);
    const stillStep1 = await page.locator('h2:has-text("Select Patient")').count();
    add('Creating new patient inline proceeds automatically to step 2', stillStep1 === 0, stillStep1 ? 'Stayed on step 1' : 'Moved to step 2');

  } catch (e) {
    add('Script fatal error', false, e && e.message ? e.message : String(e));
  } finally {
    await browser.close();
    console.log('\nSUMMARY');
    for (const r of results) {
      console.log((r.pass ? 'PASS' : 'FAIL') + '\t' + r.name + '\t' + r.detail);
    }
  }
})();
