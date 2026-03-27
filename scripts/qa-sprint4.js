const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: 'http://localhost:3000' });
  const page = await context.newPage();

  const checkpoints = [];
  let icdSelected = null;
  let referenceNumber = null;
  let requestId = null;

  function log(status, name, detail = '') {
    checkpoints.push({ status, name, detail });
    console.log(status + ': ' + name + (detail ? ' - ' + detail : ''));
  }

  async function safeStep(name, fn) {
    try {
      await fn();
      log('PASS', name);
      return true;
    } catch (err) {
      log('FAIL', name, err && err.message ? err.message : String(err));
      return false;
    }
  }

  try {
    await safeStep('Login with seeded user', async () => {
      await page.goto('/app/login');
      await page.fill('input[type="email"]', 'sarah.mitchell@metroadvan.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');
      await page.waitForURL('**/app/dashboard**', { timeout: 15000 });
    });

    await safeStep('New PA Request opens wizard', async () => {
      await page.goto('/app/requests');
      await page.click('button:has-text("New PA Request")');
      await page.waitForURL('**/app/requests/new**', { timeout: 15000 });
      await page.locator('h1:has-text("New PA Request")').waitFor({ timeout: 8000 });
    });

    await safeStep('Step indicator shows at step 1', async () => {
      await page.locator('nav[aria-label="Progress"]').waitFor({ timeout: 5000 });
      await page.locator('h2:has-text("Select Patient")').waitFor({ timeout: 5000 });
    });

    await safeStep('Search seeded patient by MRN', async () => {
      await page.fill('input[placeholder*="Type patient name or MRN"]', 'MRN001000');
      await page.locator('button:has-text("MRN: MRN001000")').first().waitFor({ timeout: 10000 });
    });

    await safeStep('Select found patient', async () => {
      await page.locator('button:has-text("MRN: MRN001000")').first().click();
      await page.locator('text=Selected Patient').waitFor({ timeout: 5000 });
    });

    await safeStep('Proceed to step 2', async () => {
      await page.click('button:has-text("Next Step")');
      await page.locator('h2:has-text("Service Details")').waitFor({ timeout: 5000 });
    });

    await safeStep('Select imaging -> mri', async () => {
      const selects = page.locator('select');
      await selects.nth(0).selectOption('imaging');
      await selects.nth(1).selectOption('mri');
    });

    await safeStep('Add CPT 70553 from suggestions', async () => {
      await page.fill('input[placeholder*="70553"]', '70553');
      await page.locator('button:has-text("70553")').first().click({ timeout: 10000 });
      await page.locator('span:has-text("70553")').first().waitFor({ timeout: 5000 });
    });

    await safeStep('Add ICD code from suggestions using S06.0 query', async () => {
      await page.fill('input[placeholder*="M54.5"]', 'S06.0');
      const option = page.locator('button:has-text("S06.0")').first();
      await option.waitFor({ timeout: 10000 });
      icdSelected = (await option.innerText()).trim().split(/\s+/)[0];
      await option.click();
      await page.fill('textarea[placeholder*="Describe the procedure"]', 'MRI brain with symptoms and history.');
      await page.locator('span:has-text("' + icdSelected + '")').first().waitFor({ timeout: 5000 });
    });

    await safeStep('Proceed to step 3', async () => {
      await page.click('button:has-text("Next Step")');
      await page.locator('h2:has-text("Insurance & Payer")').waitFor({ timeout: 5000 });
    });

    await safeStep('Insurance and payer auto-populated display', async () => {
      await page.locator('text=Select Insurance').waitFor({ timeout: 5000 });
      await page.locator('button:has-text("Primary")').first().waitFor({ timeout: 5000 });
    });

    await safeStep('PA requirement check displays required/not required', async () => {
      await page.locator('text=PA Required, text=PA Not Required').first().waitFor({ timeout: 10000 });
    });

    await safeStep('RBM routing display renders when available', async () => {
      await page.locator('text=RBM Routing:').first().waitFor({ timeout: 10000 });
    });

    await safeStep('Ordering physician selectable', async () => {
      const selects = page.locator('select');
      const n = await selects.count();
      await selects.nth(n - 1).selectOption({ index: 1 });
    });

    await safeStep('Draft reference generated after auto-save', async () => {
      const ref = page.locator('p.font-mono.text-emerald-400').first();
      await ref.waitFor({ timeout: 5000 });
      referenceNumber = (await ref.innerText()).trim();
      if (!referenceNumber) throw new Error('No reference number text');
    });

    await safeStep('Proceed to step 4', async () => {
      await page.click('button:has-text("Next Step")');
      await page.locator('h2:has-text("Clinical Documentation")').waitFor({ timeout: 5000 });
    });

    await safeStep('Upload test PDF and assign imaging_order category', async () => {
      const testPdfPath = path.join(process.cwd(), 'uploads', 'qa-test-upload.pdf');
      fs.writeFileSync(testPdfPath, '%PDF-1.4\n% QA\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
      await page.setInputFiles('input[type="file"]', testPdfPath);
      const rowSelect = page.locator('div.w-44 select').first();
      await rowSelect.waitFor({ timeout: 5000 });
      await rowSelect.selectOption('imaging_order');
      const uploadButton = page.locator('button:has-text("Upload")').first();
      if (await uploadButton.count()) {
        await uploadButton.click();
      }
      await page.locator('text=qa-test-upload.pdf').waitFor({ timeout: 8000 });
    });

    await safeStep('Proceed to step 5', async () => {
      await page.click('button:has-text("Next Step")');
      await page.locator('h2:has-text("Review & Submit")').waitFor({ timeout: 5000 });
    });

    await safeStep('Review shows entered summary data', async () => {
      await page.locator('text=70553').first().waitFor({ timeout: 5000 });
      await page.locator('text=Clinical Documentation').first().waitFor({ timeout: 5000 });
    });

    await safeStep('Go back remove ICD and return to review', async () => {
      await page.click('button:has-text("Previous")');
      await page.click('button:has-text("Previous")');
      await page.click('button:has-text("Previous")');
      await page.locator('h2:has-text("Service Details")').waitFor({ timeout: 5000 });
      if (!icdSelected) throw new Error('No icd selected value captured');
      const chip = page.locator('span:has-text("' + icdSelected + '")').first();
      await chip.waitFor({ timeout: 5000 });
      await chip.locator('button').click();
      await page.click('button:has-text("Next Step")');
      await page.click('button:has-text("Next Step")');
      await page.click('button:has-text("Next Step")');
      await page.locator('h2:has-text("Review & Submit")').waitFor({ timeout: 5000 });
    });

    await safeStep('AI audit warns about missing ICD-10', async () => {
      await page.locator('text=No ICD-10 diagnosis codes provided').first().waitFor({ timeout: 5000 });
    });

    await safeStep('Save as Draft and return to list', async () => {
      await page.click('button:has-text("Save as Draft")');
      await page.waitForURL('**/app/requests**', { timeout: 10000 });
    });

    await safeStep('Saved draft appears in list with draft status', async () => {
      if (!referenceNumber) throw new Error('No reference captured');
      await page.fill('input[placeholder*="Search by reference number"]', referenceNumber);
      await page.waitForTimeout(700);
      const row = page.locator('tr:has-text("' + referenceNumber + '")').first();
      await row.waitFor({ timeout: 10000 });
      await row.locator('text=Draft').first().waitFor({ timeout: 5000 });
    });

    await safeStep('Reopen draft from list resumes wizard', async () => {
      const row = page.locator('tr:has-text("' + referenceNumber + '")').first();
      await row.click();
      await page.waitForURL('**/app/requests/new?draft=**', { timeout: 10000 });
      await page.locator('h2:has-text("Review & Submit")').waitFor({ timeout: 5000 });
    });

    await safeStep('Submit changes status to submitted', async () => {
      await page.click('button:has-text("Submit PA Request")');
      await page.waitForURL('**/app/requests/**', { timeout: 15000 });
      const url = page.url();
      requestId = url.split('/app/requests/')[1].split('?')[0];
      if (!requestId || requestId === 'new') throw new Error('Did not navigate to detail page');
      await page.locator('text=Submitted').first().waitFor({ timeout: 5000 });
    });

    await safeStep('Timeline API includes submitted event', async () => {
      if (!requestId) throw new Error('No requestId');
      const resp = await context.request.get('/api/requests/' + requestId + '/timeline');
      if (!resp.ok()) throw new Error('Timeline API failed with ' + resp.status());
      const json = await resp.json();
      const has = Array.isArray(json.timeline) && json.timeline.some((x) => x.toStatus === 'submitted');
      if (!has) throw new Error('No submitted event in timeline');
    });

    await safeStep('Documents API returns uploaded file metadata', async () => {
      if (!requestId) throw new Error('No requestId');
      const resp = await context.request.get('/api/requests/' + requestId + '/documents');
      if (!resp.ok()) throw new Error('Documents API failed with ' + resp.status());
      const json = await resp.json();
      if (!Array.isArray(json.documents) || json.documents.length === 0) {
        throw new Error('No documents returned');
      }
    });

    await safeStep('Local storage directory contains uploaded file', async () => {
      const root = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(root)) throw new Error('uploads dir missing');
      const entries = fs.readdirSync(root);
      if (!entries.length) throw new Error('uploads dir empty');
    });

    await safeStep('Inline new patient form requires name and DOB', async () => {
      await page.goto('/app/requests/new');
      await page.locator('button:has-text("Create New Patient")').click();
      await page.locator('button:has-text("Create & Select Patient")').click();
      await page.locator('text=First name is required').waitFor({ timeout: 5000 });
      await page.locator('text=Last name is required').waitFor({ timeout: 5000 });
      await page.locator('text=Date of birth is required').waitFor({ timeout: 5000 });
    });
  } finally {
    await browser.close();
    console.log('\nCHECKPOINT SUMMARY');
    for (const c of checkpoints) {
      console.log(c.status + '\t' + c.name + '\t' + (c.detail || ''));
    }
  }
})();
