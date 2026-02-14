## V2.1.0 - MOST EFFECTIVE CLOUDFLARE BYPASS AVAILABLE

**NEW IN V2.1.0:**
- 🎯 **Cookie Caching**: Automatic cookie persistence with SQLite (1 hour TTL)
- 🤖 **Stealth Mode**: Advanced fingerprint randomization & evasion techniques
- 🔄 **Retry Logic**: Exponential backoff with configurable attempts (default: 3)
- 🖱️ **Human Simulation**: Bezier curve mouse movement & realistic behavior
- ⏱️ **Timeout Handling**: Configurable timeouts for reliable operation
- 🧹 **Auto Cleanup**: Prevents zombie Chrome processes & memory leaks
- 📊 **Cache Stats**: Monitor cache performance & usage

## STATUS: Active - V2.1.0

Updates are on the way!
V2.1.0 Just released - Enhanced bypass effectiveness with advanced stealth features.
Please report any errors in Issues.

## Notice
If you like the repo, please consider starring it, starring repos will help it spread.
CloudFreed is 100% Free, CloudFreed can stop working at any time.

## Introduction
<div style="text-align:center;">
  <img src="html/CloudFreed.png" alt="CloudFreed Logo" width="48" style="float:left; margin-right:10px;">
  <h1>CloudFreed v2.1.0</h1>

  [Join the CloudFreed Server](https://discord.gg/8F852cXVbX)
</div>

CloudFreed is a powerful tool designed to bypass Cloudflare anti-bot protection, allowing users to access websites without being restricted by captchas or Cloudflare's security measures.

**Key Features:**
- ✅ Advanced stealth mode with fingerprint randomization
- ✅ Automatic cookie caching for faster subsequent requests  
- ✅ Human-like mouse movement simulation
- ✅ Intelligent retry logic with exponential backoff
- ✅ Configurable timeouts and options
- ✅ Memory leak prevention with auto-cleanup
- ✅ Support for multiple Cloudflare challenge types

## Installation
Before using CloudFreed, ensure that you have Node.js installed on your system. If not, you can download and install it from [Node.js website](https://nodejs.org/).

Once Node.js is installed, follow these steps to set up CloudFreed:

1. Clone or download the CloudFreed repository to your local machine, you can get the latest download [here](https://github.com/Akmal-CloudFreed/CloudFreed-CloudFlare-bypass/archive/refs/heads/main.zip).
2. Extract the file.
3. Open a terminal and navigate to the directory where you have cloned/downloaded CloudFreed.
4. Run the following command to install dependencies:

    ```bash
    npm install
    ```
    alternatively, you can use:
    ```bash
    npm i
    ```

## Usage

CloudFreed v2.1.0 provides an enhanced API with new configuration options and features.

### Basic Usage

```javascript
import CloudFreed from "./index.js";

// Create instance with default settings
const cloudFreed = new CloudFreed();

// Start the browser
const instance = await cloudFreed.start(false); // false = visible browser

if (instance.success) {
  // Solve Cloudflare challenge
  const result = await instance.SolveTurnstile("https://example.com");
  
  if (result.success) {
    console.log("Cookie:", result.cfClearance);
    console.log("Cookie Header:", result.cfClearanceHeader);
  }
  
  // Clean up
  await instance.Close();
}
```

### Advanced Configuration

```javascript
const cloudFreed = new CloudFreed({
  disableCache: false,        // Enable cookie caching (default: false)
  disableStealth: false,      // Enable stealth mode (default: false)
  cacheTTL: 3600000,          // Cache TTL in ms (default: 1 hour)
  retryAttempts: 3,           // Max retry attempts (default: 3)
  timeout: 30000              // Challenge timeout in ms (default: 30s)
});
```

### Cookie Caching

The enhanced v2.1.0 automatically caches `cf_clearance` cookies:

```javascript
const instance = await cloudFreed.start();

// First request - solves challenge and caches cookie
const result1 = await instance.SolveTurnstile("https://example.com");

// Second request - uses cached cookie (instant!)
const result2 = await instance.SolveTurnstile("https://example.com");
console.log("Using cached cookie:", result2.cached); // true

// Get cache statistics
const stats = await instance.GetCacheStats();
console.log(stats.stats);

// Clear cache if needed
await instance.ClearCache();
```

### Error Handling

V2.1.0 provides detailed error types for better handling:

```javascript
const result = await instance.SolveTurnstile(url);

if (!result.success) {
  switch (result.errorType) {
    case 'TIMEOUT':
      console.log("Challenge timed out - retry recommended");
      break;
    case 'TOO_MANY_CHALLENGES':
      console.log("IP may be blocked - use different proxy");
      break;
    case 'COOKIE_NOT_FOUND':
      console.log("Cookie extraction failed - retry");
      break;
    default:
      console.log("Error:", result.errormessage);
  }
}
```

### Using with Puppeteer

```javascript
import puppeteer from "puppeteer";

const instance = await cloudFreed.start();
const result = await instance.SolveTurnstile(url);

if (result.success) {
  const browser = await puppeteer.launch({
    args: [`--user-agent=${instance.userAgent}`]
  });
  
  const page = await browser.newPage();
  
  // Set the cookie
  await page.setCookie(result.cfClearance);
  
  // Access protected page
  await page.goto(url);
}
```

### Configuration File

Customize default behavior in `config.js`:

```javascript
export default {
  retry: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    exponentialFactor: 2
  },
  timeout: {
    challenge: 30000,
    navigation: 10000
  },
  cache: {
    enabled: true,
    ttl: 3600000  // 1 hour
  },
  stealth: {
    enabled: true,
    randomizeFingerprint: true
  }
};
```

## Example

A complete example is available in `example.js`:

```bash
node example.js
```

## API Reference

### Constructor Options
- `disableCache` (boolean): Disable cookie caching
- `disableStealth` (boolean): Disable stealth mode
- `cacheTTL` (number): Cache time-to-live in milliseconds
- `retryAttempts` (number): Maximum retry attempts
- `timeout` (number): Challenge timeout in milliseconds

### Instance Methods
- `start(headless, userAgent)`: Start CloudFreed browser
- `SolveTurnstile(url)`: Solve Cloudflare challenge for URL
- `GetCachedCookie(url)`: Get cached cookie for URL
- `ClearCache()`: Clear all cached cookies
- `GetCacheStats()`: Get cache usage statistics  
- `Close()`: Close CloudFreed and cleanup

## Troubleshooting

**Issue: "Chrome is not installed"**
- Make sure Google Chrome is installed on your system
- Check the attempted path in error message

**Issue: "WebSocket connection timeout"**
- Increase timeout in config.js
- Check firewall/antivirus settings

**Issue: "Too many challenge attempts"**
- Your IP may be blocked by Cloudflare
- Try using a different proxy
- Wait before retrying

**Issue: "Memory usage increasing"**
- Auto-cleanup is enabled by default
- Manually call `Close()` when done
- Check for zombie Chrome processes

## Performance Tips

1. **Enable Cookie Caching**: Reuse cookies for same domains (enabled by default)
2. **Use Stealth Mode**: Reduces detection (enabled by default)
3. **Configure Retry Logic**: Adjust based on your use case
4. **Monitor Cache Stats**: Use `GetCacheStats()` to optimize TTL
5. **Proper Cleanup**: Always call `Close()` when finished

## Contribution

Suggestions and pull requests are welcomed!

## Support the project

Supporting the project will most likely contribute to the creation of newer versions, and maybe even newer projects!
Please consider donating if you like the project.

[Support me at ko-fi.com](https://ko-fi.com/akmal2)

---

## Note
CloudFreed is intended for educational and research purposes only. Please use it responsibly and respect the terms of service of the websites you visit.
