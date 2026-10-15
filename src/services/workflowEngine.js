import { browserManager } from '../browser/browserManager.js';
import { navigator } from '../scraper/navigator.js';
import { extractArticleDetails } from '../scraper/articleExtractor.js';
import { performArticleInteractions } from '../scraper/articleAction.js';
import { commentDrafter } from '../comments/commentDrafter.js';
import { articleDb } from '../db/database.js';
import { authService } from './authService.js';
import { CONFIG } from '../config.js';

class WorkflowEngine {
  constructor() {
    this.isExecuting = false;
  }

  /**
   * Execute the daily workflow in tabs of the same browser window
   * @param {Object} options
   * @param {boolean} options.isManualTrigger Whether triggered by the "Run Now" button
   */
  async runDailyWorkflow({ isManualTrigger = false } = {}) {
    if (this.isExecuting) {
      articleDb.addLog('warn', 'Execution skipped: A workflow run is already in progress.');
      return { success: false, message: 'Workflow is already in progress.' };
    }

    const campaign = articleDb.getCampaign();
    if (!campaign) {
      return { success: false, message: 'No active campaign found.' };
    }

    if (!isManualTrigger && campaign.status !== 'running') {
      console.log(`[WorkflowEngine] Campaign is not in running state (current: ${campaign.status}). Skipping.`);
      return { success: false, message: `Campaign status is ${campaign.status}` };
    }

    if (campaign.completed_days >= campaign.duration_days) {
      articleDb.updateCampaign({ status: 'completed' });
      articleDb.addLog('info', 'Campaign has already completed all scheduled days.');
      return { success: true, message: 'Campaign already completed.' };
    }

    this.isExecuting = true;
    articleDb.addLog('info', `🚀 Starting daily article workflow (Day ${campaign.completed_days + 1} of ${campaign.duration_days})`);

    let mainPage = null;
    let articlePage = null;

    try {
      // 1. Session verification check
      const auth = await authService.checkAuthStatus();
      if (!auth.isAuthenticated) {
        articleDb.updateCampaign({ status: 'auth_required', last_error: 'Session expired or not signed in.' });
        articleDb.addLog('error', '⚠️ AWS session is not active. Workflow paused. Please click "Sign In" in the dashboard to open the sign-in tab.');
        this.isExecuting = false;
        return { success: false, message: 'Authentication required. Workflow paused.' };
      }

      // 2. Open Explore tab in the SAME window
      mainPage = await browserManager.openTab(CONFIG.BASE_URL, false);

      // 3. Navigate to Explore / Articles
      articleDb.addLog('info', 'Navigating to AWS Builder Center Explore feed...');
      await navigator.navigateToArticles(mainPage);

      // 4. Scan for cards and save newly discovered ones
      const discoveredCards = await navigator.discoverArticleCards(mainPage);
      let newCount = 0;
      for (const card of discoveredCards) {
        if (!articleDb.hasArticle(card.url)) {
          articleDb.saveDiscoveredArticle(card);
          newCount++;
        }
      }
      if (newCount > 0) {
        articleDb.addLog('info', `Found and cataloged ${newCount} newly published articles.`);
      }

      // 5. Strictly pick EXACTLY ONE unprocessed article
      let article = articleDb.getOneUnprocessedArticle();

      if (!article) {
        articleDb.addLog('info', 'All currently recorded articles are processed. Loading more from Explore feed...');
        const loadMoreBtn = mainPage.locator('button:has-text("Load more")').first();
        if (await loadMoreBtn.isVisible({ timeout: 3000 })) {
          await loadMoreBtn.click();
          await mainPage.waitForTimeout(3000);
          const moreCards = await navigator.discoverArticleCards(mainPage);
          for (const card of moreCards) {
            if (!articleDb.hasArticle(card.url)) {
              articleDb.saveDiscoveredArticle(card);
            }
          }
        }
        article = articleDb.getOneUnprocessedArticle();
      }

      if (!article) {
        articleDb.addLog('warn', 'No new unprocessed articles available on AWS Builder Center today.');
        return { success: false, message: 'No new articles found.' };
      }

      articleDb.addLog('info', `Selected 1 article for today: "${article.title}"`, { url: article.url });

      // 6. Open article in a tab of the SAME window
      articlePage = await browserManager.openTab(article.url, true);
      await articlePage.waitForLoadState('domcontentloaded');
      await mainPage.waitForTimeout(2000);

      const extracted = await extractArticleDetails(articlePage);
      const articleData = { ...article, ...extracted };

      // 7. Generate grounded, unique comment
      articleDb.addLog('info', 'Drafting technically grounded comment based on article content...');
      const comment = await commentDrafter.draftComment(articleData);

      // 8. Auto-interact (Like & Comment) if enabled
      let outcome = { liked: false, commented: false, notes: 'Drafted only' };

      if (campaign.auto_interact) {
        articleDb.addLog('info', 'Executing automated Like & Comment on article...');
        outcome = await performArticleInteractions(articlePage, comment);
      } else {
        articleDb.addLog('info', 'Auto-interact disabled; comment saved to database.');
      }

      // 9. Record article completion
      articleDb.recordCompletedArticle(article.id, {
        finalComment: comment,
        liked: outcome.liked,
        commented: outcome.commented,
        notes: outcome.notes
      });

      // 10. Update campaign progress
      const newCompletedDays = campaign.completed_days + 1;
      const isCompleted = newCompletedDays >= campaign.duration_days;

      articleDb.incrementCompletedDays();
      if (isCompleted) {
        articleDb.updateCampaign({ status: 'completed', last_error: null });
        articleDb.addLog('success', `🎉 Campaign completed! Successfully processed ${newCompletedDays} of ${campaign.duration_days} days.`);
      } else {
        articleDb.updateCampaign({ last_error: null });
        articleDb.addLog('success', `✅ Day ${newCompletedDays} completed. Processed article: "${article.title}"`);
      }

      return {
        success: true,
        article: {
          id: article.id,
          title: article.title,
          url: article.url,
          comment,
          liked: outcome.liked,
          commented: outcome.commented
        }
      };

    } catch (err) {
      articleDb.updateCampaign({ last_error: err.message });
      articleDb.addLog('error', `Workflow execution failed: ${err.message}`);
      return { success: false, error: err.message };
    } finally {
      // Close work tabs and focus dashboard in the same window
      if (articlePage && !articlePage.isClosed()) {
        await articlePage.close();
      }
      if (mainPage && !mainPage.isClosed()) {
        await mainPage.close();
      }
      if (browserManager.dashboardPage && !browserManager.dashboardPage.isClosed()) {
        await browserManager.dashboardPage.bringToFront();
      }
      this.isExecuting = false;
    }
  }
}

export const workflowEngine = new WorkflowEngine();
