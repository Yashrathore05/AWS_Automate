import { articleDb } from '../db/database.js';

/**
 * Automates the Like and Comment actions on an AWS Builder Center article page
 * @param {import('playwright').Page} page
 * @param {string} commentText
 * @returns {Promise<{ liked: boolean, commented: boolean, notes: string }>}
 */
export async function performArticleInteractions(page, commentText) {
  let liked = false;
  let commented = false;
  const notes = [];

  try {
    // 1. --- Like Action ---
    console.log('[ArticleAction] Attempting automatic Like...');
    
    // Look for article like button
    const likeBtn = page.locator('button[aria-label^="Like this article"]:visible, button[title^="Like this article"]:visible').first();
    const isLikeVisible = await likeBtn.isVisible().catch(() => false);

    if (isLikeVisible) {
      const isAlreadyLiked = await likeBtn.evaluate(el => {
        return el.getAttribute('aria-pressed') === 'true' ||
               el.classList.contains('awsui_variant-primary') ||
               /liked/i.test(el.className);
      });

      if (!isAlreadyLiked) {
        await likeBtn.click();
        await page.waitForTimeout(1500);
        liked = true;
        notes.push('Successfully liked article');
        articleDb.addLog('info', '👍 Liked article automatically');
      } else {
        liked = true;
        notes.push('Article was already liked');
      }
    } else {
      notes.push('Like button not found or already interacted');
    }
  } catch (err) {
    notes.push(`Like note: ${err.message}`);
    articleDb.addLog('warn', `Automatic like attempt: ${err.message}`);
  }

  try {
    // 2. --- Comment Action ---
    console.log('[ArticleAction] Attempting automatic Comment submission...');

    // Scroll to comments section if present
    const commentsHeader = page.locator('h2:has-text("Comments"), h3:has-text("Comments"), [id="comments"]').first();
    const hasHeader = await commentsHeader.isVisible().catch(() => false);
    if (hasHeader) {
      await commentsHeader.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(1200);
    }

    // Check if page redirected to AWS sign-in or requires authentication
    if (page.url().includes('signin.aws') || page.url().includes('/login')) {
      notes.push('Comment skipped: Active session expired (AWS Sign-In page opened)');
      articleDb.addLog('warn', 'AWS Builder Center redirected to sign-in page. Please complete sign-in in your browser.');
      return { liked, commented: false, notes: notes.join('; ') };
    }

    // Check if user is prompted to sign in to comment
    const signInPrompt = page.locator('button:has-text("Sign in to comment"):visible, a:has-text("Sign in to comment"):visible').first();
    const isSignInPromptVisible = await signInPrompt.isVisible().catch(() => false);
    if (isSignInPromptVisible) {
      notes.push('Comment skipped: Active session expired or not signed in');
      articleDb.addLog('warn', 'Unable to comment: AWS Builder requires active sign-in');
      return { liked, commented: false, notes: notes.join('; ') };
    }

    // Locate the comment editor (AWS Builder Center uses a Lexical rich text editor)
    const commentInput = page.locator([
      'div[data-lexical-editor="true"]:visible',
      'div[data-testid="draft-content"]:visible',
      'div[aria-label="Rich text editor"]:visible',
      'div[role="textbox"][contenteditable="true"]:visible',
      'textarea:visible'
    ].join(', ')).first();

    const hasCommentInput = await commentInput.isVisible().catch(() => false);

    if (!hasCommentInput) {
      notes.push('Comments disabled or not available on this article');
      articleDb.addLog('info', 'ℹ️ Comments are closed or not available on this article.');
      return { liked, commented: false, notes: notes.join('; ') };
    }

    await commentInput.scrollIntoViewIfNeeded().catch(() => {});
    await commentInput.click();
    await commentInput.focus();
    await page.waitForTimeout(400);

    // Clear any previous draft text
    const selectAllKey = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';
    await page.keyboard.press(selectAllKey);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);

    // Insert comment text into Lexical editor
    console.log('[ArticleAction] Inserting comment into editor...');
    await page.keyboard.insertText(commentText);
    await page.waitForTimeout(1000);

    // Locate visible submit button
    const submitBtn = page.locator([
      'button[aria-label="Submit comment"]:visible',
      'button[title="Submit comment"]:visible',
      'button[aria-label*="Submit comment" i]:visible',
      'button[title*="Submit comment" i]:visible',
      'button[type="submit"]:has-text("Submit"):visible',
      'button:has-text("Submit"):visible'
    ].join(', ')).first();

    const hasSubmitBtn = await submitBtn.isVisible().catch(() => false);

    if (hasSubmitBtn) {
      let isEnabled = await submitBtn.isEnabled().catch(() => false);

      // If not immediately enabled, send a small key event to trigger Lexical's change listener
      if (!isEnabled) {
        console.log('[ArticleAction] Submit button not yet enabled, sending input pulse...');
        await commentInput.focus();
        await page.keyboard.type(' ', { delay: 30 });
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(1000);
        isEnabled = await submitBtn.isEnabled().catch(() => false);
      }

      if (isEnabled) {
        console.log('[ArticleAction] Clicking enabled Submit comment button...');
        await submitBtn.click({ timeout: 5000 });
        await page.waitForTimeout(4000);
        commented = true;
        notes.push('Successfully posted comment');
        articleDb.addLog('success', '💬 Automatically posted comment on article');
      } else {
        console.warn('[ArticleAction] Submit button remained disabled after text entry.');
        notes.push('Submit comment button remained disabled after text input');
        articleDb.addLog('warn', '⚠️ Comment entered into editor, but Submit button was disabled.');
      }
    } else {
      notes.push('Submit button was not visible in comment form');
      articleDb.addLog('info', 'ℹ️ Comment entered; submit button was not visible.');
    }

  } catch (err) {
    notes.push(`Comment failed: ${err.message}`);
    articleDb.addLog('warn', `Automatic comment attempt failed: ${err.message}`);
  }

  return {
    liked,
    commented,
    notes: notes.join('; ')
  };
}
