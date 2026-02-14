/**
 * ChromeCleanup - Cleanup zombie Chrome processes and stale data directories
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

class ChromeCleanup {
  constructor(options = {}) {
    this.maxAge = options.maxAge || 300000; // 5 minutes default
    this.dataDir = options.dataDir || path.join(os.homedir(), 'CloudFreed', 'DataDirs');
  }

  /**
   * Find and kill orphaned Chrome processes by window name
   */
  async killOrphanedProcesses() {
    const platform = process.platform;

    try {
      if (platform === 'win32') {
        // Windows: Find processes with CloudFreed window name
        const { stdout } = await execAsync('tasklist /FI "WINDOWTITLE eq CloudFreed" /FO CSV /NH');
        const lines = stdout.split('\n').filter(line => line.includes('chrome.exe'));

        for (const line of lines) {
          const match = line.match(/"(\d+)"/);
          if (match) {
            const pid = match[1];
            try {
              await execAsync(`taskkill /PID ${pid} /F`);
              console.log(`Killed orphaned Chrome process: ${pid}`);
            } catch (e) {
              // Process might have already exited
            }
          }
        }
      } else if (platform === 'darwin') {
        // macOS: Find Chrome processes older than maxAge
        const { stdout } = await execAsync('ps aux | grep "[C]hrome.*--window-name=CloudFreed"');
        const lines = stdout.split('\n').filter(line => line.trim());

        for (const line of lines) {
          const parts = line.split(/\s+/);
          if (parts.length >= 2) {
            const pid = parts[1];
            try {
              await execAsync(`kill -9 ${pid}`);
              console.log(`Killed orphaned Chrome process: ${pid}`);
            } catch (e) {
              // Process might have already exited
            }
          }
        }
      } else if (platform === 'linux') {
        // Linux: Find Chrome processes with CloudFreed window name
        const { stdout } = await execAsync('ps aux | grep "[c]hrome.*--window-name=CloudFreed"');
        const lines = stdout.split('\n').filter(line => line.trim());

        for (const line of lines) {
          const parts = line.split(/\s+/);
          if (parts.length >= 2) {
            const pid = parts[1];
            try {
              await execAsync(`kill -9 ${pid}`);
              console.log(`Killed orphaned Chrome process: ${pid}`);
            } catch (e) {
              // Process might have already exited
            }
          }
        }
      }
    } catch (error) {
      // No orphaned processes found or error occurred
      console.debug('ChromeCleanup: No orphaned processes found or error:', error.message);
    }
  }

  /**
   * Clean up old data directories
   */
  async cleanupDataDirs() {
    try {
      // Check if directory exists
      try {
        await fs.access(this.dataDir);
      } catch {
        // Directory doesn't exist, nothing to clean
        return;
      }

      const entries = await fs.readdir(this.dataDir, { withFileTypes: true });
      const now = Date.now();

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('CloudFreed_')) {
          const dirPath = path.join(this.dataDir, entry.name);

          try {
            const stats = await fs.stat(dirPath);
            const age = now - stats.mtimeMs;

            // Remove directories older than maxAge
            if (age > this.maxAge) {
              await fs.rm(dirPath, { recursive: true, force: true });
              console.log(`Cleaned up old data directory: ${entry.name}`);
            }
          } catch (error) {
            console.debug(`Error cleaning directory ${entry.name}:`, error.message);
          }
        }
      }
    } catch (error) {
      console.debug('ChromeCleanup: Error cleaning data directories:', error.message);
    }
  }

  /**
   * Remove stale lock files
   */
  async removeStaleLocks() {
    try {
      const lockFile = path.join(this.dataDir, 'SingletonLock');
      await fs.unlink(lockFile);
      console.log('Removed stale lock file');
    } catch {
      // Lock file doesn't exist or already removed
    }
  }

  /**
   * Execute full cleanup
   */
  async cleanup() {
    console.log('ChromeCleanup: Starting cleanup...');
    await this.killOrphanedProcesses();
    await this.cleanupDataDirs();
    await this.removeStaleLocks();
    console.log('ChromeCleanup: Cleanup complete');
  }
}

export default ChromeCleanup;
