/**
 * storage.js
 * All data persistence: Google Sheets cloud sync and local JSON import/export.
 */

import { WEB_APP_URL, EXPORT_VERSION } from './config.js';
import { state } from './state.js';
import { timeToSeconds, secondsToTime } from './utils.js';
import { showAlert, showConfirm, showToast } from './modal.js';

// ─── Save-Status UI ──────────────────────────────────────────────────────────

export function updateSaveStatus(status, message = '') {
    const el = document.getElementById('save-status');
    if (!el) return;
    el.classList.remove('save-status-idle', 'save-status-saving', 'save-status-saved');
    switch (status) {
        case 'idle':
            el.classList.add('save-status-idle');
            el.textContent = 'No data saved this session';
            break;
        case 'saving':
            el.classList.add('save-status-saving');
            el.textContent = message || 'Saving to cloud...';
            break;
        case 'saved':
            el.classList.add('save-status-saved');
            el.textContent = 'Data saved to cloud';
            break;
        case 'error':
            el.classList.add('save-status-saving');
            el.textContent = message || 'Save failed';
            break;
    }
}

// ─── Background Save Queue ───────────────────────────────────────────────────

const SAVE_RETRY_BASE_MS = 5_000;
const SAVE_RETRY_MAX     = 5;
let _saveRetryCount      = 0;
let _saveRetryTimeoutId  = null;

export function triggerSave() {
    if (state.isSaving) {
        state.saveQueued = true;
        updateSaveStatus('saving', 'Changes queued...');
        return;
    }
    if (_saveRetryTimeoutId) { clearTimeout(_saveRetryTimeoutId); _saveRetryTimeoutId = null; }
    _saveRetryCount = 0;
    _saveDataToGoogleSheet();
}

async function _saveDataToGoogleSheet() {
    if (state.isSaving) return;
    state.isSaving = true;
    updateSaveStatus('saving');
    console.log(`Saving to Google Sheet... (attempt ${_saveRetryCount + 1})`);

    const payload = {
        seriesData:   state.series,
        boatListData: state.boatList,
        calendarText: state.savedCalendarText,
    };

    try {
        const response = await fetch(WEB_APP_URL, {
            method: 'POST', mode: 'cors', cache: 'no-cache',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload), redirect: 'follow',
        });
        const resultText = await response.text();
        let result;
        try { result = JSON.parse(resultText); }
        catch { throw new Error('Invalid server response: ' + resultText.substring(0, 100)); }

        if (result.status === 'success') {
            console.log('Saved:', result.message);
            _saveRetryCount = 0;
            if (!state.saveQueued) updateSaveStatus('saved');
        } else {
            console.error('API error:', result.message);
            updateSaveStatus('error', 'Save error — see notification');
            showToast('Cloud save failed: ' + result.message, 'error', 8000);
        }
    } catch (error) {
        console.error('Fetch error while saving:', error);
        _saveRetryCount++;
        if (_saveRetryCount <= SAVE_RETRY_MAX) {
            const delay     = SAVE_RETRY_BASE_MS * Math.pow(2, _saveRetryCount - 1);
            const delaySecs = Math.round(delay / 1000);
            updateSaveStatus('saving', `Save failed — retrying in ${delaySecs}s…`);
            showToast(`Save failed. Retrying in ${delaySecs}s… (${_saveRetryCount}/${SAVE_RETRY_MAX})`, 'warning', delay - 500);
            _saveRetryTimeoutId = setTimeout(() => {
                state.isSaving = false;
                _saveRetryTimeoutId = null;
                _saveDataToGoogleSheet();
            }, delay);
            return;
        } else {
            console.error(`Save failed after ${SAVE_RETRY_MAX} attempts.`);
            updateSaveStatus('error', `Save failed after ${SAVE_RETRY_MAX} attempts`);
            showToast(
                `Could not save to cloud after ${SAVE_RETRY_MAX} attempts. Data is safe locally — retry when connectivity is restored.`,
                'error', 12000
            );
            _saveRetryCount = 0;
        }
    } finally {
        state.isSaving = false;
        if (state.saveQueued) {
            state.saveQueued = false;
            setTimeout(triggerSave, 100);
        }
    }
}

// ─── Load from Google Sheets ─────────────────────────────────────────────────

