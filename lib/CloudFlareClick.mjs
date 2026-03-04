/**
 * Enhanced CloudFlare Turnstile solver with human-like behavior
 */
function CloudFlareClick() {
  return `
  async function Click() {
    console.log('[DEBUG] click start');
    const delay = async (milliseconds) => await new Promise(resolve => setTimeout(resolve, milliseconds));

    function randomDelay(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // Generate bezier curve points for smooth mouse movement
    function bezierCurve(startX, startY, endX, endY, points = 10) {
      const curve = [];

      // Random control points for natural curve
      const cp1X = startX + Math.random() * (endX - startX) * 0.5;
      const cp1Y = startY + (Math.random() - 0.5) * 50;
      const cp2X = startX + Math.random() * (endX - startX) * 0.5 + (endX - startX) * 0.5;
      const cp2Y = endY + (Math.random() - 0.5) * 50;

      for (let i = 0; i <= points; i++) {
        const t = i / points;
        const t1 = 1 - t;

        const x = Math.pow(t1, 3) * startX +
                  3 * Math.pow(t1, 2) * t * cp1X +
                  3 * t1 * Math.pow(t, 2) * cp2X +
                  Math.pow(t, 3) * endX;

        const y = Math.pow(t1, 3) * startY +
                  3 * Math.pow(t1, 2) * t * cp1Y +
                  3 * t1 * Math.pow(t, 2) * cp2Y +
                  Math.pow(t, 3) * endY;

        curve.push({ x: Math.round(x), y: Math.round(y) });
      }
      
      return curve;
    }

    // Simulate human-like mouse movement along a curve
    async function moveMouseAlongCurve(element, targetX, targetY) {
      const startX = Math.random() * window.innerWidth;
      const startY = Math.random() * window.innerHeight;

      const curve = bezierCurve(startX, startY, targetX, targetY, 15);

      for (const point of curve) {
        const moveEvent = new MouseEvent('mousemove', {
          view: window,
          bubbles: true,
          cancelable: true,
          clientX: point.x,
          clientY: point.y
        });
        document.dispatchEvent(moveEvent);
        await delay(randomDelay(5, 15));
      }
    }

    // Enhanced mouse click simulation with human-like behavior
    async function simulateHumanClick(element, clientX = null, clientY = null) {
      if (!element) return;

      // Get element position with random variance
      if (clientX === null || clientY === null) {
        const box = element.getBoundingClientRect();
        const variance = 5; // Pixel variance for natural clicking
        clientX = box.left + box.width / 2 + (Math.random() - 0.5) * variance;
        clientY = box.top + box.height / 2 + (Math.random() - 0.5) * variance;
      }

      if (isNaN(clientX) || isNaN(clientY)) {
        return;
      }

      // Move mouse to element along bezier curve
      await moveMouseAlongCurve(element, clientX, clientY);

      // Random hover delay before clicking
      await delay(randomDelay(100, 300));

      // Dispatch events in realistic sequence
      const eventSequence = [
        { type: 'mouseover', detail: 0 },
        { type: 'mouseenter', detail: 0 },
        { type: 'mousemove', detail: 0 },
        { type: 'mousedown', detail: 1 },
        { type: 'mouseup', detail: 1 },
        { type: 'click', detail: 1 }
      ];

      for (const evt of eventSequence) {
        const event = new MouseEvent(evt.type, {
          detail: evt.detail,
          view: window,
          bubbles: true,
          cancelable: true,
          clientX: clientX,
          clientY: clientY
        });
        element.dispatchEvent(event);
        
        // Small delay between events
        if (evt.type === 'mousedown') {
          await delay(randomDelay(50, 150)); // Realistic click duration
        } else {
          await delay(randomDelay(10, 30));
        }
      }
      
      // Dispatch mouseout after a short delay
      await delay(randomDelay(50, 100));
      const mouseoutEvent = new MouseEvent('mouseout', {
        detail: 0,
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: clientX,
        clientY: clientY
      });
      element.dispatchEvent(mouseoutEvent);
    }

    function findChallengeCheckbox() {
      const selectors = [
        "div[role=alert] > label > input[type=checkbox]:not(:checked)",
        // "#challenge-stage input[type=checkbox]:not(:checked)",
        // "#challenge-form input[type=checkbox]:not(:checked)",
        // "input[type=checkbox][id*='challenge']:not(:checked)",
        // "input[type=checkbox].challenge-input:not(:checked)",
        // "input[type=checkbox][name*='challenge']:not(:checked)",
        // ".ctp-checkbox-container input[type=checkbox]:not(:checked)",
      ];

      function queryRecursive(root) {
        if (!root) return null;
        
        // Try selectors in current root
        for (const selector of selectors) {
          try {
            const el = root.querySelector(selector);
            if (el && el.tagName === 'INPUT') {
              console.log('[DEBUG] input found now', selector);
              return el;
            }
          } catch (e) {}
        }

        // Traverse elements to find shadow roots
        const elements = root.querySelectorAll('*');
        for (const el of elements) {
          const shadow = el.shadowRoot || el.__capturedShadowRoot;
          if (shadow) {
            const found = queryRecursive(shadow);
            if (found) return found;
          }
        }
        return null;
      }

      const result = queryRecursive(document);
      if (result) console.log('[DEBUG] Checkbox found:', result.id || result.name || 'unnamed');
      return result;
    }

    // Find the clickable label for the checkbox
    function findClickableLabel(checkbox) {
      if (!checkbox) return null;
      const root = checkbox.getRootNode();
      
      // Try to find associated label within the same root
      const label = checkbox.closest('label') || 
                    (root.querySelector && checkbox.id ? root.querySelector(\`label[for="\${checkbox.id}"]\`) : null) ||
                    checkbox.parentElement;
      
      return label;
    }

    // Main challenge detection and clicking loop
    let attempts = 0;
    const maxAttempts = 50; // Prevent infinite loops

    while (attempts < maxAttempts) {
      await delay(randomDelay(100, 300)); // Random check interval
      
      const checkbox = findChallengeCheckbox();

      if (checkbox && !checkbox.checked) {
        console.log('[DEBUG] Attempting to click checkbox');
        const clickTarget = findClickableLabel(checkbox) || checkbox;

        // Random delay before clicking (simulate human reading/thinking)
        await delay(randomDelay(500, 1500));
        
        // Scroll element into view if needed
        clickTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await delay(randomDelay(200, 500));
        
        // Simulate human click
        await simulateHumanClick(clickTarget);

        // Wait for potential page response
        await delay(randomDelay(1000, 2000));

        // Check if challenge was solved
        if (checkbox.checked) {
          console.log('[DEBUG] Challenge checkbox clicked successfully');
          break;
        }
        console.log('[DEBUG] Challenge checkbox checked status', checkbox.checked);
      }

      attempts++;
    }

    console.log('[DEBUG] click finished');
  }

  // Ensure DOM is ready before executing Click
  if (document.readyState === 'loading') {
    // DOM hasn't loaded yet
    document.addEventListener('DOMContentLoaded', () => {
      Click().catch(err => console.error('Click error:', err));
    });
  } else {
    // DOM is already loaded, execute immediately
    Click().catch(err => console.error('Click error:', err));
  }

  console.log('[DEBUG] click now');
  `;
}

export default CloudFlareClick;
