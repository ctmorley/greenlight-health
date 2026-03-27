const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  const filePath = path.resolve(__dirname, 'proposal.html');
  await page.goto(`file://${filePath}`, {
    waitUntil: 'networkidle0',
    timeout: 60000
  });

  // Wait for fonts to load
  await page.evaluateHandle('document.fonts.ready');

  // Wait for Chart.js to render
  await page.waitForFunction(() => {
    const canvases = document.querySelectorAll('canvas');
    return canvases.length > 0;
  }, { timeout: 15000 });

  // Extra time for chart animations to complete
  await new Promise(r => setTimeout(r, 3000));

  await page.pdf({
    path: path.resolve(__dirname, 'GreenLight_by_Medivis_Business_Proposal.pdf'),
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    displayHeaderFooter: false
  });

  console.log('PDF generated: GreenLight_by_Medivis_Business_Proposal.pdf');
  await browser.close();
})();