export async function loadDataFromGoogleSheet() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) { overlay.textContent = 'Loading from Cloud...'; overlay.classList.remove('hidden'); }

    try {
        const response = await fetch(`${WEB_APP_URL}?action=load`, { cache: 'no-cache' });
        const data     = await response.json();

        if (data.status !== 'success') {
            showToast('Could not load cloud data: ' + (data.message || 'Unknown error') + '. Starting empty.', 'error', 10000);
            state.series = []; state.boatList = []; state.savedCalendarText = '';
            return;
        }

        state.boatList          = _parseBoatList(data.boatListData);
        state.series            = _parseSeriesData(data.seriesData);
        state.savedCalendarText = data.calendarText || '';

        const textarea = document.getElementById('calendar-textarea');
        const calTab   = document.getElementById('calendar-tab');
        if (calTab?.classList.contains('active-tab') && textarea) textarea.value = state.savedCalendarText;

    } catch (error) {
        console.error('Fetch error while loading:', error);
        showToast('Could not connect to cloud: ' + error.message + '. Starting empty.', 'error', 10000);
        state.series = []; state.boatList = []; state.savedCalendarText = '';
    } finally {
        if (overlay) overlay.classList.add('hidden');
    }
}

// ─── Private parse helpers ───────────────────────────────────────────────────

function _parseBoatList(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(b => {
        if (!b || typeof b !== 'object') return null;
        const sailNumber = typeof b.sailNumber === 'string' ? b.sailNumber.trim() : '';
        const boatClass  = typeof b.boatClass  === 'string' ? b.boatClass.trim()  : '';
        const skipper    = typeof b.skipper     === 'string' ? b.skipper.trim()    : 'Unknown';
        const yardstick  = typeof b.yardstick   === 'number' && !isNaN(b.yardstick) ? b.yardstick : 0;
        if (!sailNumber || !boatClass || !skipper || yardstick <= 0) {
            console.warn('Skipping boat with missing data:', b.id); return null;
        }
        return { id: b.id || Date.now(), sailNumber, boatClass, skipper, yardstick, division: b.division };
    }).filter(Boolean);
}

function _standardizeEntryTimes(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(item => {
        const boatFromList = state.boatList.find(b => b.id === item.savedBoatId);
        let elapsed = item.elapsedTime || '';
        if (item.status === 'finished' && elapsed) {
            const secs = timeToSeconds(elapsed);
            if (secs >= 0) elapsed = secondsToTime(secs);
        }
        return {
            ...item,
            elapsedTime: elapsed,
            savedBoatId: item.savedBoatId || null,
            yardstick:   item.yardstick   || boatFromList?.yardstick || 100,
            division:    item.division    || boatFromList?.division,
        };
    });
}

function _parseRace(r, index) {
    if (!r || typeof r !== 'object') {
        return { raceNumber: index + 1, date: null, entries: [], results: [], startTime: null };
    }
    return {
        ...r,
        raceNumber: typeof r.raceNumber === 'number' ? r.raceNumber : index + 1,
        startTime:  r.startTime || null,
        date:       r.date      || null,
        entries:    _standardizeEntryTimes(r.entries),
        results:    _standardizeEntryTimes(r.results),
    };
}

function _reconcileStandardRaces(s) {
    const expected = s.numberOfRaces || 0;
    if (s.races.length === expected) return s.races;
    console.warn(`Fixing race structure for "${s.name}". Expected ${expected}, found ${s.races.length}.`);
    const existing = new Map(s.races.filter(r => r && typeof r.raceNumber === 'number').map(r => [r.raceNumber, r]));
    return Array.from({ length: expected }, (_, i) => {
        const ex = existing.get(i + 1);
        return {
            raceNumber: i + 1, date: ex?.date || null, startTime: ex?.startTime || null,
            entries: _standardizeEntryTimes(ex?.entries), results: _standardizeEntryTimes(ex?.results),
        };
    });
}

function _parseSeriesData(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map((s, index) => {
        if (!s || typeof s !== 'object') return null;
        s.id               = s.id   || (Date.now() + index);
        s.name             = s.name || `Series ${s.id}`;
        s.isShortCourse    = typeof s.isShortCourse   === 'boolean' ? s.isShortCourse   : false;
        s.discardThreshold = typeof s.discardThreshold === 'number'  ? s.discardThreshold : 0;
        s.numberOfRaces    = typeof s.numberOfRaces    === 'number'  ? s.numberOfRaces    : 0;
        delete s.dncScoringRule;
        delete s.shortCourseSingleDiscardAfter5Races;
        s.races = (Array.isArray(s.races) ? s.races : []).map(_parseRace);
        if (!s.isShortCourse) s.races = _reconcileStandardRaces(s);
        s.races.sort((a, b) => (a.raceNumber || 0) - (b.raceNumber || 0));
        return s;
    }).filter(Boolean);
}

