import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

export const CONFIG = {
  ROOT_DIR,
  PORT: parseInt(process.env.PORT || '3000', 10),
  BASE_URL: process.env.AWS_BUILDER_BASE_URL || 'https://builder.aws.com/',
  BROWSER_PROFILE_DIR: path.resolve(ROOT_DIR, process.env.BROWSER_PROFILE_DIR || '.browser_profile'),
  DATABASE_PATH: path.resolve(ROOT_DIR, process.env.DATABASE_PATH || 'data/articles.db'),
  HEADLESS: process.env.HEADLESS === 'true', // Defaults to false in persistent context if not set
  DEFAULT_TIMEZONE: process.env.TIMEZONE || 'Asia/Kolkata',
  DEFAULT_SCHEDULE_TIME: process.env.SCHEDULE_TIME || '09:00', // HH:mm
  DEFAULT_CAMPAIGN_DAYS: 30,
  NAVIGATION_TIMEOUT_MS: 45000,
  ACTION_TIMEOUT_MS: 15000,
  MAX_ARTICLES_PER_RUN: 1, // Strict requirement: exactly 1 article per scheduled day
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || ''
};
