/**
 * session.js
 * Persists the active short-course session to sessionStorage so that an
 * accidental page refresh during a race does not lose all entered data.
 */

import { state } from './state.js';

const SESSION_STORAGE_KEY = 'lsc_sc_session';

export function saveSessionToStorage() {
    try {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
            seriesId:    state.currentSeries?.id ?? null,
            savedAt:     Date.now(),
            races:       state.shortCourseSessionRaces,
            poolEntries: state.entries,
        }));
    } catch (e) {
        console.warn('Could not save session to sessionStorage:', e);
    }
}

/**
 * Attempts to restore a short-course session from sessionStorage.
 * Must be called after cloud data has loaded so the seriesId can be validated.
 * @returns {boolean} True if a session was restored.
 */
export function restoreSessionFromStorage() {
    try {
        const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (!raw) return false;

        const payload = JSON.parse(raw);
        if (!payload || !Array.isArray(payload.races) || payload.races.length === 0) {
            clearSessionStorage(); return false;
        }

        const matchingSeries = payload.seriesId != null
            ? state.series.find(s => s.id === payload.seriesId)
            : null;

        if (!matchingSeries?.isShortCourse) { clearSessionStorage(); return false; }

        const ageHours = (Date.now() - (payload.savedAt || 0)) / 3_600_000;
        if (ageHours > 12) {
            console.warn(`SC session is ${ageHours.toFixed(1)}h old — discarding.`);
            clearSessionStorage(); return false;
        }

        state.shortCourseSessionRaces = payload.races;
        state.entries                 = Array.isArray(payload.poolEntries) ? payload.poolEntries : [];
        state.currentSeries           = matchingSeries;

        console.log(`Restored SC session for "${matchingSeries.name}" with ${state.shortCourseSessionRaces.length} race(s).`);
        return true;

    } catch (e) {
        console.warn('Failed to restore session from sessionStorage:', e);
        clearSessionStorage();
        return false;
    }
}

export function clearSessionStorage() {
    try { sessionStorage.removeItem(SESSION_STORAGE_KEY); } catch (_) { /* ignore */ }
}
