import { BrowserManager } from '../browser/browserManager.js';
import { navigator } from '../scraper/navigator.js';
import { articleDb } from '../db/database.js';
import { CONFIG } from '../config.js';

async function runDiscovery() {
  console.log('='.repeat(70));
  console.log('📰 AWS Builder Center - Article Discovery');
  console.log('='.repeat(70));

  const browser = new BrowserManager({ headless: CONFIG.HEADLESS });

  try {
    const page = await browser.getPage();
    await navigator.navigateToArticles(page);

    const cards = await navigator.discoverArticleCards(page);
    console.log(`\nFound ${cards.length} articles on the page.`);

    let newlyAdded = 0;
    let existing = 0;

    for (const card of cards) {
      if (articleDb.hasArticle(card.url)) {
        existing++;
        console.log(`[DB] Already tracked: ${card.title}`);
      } else {
        articleDb.saveDiscoveredArticle(card);
        newlyAdded++;
        console.log(`[DB] ✨ Discovered new article: "${card.title}"`);
        console.log(`     URL: ${card.url}`);
      }
    }

    console.log('\n--- Discovery Summary ---');
    console.log(`Total found on page: ${cards.length}`);
    console.log(`New articles saved:  ${newlyAdded}`);
    console.log(`Previously recorded: ${existing}`);

    const stats = articleDb.getStats();
    console.log(`Current Database Stats: ${JSON.stringify(stats)}`);

  } catch (error) {
    console.error('Error during article discovery:', error);
  } finally {
    await browser.close();
    articleDb.close();
  }
}

runDiscovery();
