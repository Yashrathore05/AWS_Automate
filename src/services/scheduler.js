import { articleDb } from '../db/database.js';
import { workflowEngine } from './workflowEngine.js';

class Scheduler {
  constructor() {
    this.timer = null;
    this.intervalMs = 30000; // Check every 30 seconds
  }

  /**
   * Start the background scheduler loop
   */
  start() {
    if (this.timer) return;
    console.log('[Scheduler] Starting backend campaign scheduler service...');
    this.ensureNextRunScheduled();

    this.timer = setInterval(() => {
      this.tick();
    }, this.intervalMs);

    // Initial tick
    this.tick();
  }

  /**
   * Stop the scheduler loop
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[Scheduler] Stopped backend campaign scheduler.');
    }
  }

  /**
   * Periodic scheduler tick
   */
  async tick() {
    const campaign = articleDb.getCampaign();
    if (!campaign || campaign.status !== 'running') {
      return;
    }

    if (campaign.completed_days >= campaign.duration_days) {
      articleDb.updateCampaign({ status: 'completed' });
      articleDb.addLog('info', 'Campaign finished all scheduled days.');
      return;
    }

    const now = new Date();
    let nextRun = campaign.next_run_at ? new Date(campaign.next_run_at) : null;

    if (!nextRun || isNaN(nextRun.getTime())) {
      nextRun = this.calculateNextRunTime(campaign.scheduled_time, campaign.timezone);
      articleDb.updateCampaign({ next_run_at: nextRun.toISOString() });
    }

    // Check if it is time to execute today's run
    if (now >= nextRun) {
      console.log('[Scheduler] Target run time reached! Triggering daily workflow...');
      
      // Calculate following run time first to prevent immediate re-trigger on tick
      const followingRun = this.calculateNextRunTime(
        campaign.scheduled_time,
        campaign.timezone,
        new Date(now.getTime() + 86400000)
      );
      articleDb.updateCampaign({ next_run_at: followingRun.toISOString() });

      // Run daily workflow
      await workflowEngine.runDailyWorkflow();
    }
  }

  /**
   * Calculate next ISO date for target time and timezone
   * @param {string} scheduledTime e.g. "09:00"
   * @param {string} timezone e.g. "Asia/Kolkata"
   * @param {Date} [referenceDate]
   * @returns {Date}
   */
  calculateNextRunTime(scheduledTime = '09:00', timezone = 'Asia/Kolkata', referenceDate = new Date()) {
    const [hoursStr, minutesStr] = (scheduledTime || '09:00').split(':');
    const targetHours = parseInt(hoursStr || '9', 10);
    const targetMinutes = parseInt(minutesStr || '0', 10);

    // Get current date string in the target timezone
    let dateStr;
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      dateStr = formatter.format(referenceDate); // "YYYY-MM-DD"
    } catch {
      dateStr = referenceDate.toISOString().slice(0, 10);
    }

    // Candidate date today in ISO
    let candidate = new Date(`${dateStr}T${String(targetHours).padStart(2, '0')}:${String(targetMinutes).padStart(2, '0')}:00`);

    // If candidate has already passed relative to referenceDate, schedule for tomorrow
    if (candidate <= referenceDate) {
      candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
    }

    return candidate;
  }

  ensureNextRunScheduled() {
    const campaign = articleDb.getCampaign();
    if (campaign && campaign.status === 'running' && !campaign.next_run_at) {
      const nextRun = this.calculateNextRunTime(campaign.scheduled_time, campaign.timezone);
      articleDb.updateCampaign({ next_run_at: nextRun.toISOString() });
    }
  }
}

export const scheduler = new Scheduler();
