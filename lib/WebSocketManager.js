/**
 * Enhanced WebSocketManager with retry logic, timeout handling, and better error categorization
 */

import delay from "./delay.js";
import ConvertToCDPHeaders from "./ConvertToCDPHeaders.js";
import CloudFlareClick from "./CloudFlareClick.js";
import config from "../config.js";

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

async function WebSocketManager(websocket, url, html, options = {}) {
  const timeout = options.timeout || config.timeout.challenge;
  const maxChallengeAttempts = options.maxChallengeAttempts || 5;

  return new Promise(async (resolve, reject) => {
    let timeoutId = null;
    let resolved = false;

    // Set overall timeout
    timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({
          success: false,
          code: 408,
          errorType: 'TIMEOUT',
          errormessage: `Challenge solving timed out after ${timeout / 1000} seconds.`
        });
      }
    }, timeout);

    try {
      let opened = false;
      let challenges = 0;
      let interception = {};
      let cookieAttempts = 0;
      const clicker = CloudFlareClick();

      function safeResolve(result) {
        if (!resolved) {
          resolved = true;
          if (timeoutId) clearTimeout(timeoutId);
          resolve(result);
        }
      }

      function open() {
        delay(1000).then(() => {
          if (opened || resolved) return;

          if (++attempts >= 10) {
            safeResolve({
              success: false,
              code: 500,
              errorType: 'TARGET_ERROR',
              errormessage: "Failed to create browser target. Please try again."
            });
            return;
          }

          if (websocket.readyState !== 1) {
            safeResolve({
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

          open();
        });
      }

      let attempts = 0;
      open();

      websocket.addEventListener('message', async function incoming(event) {
        try {
          if (resolved) return;

          const messageString = event.data.toString('utf8');
          const response = JSON.parse(messageString);

          // Handle target creation
          if (response.id === 1 && response.result && response.result.targetId) {
            const targetId = response.result.targetId;
            opened = true;

            websocket.send(JSON.stringify({
              id: 2,
              method: 'Target.attachToTarget',
              params: { targetId, flatten: true }
            }));
          }
          // Handle target attachment
          else if (response.id === 2 && response.result && response.result.sessionId) {
            const sessionId = response.result.sessionId;

            // Enable network interception
            websocket.send(JSON.stringify({
              id: 3,
              method: 'Network.setRequestInterception',
              params: { patterns: [{ urlPattern: '*', interceptionStage: 'HeadersReceived' }] },
              sessionId
            }));

            // Navigate to target URL
            websocket.send(JSON.stringify({
              id: 4,
              method: 'Page.navigate',
              params: { url },
              sessionId
            }));
          }
          // Handle cookie retrieval response
          else if (response.id === -200 && response.result && response.result.cookies) {
            const cookies = response.result.cookies;
            const cfClearance = cookies.find(cookie => cookie.name === 'cf_clearance');

            if (cfClearance) {
              websocket.send(JSON.stringify({
                id: 9,
                method: 'Page.close',
                sessionId: response.sessionId
              }));

              safeResolve({
                success: true,
                code: 200,
                cfClearance,
                cfClearanceHeader: `${cfClearance.name}=${cfClearance.value};`,
                cookies
              });
            } else if (++cookieAttempts < 3) {
              // Retry cookie extraction
              await delay(1000);
              websocket.send(JSON.stringify({
                id: -200,
                method: 'Network.getAllCookies',
                sessionId: response.sessionId
              }));
            } else {
              websocket.send(JSON.stringify({
                id: 9,
                method: 'Page.close',
                sessionId: response.sessionId
              }));

              safeResolve({
                success: false,
                code: 500,
                errorType: 'COOKIE_NOT_FOUND',
                errormessage: "cf_clearance cookie not found after challenge completion."
              });
            }
          }
          // Handle network interception
          else if (response.method === 'Network.requestIntercepted') {
            const params = response.params;

            // Check if this is a Cloudflare challenge platform request
            if (params.resourceType === "Document" &&
              params.request.url.includes("challenges.cloudflare.com/cdn-cgi/challenge-platform")) {

              let id = parseInt(params.interceptionId.split('interception-job-')[1].split('.').join(''));

              interception[id] = {
                id: params.interceptionId,
                statusCode: params.responseStatusCode,
                statusText: StatusText[String(params.responseStatusCode)] || "Unknown Server Response (CloudFreed)",
                headers: ConvertToCDPHeaders(params.responseHeaders)
              };

              // Request response body
              websocket.send(JSON.stringify({
                id,
                method: 'Network.getResponseBodyForInterception',
                params: { interceptionId: params.interceptionId },
                sessionId: response.sessionId
              }));
            } else {
              // Continue non-challenge requests
              websocket.send(JSON.stringify({
                id: 5,
                sessionId: response.sessionId,
                method: 'Network.continueInterceptedRequest',
                params: { interceptionId: params.interceptionId }
              }));

              // Check if we got cf_clearance cookie in request headers
              const headersStr = JSON.stringify(ConvertToCDPHeaders(params.request.headers));
              if (headersStr.includes("cf_clearance")) {
                // Disable interception once we have the cookie
                websocket.send(JSON.stringify({
                  id: 3,
                  method: 'Network.setRequestInterception',
                  params: { patterns: [] },
                  sessionId: response.sessionId
                }));

                // Wait a bit for page to stabilize then get cookies
                await delay(2000);
                websocket.send(JSON.stringify({
                  id: -200,
                  method: 'Network.getAllCookies',
                  sessionId: response.sessionId
                }));
              }
            }
          }
          // Handle response body for challenge pages
          else if (response.id >= 10 && response.result && response.result.body) {
            const id = response.id;
            let body = response.result.base64Encoded ?
              Buffer.from(response.result.body, 'base64').toString('utf-8') :
              response.result.body;

            // Check if this is a challenge page
            if (body.includes(`id="challenge-stage"`)) {
              if (++challenges >= maxChallengeAttempts) {
                await delay(100);
                websocket.send(JSON.stringify({
                  id: 9,
                  method: 'Page.close',
                  sessionId: response.sessionId
                }));

                safeResolve({
                  success: false,
                  type: "Error",
                  code: 403,
                  errorType: 'TOO_MANY_CHALLENGES',
                  error: new Error('Too many challenge attempts'),
                  errormessage: `Failed after ${maxChallengeAttempts} challenge attempts. IP may be blocked.`
                });
                return;
              }

              // Inject our clicker script into the challenge page
              body = body.replace("</body>", `<script>${clicker}</script></body>`);
            }

            const responseData = `HTTP/1.2 ${interception[id].statusCode} ${interception[id].statusText}\r\n${interception[id].headers.join('\r\n') || ''}\r\n\r\n${body}`;

            websocket.send(JSON.stringify({
              sessionId: response.sessionId,
              id: 5,
              method: 'Network.continueInterceptedRequest',
              params: {
                interceptionId: interception[id].id,
                rawResponse: response.result.base64Encoded === true ?
                  Buffer.from(responseData).toString("base64") :
                  responseData
              }
            }));
          }
        } catch (error) {
          console.error('WebSocketManager message error:', error);
          if (websocket.readyState === 1) websocket.close();

          safeResolve({
            success: false,
            code: 500,
            errorType: 'INTERNAL_ERROR',
            error,
            errormessage: "Internal error during challenge solving: " + error.message
          });
        }
      });

      websocket.addEventListener('close', function close() {
        if (!resolved) {
          safeResolve({
            success: false,
            code: 500,
            errorType: 'CONNECTION_CLOSED',
            errormessage: "WebSocket connection closed unexpectedly."
          });
        }
      });

      websocket.addEventListener('error', function error(err) {
        if (!resolved) {
          safeResolve({
            success: false,
            code: 500,
            errorType: 'WEBSOCKET_ERROR',
            error: err,
            errormessage: "WebSocket error: " + (err.message || 'Unknown error')
          });
        }
      });

    } catch (error) {
      if (websocket.readyState === 1) websocket.close();

      if (!resolved) {
        resolved = true;
        if (timeoutId) clearTimeout(timeoutId);

        resolve({
          success: false,
          code: 500,
          errorType: 'UNKNOWN_ERROR',
          error,
          errormessage: "Unexpected error: " + error.message
        });
      }
    }
  });
}

export default WebSocketManager;
