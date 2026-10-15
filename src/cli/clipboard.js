import { spawn } from 'child_process';

/**
 * Copies text to system clipboard (supports macOS pbcopy, Windows clip, Linux xclip/wl-copy)
 * @param {string} text 
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
  return new Promise((resolve) => {
    let command;
    let args = [];

    if (process.platform === 'darwin') {
      command = 'pbcopy';
    } else if (process.platform === 'win32') {
      command = 'clip';
    } else {
      command = 'xclip';
      args = ['-selection', 'clipboard'];
    }

    try {
      const proc = spawn(command, args);
      proc.on('error', () => {
        resolve(false);
      });
      proc.on('close', (code) => {
        resolve(code === 0);
      });
      proc.stdin.write(text);
      proc.stdin.end();
    } catch {
      resolve(false);
    }
  });
}
