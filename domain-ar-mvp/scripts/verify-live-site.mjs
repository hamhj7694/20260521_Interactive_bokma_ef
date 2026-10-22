import { chromium } from 'playwright';

const siteUrl = process.env.SITE_URL ?? 'https://hamhj7694.github.io/20260521_Interactive_bokma_ef/';
const errors = [];
const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ],
});

try {
  const context = await browser.newContext({
    permissions: ['camera'],
    viewport: { width: 1366, height: 768 },
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));

  const response = await page.goto(siteUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  if (!response || response.status() !== 200) {
    throw new Error(`Expected HTTP 200 at ${siteUrl}, got ${response?.status() ?? 'no response'}`);
  }

  const guideVisible = await page.locator('#experience-guide summary').isVisible();
  const resetVisible = await page.locator('#reset-effect').isVisible();
  if (!guideVisible || !resetVisible) {
    throw new Error('Experience guide or reset button is not visible');
  }

  await page.waitForFunction(
    () => document.querySelector('#camera-status')?.textContent?.includes('카메라 연결됨'),
    null,
    { timeout: 45_000 },
  );

  const streamStatus = await page.locator('#camera-status').innerText();
  console.log(`Camera ready: ${streamStatus}`);

  await page.keyboard.press('r');
  await page.locator('#reset-effect').click();
  console.log('Keyboard R and on-screen reset button activated without a runtime error.');

  if (errors.length) {
    throw new Error(`Browser runtime errors:\n${errors.join('\n')}`);
  }
  console.log('PASS: Live Pages site loads, guide is visible, fake webcam connects, and both reset controls work.');
  console.log('LIMITATION: The synthetic webcam does not confirm real hand gestures or visual effect accuracy.');
} finally {
  await browser.close();
}
