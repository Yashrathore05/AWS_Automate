import { BrowserManager } from './browser/browserManager.js';
import { navigator } from './scraper/navigator.js';
import { extractArticleDetails } from './scraper/articleExtractor.js';
import { commentDrafter } from './comments/commentDrafter.js';
import { articleDb } from './db/database.js';
import { prompter } from './cli/prompter.js';
import { copyToClipboard } from './cli/clipboard.js';
import { CONFIG } from './config.js';

async function main() {
  console.log('='.repeat(70));
  console.log('🚀 AWS Builder Center Daily Workflow');
  console.log('='.repeat(70));
  console.log(`Max articles to process this run: ${CONFIG.MAX_ARTICLES_PER_RUN}`);

  const browserManager = new BrowserManager({ headless: CONFIG.HEADLESS });

  try {
    const mainPage = await browserManager.getPage();

    // Step 1: Navigate to Home -> Explore -> Articles
    console.log('\n[Step 1/4] Navigating to AWS Builder Center Explore / Articles...');
    await navigator.navigateToArticles(mainPage);

    // Check if user is signed in
    const authState = await mainPage.evaluate(() => {
      const hasSignInBtn = Boolean(document.querySelector('button[aria-label="Sign in"], a[href*="/login"], a[href*="/signin"]'));
      const hasUserMenu = Boolean(document.querySelector('[data-testid*="user-menu"], [data-testid*="avatar"], button[aria-label*="account"]'));
      return { isLoggedIn: hasUserMenu || !hasSignInBtn, hasSignInBtn };
    });

    if (authState.hasSignInBtn) {
      console.log('\n⚠️  Notice: No active AWS Builder session detected in this browser profile.');
      console.log('   You can review and draft comments now, but to like/comment in the browser,');
      console.log('   you can sign in manually or run: npm run auth');
    } else {
      console.log('\n✅ Persistent AWS Builder session active.');
    }

    // Step 2: Discover and catalog new articles
    console.log('\n[Step 2/4] Scanning for new articles...');
    const cards = await navigator.discoverArticleCards(mainPage);
    let newCount = 0;

    for (const card of cards) {
      if (!articleDb.hasArticle(card.url)) {
        articleDb.saveDiscoveredArticle(card);
        newCount++;
      }
    }
    console.log(`[Discovery] ${newCount} new articles added to local database.`);

    // Step 3: Fetch unprocessed articles
    const queue = articleDb.getUnprocessedArticles(CONFIG.MAX_ARTICLES_PER_RUN);
    if (queue.length === 0) {
      console.log('\n✅ All discovered articles have already been processed! No new articles pending.');
      printDatabaseSummary();
      return;
    }

    console.log(`\n[Step 3/4] Processing ${queue.length} pending article(s)...`);

    for (let i = 0; i < queue.length; i++) {
      const article = queue[i];
      console.log(`\n[Article ${i + 1}/${queue.length}] Opening: "${article.title}"`);
      console.log(`URL: ${article.url}`);

      // Open article in a tab
      const articlePage = await browserManager.newTab(article.url);
      
      try {
        await articlePage.waitForLoadState('domcontentloaded');
        await mainPage.waitForTimeout(1500);

        // Extract article contents
        const extracted = await extractArticleDetails(articlePage);
        const articleData = {
          ...article,
          ...extracted
        };

        // Draft comment loop
        let suggestedComment = '';
        let variationIndex = 0;
        let approvalResult = null;

        while (!approvalResult) {
          suggestedComment = await commentDrafter.draftComment(articleData, variationIndex);
          const userChoice = await prompter.promptApprovalMenu(articleData, suggestedComment);

          if (userChoice.action === 'regenerate') {
            variationIndex++;
            console.log('\n🔄 Generating alternative angle...');
          } else if (userChoice.action === 'skip') {
            articleDb.markSkipped(article.id, 'Skipped by user during review');
            console.log('⏩ Article marked as skipped.');
            approvalResult = { skipped: true };
          } else if (userChoice.action === 'exit') {
            console.log('\n🛑 Workflow stopped by user.');
            return;
          } else if (userChoice.action === 'approve') {
            approvalResult = { approved: true, comment: userChoice.comment };
          }
        }

        if (approvalResult.skipped) {
          await articlePage.close();
          continue;
        }

        const approvedComment = approvalResult.comment;
        articleDb.markApproved(article.id, approvedComment);

        // Copy comment to clipboard
        const copied = await copyToClipboard(approvedComment);

        // Step 4: Guided Manual Like & Comment Action
        console.log('\n' + '-'.repeat(70));
        console.log('🎯 MANUAL ACTION STEP (Human in the loop - No bot spam):');
        console.log('The article is open in your active browser window.');
        if (copied) {
          console.log('📋 Note: Approved comment was copied to your clipboard!');
        }
        console.log('\nApproved Comment:');
        console.log(`"${approvedComment}"\n`);
        console.log('Instructions:');
        console.log('  1. Switch to the open browser tab.');
        console.log('  2. Click Like if you found the article valuable.');
        console.log('  3. Paste the comment into the article comments section and submit.');
        console.log('-'.repeat(70));

        const didLike = await prompter.confirm('Did you Like the article in the browser?', true);
        const didComment = await prompter.confirm('Did you submit the comment in the browser?', true);
        const notes = await prompter.ask('Optional notes/tags for this article (press ENTER to leave empty): ');

        articleDb.recordActionOutcome(article.id, {
          liked: didLike,
          commented: didComment,
          status: 'completed',
          notes: notes || 'Processed manually'
        });

        console.log(`✅ Outcome recorded in database: Liked=${didLike}, Commented=${didComment}`);

      } catch (articleErr) {
        console.error(`[Error] Failed processing article "${article.title}":`, articleErr.message);
        articleDb.markSkipped(article.id, `Processing error: ${articleErr.message}`);
      } finally {
        if (!articlePage.isClosed()) {
          await articlePage.close();
        }
      }
    }

    console.log('\n🎉 Finished processing queue for today!');
    printDatabaseSummary();

  } catch (error) {
    console.error('Fatal workflow error:', error);
  } finally {
    prompter.close();
    await browserManager.close();
    articleDb.close();
  }
}

function printDatabaseSummary() {
  const stats = articleDb.getStats();
  console.log('\n📊 DATABASE SUMMARY:');
  console.log(`   Total Tracked:    ${stats.total}`);
  console.log(`   Pending Queue:    ${stats.discovered}`);
  console.log(`   Completed:        ${stats.completed}`);
  console.log(`   Skipped:          ${stats.skipped}`);
}

main();
