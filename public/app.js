// State Management
let currentFilter = 'all';
let allArticles = [];
let campaignState = null;
let lastLogId = 0;

// DOM Elements
const authStatusCard = document.getElementById('auth-status-card');
const authLabel = document.getElementById('auth-label');
const btnLaunchAuth = document.getElementById('btn-launch-auth');

const campaignStatusPill = document.getElementById('campaign-status-pill');
const campaignStatusText = document.getElementById('campaign-status-text');
const btnRunNow = document.getElementById('btn-run-now');

const progressPercent = document.getElementById('progress-percent');
const metricDays = document.getElementById('metric-days');
const progressBarFill = document.getElementById('progress-bar-fill');
const metricNextRun = document.getElementById('metric-next-run');
const runCountdownBadge = document.getElementById('run-countdown-badge');
const metricTimezoneNote = document.getElementById('metric-timezone-note');

const metricTotalDiscovered = document.getElementById('metric-total-discovered');
const metricPendingNote = document.getElementById('metric-pending-note');
const metricCompletedCount = document.getElementById('metric-completed-count');
const metricInteractionBreakdown = document.getElementById('metric-interaction-breakdown');

const durationSlider = document.getElementById('duration-slider');
const durationDisplay = document.getElementById('duration-display');
const scheduleTimeInput = document.getElementById('schedule-time');
const timezoneSelect = document.getElementById('timezone-select');
const toggleAutoInteract = document.getElementById('toggle-auto-interact');

const btnStartCampaign = document.getElementById('btn-start-campaign');
const btnPauseCampaign = document.getElementById('btn-pause-campaign');
const btnResumeCampaign = document.getElementById('btn-resume-campaign');
const btnStopCampaign = document.getElementById('btn-stop-campaign');

const articlesContainer = document.getElementById('articles-container');
const terminalLogs = document.getElementById('terminal-logs');
const btnClearLogs = document.getElementById('btn-clear-logs');
const filterButtons = document.querySelectorAll('.filter-btn');

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  fetchStatus();
  fetchAuthStatus();
  fetchLogs();
  fetchArticles();

  // Background polling loops
  setInterval(fetchStatus, 3000);
  setInterval(fetchLogs, 3000);
  setInterval(fetchArticles, 6000);
  setInterval(fetchAuthStatus, 10000);
});

function setupEventListeners() {
  // Slider listener
  durationSlider.addEventListener('input', (e) => {
    durationDisplay.textContent = `${e.target.value} Days`;
  });

  // Filter buttons
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderArticles();
    });
  });

  // Action Buttons
  btnLaunchAuth.addEventListener('click', launchAuthBrowser);
  btnStartCampaign.addEventListener('click', startCampaign);
  btnPauseCampaign.addEventListener('click', pauseCampaign);
  btnResumeCampaign.addEventListener('click', resumeCampaign);
  btnStopCampaign.addEventListener('click', stopCampaign);
  btnRunNow.addEventListener('click', triggerRunNow);
  btnClearLogs.addEventListener('click', clearLogs);
}

// --- API Calls ---

async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (!data.success) return;

    campaignState = data.campaign;
    const stats = data.stats;

    // Update Campaign Status Pill
    updateStatusPill(campaignState.status, data.isExecuting);

    // Update Progress Metrics
    const completed = campaignState.completed_days || 0;
    const total = campaignState.duration_days || 30;
    const pct = Math.min(100, Math.round((completed / total) * 100));

    progressPercent.textContent = `${pct}%`;
    metricDays.textContent = `${completed} / ${total}`;
    progressBarFill.style.width = `${pct}%`;

    // Update Next Scheduled Run
    updateNextRunDisplay(campaignState.next_run_at, campaignState.timezone);

    // Update Stats
    metricTotalDiscovered.textContent = stats.total || 0;
    metricPendingNote.textContent = `${stats.discovered || 0} Pending in Queue`;
    metricCompletedCount.textContent = stats.completed || 0;
    metricInteractionBreakdown.textContent = `${stats.likedCount || 0} Likes · ${stats.commentedCount || 0} Comments`;

    // Sync input controls if idle
    if (campaignState.status === 'idle') {
      durationSlider.disabled = false;
      scheduleTimeInput.disabled = false;
      timezoneSelect.disabled = false;
      toggleAutoInteract.disabled = false;
    } else {
      durationSlider.disabled = true;
      scheduleTimeInput.disabled = true;
      timezoneSelect.disabled = true;
      toggleAutoInteract.disabled = true;
    }

    // Update Controls Button Visibility
    updateControlButtons(campaignState.status, data.isExecuting);

  } catch (err) {
    console.warn('Error fetching status:', err);
  }
}

