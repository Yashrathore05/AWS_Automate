import { browserManager } from '../browser/browserManager.js';
import { articleDb } from '../db/database.js';
import { CONFIG } from '../config.js';

class AuthService {
  constructor() {
    this.isManualLoginActive = false;
    this.activeLoginTab = null;
  }

  /**
   * Check whether the persistent browser profile currently has a valid session
   * without launching any new windows.
   * @returns {Promise<{ isAuthenticated: boolean, username: string|null }>}
   */
  async checkAuthStatus() {
    try {
      // 1. If persistent context is active, inspect its cookies
      if (browserManager.context) {
        const cookies = await browserManager.context.cookies(['https://builder.aws.com']);
        const hasAuthCookie = cookies.some(c => 
          /token|session-token|cognito|auth|aws-userInfo/i.test(c.name)
        );

        // Also check if any open tab is on builder.aws.com and logged in
        for (const p of browserManager.context.pages()) {
          if (!p.isClosed() && p.url().includes('builder.aws.com')) {
            try {
              const status = await p.evaluate(() => {
                const userMenu = document.querySelector(
                  '[data-testid*="user-menu"], [data-testid*="avatar"], button[aria-label*="account" i]'
                );
                const userHandleEl = document.querySelector('header a[href*="/community/@"], nav a[href*="/community/@"]');
                let username = null;
                if (userHandleEl) {
                  const match = (userHandleEl.getAttribute('href') || '').match(/@([a-zA-Z0-9_.-]+)/);
                  if (match) username = match[1];
                }
                return { isAuthed: Boolean(userMenu) || Boolean(userHandleEl), username };
              });

              if (status.isAuthed) {
                return { isAuthenticated: true, username: status.username, checkedAt: new Date().toISOString() };
              }
            } catch {
              // Ignore evaluate error if page navigating
            }
          }
        }

        if (hasAuthCookie) {
          return { isAuthenticated: true, username: null, checkedAt: new Date().toISOString() };
        }
      }

      return {
        isAuthenticated: false,
        username: null,
        checkedAt: new Date().toISOString()
      };
    } catch (err) {
      return {
        isAuthenticated: false,
        username: null,
        error: err.message,
        checkedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Open a new tab in the SAME browser window for manual sign in
   */
  async launchManualLoginWindow() {
    if (this.isManualLoginActive && this.activeLoginTab && !this.activeLoginTab.isClosed()) {
      await this.activeLoginTab.bringToFront();
      return { message: 'Sign-in tab is already open in your browser window.' };
    }

    this.isManualLoginActive = true;
    articleDb.addLog('info', 'Opening sign-in tab in the same browser window...');

    try {
      // Open tab in the SAME running window
      this.activeLoginTab = await browserManager.openTab(CONFIG.BASE_URL, true);

      console.log('[AuthService] Opened sign-in tab in the same window.');

      // Monitor that tab in background for sign-in completion
      (async () => {
        let checks = 0;
        const maxChecks = 120; // 10 minutes

        while (checks < maxChecks) {
          if (!this.activeLoginTab || this.activeLoginTab.isClosed()) break;

          await new Promise(r => setTimeout(r, 4000));
          checks++;

          try {
            const isAuthed = await this.activeLoginTab.evaluate(() => {
              const signInBtn = Array.from(document.querySelectorAll('button, a')).find(el => {
                const text = (el.innerText || '').trim().toLowerCase();
                const label = (el.getAttribute('aria-label') || '').toLowerCase();
                return text === 'sign in' || label === 'sign in';
              });
              const userMenu = document.querySelector(
                '[data-testid*="user-menu"], [data-testid*="avatar"], button[aria-label*="account" i]'
              );
              return Boolean(userMenu) || !Boolean(signInBtn);
            });

            if (isAuthed) {
              articleDb.addLog('success', '✅ User login detected! Persistent session updated.');
              
              const campaign = articleDb.getCampaign();
              if (campaign && campaign.status === 'auth_required') {
                articleDb.resumeCampaign();
                articleDb.addLog('info', 'Resumed campaign after successful reauthentication.');
              }

              // Bring dashboard back to front in the same window
              await new Promise(r => setTimeout(r, 2000));
              if (browserManager.dashboardPage && !browserManager.dashboardPage.isClosed()) {
                await browserManager.dashboardPage.bringToFront();
              }
              break;
            }
          } catch {
            break;
          }
        }

        this.isManualLoginActive = false;
        this.activeLoginTab = null;
      })();

      return { message: 'Opened sign-in tab in your browser window. Complete your login there.' };
    } catch (err) {
      this.isManualLoginActive = false;
      this.activeLoginTab = null;
      articleDb.addLog('error', `Failed to open sign-in tab: ${err.message}`);
      throw err;
    }
  }
}

export const authService = new AuthService();
