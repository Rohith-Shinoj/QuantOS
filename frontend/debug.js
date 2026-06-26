const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  page.on('requestfailed', req => console.log('REQUEST FAILED:', req.url(), req.failure().errorText));

  console.log('Navigating...');
  try {
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2', timeout: 15000 });
    // Assuming the user navigates to a mutual fund page, we can try to go directly to one.
    // E.g., http://localhost:5173/terminal/some_mutual_fund
    console.log('Got to root. Now navigating to a mutual fund snapshot if possible...');
    await page.goto('http://localhost:5173/terminal/ICICI-Prudential-Technology-Fund-Direct-Plan-Growth', { waitUntil: 'networkidle2', timeout: 10000 });
  } catch (e) {
    console.log('Navigation timeout or error:', e.message);
  }
  
  await browser.close();
})();
