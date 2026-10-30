import { expect, test, type BrowserContext } from '@playwright/test';

/** Signs in through the real UI: persona → magic link queued → dev mailbox → confirm. */
async function signIn(context: BrowserContext, label: string) {
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByRole('button', { name: label, exact: true }).click();
  await expect(page.getByText('Link queued')).toBeVisible();
  await page.getByRole('link', { name: /Open dev mailbox/ }).click();
  await page.locator('li.ring-2').getByRole('link', { name: 'Open link' }).click();
  await page.getByRole('button', { name: 'Continue to azentio.ai' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  return page;
}

test('AT-21: reduced motion — no infinite animations running, content fully visible', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Build Intelligence.');
  const running = await page.evaluate(() =>
    document.getAnimations().filter((a) => a.playState === 'running' && (a.effect?.getComputedTiming().iterations ?? 1) === Infinity).length,
  );
  expect(running).toBe(0);
  // Below-the-fold sections are visible without scrolling into view.
  for (const h of ['Built to Work. Designed to Evolve.', 'Innovation Without Compromising Trust.', 'Answers with receipts']) {
    const opacity = await page.getByRole('heading', { name: h }).evaluate((el) => Number(getComputedStyle(el.closest('div')!).opacity));
    expect(opacity).toBe(1);
  }
  await context.close();
});

test('Demo: client submits → moderator publishes → theme crosses k → client withdraws and panes clear', async ({ browser }) => {
  const title = `Festival trading peaks distort quarter comparisons ${Date.now() % 10000}`;
  // 1. Client member drafts privately, then proposes to community with consents.
  const client = await browser.newContext();
  const c = await signIn(client, 'Meridian member');
  await c.goto('/w/meridian/observations/new');
  await c.getByLabel('Topic').selectOption('Seasonality');
  await c.getByLabel('Title').fill(title);
  await c.getByLabel('What did you observe?').fill('Retail SMEs in Doha concentrate revenue around festival periods; annualising an off-season quarter overstates risk for otherwise stable borrowers.');
  await expect(c.getByText('Right now:')).toContainText('only you');
  await c.getByRole('button', { name: 'Save private draft' }).click();
  await expect(c.getByText('Private draft').first()).toBeVisible();
  await c.waitForLoadState('networkidle');
  const community = c.getByRole('radio', { name: /Community/ });
  await expect(async () => {
    await community.click();
    await expect(community).toHaveAttribute('aria-checked', 'true', { timeout: 1000 });
  }).toPass();
  await c.getByLabel(/Store & process/).check();
  await c.getByLabel(/Publish a reviewed/).check();
  await c.getByRole('button', { name: 'Submit for moderation' }).click();
  await expect(c.getByText('Submitted for review').first()).toBeVisible();
  const obsUrl = c.url();

  // 2. Moderator generalises and publishes into the Seasonality theme (also approves the seeded Meridian item).
  const mod = await browser.newContext();
  const m = await signIn(mod, 'Moderator');
  await m.goto('/moderate');
  await m.getByRole('link', { name: new RegExp(title) }).click();
  await expect(m.getByText('Contributor organisation hidden')).toBeVisible();
  await expect(m.getByLabel('Region (generalised)')).toHaveValue('');
  await m.getByLabel('Theme').selectOption({ label: 'Seasonality context' });
  await m.getByLabel(/Reason shown to the author/).fill('Published with the city generalised.');
  await m.getByRole('button', { name: 'Approve & publish' }).click();
  await m.waitForURL('**/moderate');
  await m.getByRole('link', { name: /Ramadan-season retail swings/ }).click();
  await m.getByLabel(/Reason shown to the author/).fill('Published with the customer name removed.');
  await m.getByRole('button', { name: 'Approve & publish' }).click();
  await m.waitForURL('**/moderate');

  // 3. Another client sees the theme with a band, not a count; the feed carries the shared copy.
  const other = await browser.newContext();
  const h = await signIn(other, 'Harbor member');
  await h.goto('/w/harbor/community');
  await h.getByRole('button', { name: /Seasonality context/ }).click();
  await expect(h.getByText('3–5 contributing organisations')).toBeVisible();
  await expect(h.getByRole('heading', { name: title })).toBeVisible();

  // 4. Author withdraws; feed, search and AIRA all clear within 60 s.
  await c.goto(obsUrl);
  await c.getByRole('button', { name: 'Withdraw…' }).click();
  await c.getByRole('button', { name: 'Confirm withdrawal' }).click();
  for (const pane of ['Shared feed & counts', 'Search index', 'AIRA retrieval']) {
    await expect(c.locator('li', { hasText: pane })).toContainText('cleared', { timeout: 60_000 });
  }
  await h.reload();
  await expect(h.getByRole('heading', { name: title })).toHaveCount(0);
});
