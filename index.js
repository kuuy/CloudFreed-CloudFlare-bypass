/**
 * CloudFreed - Enhanced Cloudflare bypass with cookie caching, stealth mode, and retry logic
 * Version: 2.1.0
 */

import ValidateURL from "./lib/ValidateURL.js";
import GetDefaultChromePath from "./lib/GetDefaultChromePath.js";
import GetHomeDirectory from "./lib/GetHomeDirectory.js";
import delay from "./lib/delay.js";
import DeleteTempUserDataFolders from "./lib/DeleteTempUserDataFolders.js";
import FindAvailablePort from "./lib/FindAvailablePort.js";
import CheckDebuggingEndpoint from "./lib/CheckDebuggingEndpoint.js";
import WebSocketManager from "./lib/WebSocketManager.js";
import KillProcess from "./lib/KillProcess.js";
import CookieCache from "./lib/CookieCache.js";
import StealthManager from "./lib/StealthManager.js";
import ChromeCleanup from "./lib/ChromeCleanup.js";
import WebSocket from "ws";
import fs from "fs/promises";
import { homedir } from 'os';
import { spawn } from "child_process";
import path from 'path';
import { fileURLToPath } from 'url';
import config from "./config.js";

var __dirname = path.dirname(fileURLToPath(import.meta.url));

class CloudFreed {
  constructor(options = {}) {
    this.chromium = GetDefaultChromePath();
    this.homedir = GetHomeDirectory();
    this.started = false;
    this.closed = false;
    this.PID = null;
    this.websocket = null;
    this.UserAgent = null;

    // Cookie cache
    this.cookieCache = options.disableCache ? null : new CookieCache(
      options.cacheDb || config.cache.database
    );

    // Stealth manager
    this.stealthManager = options.disableStealth ? null : new StealthManager();

    // Chrome cleanup
    this.chromeCleanup = new ChromeCleanup({
      dataDir: path.join(this.homedir, 'CloudFreed', 'DataDirs')
    });

    // Options
    this.options = {
      enableCache: !options.disableCache && config.cache.enabled,
      enableStealth: !options.disableStealth && config.stealth.enabled,
      cacheTTL: options.cacheTTL || config.cache.ttl,
      retryAttempts: options.retryAttempts || config.retry.maxAttempts,
      timeout: options.timeout || config.timeout.challenge
    };

    // Setup cleanup handlers
    this.setupCleanupHandlers();
  }

  /**
   * Setup process exit handlers for cleanup
   */
  setupCleanupHandlers() {
    const cleanup = async () => {
      await this.Close();
      if (this.cookieCache) {
        await this.cookieCache.close();
      }
    };

    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('uncaughtException', cleanup);
  }

