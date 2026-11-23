import { expect, test } from '@playwright/test';
import { onboardAndSkip } from './helpers';

test('encyclopedia: search, study mode, item page with client data', async ({ page }) => {
  await page.goto('/items');
  await expect(page.locator('.tile')).toHaveCount(156);
  await page.keyboard.press('/');
  await page.keyboard.type('metal skin');
  await expect(page.locator('.tile')).toHaveCount(1);
  await page.locator('.search input').fill('');
  await page.locator('h1').click(); // leave the search field: shortcuts are ignored while typing
  await page.keyboard.press('s');
  await expect(page.locator('.name.hidden').first()).toHaveText('???');
  await page.keyboard.press('s');
  await page.goto('/items/upgrade_metal_skin');
  await expect(page.getByRole('heading', { name: /Metal Skin/ })).toBeVisible();
  await expect(page.getByText('Когда покупать')).toBeVisible();
  // Term popovers keep their (hidden) text in the page: look at visible matches only.
  await expect(page.getByText('Данные клиента').filter({ visible: true }).first()).toBeVisible();
});

test('compare two items side by side', async ({ page }) => {
  await page.goto('/compare?a=upgrade_metal_skin&b=upgrade_tech_purge');
  await expect(page.locator('table.table')).toContainText('Metal Skin');
  await expect(page.locator('table.table')).toContainText('Spirit Resilience');
});

test('search by problem finds anti-heal answers', async ({ page }) => {
  await page.goto('/problems');
  await page.getByRole('searchbox').fill('лечатся');
  await expect(page.locator('.detail')).toBeVisible();
  await expect(page.locator('.detail .it').first()).toBeVisible();
});

test('shop simulator: buy within budget and get a graded decision', async ({ page }) => {
  await onboardAndSkip(page);
  await page.goto('/simulator');
  await expect(page.locator('.shop')).toBeVisible();
  const sell = await page.locator('.sellable').count();
  if (sell) {
    await page.locator('.sellable').first().click();
  } else {
    // pick the first affordable tile in any tab
    for (const tab of ['weapon', 'vitality', 'spirit']) {
      await page.locator(`.tab.t-${tab}`).click();
      const affordable = page.locator('.shop-item:not(.locked):not(.owned)');
      if (await affordable.count()) {
        await affordable.first().click();
        await page.getByRole('button', { name: /Купить/ }).click();
        break;
      }
    }
  }
  await page.getByRole('button', { name: 'Подтвердить решение' }).click();
  await expect(page.locator('.result')).toBeVisible();
  await expect(page.locator('.result .principle')).toBeVisible();
});

test('build doctor: import a build from JSON, analyze, master-your-build analysis', async ({ page }) => {
  await onboardAndSkip(page);
  await page.goto('/builds');
  await page.getByRole('button', { name: 'Импорт и создание' }).click();
  const json = JSON.stringify({ format: 'dia-build', version: 1, hero: 'hero_necro', name: 'E2E Graves', categories: [{ name: 'Core', items: [{ key: 'upgrade_toxic_bullets' }, { key: 'upgrade_tech_purge' }] }] });
  await page.locator('textarea').fill(json);
  await page.getByRole('button', { name: 'Импортировать', exact: true }).click();
  await expect(page).toHaveURL(/\/builds\/b/);
  await expect(page.getByRole('heading', { name: 'E2E Graves' })).toBeVisible();
  await expect(page.getByText('Экономика')).toBeVisible();

  await page.goto('/builds/preset:vindicta-current');
  await expect(page.getByText('Master Your Build')).toBeVisible();
  await page.getByText('Trophy Collector', { exact: true }).first().click();
  await expect(page.getByText('1. Зачем он в билде')).toBeVisible();
});

test('settings: switch to English and export progress', async ({ page }) => {
  await onboardAndSkip(page);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.locator('.sidebar')).toContainText('Dashboard');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export progress/ }).click();
  expect((await download).suggestedFilename()).toMatch(/deadlock-academy-.*\.json/);
});

test('hero paths: Vindicta course modules and Graves course', async ({ page }) => {
  await onboardAndSkip(page);
  await page.goto('/paths/hero_hornet');
  await expect(page.getByText('Модули курса')).toBeVisible();
  await expect(page.locator('.module')).toHaveCount(15);
  await page.locator('.mod-head').first().click();
  await expect(page.getByRole('button', { name: 'Тренировать модуль' })).toBeVisible();
  await page.goto('/paths/hero_necro');
  await expect(page.locator('.module')).toHaveCount(12);
});

test('active items and imbue page lists Vindicta abilities', async ({ page }) => {
  await onboardAndSkip(page);
  await page.goto('/active');
  await expect(page.getByText('Как работает imbue')).toBeVisible();
  await expect(page.locator('.ab')).toHaveCount(4);
});

test('imbue is explained on the item page and the term opens the glossary', async ({ page }) => {
  await page.goto('/items/upgrade_magic_storm');
  await expect(page.getByRole('heading', { name: /Imbue: этот предмет усиливает одно умение/ })).toBeVisible();
  await expect(page.locator('app-key-stats').first()).toContainText('+28');
  await page.locator('app-term.pill.imb').first().click();
  const pop = page.locator('.term-pop:popover-open');
  await expect(pop).toBeVisible();
  await pop.getByRole('link', { name: 'Открыть в словаре' }).click();
  await expect(page).toHaveURL(/\/glossary\?t=imbue/);
  await expect(page.locator('#term-imbue')).toHaveClass(/hl/);
  await page.getByRole('searchbox').fill('насичення');
  await expect(page.locator('article.term').first()).toHaveAttribute('id', 'term-imbue');
  await page.getByRole('searchbox').fill('керри');
  await expect(page.locator('article.term').first()).toHaveAttribute('id', 'term-carry');
});

test('hovering an item icon shows the item card instead of a browser tooltip', async ({ page }) => {
  await page.goto('/items/upgrade_magic_storm');
  const icon = page.locator('a.item-link app-item-icon').first();
  await expect(icon).not.toHaveAttribute('title', /.+/);
  await icon.hover();
  const card = page.locator('.peek');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Extra Spirit');
  await expect(card).toContainText('Пассивный');
  await page.mouse.move(5, 5);
  await expect(card).toHaveCount(0);
});

test('upgrade tree shows chains per category with top-up prices', async ({ page }) => {
  await page.goto('/upgrades?slot=spirit&item=upgrade_magic_storm');
  const surge = page.locator('.node[data-key="upgrade_magic_storm"]');
  await expect(surge).toHaveClass(/hl/);
  await expect(surge).toContainText('доплата +2400');
  await expect(surge).toContainText('+28');
  await page.getByRole('tab', { name: /Weapon/ }).click();
  await page.getByRole('searchbox').fill('Sharpshooter');
  await expect(page.locator('.node[data-key="upgrade_sharpshooter"]').first()).toBeVisible();
  await expect(page.locator('.node[data-key="upgrade_sharpshooter"]').first()).toContainText('Собирается также из');
});
