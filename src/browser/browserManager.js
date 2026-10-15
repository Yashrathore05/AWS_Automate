import { chromium } from 'playwright';
import fs from 'fs';
import { CONFIG } from '../config.js';

class BrowserManager {
  constructor() {
    this.userDataDir = CONFIG.BROWSER_PROFILE_DIR;
    this.headless = CONFIG.HEADLESS;
    this.context = null;
    this.dashboardPage = null;

    if (!fs.existsSync(this.userDataDir)) {
      fs.mkdirSync(this.userDataDir, { recursive: true });
      const bundledProfile = path.resolve(CONFIG.ROOT_DIR, '.browser_profile');
      if (bundledProfile !== this.userDataDir && fs.existsSync(bundledProfile)) {
        try {
          fs.cpSync(bundledProfile, this.userDataDir, { recursive: true });
          console.log(`[BrowserManager] Seeded persistent browser profile to: ${this.userDataDir}`);
        } catch (e) {
          console.warn('[BrowserManager] Profile seed notice:', e.message);
        }
      }
    }
  }

  /**
   * Launch or return the single shared persistent browser context
   */
  async getContext() {
    if (this.context && this.context.browser()?.isConnected?.()) {
      return this.context;
    }

    // If context was closed or disconnected, reinitialize
    if (!this.context) {
      console.log(`[BrowserManager] Initializing shared persistent Chromium window at: ${this.userDataDir}`);
      
      this.context = await chromium.launchPersistentContext(this.userDataDir, {
        headless: this.headless,
        viewport: null, // Natural maximized screen size
        ignoreHTTPSErrors: true,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-infobars',
          '--start-maximized'
        ],
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
      });

      this.context.setDefaultTimeout(CONFIG.ACTION_TIMEOUT_MS);
      this.context.setDefaultNavigationTimeout(CONFIG.NAVIGATION_TIMEOUT_MS);

      // Listen for window close
      this.context.on('close', () => {
        console.log('[BrowserManager] Browser context was closed.');
        this.context = null;
        this.dashboardPage = null;
      });
    }

    return this.context;
  }

  /**
   * Open or focus the dashboard tab in the same browser window
   * @param {number} port
   */
  async openDashboardTab(port = CONFIG.PORT) {
    const context = await this.getContext();
    const dashboardUrl = `http://localhost:${port}`;

    // Check if dashboard tab is already open
    const pages = context.pages();
    for (const p of pages) {
      if (!p.isClosed() && p.url().includes(`localhost:${port}`)) {
        this.dashboardPage = p;
        await p.bringToFront();
        return p;
      }
    }

    // Use first open tab if empty/blank, else open new tab
    if (pages.length > 0 && (pages[0].url() === 'about:blank' || pages[0].url() === '')) {
      this.dashboardPage = pages[0];
    } else {
      this.dashboardPage = await context.newPage();
    }

    await this.dashboardPage.goto(dashboardUrl, {
      waitUntil: 'domcontentloaded',
      timeout: CONFIG.NAVIGATION_TIMEOUT_MS
    });
    await this.dashboardPage.bringToFront();
    return this.dashboardPage;
  }

  /**
   * Open a new tab in the EXACT SAME browser window
   * @param {string} url
   * @param {boolean} [bringToFront=true]
   * @returns {Promise<import('playwright').Page>}
   */
  async openTab(url, bringToFront = true) {
    const context = await this.getContext();
    const page = await context.newPage();

    if (url) {
      console.log(`[BrowserManager] Opening tab in same window: ${url}`);
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: CONFIG.NAVIGATION_TIMEOUT_MS
      });
    }

    if (bringToFront) {
      await page.bringToFront();
    }

    return page;
  }

  /**
   * Check if cookies exist for AWS Builder Center without creating/closing windows
   * @returns {Promise<boolean>}
   */
  async hasBuilderCookies() {
    try {
      if (!this.context) return false;
      const cookies = await this.context.cookies(['https://builder.aws.com']);
      // AWS login cookies usually include session-id, ubid-main, or builder auth tokens
      return cookies.some(c => 
        /session|token|auth|cognito|aws|user/i.test(c.name) && !c.name.startsWith('aws-privacy')
      );
    } catch {
      return false;
    }
  }

  /**
   * Close context on application exit
   */
  async close() {
    if (this.context) {
      console.log('[BrowserManager] Closing shared persistent browser...');
      await this.context.close();
      this.context = null;
      this.dashboardPage = null;
    }
  }
}

export const browserManager = new BrowserManager();
