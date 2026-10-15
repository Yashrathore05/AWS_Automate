import { CONFIG } from '../config.js';

export class Navigator {
  /**
   * Navigate to AWS Builder Center and route to the Explore / Articles section
   * @param {import('playwright').Page} page
   */
  async navigateToArticles(page) {
    console.log(`[Navigator] Navigating to Home: ${CONFIG.BASE_URL}`);
    await page.goto(CONFIG.BASE_URL, {
      waitUntil: 'domcontentloaded',
      timeout: CONFIG.NAVIGATION_TIMEOUT_MS
    });

    // Dismiss cookie/consent dialog if shown
    await this.dismissBanners(page);

    console.log('[Navigator] Locating Explore / Articles section...');

    // Scroll to Explore section if present on Home
    try {
      const exploreH2 = page.locator('h2:has-text("Explore")').first();
      if (await exploreH2.isVisible({ timeout: 4000 })) {
        console.log('[Navigator] Found Explore section on home page. Scrolling into view...');
        await exploreH2.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1500);

        // Click "Load more" if available to discover more cards
        const loadMoreBtn = page.locator('button:has-text("Load more")').first();
        if (await loadMoreBtn.isVisible({ timeout: 2000 })) {
          console.log('[Navigator] Clicking "Load more" to reveal additional articles...');
          await loadMoreBtn.click();
          await page.waitForTimeout(2000);
        }
        return;
      }
    } catch (err) {
      console.log(`[Navigator] Explore section scroll note: ${err.message}`);
    }

    // Secondary route: Explore AWS menu or Topics articles
    try {
      const topicsUrl = new URL('/learn/topics', CONFIG.BASE_URL).toString();
      console.log(`[Navigator] Checking Topics route: ${topicsUrl}`);
      await page.goto(topicsUrl, { waitUntil: 'domcontentloaded', timeout: CONFIG.NAVIGATION_TIMEOUT_MS });
      await page.waitForTimeout(2000);
    } catch (err) {
      console.log(`[Navigator] Route navigation note: ${err.message}`);
    }
  }

  /**
   * Dismiss cookie banners or informational overlays if present
   */
  async dismissBanners(page) {
    const dismissSelectors = [
      '#awsccc-cb-btn-accept',
      'button:has-text("Accept all")',
      'button:has-text("Accept")',
      'button:has-text("Close")',
      '[aria-label="Close"]',
      '[data-testid="banner-dismiss"]'
    ];

    for (const selector of dismissSelectors) {
      try {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 1500 })) {
          await btn.click();
          console.log(`[Navigator] Dismissed banner via: ${selector}`);
          break;
        }
      } catch {
        // Ignored
      }
    }
  }

  /**
   * Scrapes the currently loaded page for article cards
   * @param {import('playwright').Page} page
   * @returns {Promise<Array<{title: string, url: string, author?: string, summary?: string}>>}
   */
  async discoverArticleCards(page) {
    console.log('[Navigator] Inspecting page for article links and cards...');

    const discovered = await page.evaluate((baseUrl) => {
      const items = [];
      const seenUrls = new Set();

      // Find all anchors with article URLs: /content/<id>/<slug> or /articles/<slug>
      const anchors = Array.from(document.querySelectorAll('a[href]'));

      for (const a of anchors) {
        const href = a.getAttribute('href');
        if (!href) continue;

        // AWS Builder Center article URL pattern: /content/[alphanumeric]/[slug] or /articles/[slug]
        const isArticleUrl = (
          /^\/content\/[a-zA-Z0-9]+\/[a-zA-Z0-9_-]+/i.test(href) ||
          /\/(articles?|community\/articles?)\/[a-zA-Z0-9_-]+/i.test(href)
        ) &&
        !href.includes('/tag/') &&
        !href.includes('/category/') &&
        !href.includes('/author/') &&
        !href.includes('/user/') &&
        !href.endsWith('#comments');

        if (!isArticleUrl) continue;

        let absoluteUrl;
        try {
          absoluteUrl = new URL(href, baseUrl).toString().split('?')[0].split('#')[0].replace(/\/+$/, '');
        } catch {
          continue;
        }

        if (seenUrls.has(absoluteUrl)) continue;

        // Extract title
        let title = a.innerText.trim();

        // If anchor has no text, look inside parent card or next heading
        if (!title || title.length < 5) {
          const card = a.closest('article, [data-testid*="card"], li, div[class*="card"], div[class*="Card"], div[class*="item"]') || a.parentElement;
          const heading = card ? card.querySelector('h1, h2, h3, h4, [class*="title"], [class*="Title"]') : null;
          if (heading && heading.innerText.trim()) {
            title = heading.innerText.trim();
          }
        }

        // Clean up title (remove trailing badges, newlines)
        title = title.split('\n')[0].trim();

        if (title && title.length > 5 && !/^(view all|load more|read more|like|share)$/i.test(title)) {
          seenUrls.add(absoluteUrl);
          items.push({
            title,
            url: absoluteUrl
          });
        }
      }

      return items;
    }, CONFIG.BASE_URL);

    console.log(`[Navigator] Found ${discovered.length} unique articles on page.`);
    return discovered;
  }
}

export const navigator = new Navigator();
