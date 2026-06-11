/**
 * storage.js
 * All data persistence: Google Sheets cloud sync and local JSON import/export.
 * Depends on: config.js, state.js, utils.js, modal.js
 *
 * Error reporting uses showToast (non-blocking) instead of alert().
 * Saves use exponential backoff with a capped retry count.
 */

'use strict';

// ─── Save-Status UI ──────────────────────────────────────────────────────────

/**
 * Updates the fixed save-status badge in the top-right corner.
 * @param {'idle'|'saving'|'saved'|'error'} status
 * @param {string} [message]
 */
function updateSaveStatus(status, message = '') {
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
            el.classList.add('save-status-saving'); // reuses the red flash style
            el.textContent = message || 'Save failed';
            break;
    }
}

// ─── Background Save Queue ───────────────────────────────────────────────────

// Exponential backoff: base 5 s, doubles each attempt, capped at 5 attempts.
const SAVE_RETRY_BASE_MS  = 5_000;
const SAVE_RETRY_MAX      = 5;
let   _saveRetryCount     = 0;
let   _saveRetryTimeoutId = null;

/**
 * Schedules a cloud save.  If a save is already in progress the request is
 * queued and will be dispatched automatically when the current one completes.
 */
function triggerSave() {
    console.log('Save triggered.');
    if (isSaving) {
        saveQueued = true;
        updateSaveStatus('saving', 'Changes queued...');
        return;
    }
    // Cancel any pending retry — we have fresh data to save now.
    if (_saveRetryTimeoutId) {
        clearTimeout(_saveRetryTimeoutId);
        _saveRetryTimeoutId = null;
    }
    _saveRetryCount = 0;
    saveDataToGoogleSheet();
}

/**
 * Performs a POST to the Google Apps Script endpoint.
 * On failure, retries with exponential backoff up to SAVE_RETRY_MAX times,
 * then surfaces a persistent error in the status badge.
 */
async function saveDataToGoogleSheet() {
    if (isSaving) return;
    isSaving = true;
    updateSaveStatus('saving');
    console.log(`Saving to Google Sheet... (attempt ${_saveRetryCount + 1})`);

    const payload = {
        seriesData:   series,
        boatListData: boatList,
        calendarText: savedCalendarText,
    };

    try {
        const response = await fetch(WEB_APP_URL, {
            method:   'POST',
            mode:     'cors',
            cache:    'no-cache',
            headers:  { 'Content-Type': 'text/plain' },
            body:     JSON.stringify(payload),
            redirect: 'follow',
        });

        const resultText = await response.text();
        let result;
        try {
            result = JSON.parse(resultText);
        } catch {
            throw new Error('Invalid response from server: ' + resultText.substring(0, 100));
        }

        if (result.status === 'success') {
            console.log('Saved to Google Sheet:', result.message);
            _saveRetryCount = 0;
            if (!saveQueued) updateSaveStatus('saved');
        } else {
            // Definitive API error — don't retry, surface to user.
            console.error('API error saving to Google Sheet:', result.message);
            updateSaveStatus('error', 'Save error — see notification');
            showToast('Cloud save failed: ' + result.message, 'error', 8000);
        }
    } catch (error) {
        console.error('Fetch error while saving:', error);
        _saveRetryCount++;

        if (_saveRetryCount <= SAVE_RETRY_MAX) {
            const delay = SAVE_RETRY_BASE_MS * Math.pow(2, _saveRetryCount - 1);
            const delaySecs = Math.round(delay / 1000);
            console.log(`Save failed. Retrying in ${delaySecs}s (attempt ${_saveRetryCount}/${SAVE_RETRY_MAX})...`);
            updateSaveStatus('saving', `Save failed — retrying in ${delaySecs}s…`);
            showToast(`Save failed. Retrying in ${delaySecs}s… (${_saveRetryCount}/${SAVE_RETRY_MAX})`, 'warning', delay - 500);
            _saveRetryTimeoutId = setTimeout(() => {
                isSaving = false;
                _saveRetryTimeoutId = null;
                saveDataToGoogleSheet();
            }, delay);
            return; // Don't fall through to the finally block's queue flush.
        } else {
            // Exhausted retries.
            console.error(`Save failed after ${SAVE_RETRY_MAX} attempts. Giving up.`);
            updateSaveStatus('error', `Save failed after ${SAVE_RETRY_MAX} attempts`);
            showToast(
                `Could not save to cloud after ${SAVE_RETRY_MAX} attempts. Your data is safe locally — try refreshing when connectivity is restored.`,
                'error',
                12000
            );
            _saveRetryCount = 0;
        }
    } finally {
        isSaving = false;
        if (saveQueued) {
            saveQueued = false;
            setTimeout(triggerSave, 100);
        }
    }
}

