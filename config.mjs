/**
 * CloudFreed Configuration
 * Centralized configuration for bypass behavior, timeouts, stealth features, and caching
 */

export default {
  // Retry configuration for failed bypass attempts
  retry: {
    maxAttempts: 3,
    baseDelay: 1000,        // 1 second initial delay
    maxDelay: 10000,        // 10 seconds max delay
    exponentialFactor: 2    // Double delay each retry
  },

  // Timeout settings for various operations
  timeout: {
    challenge: 30000,       // 30 seconds for challenge solving
    navigation: 10000,      // 10 seconds for page navigation
    websocket: 5000,        // 5 seconds for WebSocket connections
    endpoint: 10000         // 10 seconds for endpoint checks
  },

  // Stealth and evasion features
  stealth: {
    enabled: true,
    randomizeFingerprint: true,
    randomizeViewport: true,
    hideChromeObjects: true,
    spoofWebGL: true,
    preventWebRTC: true
  },

  // Cookie caching configuration
  cache: {
    enabled: true,
    ttl: 3600000,           // 1 hour default (in milliseconds)
    database: 'cloudfreed.db',
    cleanupOnStartup: true
  },

  // Chrome instance management
  chrome: {
    cleanup: {
      enabled: true,
      maxAge: 300000,       // 5 minutes (in milliseconds)
      onStartup: true,
      onExit: true
    },
    args: {
      windowSize: '1024,1024',
      disableGpu: true,
      disableDevShmUsage: true,
      noFirstRun: true
    }
  },

  // Human behavior simulation
  humanBehavior: {
    mouseMovement: {
      enabled: true,
      curvePoints: 10,      // Number of points in bezier curve
      variance: 5           // Pixel variance for click position
    },
    delays: {
      minClickDelay: 50,
      maxClickDelay: 200,
      minHoverDelay: 100,
      maxHoverDelay: 300
    }
  }
};
