import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

export class Prompter {
  constructor() {
    this.rl = null;
  }

  getInterface() {
    if (!this.rl) {
      this.rl = readline.createInterface({ input, output });
    }
    return this.rl;
  }

  async ask(questionText) {
    const rl = this.getInterface();
    return (await rl.question(questionText)).trim();
  }

  async confirm(questionText, defaultYes = true) {
    const prompt = defaultYes ? `${questionText} [Y/n]: ` : `${questionText} [y/N]: `;
    const answer = (await this.ask(prompt)).toLowerCase();
    if (!answer) return defaultYes;
    return answer === 'y' || answer === 'yes';
  }

  async promptApprovalMenu(article, suggestedComment) {
    console.log('\n' + '='.repeat(70));
    console.log(`📌 ARTICLE TITLE: ${article.title}`);
    console.log(`🔗 URL:           ${article.url}`);
    if (article.author) console.log(`👤 AUTHOR:        ${article.author}`);
    console.log('-'.repeat(70));
    console.log('💬 PROPOSED DRAFT COMMENT:');
    console.log(suggestedComment);
    console.log('='.repeat(70));

    while (true) {
      console.log('\nOptions:');
      console.log('  [1] Approve comment as-is');
      console.log('  [2] Edit comment manually');
      console.log('  [3] Regenerate comment');
      console.log('  [4] Skip this article');
      console.log('  [5] Exit workflow');

      const choice = await this.ask('Select an option (1-5): ');
      if (choice === '1') {
        return { action: 'approve', comment: suggestedComment };
      } else if (choice === '2') {
        const edited = await this.ask('Enter your revised comment:\n> ');
        if (edited) {
          return { action: 'approve', comment: edited };
        } else {
          console.log('Comment was empty. Kept original proposed comment.');
          return { action: 'approve', comment: suggestedComment };
        }
      } else if (choice === '3') {
        return { action: 'regenerate' };
      } else if (choice === '4') {
        return { action: 'skip' };
      } else if (choice === '5') {
        return { action: 'exit' };
      } else {
        console.log('Invalid option. Please choose 1, 2, 3, 4, or 5.');
      }
    }
  }

  close() {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }
}

export const prompter = new Prompter();