  /**
   * Start CloudFreed browser instance
   */
  async start(headless = true, userAgent = null) {
    let chromeProcess;

    try {
      if (this.started) {
        return {
          success: false,
          code: 400,
          errormessage: "CloudFreed is already running."
        };
      }

      // Check if OS is supported
      if (this.chromium === null && this.homedir === null) {
        return {
          success: false,
          code: 500,
          errormessage: "Unsupported OS. Please use darwin, linux, or windows."
        };
      }

      // Check if Chrome is installed
      try {
        await fs.access(this.chromium);
      } catch (error) {
        return {
          success: false,
          code: 500,
          errormessage: "Google Chrome is not installed. Please install Google Chrome.\nAttempted path: " + this.chromium
        };
      }

      // Initialize cookie cache if enabled
      if (this.cookieCache) {
        await this.cookieCache.init();
        if (config.cache.cleanupOnStartup) {
          await this.cookieCache.cleanup();
        }
      }

      // Run Chrome cleanup if enabled
      if (config.chrome.cleanup.enabled && config.chrome.cleanup.onStartup) {
        await this.chromeCleanup.cleanup();
      }

      const cloudflareBypassDir = path.join(this.homedir, 'CloudFreed');

      // Delete temporary user data folders
      await DeleteTempUserDataFolders(path.join(cloudflareBypassDir, 'DataDirs'));

      // Find an available port
      const port = await FindAvailablePort(10000, 60000);
      const dataDir = path.join(cloudflareBypassDir, 'DataDirs', `CloudFreed_${Date.now()}`);

      // Get viewport from stealth manager if enabled
      const viewport = this.stealthManager ? this.stealthManager.getRandomViewport() : { width: 1024, height: 1024 };

      // Configure Chrome arguments
      const chromeArgs = [
        `--user-data-dir=${dataDir}`,
        `--window-size=${viewport.width},${viewport.height}`,
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-first-run',
        `--remote-debugging-port=${port}`,
        `--window-name=CloudFreed`,
        '--allow-file-access-from-files',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        `file:///${path.join(__dirname, "html", "CloudFreed.html")}`,
      ];

      // Use stealth user agent or provided one
      if (typeof userAgent === "string") {
        chromeArgs.push(`--user-agent="${userAgent}"`);
        this.UserAgent = userAgent;
      } else if (this.stealthManager) {
        const stealthUA = this.stealthManager.getRandomUserAgent();
        chromeArgs.push(`--user-agent="${stealthUA}"`);
        this.UserAgent = stealthUA;
      }

      // Launch Chrome
      chromeProcess = spawn(this.chromium, chromeArgs, {
        detached: true,
        stdio: 'ignore',
        windowsHide: headless
      });

      this.PID = chromeProcess.pid;
      this.started = true;

      chromeProcess.unref();

      // Fetch Chrome version information with retry
      let versionInfo = null;
      for (let i = 0; i < 10; i++) {
        versionInfo = await CheckDebuggingEndpoint(port);
        if (versionInfo) break;
        await delay(500);
      }

      if (versionInfo === null) {
        await KillProcess(this.PID);
        return {
          success: false,
          code: 500,
          errormessage: "Failed to connect to Chrome debugging endpoint."
        };
      }

      // Establish WebSocket connection
      if (versionInfo['webSocketDebuggerUrl']) {
        const webSocketDebuggerUrl = versionInfo['webSocketDebuggerUrl'];

        if (!this.UserAgent) {
          this.UserAgent = versionInfo['User-Agent'];
        }

        this.websocket = new WebSocket(webSocketDebuggerUrl);

        // Wait for WebSocket to open
        await new Promise((resolve, reject) => {
          this.websocket.on('open', resolve);
          this.websocket.on('error', reject);
          setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
        });

        // Inject stealth scripts if enabled
        if (this.stealthManager && config.stealth.enabled) {
          // We'll inject stealth on each page navigation
        }

        return {
          success: true,
          code: 200,
          userAgent: this.UserAgent,
          webSocketDebuggerUrl,
          SolveTurnstile: async (url) => {
            return await this.SolveTurnstile(url);
          },
          GetCachedCookie: async (url) => {
            return await this.getCachedCookie(url);
          },
          ClearCache: async () => {
            return await this.clearCache();
          },
          GetCacheStats: async () => {
            return await this.getCacheStats();
          },
          Close: async () => {
            return await this.Close();
          }
        };
      }
    } catch (error) {
      if (chromeProcess) {
        await KillProcess(chromeProcess.pid);
        chromeProcess.kill();
      }

      return {
        success: false,
        code: 500,
        error,
        errormessage: "Error starting CloudFreed: " + error.message
      };
    }
  }

  /**
   * Get cached cookie for URL (if available)
   */
  async getCachedCookie(url) {
    if (!this.cookieCache || !this.options.enableCache) {
      return null;
    }

    try {
      url = ValidateURL(url);
      const urlObj = new URL(url);
      const domain = urlObj.hostname;

      const cookie = await this.cookieCache.get(domain);
      return cookie;
    } catch (error) {
      console.error('Error getting cached cookie:', error);
      return null;
    }
  }

