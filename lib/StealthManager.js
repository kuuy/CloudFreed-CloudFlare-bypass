/**
 * StealthManager - Browser fingerprint randomization and evasion
 * Injects scripts to modify browser fingerprints and evade detection
 */

import { randomInt, randomFloat, randomViewport, randomTimezone, randomLocale } from './RandomUtils.js';

class StealthManager {
  constructor() {
    this.fingerprint = this.generateFingerprint();
  }

  /**
   * Generate a consistent random fingerprint for this session
   */
  generateFingerprint() {
    const viewport = randomViewport();

    return {
      viewport,
      timezone: randomTimezone(),
      locale: randomLocale(),
      canvas: {
        noise: randomFloat(0.0001, 0.001),
        r: randomInt(0, 10),
        g: randomInt(0, 10),
        b: randomInt(0, 10)
      },
      webgl: {
        vendor: 'Google Inc.',
        renderer: `ANGLE (Intel, ${this.getRandomGPU()}, OpenGL 4.1)`
      },
      audio: {
        noise: randomFloat(0.00001, 0.0001)
      },
      screen: {
        width: viewport.width,
        height: viewport.height,
        availWidth: viewport.width,
        availHeight: viewport.height - randomInt(40, 80),
        colorDepth: 24,
        pixelDepth: 24
      }
    };
  }

  /**
   * Get random GPU model
   */
  getRandomGPU() {
    const gpus = [
      'Intel(R) UHD Graphics 620',
      'Intel(R) Iris(TM) Plus Graphics 640',
      'Intel(R) HD Graphics 630',
      'NVIDIA GeForce GTX 1050',
      'NVIDIA GeForce MX150',
      'AMD Radeon Pro 555'
    ];

    return gpus[randomInt(0, gpus.length - 1)];
  }

  /**
   * Get stealth injection script
   * This script modifies browser APIs to avoid detection
   */
  getStealthScript() {
    const fp = this.fingerprint;

    return `
    (function() {
      'use strict';
      
      // Override navigator properties
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
      
      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
      
      // Canvas fingerprint randomization
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      const originalToBlob = HTMLCanvasElement.prototype.toBlob;
      const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
      
      const noise = ${fp.canvas.noise};
      const r = ${fp.canvas.r};
      const g = ${fp.canvas.g};
      const b = ${fp.canvas.b};
      
      function addNoise(canvas, context) {
        if (!context) return;
        const imageData = originalGetImageData.apply(context, [0, 0, canvas.width, canvas.height]);
        for (let i = 0; i < imageData.data.length; i += 4) {
          imageData.data[i] += r;
          imageData.data[i + 1] += g;
          imageData.data[i + 2] += b;
        }
        context.putImageData(imageData, 0, 0);
      }
      
      HTMLCanvasElement.prototype.toDataURL = function() {
        const context = this.getContext('2d');
        addNoise(this, context);
        return originalToDataURL.apply(this, arguments);
      };
      
      HTMLCanvasElement.prototype.toBlob = function() {
        const context = this.getContext('2d');
        addNoise(this, context);
        return originalToBlob.apply(this, arguments);
      };
      
      // WebGL fingerprint spoofing
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) {
          return '${fp.webgl.vendor}';
        }
        if (parameter === 37446) {
          return '${fp.webgl.renderer}';
        }
        return getParameter.apply(this, arguments);
      };
      
      // Audio context fingerprint randomization
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        const originalCreateOscillator = AudioContext.prototype.createOscillator;
        AudioContext.prototype.createOscillator = function() {
          const oscillator = originalCreateOscillator.apply(this, arguments);
          const originalStart = oscillator.start;
          oscillator.start = function() {
            oscillator.frequency.value += ${fp.audio.noise};
            return originalStart.apply(this, arguments);
          };
          return oscillator;
        };
      }
      
      // WebRTC leak prevention
      const originalRTCPeerConnection = window.RTCPeerConnection;
      window.RTCPeerConnection = function(...args) {
        if (args[0] && args[0].iceServers) {
          args[0].iceServers = [];
        }
        return new originalRTCPeerConnection(...args);
      };
      
      // Screen properties
      Object.defineProperties(screen, {
        width: { get: () => ${fp.screen.width} },
        height: { get: () => ${fp.screen.height} },
        availWidth: { get: () => ${fp.screen.availWidth} },
        availHeight: { get: () => ${fp.screen.availHeight} },
        colorDepth: { get: () => ${fp.screen.colorDepth} },
        pixelDepth: { get: () => ${fp.screen.pixelDepth} }
      });
      
      // Plugin enumeration blocking
      Object.defineProperty(navigator, 'plugins', {
        get: () => []
      });
      
      // Battery API spoofing
      if (navigator.getBattery) {
        const originalGetBattery = navigator.getBattery;
        navigator.getBattery = function() {
          return originalGetBattery.apply(this, arguments).then(battery => {
            Object.defineProperties(battery, {
              charging: { get: () => true },
              chargingTime: { get: () => 0 },
              dischargingTime: { get: () => Infinity },
              level: { get: () => 1 }
            });
            return battery;
          });
        };
      }
      
      // Chrome runtime detection
      if (window.chrome) {
        delete window.chrome.runtime;
      }
      
      // Console.debug override
      const originalDebug = console.debug;
      console.debug = function(...args) {
        if (args[0] && typeof args[0] === 'string' && args[0].includes('DevTools')) {
          return;
        }
        return originalDebug.apply(this, args);
      };
      
    })();
    `;
  }

  /**
   * Inject stealth scripts into Chrome session
   */
  async injectStealthScripts(websocket, sessionId) {
    const script = this.getStealthScript();

    return new Promise((resolve, reject) => {
      // Enable page domain
      websocket.send(JSON.stringify({
        id: 100,
        method: 'Page.enable',
        sessionId
      }));

      // Add script to evaluate on new document
      websocket.send(JSON.stringify({
        id: 101,
        method: 'Page.addScriptToEvaluateOnNewDocument',
        params: {
          source: script
        },
        sessionId
      }));

      resolve();
    });
  }

  /**
   * Get random viewport size
   */
  getRandomViewport() {
    return this.fingerprint.viewport;
  }

  /**
   * Get random user agent matching the fingerprint
   */
  getRandomUserAgent() {
    // This should match Chrome version being used
    // For now, return a generic recent Chrome UA
    const chromeVersion = randomInt(120, 123);
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion}.0.0.0 Safari/537.36`;
  }
}

export default StealthManager;
