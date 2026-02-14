/**
 * CloudFreed v2.1.0 - Enhanced Example
 * Demonstrates cookie caching, retry logic, and new features
 */

import CloudFreed from "./index.js";
import puppeteer from "puppeteer";

async function main() {
  // Create CloudFreed instance with optional configuration
  const cloudFreed = new CloudFreed({
    // Optional: disable cookie caching
    // disableCache: false,

    // Optional: disable stealth mode
    // disableStealth: false,

    // Optional: custom cache TTL (default: 1 hour)
    // cacheTTL: 3600000,

    // Optional: custom retry attempts (default: 3)
    // retryAttempts: 3,

    // Optional: custom timeout (default: 30000ms)
    // timeout: 30000
  });

  // Start the CloudFreed instance
  console.log("Starting CloudFreed...");
  const instance = await cloudFreed.start(false); // false = visible browser

  if (!instance.success) {
    console.error("Failed to start CloudFreed:", instance.errormessage);
    return;
  }

  console.log("CloudFreed started successfully!");
  console.log("User Agent:", instance.userAgent);

  // Test URL with Cloudflare protection
  const testUrl = "https://www.coinbase.com/password_resets/new/?visible_recaptcha=true";

  // Check for cached cookie first (optional)
  const cached = await instance.GetCachedCookie(testUrl);
  if (cached) {
    console.log("Found cached cookie:", cached);
  }

  // Solve Turnstile challenge
  console.log("\nSolving Turnstile challenge...");
  const result = await instance.SolveTurnstile(testUrl);

  if (result.success) {
    console.log("\n✅ Challenge solved successfully!");
    console.log("Cached:", result.cached || false);
    console.log("Cookie:", result.cfClearance);
    console.log("Cookie Header:", result.cfClearanceHeader);

    // Get cache statistics
    const stats = await instance.GetCacheStats();
    if (stats.success) {
      console.log("\nCache Stats:", stats.stats);
    }

    // Use the cookie with Puppeteer
    console.log("\nTesting cookie with Puppeteer...");
    const browser = await puppeteer.launch({
      headless: false,
      args: [`--user-agent=${instance.userAgent}`]
    });

    const page = await browser.newPage();

    // Set the cf_clearance cookie
    await page.setCookie({
      name: result.cfClearance.name,
      value: result.cfClearance.value,
      domain: result.cfClearance.domain,
      path: result.cfClearance.path || '/',
      httpOnly: result.cfClearance.httpOnly || false,
      secure: result.cfClearance.secure || false
    });

    // Navigate to the protected page
    await page.goto(testUrl);

    console.log("✅ Successfully accessed protected page with cookie!");

    // Wait a bit to see the result
    await new Promise(resolve => setTimeout(resolve, 5000));

    await browser.close();
  } else {
    console.error("\n❌ Failed to solve challenge:");
    console.error("Error Type:", result.errorType);
    console.error("Message:", result.errormessage);
  }

  // Clean up
  console.log("\nClosing CloudFreed...");
  await instance.Close();
  console.log("Done!");
}

// Run the example
main().catch(console.error);