// ─── Local JSON Import / Export ──────────────────────────────────────────────

export function exportAllData() {
    if (!state.series.length && !state.boatList.length && !state.savedCalendarText) {
        showToast('No data to export.', 'warning'); return;
    }
    try {
        _downloadJSON({
            version: EXPORT_VERSION, exportDate: new Date().toISOString(),
            seriesData: state.series, boatListData: state.boatList, calendarText: state.savedCalendarText,
        }, `lysterfield_gs_backup_all_${_todayISO()}.json`);
        showToast('Data exported successfully.', 'success');
    } catch (e) { console.error(e); showToast('Export error.', 'error'); }
}

export function exportSingleSeries(seriesId) {
    const target = state.series.find(s => s.id === seriesId);
    if (!target) { showToast('Series not found.', 'error'); return; }
    try {
        _downloadJSON(target, `series_${target.name.replace(/\s+/g, '_')}_${_todayISO()}.json`);
        showToast(`Series "${target.name}" exported.`, 'success');
    } catch (e) { console.error(e); showToast('Export error.', 'error'); }
}

export function exportBoatList() {
    if (!state.boatList.length) { showToast('No boats to export.', 'warning'); return; }
    try {
        _downloadJSON({ boatListData: state.boatList }, `lysterfield_boats_${_todayISO()}.json`);
        showToast('Boat list exported.', 'success');
    } catch (e) { console.error(e); showToast('Export error.', 'error'); }
}

export function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async e => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.seriesData && !data.boatListData) { await showAlert('Invalid file format.'); return; }
            if (!await showConfirm('This will REPLACE all current data. Are you sure?', { danger: true, confirmText: 'Replace All Data' })) return;
            state.series            = _parseSeriesData(data.seriesData   || []);
            state.boatList          = _parseBoatList(data.boatListData   || []);
            state.savedCalendarText = data.calendarText || '';
            triggerSave();
            window._afterImport?.();
            showToast('Data imported successfully.', 'success');
        } catch (err) { console.error(err); await showAlert('Failed to parse import file: ' + err.message); }
        finally { event.target.value = ''; }
    };
    reader.readAsText(file);
}

export function importSingleSeries(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async e => {
        try {
            const data     = JSON.parse(e.target.result);
            const incoming = Array.isArray(data.seriesData) ? data.seriesData[0] : data;
            if (!incoming?.name) { await showAlert('Invalid file: no valid series found.'); return; }
            const parsed = _parseSeriesData([incoming])[0];
            if (!parsed) { await showAlert('Could not parse series data.'); return; }
            const idx = state.series.findIndex(s => s.id === parsed.id);
            if (idx !== -1) {
                if (!await showConfirm(`Series "${parsed.name}" already exists. Overwrite?`, { danger: true, confirmText: 'Overwrite' })) return;
                state.series[idx] = parsed;
            } else {
                state.series.push(parsed);
            }
            triggerSave();
            window._afterImport?.();
            showToast(`Series "${parsed.name}" imported.`, 'success');
        } catch (err) { console.error(err); await showAlert('Failed to parse series file: ' + err.message); }
        finally { event.target.value = ''; }
    };
    reader.readAsText(file);
}

export function importBoatList(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async e => {
        try {
            const data     = JSON.parse(e.target.result);
            const rawBoats = data.boatListData || (Array.isArray(data) ? data : null);
            if (!rawBoats) { await showAlert('Invalid file: missing boatListData.'); return; }
            if (!await showConfirm('This will REPLACE the current boat list. Are you sure?', { danger: true, confirmText: 'Replace Boat List' })) return;
            state.boatList = _parseBoatList(rawBoats);
            triggerSave();
            window._afterImport?.();
            showToast('Boat list imported.', 'success');
        } catch (err) { console.error(err); await showAlert('Failed to parse boat list file: ' + err.message); }
        finally { event.target.value = ''; }
    };
    reader.readAsText(file);
}

function _todayISO() { return new Date().toISOString().split('T')[0]; }

function _downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
