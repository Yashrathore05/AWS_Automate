# AWS Builder Center - Autonomous Daily Engagement Dashboard

A full-stack Node.js + Playwright web application that automates daily article discovery on [AWS Builder Center](https://builder.aws.com/), generates grounded technical comments, and executes automated likes and comments without requiring daily human intervention.

---

## 🌟 Key Features

- **🌐 Modern Web Dashboard**: Sleek dark-mode glassmorphism interface at `http://localhost:3000` with live metrics, progress tracking, campaign controls, real-time activity logs, and article feed.
- **🔒 Persistent 1-Time Authentication**:
  - Sign in once via AWS's official login page using Playwright's persistent Chromium profile (`.browser_profile/`).
  - Browser cookies, tokens, and storage persist across server restarts.
  - Never asks for, stores, or logs your email, password, or OTP.
  - Automatically detects expired sessions and pauses workflow until re-authenticated.
- **📅 Configurable Campaigns (1 to 90 Days)**:
  - Interactive duration slider from 1 to 90 days.
  - Full lifecycle controls: **Start**, **Pause**, **Resume**, and **Stop / Reset**.
  - Displays completed days, remaining days, percentage progress bar, and countdown to next scheduled execution.
- **🎯 Strict Daily Limits (1 Article / Day)**:
  - Discovers and processes **strictly 1 eligible, unprocessed article** per scheduled day.
  - SQLite database (`data/articles.db`) guarantees zero duplicate processing.
  - Automatically stops when the campaign duration completes.
- **🤖 Autonomous Likes & Comments**:
  - Automatically likes the article and submits the generated technical comment without human intervention.
  - Can be toggled on/off in the dashboard settings anytime.
- **✍️ Grounded Technical Comments**:
  - Evaluates mentioned AWS services (Lambda, Bedrock, DynamoDB, CDK, ECS, etc.), architecture patterns, and section headings.
  - Formulates authentic peer-review observations and tradeoff questions—never inventing personal test claims.
- **⏰ Backend Scheduler & Recovery**:
  - Runs in the Node.js backend (independent of browser tabs).
  - Timezone-aware (supports `Asia/Kolkata`, `UTC`, `America/New_York`, and any IANA timezone).
  - Survives server restarts and resumes scheduling seamlessly.
- **⚡ On-Demand Execution**:
  - "Run Now" button allows immediate triggering of today's workflow for instant testing.

---

## 📁 Project Structure

```text
AWS Automate/
├── package.json               # Main entrypoint: "npm start" -> src/server.js
├── .env.example               # Configuration defaults
├── .gitignore                 # Ignores .browser_profile/, data/*.db, .env
├── README.md                  # Comprehensive documentation
├── public/                    # Web Dashboard Frontend
│   ├── index.html             # Dashboard UI with glassmorphism layout
│   ├── style.css              # Custom Vanilla CSS with responsive design
│   └── app.js                 # Real-time state polling & controls
├── data/                      # Local SQLite database (gitignored)
│   └── articles.db            # Persistent tracking of articles, campaign, & logs
└── src/
    ├── config.js              # Centralized configuration & environment loader
    ├── server.js              # Express REST API & static server
    ├── browser/
    │   └── browserManager.js  # Persistent Playwright Chromium context
    ├── db/
    │   └── database.js        # SQLite tracking (articles, campaign state, logs)
    ├── scraper/
    │   ├── articleAction.js   # Automated Like and Comment submission
    │   ├── articleExtractor.js# Title, author, headings, and body extractor
    │   └── navigator.js       # Explore/Articles routing and card discovery
    ├── comments/
    │   └── commentDrafter.js  # Grounded technical comment generation
    └── services/
        ├── authService.js     # Session verification & 1-click desktop login
        ├── scheduler.js       # Background daily scheduler & timezone calculator
        └── workflowEngine.js  # 1-article/day daily execution orchestrator
```

---

## 🚀 Quick Start (Single Command Launch)

### 1. Launch the Application
```bash
npm start
```
This launches the Express web server and starts the backend scheduler at:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 📋 Step-by-Step Dashboard Setup

### Step 1: Complete 1-Time Authentication
1. Open **[http://localhost:3000](http://localhost:3000)** in your browser.
2. At the top right of the dashboard, if the authentication status chip shows **"Not Signed In"**, click **"🔑 Sign In"**.
3. A new tab pointing to AWS Builder Center will open directly in the **same browser window**.
4. Click **Sign in** and log in with your AWS Builder ID / Amazon credentials.
5. Once logged in, the dashboard automatically detects your active session and switches to **"Session Active"** (or displays your `@handle Connected`).
6. You never need to enter credentials again; session cookies and tokens remain securely saved in `.browser_profile/`.

---

### Step 2: Configure & Start Your Campaign
In the **Campaign Configuration** panel:
1. **Duration**: Move the slider to choose between **1 and 90 Days** (e.g., 30 Days).
2. **Daily Execution Time**: Set the time you want the daily workflow to run (e.g., `09:00`).
3. **Timezone**: Select your local timezone (e.g., `Asia/Kolkata (IST +5:30)`).
4. **Autonomous Like & Comment**: Enabled by default to like and comment automatically without human intervention.
5. Click **"Start Campaign"**.

---

### Step 3: Test on Demand (Optional)
To immediately execute today's article discovery, drafting, liking, and commenting without waiting for the scheduled time:
- Click the **"⚡ Run Now"** button in the header.
- Watch the **Real-Time Activity Logs** stream the progress:
  - Navigation to AWS Builder Center
  - Discovery of newly published articles
  - Selection of exactly 1 unprocessed article
  - Content extraction & comment generation
  - Automated like & comment submission
  - Outcome recorded and campaign progress incremented!

---

## 🎛️ REST API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/status` | `GET` | Returns campaign status, completed days, stats, and next run time. |
| `/api/auth/status` | `GET` | Checks if persistent browser profile has an active AWS session. |
| `/api/auth/login` | `POST` | Launches desktop browser window for 1-time manual login. |
| `/api/campaign/start` | `POST` | Starts campaign with `{ durationDays, scheduledTime, timezone, autoInteract }`. |
| `/api/campaign/pause` | `POST` | Pauses running campaign. |
| `/api/campaign/resume` | `POST` | Resumes paused campaign. |
| `/api/campaign/stop` | `POST` | Resets campaign back to idle state. |
| `/api/campaign/run-now`| `POST` | Triggers immediate daily execution. |
| `/api/articles` | `GET` | Returns paginated list of cataloged and processed articles. |
| `/api/logs` | `GET` | Returns real-time activity log entries. |
| `/api/logs` | `DELETE` | Clears activity logs. |

---

## 🛡️ Reliability & Platform Safeguards

- **Strict Rate Limiting**: Exactly 1 article processed per day prevents spam behavior and respects platform limits.
- **Crash Resilience**: All state is persisted in SQLite with WAL mode. If the machine or server restarts, the scheduler recovers seamlessly and resumes your campaign.
- **Session Expiry Protection**: If an AWS session expires, the campaign automatically switches to `auth_required` state, logs an alert, and waits for re-authentication rather than failing silently.
