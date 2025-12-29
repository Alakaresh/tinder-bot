import { chromium } from 'playwright';

(async () => {
  let browser;
  try {
    console.log('Launching browser...');
    browser = await chromium.launch();
    const page = await browser.newPage();

    console.log('Navigating to http://127.0.0.1:8099');
    await page.goto('http://127.0.0.1:8099', { waitUntil: 'domcontentloaded' });

    console.log('Waiting for UI to load...');
    await page.waitForSelector('#url');
    await page.waitForSelector('#load-vnc');
    await page.waitForSelector('#vnc-canvas');

    console.log('Setting URL...');
    await page.fill('#url', 'http://127.0.0.1:8088');

    console.log('Clicking "Load" button...');
    await page.click('#load-vnc');

    console.log('Waiting for VNC stream to connect and render...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    console.log('Taking screenshot of the VNC canvas...');
    const vncCanvas = await page.$('#vnc-canvas');
    if (vncCanvas) {
      await vncCanvas.screenshot({ path: 'vnc-test-result.png' });
      console.log('Screenshot saved to vnc-test-result.png');
    } else {
      throw new Error('Could not find the VNC canvas element.');
    }
  } catch (error) {
    console.error('An error occurred during the E2E test:', error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed.');
    }
  }
})();
