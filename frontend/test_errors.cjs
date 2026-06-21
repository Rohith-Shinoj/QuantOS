const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('BROWSER ERROR:', msg.text());
    }
  });
  
  page.on('pageerror', err => {
    console.log('PAGE EXCEPTION:', err.toString());
  });

  try {
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 5000 });
  } catch (e) {
    console.log('Nav 1 error:', e.message);
  }

  try {
    await page.goto('http://localhost:5173/stock/state-bank-of-india', { waitUntil: 'networkidle0', timeout: 5000 });
  } catch (e) {
    console.log('Nav 2 error:', e.message);
  }
  
  await browser.close();
})();