async function fetchAuthStatus() {
  try {
    const res = await fetch('/api/auth/status');
    const data = await res.json();

    authStatusCard.className = 'status-chip ' + (data.isAuthenticated ? 'chip-authed' : 'chip-unauthed');
    if (data.isAuthenticated) {
      authLabel.textContent = data.username ? `@${data.username} Connected` : 'Session Active';
      btnLaunchAuth.textContent = 'Switch Account';
    } else {
      authLabel.textContent = 'Not Signed In';
      btnLaunchAuth.textContent = '🔑 Sign In';
    }
  } catch (err) {
    authStatusCard.className = 'status-chip chip-unauthed';
    authLabel.textContent = 'Check Failed';
  }
}

async function launchAuthBrowser() {
  btnLaunchAuth.disabled = true;
  btnLaunchAuth.textContent = 'Opening Tab...';

  // Open AWS Builder Center tab directly in the same browser window
  try {
    window.open('https://builder.aws.com/', '_blank');
  } catch {
    // If popups blocked, backend handles it
  }

  try {
    await fetch('/api/auth/login', { method: 'POST' });
    btnLaunchAuth.textContent = 'Tab Opened';
  } catch (err) {
    console.warn('Backend login trigger notice:', err.message);
  } finally {
    setTimeout(fetchAuthStatus, 2500);
    setTimeout(() => {
      btnLaunchAuth.disabled = false;
      fetchAuthStatus();
    }, 3500);
  }
}

async function startCampaign() {
  const durationDays = parseInt(durationSlider.value, 10);
  const scheduledTime = scheduleTimeInput.value || '09:00';
  const timezone = timezoneSelect.value;
  const autoInteract = toggleAutoInteract.checked;

  try {
    const res = await fetch('/api/campaign/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ durationDays, scheduledTime, timezone, autoInteract })
    });
    const data = await res.json();
    if (data.success) {
      fetchStatus();
      fetchLogs();
    }
  } catch (err) {
    alert('Failed to start campaign: ' + err.message);
  }
}

async function pauseCampaign() {
  try {
    const res = await fetch('/api/campaign/pause', { method: 'POST' });
    const data = await res.json();
    if (data.success) fetchStatus();
  } catch (err) {
    alert('Failed to pause campaign: ' + err.message);
  }
}

async function resumeCampaign() {
  try {
    const res = await fetch('/api/campaign/resume', { method: 'POST' });
    const data = await res.json();
    if (data.success) fetchStatus();
  } catch (err) {
    alert('Failed to resume campaign: ' + err.message);
  }
}

async function stopCampaign() {
  if (!confirm('Are you sure you want to stop this campaign? Completed days will be reset.')) return;
  try {
    const res = await fetch('/api/campaign/stop', { method: 'POST' });
    const data = await res.json();
    if (data.success) fetchStatus();
  } catch (err) {
    alert('Failed to stop campaign: ' + err.message);
  }
}

async function triggerRunNow() {
  btnRunNow.disabled = true;
  try {
    const res = await fetch('/api/campaign/run-now', { method: 'POST' });
    const data = await res.json();
    if (!data.success) {
      alert(data.message || 'Execution error');
    }
    fetchStatus();
    fetchLogs();
  } catch (err) {
    alert('Failed to trigger run: ' + err.message);
  } finally {
    setTimeout(() => { btnRunNow.disabled = false; }, 3000);
  }
}

async function fetchLogs() {
  try {
    const res = await fetch('/api/logs?limit=80');
    const data = await res.json();
    if (!data.success || !data.logs) return;

    // Only re-render if logs changed
    const newLogs = data.logs;
    if (newLogs.length === 0) {
      terminalLogs.innerHTML = '<div class="empty-state">No logs recorded yet.</div>';
      return;
    }

    const html = newLogs.map(log => {
      const time = log.created_at ? log.created_at.slice(11, 19) : '';
      return `
        <div class="log-entry log-${log.level}">
          <span class="log-time">[${time}]</span>
          <span class="log-msg">${escapeHtml(log.message)}</span>
        </div>
      `;
    }).reverse().join('');

    const isAtBottom = terminalLogs.scrollHeight - terminalLogs.clientHeight <= terminalLogs.scrollTop + 50;
    terminalLogs.innerHTML = html;
    if (isAtBottom) {
      terminalLogs.scrollTop = terminalLogs.scrollHeight;
    }
  } catch (err) {
    console.warn('Error fetching logs:', err);
  }
}

