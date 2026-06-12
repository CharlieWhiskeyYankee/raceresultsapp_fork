/**
 * utils.js
 * Pure utility and helper functions with no DOM or state dependencies.
 */

/**
 * Parses a time string in h:m:s, h m s, m:s, or m s format into total seconds.
 * Returns -1 if the string cannot be parsed or is out of range.
 * @param {string} timeStr
 * @returns {number}
 */
export function timeToSeconds(timeStr) {
    if (!timeStr) return -1;
    timeStr = String(timeStr).trim();

    const hmsColonRegex = /^([0-9]{1,2}):([0-5]?[0-9]):([0-5]?[0-9])$/;
    const hmsSpaceRegex = /^([0-9]{1,2})\s+([0-5]?[0-9])\s+([0-5]?[0-9])$/;
    const msColonRegex  = /^([0-5]?[0-9]):([0-5]?[0-9])$/;
    const msSpaceRegex  = /^([0-5]?[0-9])\s+([0-5]?[0-9])$/;

    let match;
    let hours = 0, minutes = 0, seconds = 0;

    if ((match = timeStr.match(hmsColonRegex)) || (match = timeStr.match(hmsSpaceRegex))) {
        hours   = parseInt(match[1], 10);
        minutes = parseInt(match[2], 10);
        seconds = parseInt(match[3], 10);
    } else if ((match = timeStr.match(msColonRegex)) || (match = timeStr.match(msSpaceRegex))) {
        minutes = parseInt(match[1], 10);
        seconds = parseInt(match[2], 10);
    } else {
        return -1;
    }

    if (
        isNaN(hours) || isNaN(minutes) || isNaN(seconds) ||
        hours < 0 || hours > 99 ||
        minutes < 0 || minutes > 59 ||
        seconds < 0 || seconds > 59
    ) {
        return -1;
    }

    return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Returns true if the supplied string represents a valid time.
 * @param {string} timeStr
 * @returns {boolean}
 */
export function isValidTimeFormat(timeStr) {
    if (!timeStr) return false;
    return timeToSeconds(String(timeStr).trim()) >= 0;
}

/**
 * Converts a total-seconds value to a zero-padded "HH:MM:SS" string.
 * @param {number} seconds
 * @returns {string}
 */
export function secondsToTime(seconds) {
    if (isNaN(seconds) || seconds === null || seconds < 0) return '';
    seconds = Math.round(seconds);
    const hours = Math.floor(seconds / 3600);
    let minutes = Math.floor((seconds % 3600) / 60);
    let secs    = seconds % 60;
    if (secs === 60)    { minutes += 1; secs = 0; }
    if (minutes === 60) { minutes = 0; }
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Returns the singular or plural form of a word based on count.
 * @param {number} count
 * @param {string} singular
 * @param {string} [plural]
 * @returns {string}
 */
export function pluralize(count, singular, plural = null) {
    return count === 1 ? singular : (plural || singular + 's');
}

/**
 * Escapes a value for safe interpolation into an HTML string.
 * @param {*} value
 * @returns {string}
 */
export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#39;');
}
