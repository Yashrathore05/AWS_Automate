import { BrowserManager } from '../browser/browserManager.js';
import { CONFIG } from '../config.js';

async function inspectPage() {
  console.log('='.repeat(70));
  console.log('🔍 AWS Builder Center - Live Page DOM & Navigation Inspector');
  console.log('='.repeat(70));
  console.log(`Target: ${CONFIG.BASE_URL}`);

  // We run in non-headless by default (or user setting) so we can see the exact layout
  const browser = new BrowserManager({ headless: true });

  try {
    const page = await browser.getPage();
    console.log('[Inspect] Loading page...');
    const response = await page.goto(CONFIG.BASE_URL, {
      waitUntil: 'domcontentloaded',
      timeout: CONFIG.NAVIGATION_TIMEOUT_MS
    });

    console.log(`[Inspect] Response Status: ${response.status()}`);
    console.log(`[Inspect] Final URL: ${page.url()}`);
    console.log(`[Inspect] Document Title: ${await page.title()}`);

    // Wait a brief moment for dynamic client-side hydration
    await page.waitForTimeout(4000);

    // Inspect navigation bar links and buttons
    const navAnalysis = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('header a, nav a')).map(a => ({
        text: a.innerText.trim(),
        href: a.getAttribute('href'),
        role: a.getAttribute('role'),
        ariaLabel: a.getAttribute('aria-label')
      })).filter(l => l.text || l.ariaLabel);

      const buttons = Array.from(document.querySelectorAll('header button, nav button')).map(b => ({
        text: b.innerText.trim(),
        ariaLabel: b.getAttribute('aria-label'),
        id: b.id
      })).filter(b => b.text || b.ariaLabel);

      return { links, buttons };
    });

    console.log('\n--- Navigation Elements ---');
    console.log('Links:', JSON.stringify(navAnalysis.links, null, 2));
    console.log('Buttons:', JSON.stringify(navAnalysis.buttons, null, 2));

    // Look for Explore and Articles specific elements
    const exploreMatches = await page.evaluate(() => {
      const exploreLinks = Array.from(document.querySelectorAll('a'))
        .filter(a => /explore/i.test(a.innerText) || /explore/i.test(a.href))
        .map(a => ({ text: a.innerText.trim(), href: a.getAttribute('href') }));

      const articleLinks = Array.from(document.querySelectorAll('a'))
        .filter(a => /(article|post)/i.test(a.innerText) || /(article|post)/i.test(a.href))
        .slice(0, 15)
        .map(a => ({ text: a.innerText.trim(), href: a.getAttribute('href') }));

      return { exploreLinks, articleLinks };
    });

    console.log('\n--- Explore / Articles Link Candidates ---');
    console.log('Explore Links:', JSON.stringify(exploreMatches.exploreLinks, null, 2));
    console.log('Article Links Sample:', JSON.stringify(exploreMatches.articleLinks, null, 2));

    // If Explore link exists, try clicking or checking URL
    if (exploreMatches.exploreLinks.length > 0) {
      const exploreTarget = exploreMatches.exploreLinks[0].href;
      console.log(`\n[Inspect] Navigating to explore URL: ${exploreTarget}`);
      await page.goto(new URL(exploreTarget, CONFIG.BASE_URL).toString(), {
        waitUntil: 'domcontentloaded',
        timeout: CONFIG.NAVIGATION_TIMEOUT_MS
      });
      await page.waitForTimeout(4000);

      console.log(`[Inspect] Explore Page Title: ${await page.title()}`);
      console.log(`[Inspect] Explore Page URL: ${page.url()}`);

      const exploreCards = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href]'));
        return anchors
          .map(a => ({
            text: a.innerText.trim().slice(0, 80),
            href: a.getAttribute('href')
          }))
          .filter(a => a.href && (a.href.includes('/articles') || a.href.includes('/post') || a.href.includes('/community')));
      });

      console.log('\n--- Discovered Articles on Explore Page ---');
      console.log(JSON.stringify(exploreCards.slice(0, 10), null, 2));
    }

  } catch (error) {
    console.error('[Inspect] Error during page inspection:', error);
  } finally {
    await browser.close();
  }
}

inspectPage();
