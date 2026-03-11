/**
 * Enhanced WebSocketManager with retry logic, timeout handling, and better error categorization
 */

import delay from "./delay.mjs";
import ConvertToCDPHeaders from "./ConvertToCDPHeaders.mjs";
import CloudFlareClick from "./CloudFlareClick.mjs";
import config from "../config.mjs";
import { WebSocket } from "ws";

const StatusText = {
  "100": "Continue",
  "101": "Switching Protocols",
  "102": "Processing",
  "103": "Early Hints",
  "200": "OK",
  "201": "Created",
  "202": "Accepted",
  "203": "Non-Authoritative Information",
  "204": "No Content",
  "205": "Reset Content",
  "206": "Partial Content",
  "207": "Multi-Status",
  "208": "Already Reported",
  "226": "IM Used",
  "300": "Multiple Choices",
  "301": "Moved Permanently",
  "302": "Found",
  "303": "See Other",
  "304": "Not Modified",
  "305": "Use Proxy",
  "307": "Temporary Redirect",
  "308": "Permanent Redirect",
  "400": "Bad Request",
  "401": "Unauthorized",
  "402": "Payment Required",
  "403": "Forbidden",
  "404": "Not Found",
  "405": "Method Not Allowed",
  "406": "Not Acceptable",
  "407": "Proxy Authentication Required",
  "408": "Request Timeout",
  "409": "Conflict",
  "410": "Gone",
  "411": "Length Required",
  "412": "Precondition Failed",
  "413": "Payload Too Large",
  "414": "URI Too Long",
  "415": "Unsupported Media Type",
  "416": "Range Not Satisfiable",
  "417": "Expectation Failed",
  "418": "I'm a teapot",
  "421": "Misdirected Request",
  "422": "Unprocessable Entity",
  "423": "Locked",
  "424": "Failed Dependency",
  "425": "Too Early",
  "426": "Upgrade Required",
  "428": "Precondition Required",
  "429": "Too Many Requests",
  "431": "Request Header Fields Too Large",
  "451": "Unavailable For Legal Reasons",
  "500": "Internal Server Error",
  "501": "Not Implemented",
  "502": "Bad Gateway",
  "503": "Service Unavailable",
  "504": "Gateway Timeout",
  "505": "HTTP Version Not Supported",
  "506": "Variant Also Negotiates",
  "507": "Insufficient Storage",
  "508": "Loop Detected",
  "510": "Not Extended",
  "511": "Network Authentication Required"
};

