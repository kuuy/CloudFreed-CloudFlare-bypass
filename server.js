const path = require("path");

const puppeteer = require('puppeteer');
const Koa = require('koa');
const app = new Koa();
const bodyParser = require('koa-bodyparser');

app.use(bodyParser());

const dataDir = path.join(process.env.HOME, '.puppeteer', `cache_${Date.now()}`);

(async () => {
  const { default: FindAvailablePort } = await import('./lib/FindAvailablePort.mjs')
  const { default: CheckDebuggingEndpoint } = await import('./lib/CheckDebuggingEndpoint.mjs')
  const { default: WebSocketManager } = await import("./lib/WebSocketManager.mjs")

  const port = await FindAvailablePort(10000, 60000);

  let options = {
    //headless: "new",
    headless: false,
    executablePath: "/opt/google/chrome/chrome",
    ignoreDefaultArgs: ["--enable-automation"],
    args: [
      '--no-first-run',
      '--no-sandbox',
      '--allow-file-access-from-files',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-setuid-sandbox',
      '--window-size=1290,1080',
      '-–disk-cache-size=1',
      '--media-cache-size=1',
      `--user-data-dir=${dataDir}`,
      `--remote-debugging-port=${port}`,
      `--proxy-server=socks5://127.0.0.1:2080`,
      `--window-name=CloudFlare Bypass`,
      `file:///${path.join(__dirname, "html", "main.html")}`,
    ]
  }

  await puppeteer.launch(options);

  const versionInfo = await CheckDebuggingEndpoint(port)
  console.log("versionInfo", versionInfo)

  const webSocketDebuggerUrl = versionInfo['webSocketDebuggerUrl'];

  app.use(async ctx => {
    if (ctx.query.url) {
      const targetUrl = ctx.query.url;
      const loadingHtml = `file:///${path.join(__dirname, "html", "loading.html")}`;

      if (process.env.DEBUG) {
        console.log(`[DEBUG] Requesting: ${targetUrl}`);
      }

      try {
        // Use our rewritten Manager
        // It handles all the interception, body capturing, and CF bypass internally now.
        const options = {
          timeout: 60000,
          method: ctx.method,
          contentType: ctx.get('content-type') || 'application/json',
          postData: ctx.method === 'POST' ? ctx.request.body : null
        };

        if (process.env.DEBUG && ctx.method === 'POST') {
          console.log(`[DEBUG] POST Body: ${JSON.stringify(options.postData)}`);
        }

        const result = await WebSocketManager(webSocketDebuggerUrl, targetUrl, loadingHtml, options);

        if (result.success) {
          ctx.status = result.code || 200;
          // Set headers if captured
          if (result.headers) {
            for (const [key, value] of Object.entries(result.headers)) {
              // Filter unsafe headers if needed
              if (key.toLowerCase() !== 'content-encoding' && key.toLowerCase() !== 'content-length') {
                ctx.set(key, value);
              }
            }
          }

          // Return body or buffer
          if (ctx.query.binary && result.bodyBuffer) {
            ctx.body = result.bodyBuffer;
          } else {
            ctx.body = result.body;
          }
        } else {
          ctx.status = result.code || 500;
          ctx.body = result.errormessage || "Unknown error";
        }

      } catch (error) {
        console.error("Handler error:", error);
        ctx.status = 500;
        ctx.body = error.message;
      }
    } else {
      ctx.body = "Please specify the URL in the 'url' query string.";
    }
  });

  app.listen(6210, "127.0.0.1", () => {
    console.log("Server listening on http://127.0.0.1:6210");
  });
})();
