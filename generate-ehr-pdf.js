const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  const filePath = path.resolve(__dirname, 'ehr-integration-roadmap.html');
  await page.goto(`file://${filePath}`, {
    waitUntil: 'networkidle0',
    timeout: 60000
  });

  // Wait for fonts to load
  await page.evaluateHandle('document.fonts.ready');

  // Extra time for rendering
  await new Promise(r => setTimeout(r, 2000));

  await page.pdf({
    path: path.resolve(__dirname, 'GreenLight_EHR_Integration_Roadmap.pdf'),
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    displayHeaderFooter: false
  });

  console.log('PDF generated: GreenLight_EHR_Integration_Roadmap.pdf');
  await browser.close();
})();