async function WebSocketManager(debuggerUrl, url, html, options = {}) {
  const timeout = options.timeout || config.timeout.challenge;
  const maxChallengeAttempts = options.maxChallengeAttempts || 5;

  return new Promise(async (resolve, reject) => {
    let timeoutId = null;
    let resolved = false;
    let sessionId = null;
    let websocket = null;

    // Result object to be returned
    let finalResult = {
      success: false,
      code: 500,
      headers: {},
      cookies: [],
      body: null,
      cfClearance: null
    };

    // Set overall timeout
    timeoutId = setTimeout(() => {
      safeResolve({
        ...finalResult,
        success: false,
        code: 408,
        errorType: 'TIMEOUT',
        errormessage: `Challenge solving timed out after ${timeout / 1000} seconds.`
      });
    }, timeout);

    function safeResolve(result) {
      if (!resolved) {
        resolved = true;
        if (timeoutId) clearTimeout(timeoutId);
        // Clean up: try to close page if possible
        if (websocket && websocket.readyState === 1) {
          try {
            if (sessionId) {
              websocket.send(JSON.stringify({
                id: 999,
                method: 'Page.close',
                sessionId
              }));
            }
            // Close socket after a short delay to allow Page.close to send?
            // Or just close immediately as we are done.
            // Given we are resolving, let's close.
            websocket.close();
          } catch (e) { }
        }
        resolve(result);
      }
    }

    try {
      websocket = new WebSocket(debuggerUrl);

      await new Promise((res, rej) => {
        websocket.once('open', res);
        websocket.once('error', rej);
      });

      let opened = false;
      let challenges = 0;
      let interception = {}; // Map<cmdId, { requestId, statusCode, headers, isTarget }>
      let cookieAttempts = 0;
      const clicker = CloudFlareClick();

      let attempts = 0;

      function open() {
        delay(1000).then(() => {
          if (opened || resolved) return;

          if (++attempts >= 10) {
            safeResolve({
              ...finalResult,
              success: false,
              code: 500,
              errorType: 'TARGET_ERROR',
              errormessage: "Failed to create browser target. Please try again."
            });
            return;
          }

          if (websocket.readyState !== 1) {
            // Keep trying if connection is not ready? Or fail?
            // Original code just returned error.
            if (attempts < 5) {
              open();
              return;
            }
            safeResolve({
              ...finalResult,
              success: false,
              code: 500,
              errorType: 'CONNECTION_ERROR',
              errormessage: "WebSocket connection lost."
            });
            return;
          }

          websocket.send(JSON.stringify({
            id: 1,
            method: 'Target.createTarget',
            params: { url: html }
          }));

          // Recurse until opened
          open();
        });
      }

      // Start the connection loop
      open();

      websocket.addEventListener('message', async function incoming(event) {
        try {
          if (resolved) return;

          const messageString = event.data.toString('utf8');
          const response = JSON.parse(messageString);

          // 1. Target Created
          if (response.id === 1 && response.result && response.result.targetId) {
            const targetId = response.result.targetId;
            opened = true;

            websocket.send(JSON.stringify({
              id: 2,
              method: 'Target.attachToTarget',
              params: { targetId, flatten: true }
            }));
          }
          // 2. Attached -> Enable Fetch & Navigate
          else if (response.id === 2 && response.result && response.result.sessionId) {
            sessionId = response.result.sessionId;

            // Enable Page and Fetch domains
            websocket.send(JSON.stringify({
              id: 3,
              method: 'Fetch.enable',
              params: { patterns: [{ urlPattern: '*', requestStage: 'Response' }] },
              sessionId
            }));
            websocket.send(JSON.stringify({
              id: 31,
              method: 'Page.enable',
              sessionId
            }));
            if (options.method === 'POST') {
              websocket.send(JSON.stringify({
                id: 4,
                method: 'Page.navigate',
                params: { url: html }, // Navigate to local loading page first
                sessionId
              }));
            } else {
              websocket.send(JSON.stringify({
                id: 4,
                method: 'Page.navigate',
                params: { url },
                sessionId
              }));
            }
          }
          // 2.1. If Loading HTML finished (for POST), trigger Fetch
          else if (response.method === 'Page.loadEventFired' && options.method === 'POST') {
            const isForm = options.contentType.includes('application/x-www-form-urlencoded');
            const bodyData = options.postData;

            let serializedBody;
            if (typeof bodyData === 'object' && bodyData !== null) {
              if (isForm) {
                serializedBody = new URLSearchParams(bodyData).toString();
              } else {
                serializedBody = JSON.stringify(bodyData);
              }
            } else {
              serializedBody = bodyData || "";
            }

            const fetchScript = `
              fetch(${JSON.stringify(url)}, {
                method: 'POST',
                headers: {
                  'Content-Type': ${JSON.stringify(options.contentType)}
                },
                body: ${JSON.stringify(serializedBody)}
              }).then(r => r.text()).catch(e => console.error('Fetch error:', e));
            `;
            websocket.send(JSON.stringify({
              id: 41,
              method: 'Runtime.evaluate',
              params: { expression: fetchScript },
              sessionId
            }));
          }
          // 3. Handle Fetch Interception (Cloudflare & Target URL)
          else if (response.method === 'Fetch.requestPaused') {
            const params = response.params;
            const reqUrl = params.request.url;
            const resourceType = params.resourceType;

            // Generate a random ID for the getResponseBody command
            // We use this to map the response back to this request
            let cmdId = Math.floor(Math.random() * 900000) + 100000;

            // A. Cloudflare Challenge
            if (resourceType === "Document" && reqUrl.includes("challenges.cloudflare.com/cdn-cgi/challenge-platform")) {
              interception[cmdId] = {
                requestId: params.requestId,
                statusCode: params.responseStatusCode,
                headers: params.responseHeaders,
                isChallenge: true
              };

              // Filter CSP headers to allow injection
              if (interception[cmdId].headers) {
                interception[cmdId].headers = interception[cmdId].headers.filter(h => h.name.toLowerCase() !== 'content-security-policy');
              }

              websocket.send(JSON.stringify({
                id: cmdId,
                method: 'Fetch.getResponseBody',
                params: { requestId: params.requestId },
                sessionId: sessionId
              }));
            }
            // B. Target URL or Redirects (Logic moved from cf.js)
            else if (resourceType === "Document" || reqUrl === url || (options.method === 'POST' && reqUrl.includes(new URL(url).pathname))) {
              // Check if it matches our target (fuzzy match)
              // cf.js logic: response.params.request.url === ctx.query.url
              // We'll trust "Document" type usually means the main page if it's not the challenge

              // Handle Redirects (301/302)
              if (params.responseStatusCode === 301 || params.responseStatusCode === 302) {
                // Just continue, let browser follow redirect
                websocket.send(JSON.stringify({
                  id: 5,
                  method: 'Fetch.continueRequest',
                  params: { requestId: params.requestId },
                  sessionId
                }));
                return;
              }

              // Handle 404
              if (params.responseStatusCode === 404 || reqUrl.includes("/error/album_missing")) {
                finalResult.code = 404;
              } else {
                finalResult.code = params.responseStatusCode || 200;
              }

              finalResult.headers = ConvertToCDPHeaders(params.responseHeaders || []);

              // Store state to capture body
              interception[cmdId] = {
                requestId: params.requestId,
                statusCode: params.responseStatusCode,
                headers: params.responseHeaders,
                isTarget: true
              };

              websocket.send(JSON.stringify({
                id: cmdId,
                method: 'Fetch.getResponseBody',
                params: { requestId: params.requestId },
                sessionId: sessionId
              }));
            }
            // C. Other requests
            else {
              websocket.send(JSON.stringify({
                id: 5,
                method: 'Fetch.continueRequest',
                params: { requestId: params.requestId },
                sessionId
              }));
            }
          }
          // 4. Handle getResponseBody Result
          else if (response.id && interception[response.id]) {
            const cmdId = response.id;
            const data = interception[cmdId];
            delete interception[cmdId]; // Clean up

            let body = "";
            if (response.result && response.result.body) {
              body = response.result.base64Encoded ?
                Buffer.from(response.result.body, 'base64').toString('utf-8') :
                response.result.body;
            }

            // Case A: Target URL Body Captured
            if (data.isTarget) {
              // Save the body!
              if (body.includes('<title>Just a moment...</title>')) {
                websocket.send(JSON.stringify({
                  id: 7,
                  method: 'Fetch.continueRequest',
                  params: { requestId: data.requestId },
                  sessionId
                }));
                return;
              }

              finalResult.body = body;
              if (response.result.base64Encoded) {
                finalResult.bodyBuffer = Buffer.from(response.result.body, 'base64');
              } else {
                finalResult.bodyBuffer = Buffer.from(body);
              }

              // Fulfill the request so the browser can finish loading (and set cookies)
              websocket.send(JSON.stringify({
                id: 6,
                method: 'Fetch.fulfillRequest',
                params: {
                  requestId: data.requestId,
                  responseCode: data.statusCode,
                  responseHeaders: data.headers,
                  body: Buffer.from(body).toString('base64')
                },
                sessionId
              }));

              // Now we fetch cookies and finish
              // Give a small delay for cookies to settle?
              setTimeout(() => {
                websocket.send(JSON.stringify({
                  id: -200,
                  method: 'Network.getAllCookies',
                  sessionId
                }));
              }, 500);
            }
            // Case B: Cloudflare Challenge
            else if (data.isChallenge) {
              if (++challenges >= maxChallengeAttempts) {
                safeResolve({
                  ...finalResult,
                  success: false,
                  code: 403,
                  errormessage: `Failed after ${maxChallengeAttempts} challenge attempts.`
                });
                return;
              }

              // Remove CSP
              body = body.replace(/<meta http-equiv="Content-Security-Policy" content="[^"]*">/gi, '');

              // Inject Hooks
              const shadowHook = `(function(){const o=Element.prototype.attachShadow;Element.prototype.attachShadow=function(i){return this.__capturedShadowRoot=o.call(this,i)}})();`;
              if (/<head\b[^>]*>/i.test(body)) {
                body = body.replace(/<head\b[^>]*>/i, (match) => `${match}<script>${shadowHook}</script>`);
              } else {
                body = `<script>${shadowHook}</script>` + body;
              }

              // Inject Clicker
              if (/<\/body>/i.test(body)) {
                body = body.replace(/<\/body>/i, `<script>${clicker}</script></body>`);
              } else {
                body = body + `<script>${clicker}</script>`;
              }

              // Fulfill with modified body
              websocket.send(JSON.stringify({
                id: 6,
                method: 'Fetch.fulfillRequest',
                params: {
                  requestId: data.requestId,
                  responseCode: data.statusCode,
                  responseHeaders: data.headers,
                  body: Buffer.from(body).toString('base64')
                },
                sessionId
              }));
            }
          }
          // 5. Cookies Response (Final Step)
          else if (response.id === -200 && response.result && response.result.cookies) {
            const cookies = response.result.cookies;
            const cfClearance = cookies.find(cookie => cookie.name === 'cf_clearance');

            finalResult.cookies = cookies;
            finalResult.cfClearance = cfClearance;

            // Check success condition: We have body AND (we have cookie OR we don't need it?)
            // cf.js logic suggests we need the cookie for success?
            // But sometimes we just want the content (e.g. if site doesn't use CF?)

            if (cfClearance) {
              safeResolve({
                ...finalResult,
                success: true,
                code: finalResult.code === 500 ? 200 : finalResult.code, // Fix default code
                cfClearanceHeader: `${cfClearance.name}=${cfClearance.value};`
              });
            } else if (++cookieAttempts < 3) {
              // Retry cookies
              setTimeout(() => {
                websocket.send(JSON.stringify({
                  id: -200,
                  method: 'Network.getAllCookies',
                  sessionId
                }));
              }, 1000);
            } else {
              // Return whatever we have, even if cookie missing (maybe failed, maybe not needed)
              safeResolve({
                ...finalResult,
                success: !!finalResult.body, // Success if we at least got the body
                errormessage: "cf_clearance cookie not found."
              });
            }
          }

        } catch (error) {
          console.error('WebSocketManager error:', error);
          if (websocket.readyState === 1) websocket.close();
          safeResolve({
            ...finalResult,
            success: false,
            code: 500,
            error,
            errormessage: "Internal error: " + error.message
          });
        }
      });

      websocket.addEventListener('close', () => {
        if (!resolved) {
          // If we have a body, maybe we consider it a success even if closed?
          if (finalResult.body) {
            safeResolve({ ...finalResult, success: true });
          } else {
            safeResolve({
              ...finalResult,
              success: false,
              code: 500,
              errormessage: "WebSocket connection closed unexpectedly."
            });
          }
        }
      });

      websocket.addEventListener('error', (err) => {
        if (!resolved) {
          safeResolve({
            ...finalResult,
            success: false,
            code: 500,
            error: err,
            errormessage: "WebSocket error."
          });
        }
      });

    } catch (error) {
      if (websocket.readyState === 1) websocket.close();
      if (!resolved) {
        resolved = true;
        if (timeoutId) clearTimeout(timeoutId);
        resolve({
          ...finalResult,
          success: false,
          code: 500,
          error,
          errormessage: "Unexpected error: " + error.message
        });
      }
    }
  });
}

export default WebSocketManager;