// ─── Load from Google Sheets ─────────────────────────────────────────────────

/**
 * Fetches all app data from the Google Apps Script endpoint and populates the
 * global state arrays.  Shows/hides the loading overlay during the request.
 * Load errors are reported via showToast (non-blocking).
 */
async function loadDataFromGoogleSheet() {
    if (!WEB_APP_URL) {
        console.error('WEB_APP_URL is not defined.');
        series = []; boatList = []; savedCalendarText = '';
        return;
    }

    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.textContent = 'Loading from Cloud...';
        loadingOverlay.classList.remove('hidden');
    }

    console.log('Loading from Google Sheet...');

    try {
        const response = await fetch(`${WEB_APP_URL}?action=load`, { cache: 'no-cache' });
        const data = await response.json();

        if (data.status !== 'success') {
            console.error('Error loading from Google Sheet:', data.message);
            showToast(
                'Could not load cloud data: ' + (data.message || 'Unknown error') + '. Starting with empty data.',
                'error',
                10000
            );
            series = []; boatList = []; savedCalendarText = '';
            return;
        }

        boatList          = _parseBoatList(data.boatListData);
        series            = _parseSeriesData(data.seriesData);
        savedCalendarText = data.calendarText || '';

        // Sync calendar textarea if that tab is currently active.
        const calendarTextarea = document.getElementById('calendar-textarea');
        const calendarTab      = document.getElementById('calendar-tab');
        if (calendarTab?.classList.contains('active-tab') && calendarTextarea) {
            calendarTextarea.value = savedCalendarText;
        }
    } catch (error) {
        console.error('Fetch error while loading:', error);
        showToast(
            'Could not connect to cloud storage: ' + error.message + '. Starting with empty data.',
            'error',
            10000
        );
        series = []; boatList = []; savedCalendarText = '';
    } finally {
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
    }
}

// ─── Private parse helpers ───────────────────────────────────────────────────

function _parseBoatList(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(b => {
        if (!b || typeof b !== 'object') return null;
        const id         = b.id || Date.now();
        const sailNumber = typeof b.sailNumber === 'string' ? b.sailNumber.trim() : '';
        const boatClass  = typeof b.boatClass  === 'string' ? b.boatClass.trim()  : '';
        const skipper    = typeof b.skipper     === 'string' ? b.skipper.trim()    : 'Unknown';
        const yardstick  = typeof b.yardstick   === 'number' && !isNaN(b.yardstick) ? b.yardstick : 0;
        const division   = b.division;
        if (!sailNumber || !boatClass || !skipper || yardstick <= 0) {
            console.warn(`Load: Skipping boat with missing data. ID: ${id}`);
            return null;
        }
        return { id, sailNumber, boatClass, skipper, yardstick, division };
    }).filter(Boolean);
}

