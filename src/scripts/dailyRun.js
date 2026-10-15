import { workflowEngine } from '../services/workflowEngine.js';
import { browserManager } from '../browser/browserManager.js';
import { articleDb } from '../db/database.js';

async function run() {
  console.log('='.repeat(70));
  console.log('🤖 AWS Builder Center - Headless Daily Runner (GitHub Actions / Cron)');
  console.log('='.repeat(70));

  try {
    const result = await workflowEngine.runDailyWorkflow({ isManualTrigger: true });
    console.log('[DailyRun] Result:', JSON.stringify(result, null, 2));

    if (!result.success) {
      console.warn('[DailyRun] Workflow completed with notice:', result.message || result.error);
    }
  } catch (err) {
    console.error('[DailyRun] Execution failed:', err);
    process.exit(1);
  } finally {
    try {
      await browserManager.close();
      articleDb.close();
    } catch {}
    process.exit(0);
  }
}

run();
