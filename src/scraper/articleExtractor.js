/**
 * Extracts key information from an AWS Builder Center article page
 * @param {import('playwright').Page} page
 * @returns {Promise<Object>}
 */
export async function extractArticleDetails(page) {
  await page.waitForLoadState('domcontentloaded');

  const articleData = await page.evaluate(() => {
    // 1. Article Title: try standard h1 or metadata
    const h1 = document.querySelector('h1');
    const title = h1 ? h1.innerText.trim() : document.title.replace(/\s*[-|]\s*AWS Builder.*$/i, '').trim();

    // 2. Author: find community @username link or author heading
    let author = null;
    const authorLink = document.querySelector('a[href*="/community/@"]');
    if (authorLink) {
      author = authorLink.innerText.trim();
      if (!author) {
        // Extract handle from href (e.g. /community/@elenavanengelen -> elenavanengelen)
        const match = authorLink.getAttribute('href').match(/@([a-zA-Z0-9_.-]+)/);
        if (match) author = match[1];
      }
    }

    // 3. Headings inside the article body (stop before comments / explore more)
    const allH = Array.from(document.querySelectorAll('article h2, article h3, article h4, main h2, main h3'));
    const headings = [];
    for (const h of allH) {
      const text = h.innerText.trim();
      if (/^(comments|explore more|references|related)/i.test(text)) {
        break;
      }
      if (text && text.length > 3 && text !== title && text !== author) {
        headings.push(text);
      }
    }

    // 4. Body paragraphs
    const paragraphElements = Array.from(document.querySelectorAll('article p, main p'));
    const textContent = paragraphElements
      .map(p => p.innerText.trim())
      .filter(p => p.length > 20 && !/^(your likes, comments|cookie notice)/i.test(p))
      .join('\n\n');

    // 5. Tags / Topics
    const tagElements = Array.from(document.querySelectorAll('a[href*="/learn/topics/"], [data-testid*="tag"]'));
    const tags = tagElements.map(t => t.innerText.trim().replace(/^#/, '')).filter(Boolean);

    return {
      title,
      author,
      headings,
      content: textContent.slice(0, 4000), // First 4000 chars
      tags: [...new Set(tags)]
    };
  });

  return articleData;
}
