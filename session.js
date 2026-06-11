/**
 * session.js
 * Persists the active short-course session to sessionStorage so that an
 * accidental page refresh during a race does not lose all entered data.
 *
 * The session is cleared when the user explicitly saves or clears it via the
 * UI, so stale data from a previous session does not bleed into a new one.
 *
 * Only short-course session races are preserved this way; the standard entries
 * list is always reloaded from Google Sheets (which is saved on every change).
 *
 * Depends on: state.js, utils.js
 */

'use strict';

const SESSION_STORAGE_KEY = 'lsc_sc_session';

/**
 * Serialises the current shortCourseSessionRaces array to sessionStorage.
 * Called after every mutation that affects the session races.
 */
function saveSessionToStorage() {
    try {
        const payload = {
            seriesId:   currentSeries?.id ?? null,
            savedAt:    Date.now(),
            races:      shortCourseSessionRaces,
            poolEntries: entries,
        };
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
        // sessionStorage can throw in private browsing if storage is full.
        console.warn('Could not save session to sessionStorage:', e);
    }
}

/**
 * Attempts to restore a short-course session from sessionStorage.
 * Should be called during initApp(), after series data has been loaded from
 * Google Sheets, so we can validate the seriesId still exists.
 *
 * Returns true if a session was restored, false otherwise.
 * @returns {boolean}
 */
function restoreSessionFromStorage() {
    try {
        const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (!raw) return false;

        const payload = JSON.parse(raw);
        if (!payload || !Array.isArray(payload.races) || payload.races.length === 0) {
            clearSessionStorage();
            return false;
        }

        // Validate that the series this session belongs to still exists.
        const matchingSeries = payload.seriesId != null
            ? series.find(s => s.id === payload.seriesId)
            : null;

        if (!matchingSeries || !matchingSeries.isShortCourse) {
            clearSessionStorage();
            return false;
        }

        // How old is the session?  Warn if it's from more than 12 hours ago.
        const ageHours = (Date.now() - (payload.savedAt || 0)) / (1000 * 60 * 60);
        if (ageHours > 12) {
            console.warn(`SC session in storage is ${ageHours.toFixed(1)} hours old — discarding.`);
            clearSessionStorage();
            return false;
        }

        shortCourseSessionRaces = payload.races;
        entries                 = Array.isArray(payload.poolEntries) ? payload.poolEntries : [];
        currentSeries           = matchingSeries;

        console.log(
            `Restored SC session for "${matchingSeries.name}" ` +
            `with ${shortCourseSessionRaces.length} race(s) from sessionStorage.`
        );
        return true;

    } catch (e) {
        console.warn('Failed to restore session from sessionStorage:', e);
        clearSessionStorage();
        return false;
    }
}

/**
 * Removes the persisted session from sessionStorage.
 * Call this after the user deliberately saves or clears the session.
 */
function clearSessionStorage() {
    try {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (e) {
        // Ignore — if we can't remove it, it'll just be ignored next time.
    }
}