  /**
   * Solve Turnstile challenge with retry logic and cookie caching
   */
  async SolveTurnstile(url) {
    url = ValidateURL(url);
    const urlObj = new URL(url);
    const domain = urlObj.hostname;

    // Check cache first
    if (this.cookieCache && this.options.enableCache) {
      const cachedCookie = await this.cookieCache.get(domain);
      if (cachedCookie) {
        console.log('Using cached cookie for', domain);
        return {
          success: true,
          code: 200,
          cached: true,
          cfClearance: cachedCookie,
          cfClearanceHeader: `${cachedCookie.name}=${cachedCookie.value};`
        };
      }
    }

    // Attempt to solve with retry logic
    let lastError = null;
    let attempts = 0;

    while (attempts < this.options.retryAttempts) {
      attempts++;
      console.log(`Solving ${url} (attempt ${attempts}/${this.options.retryAttempts})`);

      try {
        const response = await WebSocketManager(
          this.websocket,
          url,
          `file:///${path.join(__dirname, "html", "Loading.html")}`,
          {
            timeout: this.options.timeout,
            maxChallengeAttempts: 5
          }
        );

        if (response.success) {
          // Cache the cookie if enabled
          if (this.cookieCache && this.options.enableCache && response.cfClearance) {
            try {
              await this.cookieCache.set(response.cfClearance, this.options.cacheTTL);
              console.log('Cached cookie for', domain);
            } catch (error) {
              console.error('Error caching cookie:', error);
            }
          }

          await delay(1000);
          return response;
        }

        lastError = response;

        // Check if we should retry based on error type
        if (response.errorType === 'TOO_MANY_CHALLENGES' ||
          response.errorType === 'TIMEOUT') {
          // These errors benefit from retry
          if (attempts < this.options.retryAttempts) {
            const backoffDelay = Math.min(
              config.retry.baseDelay * Math.pow(config.retry.exponentialFactor, attempts - 1),
              config.retry.maxDelay
            );
            console.log(`Retrying after ${backoffDelay}ms...`);
            await delay(backoffDelay);
            continue;
          }
        } else {
          // Other errors don't benefit from retry
          break;
        }

      } catch (error) {
        lastError = {
          success: false,
          code: 500,
          error,
          errormessage: error.message
        };

        if (attempts < this.options.retryAttempts) {
          const backoffDelay = Math.min(
            config.retry.baseDelay * Math.pow(config.retry.exponentialFactor, attempts - 1),
            config.retry.maxDelay
          );
          await delay(backoffDelay);
        }
      }
    }

    return lastError || {
      success: false,
      code: 500,
      errormessage: "Failed to solve challenge after all retry attempts."
    };
  }

  /**
   * Clear cookie cache
   */
  async clearCache() {
    if (this.cookieCache) {
      await this.cookieCache.clear();
      return { success: true, message: "Cache cleared" };
    }
    return { success: false, message: "Cache not enabled" };
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    if (this.cookieCache) {
      const stats = await this.cookieCache.getStats();
      return { success: true, stats };
    }
    return { success: false, message: "Cache not enabled" };
  }

  /**
   * Close CloudFreed instance
   */
  async Close() {
    try {
      if (this.closed === false) {
        // Close the WebSocket connection
        if (this.websocket) {
          this.websocket.close();
          this.websocket = null;
        }

        // Kill the Chrome process
        if (this.PID) {
          await KillProcess(this.PID);
          this.PID = null;
        }

        // Close cookie cache
        if (this.cookieCache) {
          await this.cookieCache.close();
        }

        this.closed = true;
        this.started = false;

        return {
          success: true,
          code: 200
        };
      } else {
        return {
          success: false,
          code: 400,
          errormessage: "CloudFreed already closed."
        };
      }
    } catch (error) {
      return {
        success: false,
        code: 500,
        errormessage: "Error occurred while closing: " + error.message
      };
    }
  }
}

export default CloudFreed;