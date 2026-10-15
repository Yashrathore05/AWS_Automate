import { BrowserManager } from '../browser/browserManager.js';
import { prompter } from '../cli/prompter.js';
import { CONFIG } from '../config.js';

async function runAuth() {
  console.log('='.repeat(70));
  console.log('🔐 AWS Builder Center - Authentication Setup');
  console.log('='.repeat(70));
  console.log(`Opening: ${CONFIG.BASE_URL}`);
  console.log(`Persistent Profile Directory: ${CONFIG.BROWSER_PROFILE_DIR}`);
  console.log('\n🔒 SECURITY NOTE:');
  console.log('This tool will NEVER ask for, record, or store your AWS password, OTP, or credentials.');
  console.log('You will sign in directly via AWS’s official login page in the browser window.\n');

  const browserManager = new BrowserManager({ headless: false });

  try {
    const page = await browserManager.getPage();
    await page.goto(CONFIG.BASE_URL, {
      waitUntil: 'domcontentloaded',
      timeout: CONFIG.NAVIGATION_TIMEOUT_MS
    });

    console.log('👉 Please use the opened browser window to Sign In or Sign Up.');
    console.log('   Once you are signed in and see the AWS Builder Center home page, return here.\n');

    await prompter.ask('Press [ENTER] here once you have finished signing in in the browser...');

    // Attempt to verify sign-in status
    const isLoggedIn = await page.evaluate(() => {
      // Check for presence of user avatar, profile menu, or sign-out links
      const profileIndicator = document.querySelector(
        '[data-testid*="user-menu"], [data-testid*="avatar"], button[aria-label*="profile"], button[aria-label*="account"], a[href*="/signout"], a[href*="/logout"]'
      );
      const signInButton = document.querySelector(
        'button:has-text("Sign in"), a:has-text("Sign in"), button:has-text("Sign In"), a:has-text("Sign In")'
      );
      return Boolean(profileIndicator) || !Boolean(signInButton);
    });

    if (isLoggedIn) {
      console.log('\n✅ Sign-in session detected and persistent profile updated!');
    } else {
      console.log('\nℹ️ Browser profile saved. Note: If you have not completed sign-in, you can rerun `npm run auth` at any time.');
    }

    console.log(`📁 Your persistent session data is saved in: ${CONFIG.BROWSER_PROFILE_DIR}`);
  } catch (error) {
    console.error('\n❌ Authentication setup encountered an error:', error.message);
  } finally {
    prompter.close();
    await browserManager.close();
    console.log('\nDone.');
  }
}

runAuth();
