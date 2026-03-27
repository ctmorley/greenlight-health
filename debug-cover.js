const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`file://${path.resolve(__dirname, 'proposal.html')}`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.evaluateHandle('document.fonts.ready');

  const info = await page.evaluate(() => {
    const cover = document.querySelector('.cover');
    const stats = document.querySelector('.cover-stats');
    const footer = document.querySelector('.cover-footer');
    const inner = document.querySelector('.cover-inner');

    const coverRect = cover.getBoundingClientRect();
    const statsRect = stats ? stats.getBoundingClientRect() : null;
    const footerRect = footer ? footer.getBoundingClientRect() : null;
    const innerRect = inner ? inner.getBoundingClientRect() : null;

    const coverStyles = window.getComputedStyle(cover);
    const statsStyles = stats ? window.getComputedStyle(stats) : null;

    return {
      cover: { top: coverRect.top, bottom: coverRect.bottom, height: coverRect.height, overflow: coverStyles.overflow, position: coverStyles.position },
      inner: innerRect ? { top: innerRect.top, bottom: innerRect.bottom, height: innerRect.height } : null,
      stats: statsRect ? { top: statsRect.top, bottom: statsRect.bottom, height: statsRect.height, position: statsStyles.position, botCSS: statsStyles.bottom } : null,
      footer: footerRect ? { top: footerRect.top, bottom: footerRect.bottom, height: footerRect.height } : null,
      statsHTML: stats ? stats.outerHTML.substring(0, 200) : 'NOT FOUND',
      coverChildCount: cover.children.length,
      coverChildClasses: Array.from(cover.children).map(c => c.className),
    };
  });

  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
