const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('PAGE ERROR LOG:', msg.text());
    }
  });
  page.on('pageerror', error => console.log('PAGE EXCEPTION:', error.message));
  
  await page.goto('http://localhost:5173/overview');
  await new Promise(r => setTimeout(r, 3000));
  
  await page.goto('http://localhost:5173/stock/state-bank-of-india');
  await new Promise(r => setTimeout(r, 3000));

  await browser.close();
})();