function _standardizeEntryTimes(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(item => {
        const boatFromList = boatList.find(b => b.id === item.savedBoatId);
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
    r.raceNumber = typeof r.raceNumber === 'number' ? r.raceNumber : index + 1;
    r.startTime  = r.startTime || null;
    r.date       = r.date      || null;
    r.entries    = _standardizeEntryTimes(r.entries);
    r.results    = _standardizeEntryTimes(r.results);
    return r;
}

function _reconcileStandardRaces(s) {
    const expected = s.numberOfRaces || 0;
    if (s.races.length === expected) return s.races;

    console.warn(`Load: Fixing race structure for "${s.name}". Expected ${expected}, found ${s.races.length}.`);
    const existing   = new Map(s.races.filter(r => r && typeof r.raceNumber === 'number').map(r => [r.raceNumber, r]));
    const reconciled = [];
    for (let i = 1; i <= expected; i++) {
        const ex = existing.get(i);
        reconciled.push({
            raceNumber: i,
            date:       ex?.date      || null,
            entries:    _standardizeEntryTimes(ex?.entries),
            results:    _standardizeEntryTimes(ex?.results),
            startTime:  ex?.startTime || null,
        });
    }
    return reconciled;
}

function _parseSeriesData(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map((s, index) => {
        if (!s || typeof s !== 'object') return null;

        s.id                = s.id   || (Date.now() + index);
        s.name              = s.name || `Series ${s.id}`;
        s.isShortCourse     = typeof s.isShortCourse     === 'boolean' ? s.isShortCourse     : false;
        s.discardThreshold  = typeof s.discardThreshold  === 'number'  ? s.discardThreshold  : 0;
        s.numberOfRaces     = typeof s.numberOfRaces     === 'number'  ? s.numberOfRaces     : 0;
        delete s.dncScoringRule;
        delete s.shortCourseSingleDiscardAfter5Races;

        s.races = (Array.isArray(s.races) ? s.races : []).map(_parseRace);
        if (!s.isShortCourse) s.races = _reconcileStandardRaces(s);
        s.races.sort((a, b) => (a.raceNumber || 0) - (b.raceNumber || 0));
        return s;
    }).filter(Boolean);
}

// ─── Local JSON Import / Export ──────────────────────────────────────────────

function exportAllData() {
    if (series.length === 0 && boatList.length === 0 && !savedCalendarText) {
        showToast('No data available to export.', 'warning');
        return;
    }
    try {
        const payload = {
            version:      EXPORT_VERSION,
            exportDate:   new Date().toISOString(),
            seriesData:   series,
            boatListData: boatList,
            calendarText: savedCalendarText,
        };
        _downloadJSON(payload, `lysterfield_gs_backup_all_${_todayISO()}.json`);
        showToast('Data exported successfully.', 'success');
    } catch (error) {
        console.error('Export error:', error);
        showToast('An error occurred while exporting data.', 'error');
    }
}

function exportSingleSeries(seriesId) {
    const target = series.find(s => s.id === seriesId);
    if (!target) { showToast('Error: Could not find series to export.', 'error'); return; }
    try {
        _downloadJSON(target, `series_${target.name.replace(/\s+/g, '_')}_${_todayISO()}.json`);
        showToast(`Series "${target.name}" exported.`, 'success');
    } catch (error) {
        console.error('Export single series error:', error);
        showToast('An error occurred while exporting the series.', 'error');
    }
}

function exportBoatList() {
    if (boatList.length === 0) { showToast('No boats to export.', 'warning'); return; }
    try {
        _downloadJSON({ boatListData: boatList }, `lysterfield_boats_${_todayISO()}.json`);
        showToast('Boat list exported.', 'success');
    } catch (error) {
        console.error('Export boat list error:', error);
        showToast('An error occurred while exporting the boat list.', 'error');
    }
}

/**
 * Imports a full-backup JSON file, replacing all current data.
 * @param {Event} event - change event from a file <input>
 */
function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.seriesData && !data.boatListData) {
                await showAlert('Invalid file format. Missing seriesData or boatListData.');
                return;
            }
            if (!await showConfirm('This will REPLACE all current data with the contents of this file. Are you sure?', { danger: true, confirmText: 'Replace All Data' })) return;

            series            = _parseSeriesData(data.seriesData   || []);
            boatList          = _parseBoatList(data.boatListData   || []);
            savedCalendarText = data.calendarText || '';

            triggerSave();
            window._afterImport && window._afterImport();
            showToast('Data imported successfully.', 'success');
        } catch (err) {
            console.error('Import error:', err);
            await showAlert('Failed to parse the import file: ' + err.message);
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

/**
 * Imports a single-series JSON file (add or overwrite).
 * @param {Event} event
 */
function importSingleSeries(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data     = JSON.parse(e.target.result);
            const incoming = Array.isArray(data.seriesData) ? data.seriesData[0] : data;
            if (!incoming || !incoming.name) {
                await showAlert('Invalid file: does not appear to contain a valid series.');
                return;
            }

            const parsed = _parseSeriesData([incoming])[0];
            if (!parsed) { await showAlert('Could not parse the series data.'); return; }

            const existingIdx = series.findIndex(s => s.id === parsed.id);
            if (existingIdx !== -1) {
                if (!await showConfirm(`Series "${parsed.name}" already exists. Overwrite it?`, { danger: true, confirmText: 'Overwrite' })) return;
                series[existingIdx] = parsed;
            } else {
                series.push(parsed);
            }

            triggerSave();
            window._afterImport && window._afterImport();
            showToast(`Series "${parsed.name}" imported successfully.`, 'success');
        } catch (err) {
            console.error('Import single series error:', err);
            await showAlert('Failed to parse the series file: ' + err.message);
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

/**
 * Imports a boat-list JSON file, replacing the current boat list.
 * @param {Event} event
 */
function importBoatList(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data     = JSON.parse(e.target.result);
            const rawBoats = data.boatListData || (Array.isArray(data) ? data : null);
            if (!rawBoats) { await showAlert('Invalid file: missing boatListData.'); return; }
            if (!await showConfirm('This will REPLACE the current boat list. Are you sure?', { danger: true, confirmText: 'Replace Boat List' })) return;

            boatList = _parseBoatList(rawBoats);
            triggerSave();
            window._afterImport && window._afterImport();
            showToast('Boat list imported successfully.', 'success');
        } catch (err) {
            console.error('Import boat list error:', err);
            await showAlert('Failed to parse the boat list file: ' + err.message);
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

// ─── Private helpers ─────────────────────────────────────────────────────────

function _todayISO() {
    return new Date().toISOString().split('T')[0];
}

function _downloadJSON(data, filename) {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
