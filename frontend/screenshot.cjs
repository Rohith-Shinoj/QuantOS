const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('http://localhost:5173/overview');
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: '/Users/rohith/.gemini/antigravity/brain/da06e884-ad76-4e98-ba0a-4a915fb52508/screenshot.png' });
  await browser.close();
})();