async function clearLogs() {
  try {
    await fetch('/api/logs', { method: 'DELETE' });
    terminalLogs.innerHTML = '<div class="empty-state">Logs cleared.</div>';
  } catch (err) {
    alert('Failed to clear logs: ' + err.message);
  }
}

async function fetchArticles() {
  try {
    const res = await fetch('/api/articles?limit=50');
    const data = await res.json();
    if (!data.success || !data.articles) return;

    allArticles = data.articles;
    renderArticles();
  } catch (err) {
    console.warn('Error fetching articles:', err);
  }
}

function renderArticles() {
  let filtered = allArticles;
  if (currentFilter === 'completed') {
    filtered = allArticles.filter(a => a.status === 'completed');
  } else if (currentFilter === 'discovered') {
    filtered = allArticles.filter(a => a.status === 'discovered');
  }

  if (filtered.length === 0) {
    articlesContainer.innerHTML = '<div class="empty-state">No articles found in this filter.</div>';
    return;
  }

  articlesContainer.innerHTML = filtered.map(a => {
    const isCompleted = a.status === 'completed';
    const dateStr = a.processed_at ? new Date(a.processed_at).toLocaleDateString() : 'Discovered';
    const authorStr = a.author ? `@${a.author}` : 'AWS Community';

    return `
      <div class="article-row-card">
        <div class="article-card-header">
          <a href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer" class="article-card-title">
            ${escapeHtml(a.title)}
          </a>
          <div class="article-badges">
            <span class="badge-tag ${isCompleted ? 'completed' : 'queued'}">
              ${isCompleted ? 'Processed' : 'In Queue'}
            </span>
          </div>
        </div>

        <div class="article-meta">
          <span>👤 ${escapeHtml(authorStr)}</span>
          <span>📅 ${dateStr}</span>
          ${a.liked ? '<span>👍 Liked</span>' : ''}
          ${a.commented ? '<span>💬 Commented</span>' : ''}
        </div>

        ${a.final_comment ? `
          <div class="comment-preview-box">
            <span class="comment-label">Generated Grounded Comment</span>
            <p>${escapeHtml(a.final_comment)}</p>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

// --- Helpers ---

function updateStatusPill(status, isExecuting) {
  if (isExecuting) {
    campaignStatusPill.className = 'status-chip chip-running';
    campaignStatusText.textContent = 'RUNNING TODAY';
    return;
  }

  switch (status) {
    case 'running':
      campaignStatusPill.className = 'status-chip chip-running';
      campaignStatusText.textContent = 'ACTIVE CAMPAIGN';
      break;
    case 'paused':
      campaignStatusPill.className = 'status-chip chip-paused';
      campaignStatusText.textContent = 'PAUSED';
      break;
    case 'auth_required':
      campaignStatusPill.className = 'status-chip chip-auth-required';
      campaignStatusText.textContent = 'AUTH REQUIRED';
      break;
    case 'completed':
      campaignStatusPill.className = 'status-chip chip-authed';
      campaignStatusText.textContent = 'COMPLETED';
      break;
    default:
      campaignStatusPill.className = 'status-chip chip-idle';
      campaignStatusText.textContent = 'IDLE';
  }
}

function updateControlButtons(status, isExecuting) {
  btnStartCampaign.style.display = (status === 'idle' || status === 'completed') ? 'inline-flex' : 'none';
  btnPauseCampaign.style.display = (status === 'running') ? 'inline-flex' : 'none';
  btnResumeCampaign.style.display = (status === 'paused' || status === 'auth_required') ? 'inline-flex' : 'none';
  btnStopCampaign.style.display = (status !== 'idle') ? 'inline-flex' : 'none';

  btnRunNow.disabled = isExecuting;
}

function updateNextRunDisplay(nextRunAt, timezone) {
  metricTimezoneNote.textContent = `Zone: ${timezone || 'Asia/Kolkata'}`;

  if (!nextRunAt) {
    metricNextRun.textContent = '--:--';
    runCountdownBadge.textContent = 'Not Active';
    return;
  }

  const targetDate = new Date(nextRunAt);
  const now = new Date();
  const diffMs = targetDate.getTime() - now.getTime();

  if (diffMs <= 0) {
    metricNextRun.textContent = 'Imminent';
    runCountdownBadge.textContent = 'Starting';
  } else {
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    metricNextRun.textContent = targetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    runCountdownBadge.textContent = `in ${hours}h ${mins}m`;
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
