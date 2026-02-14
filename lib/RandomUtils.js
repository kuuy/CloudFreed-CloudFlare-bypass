/**
 * RandomUtils - Utility functions for randomization
 * Used for human behavior simulation and fingerprint randomization
 */

/**
 * Generate random integer between min and max (inclusive)
 */
export function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate random float between min and max
 */
export function randomFloat(min, max) {
    return Math.random() * (max - min) + min;
}

/**
 * Choose random element from array
 */
export function randomChoice(array) {
    return array[randomInt(0, array.length - 1)];
}

/**
 * Random delay as a promise
 */
export function randomDelay(min, max) {
    return new Promise(resolve => setTimeout(resolve, randomInt(min, max)));
}

/**
 * Generate bezier curve points for mouse movement
 * @param {Object} start - {x, y} starting position
 * @param {Object} end - {x, y} ending position
 * @param {number} points - Number of intermediate points
 * @returns {Array} Array of {x, y} points along the curve
 */
export function bezierCurve(start, end, points = 10) {
    const curve = [];

    // Generate two random control points for cubic bezier
    const cp1 = {
        x: start.x + randomFloat(0, (end.x - start.x) * 0.5),
        y: start.y + randomFloat(-50, 50)
    };

    const cp2 = {
        x: start.x + randomFloat((end.x - start.x) * 0.5, end.x - start.x),
        y: end.y + randomFloat(-50, 50)
    };

    // Calculate points along the bezier curve
    for (let i = 0; i <= points; i++) {
        const t = i / points;
        const t1 = 1 - t;

        const x = Math.pow(t1, 3) * start.x +
            3 * Math.pow(t1, 2) * t * cp1.x +
            3 * t1 * Math.pow(t, 2) * cp2.x +
            Math.pow(t, 3) * end.x;

        const y = Math.pow(t1, 3) * start.y +
            3 * Math.pow(t1, 2) * t * cp1.y +
            3 * t1 * Math.pow(t, 2) * cp2.y +
            Math.pow(t, 3) * end.y;

        curve.push({ x: Math.round(x), y: Math.round(y) });
    }

    return curve;
}

/**
 * Generate realistic typing delay (in milliseconds)
 */
export function humanTypingDelay() {
    // Average typing speed: 40-60 WPM = ~150-250ms per character
    // With variance for human-like behavior
    return randomInt(100, 300);
}

/**
 * Generate random viewport size
 */
export function randomViewport() {
    const common = [
        { width: 1920, height: 1080 },
        { width: 1366, height: 768 },
        { width: 1440, height: 900 },
        { width: 1536, height: 864 },
        { width: 1280, height: 720 },
    ];

    return randomChoice(common);
}

/**
 * Generate random timezone
 */
export function randomTimezone() {
    const timezones = [
        'America/New_York',
        'America/Chicago',
        'America/Los_Angeles',
        'Europe/London',
        'Europe/Paris',
        'Asia/Tokyo',
        'Asia/Shanghai',
        'Australia/Sydney'
    ];

    return randomChoice(timezones);
}

/**
 * Generate random locale
 */
export function randomLocale() {
    const locales = [
        'en-US',
        'en-GB',
        'en-CA',
        'fr-FR',
        'de-DE',
        'es-ES',
        'ja-JP',
        'zh-CN'
    ];

    return randomChoice(locales);
}

export default {
    randomInt,
    randomFloat,
    randomChoice,
    randomDelay,
    bezierCurve,
    humanTypingDelay,
    randomViewport,
    randomTimezone,
    randomLocale
};
