import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const PROFILE_DIR = path.resolve(ROOT_DIR, '.browser_profile');
const ZIP_PATH = path.resolve(ROOT_DIR, 'data/auth_profile.zip');

if (!fs.existsSync(PROFILE_DIR)) {
  console.error('❌ .browser_profile directory not found. Please log in first via npm start or npm run auth.');
  process.exit(1);
}

console.log('📦 Packaging authenticated session into lightweight archive...');

// Python zip packaging focusing on authentication tokens and storage
const pythonScript = `
import zipfile, os

profile_dir = "${PROFILE_DIR}"
zip_path = "${ZIP_PATH}"

if os.path.exists(zip_path):
    os.remove(zip_path)

with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(profile_dir):
        # Exclude telemetry, logs, and caches
        dirs[:] = [d for d in dirs if d not in ["Cache", "Code Cache", "GPUCache", "DawnGraphiteCache", "DawnWebGPUCache", "Crashpad", "metrics"]]
        for f in files:
            if f.startswith("Singleton") or f == "RunningChromeVersion" or f.endswith(".pma") or f.endswith(".log"):
                continue
            p = os.path.join(root, f)
            rel = os.path.relpath(p, profile_dir)
            if any(k in rel for k in ["Cookies", "Local Storage", "Session Storage", "Preferences", "Network"]):
                try:
                    if not os.path.islink(p):
                        z.write(p, rel)
                except Exception:
                    pass

print(os.path.getsize(zip_path))
`;

try {
  const size = execSync(`python3 -c '${pythonScript}'`).toString().trim();
  console.log(`✅ Session archive created (${size} bytes).`);

  const zipData = fs.readFileSync(ZIP_PATH);
  const base64Data = zipData.toString('base64');
  console.log(`🔐 Base64 encoded payload size: ${base64Data.length} chars (GitHub Limit: 64,000).`);

  // Clean up local zip
  if (fs.existsSync(ZIP_PATH)) {
    fs.unlinkSync(ZIP_PATH);
  }

  // Set GitHub Secret via gh CLI
  console.log('🚀 Uploading encrypted secret to GitHub Actions (Yashrathore05/AWS_Automate)...');
  execSync(`gh secret set BROWSER_PROFILE_ZIP_B64 -R Yashrathore05/AWS_Automate`, {
    input: base64Data,
    stdio: ['pipe', 'inherit', 'inherit']
  });

  console.log('\n🎉 SUCCESS! Authenticated AWS session has been synced to your GitHub repository.');
  console.log('GitHub Actions can now run your daily automation 100% autonomously at 09:00 AM IST every day!');

} catch (err) {
  console.error('❌ Failed to sync session to GitHub:', err.message);
  process.exit(1);
}
