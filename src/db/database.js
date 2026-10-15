import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config.js';

class ArticleDatabase {
  constructor(dbPath = CONFIG.DATABASE_PATH) {
    this.dbPath = dbPath;
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const bundledDb = path.resolve(CONFIG.ROOT_DIR, 'data/articles.db');
    if (!fs.existsSync(this.dbPath) && bundledDb !== this.dbPath && fs.existsSync(bundledDb)) {
      try {
        fs.copyFileSync(bundledDb, this.dbPath);
        console.log(`[Database] Seeded initial database to persistent disk: ${this.dbPath}`);
      } catch (e) {
        console.warn('[Database] Database seed notice:', e.message);
      }
    }
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        author TEXT,
        published_date TEXT,
        summary TEXT,
        status TEXT NOT NULL DEFAULT 'discovered',
        draft_comment TEXT,
        final_comment TEXT,
        liked INTEGER DEFAULT 0,
        commented INTEGER DEFAULT 0,
        notes TEXT,
        discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        processed_at DATETIME
      );

      CREATE INDEX IF NOT EXISTS idx_articles_url ON articles(url);
      CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);

      CREATE TABLE IF NOT EXISTS campaign (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        duration_days INTEGER NOT NULL DEFAULT 30,
        completed_days INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'idle',
        scheduled_time TEXT NOT NULL DEFAULT '09:00',
        timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
        auto_interact INTEGER NOT NULL DEFAULT 1,
        start_date TEXT,
        last_run_at TEXT,
        next_run_at TEXT,
        last_error TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL DEFAULT 'info',
        message TEXT NOT NULL,
        details TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at DESC);
    `);

    // Ensure default campaign row exists
    const row = this.db.prepare('SELECT id FROM campaign WHERE id = 1').get();
    if (!row) {
      this.db.prepare(`
        INSERT INTO campaign (id, duration_days, completed_days, status, scheduled_time, timezone, auto_interact)
        VALUES (1, @duration_days, 0, 'idle', @scheduled_time, @timezone, 1)
      `).run({
        duration_days: CONFIG.DEFAULT_CAMPAIGN_DAYS,
        scheduled_time: CONFIG.DEFAULT_SCHEDULE_TIME,
        timezone: CONFIG.DEFAULT_TIMEZONE
      });
    }
  }

  // --- Campaign Management ---

  getCampaign() {
    return this.db.prepare('SELECT * FROM campaign WHERE id = 1').get();
  }

  updateCampaign(fields) {
    const validCols = [
      'duration_days', 'completed_days', 'status', 'scheduled_time',
      'timezone', 'auto_interact', 'start_date', 'last_run_at',
      'next_run_at', 'last_error'
    ];
    const updates = [];
    const params = {};

    for (const [key, value] of Object.entries(fields)) {
      if (validCols.includes(key)) {
        updates.push(`${key} = @${key}`);
        params[key] = value;
      }
    }

    if (updates.length === 0) return;
    updates.push("updated_at = datetime('now')");

    const sql = `UPDATE campaign SET ${updates.join(', ')} WHERE id = 1`;
    return this.db.prepare(sql).run(params);
  }

  startCampaign({ durationDays, timezone, scheduledTime, autoInteract }) {
    const now = new Date().toISOString();
    return this.db.prepare(`
      UPDATE campaign
      SET duration_days = ?,
          completed_days = 0,
          status = 'running',
          timezone = ?,
          scheduled_time = ?,
          auto_interact = ?,
          start_date = ?,
          last_error = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(
      durationDays || 30,
      timezone || CONFIG.DEFAULT_TIMEZONE,
      scheduledTime || CONFIG.DEFAULT_SCHEDULE_TIME,
      autoInteract ? 1 : 0,
      now
    );
  }

  pauseCampaign() {
    return this.db.prepare(`
      UPDATE campaign
      SET status = 'paused', updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run();
  }

  resumeCampaign() {
    return this.db.prepare(`
      UPDATE campaign
      SET status = 'running', last_error = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run();
  }

  stopCampaign() {
    return this.db.prepare(`
      UPDATE campaign
      SET status = 'idle', next_run_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run();
  }

  incrementCompletedDays(nextRunAt = null) {
    return this.db.prepare(`
      UPDATE campaign
      SET completed_days = completed_days + 1,
          last_run_at = CURRENT_TIMESTAMP,
          next_run_at = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(nextRunAt);
  }

  // --- Article Tracking ---

  hasArticle(url) {
    const normalized = this.normalizeUrl(url);
    const row = this.db.prepare('SELECT id FROM articles WHERE url = ?').get(normalized);
    return Boolean(row);
  }

  saveDiscoveredArticle(article) {
    const normalizedUrl = this.normalizeUrl(article.url);
    const stmt = this.db.prepare(`
      INSERT INTO articles (url, title, author, published_date, summary, status)
      VALUES (@url, @title, @author, @published_date, @summary, 'discovered')
      ON CONFLICT(url) DO UPDATE SET
        title = coalesce(excluded.title, articles.title),
        author = coalesce(excluded.author, articles.author),
        published_date = coalesce(excluded.published_date, articles.published_date)
    `);

    return stmt.run({
      url: normalizedUrl,
      title: article.title || 'Untitled',
      author: article.author || null,
      published_date: article.publishedDate || null,
      summary: article.summary || null
    });
  }

  /**
   * Strictly fetches EXACTLY ONE eligible unprocessed article for the daily execution
   */
  getOneUnprocessedArticle() {
    return this.db.prepare(`
      SELECT * FROM articles
      WHERE status = 'discovered'
      ORDER BY id ASC
      LIMIT 1
    `).get();
  }

  getAllProcessedArticles(limit = 100, offset = 0) {
    return this.db.prepare(`
      SELECT * FROM articles
      ORDER BY 
        CASE WHEN processed_at IS NOT NULL THEN 0 ELSE 1 END,
        processed_at DESC, 
        discovered_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);
  }

  recordCompletedArticle(id, { finalComment, liked = false, commented = false, notes = '' }) {
    return this.db.prepare(`
      UPDATE articles
      SET status = 'completed',
          final_comment = ?,
          liked = ?,
          commented = ?,
          notes = ?,
          processed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(finalComment, liked ? 1 : 0, commented ? 1 : 0, notes, id);
  }

  markSkipped(id, reason = 'Skipped') {
    return this.db.prepare(`
      UPDATE articles
      SET status = 'skipped', notes = ?, processed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(reason, id);
  }

  // --- Logging Layer ---

  addLog(level, message, details = null) {
    try {
      const detailsStr = details ? (typeof details === 'object' ? JSON.stringify(details) : String(details)) : null;
      return this.db.prepare(`
        INSERT INTO logs (level, message, details)
        VALUES (?, ?, ?)
      `).run(level, message, detailsStr);
    } catch (err) {
      console.error('[DB Log Error]', err.message);
    }
  }

  getLogs(limit = 100) {
    return this.db.prepare(`
      SELECT * FROM logs
      ORDER BY id DESC
      LIMIT ?
    `).all(limit);
  }

  clearLogs() {
    return this.db.prepare('DELETE FROM logs').run();
  }

  // --- Stats Summary ---

  getStats() {
    const total = this.db.prepare('SELECT count(*) as count FROM articles').get().count;
    const discovered = this.db.prepare("SELECT count(*) as count FROM articles WHERE status = 'discovered'").get().count;
    const completed = this.db.prepare("SELECT count(*) as count FROM articles WHERE status = 'completed'").get().count;
    const skipped = this.db.prepare("SELECT count(*) as count FROM articles WHERE status = 'skipped'").get().count;
    const likedCount = this.db.prepare("SELECT count(*) as count FROM articles WHERE liked = 1").get().count;
    const commentedCount = this.db.prepare("SELECT count(*) as count FROM articles WHERE commented = 1").get().count;
    return { total, discovered, completed, skipped, likedCount, commentedCount };
  }

  normalizeUrl(rawUrl) {
    if (!rawUrl) return '';
    try {
      const parsed = new URL(rawUrl, CONFIG.BASE_URL);
      return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
    } catch {
      return rawUrl.trim().replace(/\/+$/, '');
    }
  }

  close() {
    this.db.close();
  }
}

export const articleDb = new ArticleDatabase();
