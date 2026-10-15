import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { CONFIG } from './config.js';
import { articleDb } from './db/database.js';
import { authService } from './services/authService.js';
import { workflowEngine } from './services/workflowEngine.js';
import { scheduler } from './services/scheduler.js';
import { browserManager } from './browser/browserManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');

const app = express();

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// --- API Endpoints ---

// 1. Full Dashboard State
app.get('/api/status', (req, res) => {
  try {
    const campaign = articleDb.getCampaign();
    const stats = articleDb.getStats();
    res.json({
      success: true,
      campaign,
      stats,
      isExecuting: workflowEngine.isExecuting,
      currentTime: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Auth Status
app.get('/api/auth/status', async (req, res) => {
  try {
    const status = await authService.checkAuthStatus();
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Open Sign-In Tab in Same Window
app.post('/api/auth/login', async (req, res) => {
  try {
    const result = await authService.launchManualLoginWindow();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Campaign Controls: Start
app.post('/api/campaign/start', (req, res) => {
  try {
    const { durationDays, timezone, scheduledTime, autoInteract } = req.body;
    const days = Math.max(1, Math.min(90, parseInt(durationDays || '30', 10)));
    
    articleDb.startCampaign({
      durationDays: days,
      timezone: timezone || CONFIG.DEFAULT_TIMEZONE,
      scheduledTime: scheduledTime || CONFIG.DEFAULT_SCHEDULE_TIME,
      autoInteract: autoInteract !== undefined ? autoInteract : true
    });

    // Schedule next run
    const nextRun = scheduler.calculateNextRunTime(scheduledTime, timezone);
    articleDb.updateCampaign({ next_run_at: nextRun.toISOString() });

    articleDb.addLog('info', `Started new ${days}-day campaign (Runs daily at ${scheduledTime} ${timezone})`);

    res.json({ success: true, campaign: articleDb.getCampaign() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Campaign Controls: Pause
app.post('/api/campaign/pause', (req, res) => {
  try {
    articleDb.pauseCampaign();
    articleDb.addLog('info', 'Campaign paused by user.');
    res.json({ success: true, campaign: articleDb.getCampaign() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Campaign Controls: Resume
app.post('/api/campaign/resume', (req, res) => {
  try {
    articleDb.resumeCampaign();
    scheduler.ensureNextRunScheduled();
    articleDb.addLog('info', 'Campaign resumed by user.');
    res.json({ success: true, campaign: articleDb.getCampaign() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Campaign Controls: Stop
app.post('/api/campaign/stop', (req, res) => {
  try {
    articleDb.stopCampaign();
    articleDb.addLog('info', 'Campaign stopped by user.');
    res.json({ success: true, campaign: articleDb.getCampaign() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Run Today's Run Now
app.post('/api/campaign/run-now', async (req, res) => {
  try {
    if (workflowEngine.isExecuting) {
      return res.status(400).json({ success: false, message: 'A workflow execution is already in progress.' });
    }

    // Trigger run asynchronously in tabs of the same window
    workflowEngine.runDailyWorkflow({ isManualTrigger: true });
    res.json({ success: true, message: 'Workflow triggered in active browser. Monitor logs in dashboard.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Articles List
app.get('/api/articles', (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '100', 10);
    const offset = parseInt(req.query.offset || '0', 10);
    const articles = articleDb.getAllProcessedArticles(limit, offset);
    res.json({ success: true, articles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 10. Logs List
app.get('/api/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '100', 10);
    const logs = articleDb.getLogs(limit);
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 11. Clear Logs
app.delete('/api/logs', (req, res) => {
  try {
    articleDb.clearLogs();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start scheduler and server
export function startServer(port = CONFIG.PORT) {
  scheduler.start();

  const server = app.listen(port, async () => {
    console.log('='.repeat(70));
    console.log(`🌐 AWS Builder Center Automation Dashboard`);
    console.log(`📡 URL: http://localhost:${port}`);
    console.log('='.repeat(70));
    articleDb.addLog('info', `Dashboard web server started on port ${port}`);

    try {
      if (!CONFIG.HEADLESS) {
        // Launch or focus the dashboard in the persistent browser window (local desktop mode)
        await browserManager.openDashboardTab(port);
        console.log(`[BrowserManager] Dashboard tab ready in persistent window.`);
      } else {
        console.log(`[BrowserManager] Running in HEADLESS mode on server. Web UI accessible at port ${port}.`);
      }
    } catch (err) {
      console.log(`[BrowserManager] Dashboard window notice: ${err.message}`);
    }
  });

  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}
