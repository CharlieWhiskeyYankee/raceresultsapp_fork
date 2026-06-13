/**
 * app.js
 * Application entry point.
 *
 * Responsibilities:
 *   1. Gate screen — simple access check before loading the app.
 *   2. initApp() — loads cloud data, restores session, renders initial UI.
 *   3. _bindStaticListeners() — wires all stable DOM event listeners.
 *   4. _bindDelegatedListeners() — single delegation handler per container,
 *      replacing all the former window.xxx = handler globals.
 *
 * No handler functions live on window. All data-action routing is done here.
 */

import { YARDSTICK_DATA } from './config.js';
import { state, clearEntries, setTimerInterval } from './state.js';
import { showAlert, showConfirm, showToast } from './modal.js';
import { restoreSessionFromStorage } from './session.js';
import {
    updateSaveStatus, loadDataFromGoogleSheet, triggerSave,
    exportAllData, exportSingleSeries, exportBoatList,
    importData, importSingleSeries, importBoatList,
} from './storage.js';
import {
    setActiveTab, renderBoatListTable, renderEntriesTable,
    renderShortCoursePoolTable, renderShortCourseSessionRaces,
    refreshSeriesList, refreshSeriesDropdowns,
    calculateAndRenderSeriesResults, displayRaceViewer,
    updateRaceEntryUI, updateRaceInfoAndEntries, updateRaceStartUI,
    updateBulkAddSectionVisibility, updateAllVisibleTimers,
    updateCreateRaceButton, updateRemoveLastRaceButtonVisibility,
    switchToShortCourseUI, switchToStandardRaceUI,
    initYardsticks, clearEntryForm, populateSavedBoatDropdown,
} from './ui.js';
import {
    handleAddBoat, handleUpdateBoat, handleSaveBoat, handleSaveSeries,
    handleCalculateResults, handleSaveCurrentEntries,
    handleCreateShortCourseRace, handleRemoveLastShortCourseRace,
    handleClearShortCourseSession, handleAddSelectedBoats,
    handleStartRace, handleStartCountdown, handleResetStartTime,
    handleFinButtonClick, handleSailNumberClick, handleManualTimeSave,
    handleStatusChange, saveCalendarText,
    editEntry, editShortCourseEntry, removeEntry, removeShortCourseEntry,
    editBoatInList, deleteBoatFromList, clearBoatListForm,
    editSeries, deleteSeries,
    updateEntryField, updateShortCourseEntryField, updatePoolEntryDivision,
} from './handlers.js';

// ─── After-import hook for storage.js ────────────────────────────────────────
// storage.js calls window._afterImport() when an import completes.
// We wire it here so storage doesn't need to import ui/handlers directly.
window._afterImport = () => {
    refreshSeriesList();
    refreshSeriesDropdowns();
    renderBoatListTable();
};

// ─── Initialisation ───────────────────────────────────────────────────────────

async function initApp() {
    console.log('Initialising Lysterfield Sailing App...');

    initYardsticks();

    if (state.raceTimerDisplayInterval) clearInterval(state.raceTimerDisplayInterval);
    setTimerInterval(setInterval(updateAllVisibleTimers, 1000));

    updateSaveStatus('idle');

    await loadDataFromGoogleSheet();

    const sessionRestored = restoreSessionFromStorage();

    refreshSeriesList();
    refreshSeriesDropdowns();
    renderBoatListTable();
    setActiveTab(document.getElementById('series-tab'));
    updateRaceStartUI();

    if (sessionRestored && state.currentSeries) {
        const sel = document.getElementById('select-series');
        if (sel) { sel.value = state.currentSeries.id; updateRaceEntryUI(); }
        setActiveTab(document.getElementById('race-tab'));
        showToast(`Session restored for "${state.currentSeries.name}" — ${state.shortCourseSessionRaces.length} race(s) reloaded.`, 'info', 6000);
    }

    _bindStaticListeners();
    _bindDelegatedListeners();

    console.log(`App ready. Series: ${state.series.length}, Boats: ${state.boatList.length}`);
}

// ─── Static Event Listeners ───────────────────────────────────────────────────

function _bindStaticListeners() {

    // Tab buttons
    _on('btn-series',         'click', () => setActiveTab(document.getElementById('series-tab')));
    _on('btn-boat-list',      'click', () => setActiveTab(document.getElementById('boat-list-tab')));
    _on('btn-race',           'click', () => setActiveTab(document.getElementById('race-tab')));
    _on('btn-results',        'click', () => setActiveTab(document.getElementById('results-tab')));
    _on('btn-series-results', 'click', () => {
        setActiveTab(document.getElementById('series-results-tab'));
        if (document.getElementById('view-series-select')?.value) calculateAndRenderSeriesResults();
    });
    _on('btn-race-view', 'click', () => {
        setActiveTab(document.getElementById('race-view-tab'));
        if (document.getElementById('view-all-series-select')?.value) displayRaceViewer();
    });
    _on('btn-calendar', 'click', () => setActiveTab(document.getElementById('calendar-tab')));

    // Series management
    _on('create-series-btn', 'click', () => {
        ['series-name', 'edit-series-id'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        const sc = document.getElementById('series-short-course');
        if (sc) { sc.checked = false; sc.dispatchEvent(new Event('change')); }
        _setVal('number-of-races', '8');
        _setVal('races-per-discard', '4');
        document.getElementById('number-of-races-group')?.classList.remove('hidden');
        document.getElementById('create-series-form')?.classList.remove('hidden');
    });
    _on('save-series-btn',   'click', handleSaveSeries);
    _on('cancel-series-btn', 'click', () => document.getElementById('create-series-form')?.classList.add('hidden'));
    _on('series-short-course', 'change', e => {
        document.getElementById('number-of-races-group')?.classList.toggle('hidden', e.target.checked);
    });
    _on('view-series-select',     'change', calculateAndRenderSeriesResults);
    _on('view-all-series-select', 'change', displayRaceViewer);

    // Boat list
    _on('show-add-boat-form-btn', 'click', () => {
        clearBoatListForm();
        document.getElementById('boat-list-form')?.classList.remove('hidden');
        document.getElementById('boat-sail-number')?.focus();
    });
    _on('save-boat-list-btn',   'click', handleSaveBoat);
    _on('cancel-boat-list-btn', 'click', clearBoatListForm);

    _on('boat-class-list', 'change', () => {
        const isManual = document.getElementById('boat-manual-class-check')?.checked;
        if (isManual) return;
        const selected = document.getElementById('boat-class-list')?.value;
        const data     = YARDSTICK_DATA.find(b => b.boatClass === selected);
        const ys       = document.getElementById('boat-yardstick');
        if (ys) { ys.value = data ? data.yardstick : ''; ys.readOnly = !!selected; }
    });

    _on('boat-manual-class-check', 'change', () => {
        const isManual  = document.getElementById('boat-manual-class-check')?.checked;
        const classList = document.getElementById('boat-class-list');
        const manInput  = document.getElementById('boat-manual-class-input');
        const manClass  = document.getElementById('boat-manual-boat-class');
        const ys        = document.getElementById('boat-yardstick');
        if (classList) classList.disabled = isManual;
        manInput?.classList.toggle('hidden', !isManual);
        if (!isManual) {
            if (manClass) manClass.value = '';
            classList?.dispatchEvent(new Event('change'));
        } else {
            if (ys) { ys.value = ''; ys.readOnly = false; }
            if (classList) classList.value = '';
            manClass?.focus();
        }
    });

    _on('boat-yardstick', 'focus', () => {
        if (!document.getElementById('boat-manual-class-check')?.checked) {
            const ys = document.getElementById('boat-yardstick');
            if (ys) ys.readOnly = false;
        }
    });

    // Data management
    _on('export-all-data-btn',  'click', exportAllData);
    _on('export-boat-list-btn', 'click', exportBoatList);
    _on('import-data-btn',      'click', () => document.getElementById('import-file-input')?.click());
    _on('import-file-input',    'change', importData);
    _on('import-series-btn',    'click', () => document.getElementById('import-series-file-input')?.click());
    _on('import-series-file-input', 'change', importSingleSeries);
    _on('import-boat-list-btn', 'click', () => document.getElementById('import-boat-list-file-input')?.click());
    _on('import-boat-list-file-input', 'change', importBoatList);

    // Race entry
    _on('select-series', 'change', updateRaceEntryUI);
    _on('select-race',   'change', updateRaceInfoAndEntries);

    _on('use-race-start-time-checkbox', 'change', () => {
        renderEntriesTable();
        renderShortCourseSessionRaces();
        updateRaceStartUI();
    });
    _on('use-bulk-entry-checkbox',   'change', updateBulkAddSectionVisibility);
    _on('use-single-entry-checkbox', 'change', () => {
        document.getElementById('single-entry-form')
            ?.classList.toggle('hidden', !document.getElementById('use-single-entry-checkbox')?.checked);
    });

    _on('select-saved-boat', 'change', () => {
        const id   = document.getElementById('select-saved-boat')?.value;
        const ysEl = document.getElementById('yardstick');
        if (!ysEl) return;
        const boat = id ? state.boatList.find(b => String(b.id) === String(id)) : null;
        ysEl.value = boat ? boat.yardstick : '';
    });

    document.querySelectorAll('input[name="race-status"]').forEach(r =>
        r.addEventListener('change', handleStatusChange)
    );

    _on('add-boat',      'click', handleAddBoat);
    _on('update-boat',   'click', handleUpdateBoat);
    _on('cancel-update', 'click', () => {
        clearEntryForm();
        if (state.currentSeries?.isShortCourse) switchToShortCourseUI();
        else switchToStandardRaceUI();
    });
    _on('clear-form', 'click', () => {
        clearEntryForm();
        if (state.currentSeries?.isShortCourse) switchToShortCourseUI();
        else switchToStandardRaceUI();
    });

    _on('clear-all', 'click', async () => {
        if (state.currentSeries?.isShortCourse) {
            if (!state.entries.length) { await showAlert('Pool is already empty.'); return; }
            if (await showConfirm('Clear all boats from the pool?')) {
                clearEntries();
                renderShortCoursePoolTable();
                clearEntryForm();
            }
        } else {
            if (!state.currentRace) { await showAlert('Select a race first.'); return; }
            if (!state.entries.length) { await showAlert('Entry list is already empty.'); return; }
            if (await showConfirm(`Clear all entries for Race ${state.currentRace}?`)) {
                clearEntries();
                renderEntriesTable();
                clearEntryForm();
            }
        }
    });

    _on('save-current-entries-btn', 'click', handleSaveCurrentEntries);
    _on('save-sc-session-btn',      'click', handleSaveCurrentEntries);
    _on('calculate-results',        'click', handleCalculateResults);

    // Short course
    _on('create-short-course-race-btn',      'click', handleCreateShortCourseRace);
    _on('remove-last-short-course-race-btn', 'click', handleRemoveLastShortCourseRace);
    _on('clear-short-course-session-btn',    'click', handleClearShortCourseSession);
    _on('btn-add-selected-boats',            'click', handleAddSelectedBoats);

    // Main race-start widget (standard races, scIdx = -1)
    _on('race-start-widget', 'click', e => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        if (action === 'sc-countdown') handleStartCountdown(e, -1);
        if (action === 'sc-start')     handleStartRace(e, -1);
        if (action === 'sc-reset')     handleResetStartTime(e, -1);
    });

    // Calendar
    _on('save-calendar-btn', 'click', saveCalendarText);
}

// ─── Delegated Event Listeners ────────────────────────────────────────────────
// Each container gets one delegated listener. data-action on rendered elements
// routes to the correct handler. This replaces all former onclick= attributes
// and all window.xxx = handler assignments.

function _bindDelegatedListeners() {

    // ── Series list (edit / export / delete series) ──
    _delegate('series-list', 'click', (e, btn) => {
        const id = parseInt(btn.dataset.seriesId);
        if (isNaN(id)) return;
        const action = btn.dataset.action;
        if (action === 'edit-series')   editSeries(id);
        if (action === 'export-series') exportSingleSeries(id);
        if (action === 'delete-series') deleteSeries(id);
    });

    // ── Boat list table ──
    _delegate('boat-list-body', 'click', (e, btn) => {
        const id = parseInt(btn.dataset.boatId);
        if (isNaN(id)) return;
        if (btn.dataset.action === 'edit-boat')   editBoatInList(id);
        if (btn.dataset.action === 'delete-boat') deleteBoatFromList(id);
    });

    // ── Standard entries table ──
    _delegate('entries-body', 'click', (e, el) => {
        const action = el.dataset.action;
        const index  = parseInt(el.dataset.index);
        const scIdx  = parseInt(el.dataset.scIndex ?? '-1');
        if (action === 'remove-entry')  removeEntry(index);
        if (action === 'finish-entry')  handleFinButtonClick(el, index, scIdx >= 0 ? scIdx : -1);
        if (action === 'sail-click')    handleSailNumberClick(index, scIdx >= 0 ? scIdx : -1);
        if (action === 'save-time')     handleManualTimeSave(el, index, scIdx >= 0 ? scIdx : -1);
    });

    _delegate('entries-body', 'change', (e, el) => {
        if (el.dataset.action !== 'update-entry-field') return;
        updateEntryField(parseInt(el.dataset.index), el.dataset.field, el.value);
    });

    // ── Short course pool table ──
    _delegate('short-course-pool-body', 'click', (e, el) => {
        if (el.dataset.action === 'remove-entry') removeEntry(parseInt(el.dataset.index));
    });

    _delegate('short-course-pool-body', 'change', (e, el) => {
        if (el.dataset.action === 'update-pool-division') updatePoolEntryDivision(parseInt(el.dataset.index), el.value);
    });

    // ── Short course races container (created races) ──
    _delegate('short-course-races-container', 'click', (e, el) => {
        const action   = el.dataset.action;
        const index    = parseInt(el.dataset.index ?? '-1');
        const scIdx    = parseInt(el.dataset.scIndex ?? '-1');
        if (action === 'sc-start')     handleStartRace(e, scIdx);
        if (action === 'sc-countdown') handleStartCountdown(e, scIdx);
        if (action === 'sc-reset')     handleResetStartTime(e, scIdx);
        if (action === 'finish-entry') handleFinButtonClick(el, index, scIdx);
        if (action === 'sail-click')   handleSailNumberClick(index, scIdx);
        if (action === 'save-time')    handleManualTimeSave(el, index, scIdx);
        if (action === 'remove-sc-entry') removeShortCourseEntry(scIdx, index);
    });

    _delegate('short-course-races-container', 'change', (e, el) => {
        if (el.dataset.action === 'update-sc-field') {
            updateShortCourseEntryField(parseInt(el.dataset.scIndex), parseInt(el.dataset.index), el.dataset.field, el.value);
        }
    });
}

// ─── Gate Screen ──────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const gateScreen  = document.getElementById('gate-screen');
    const input       = document.getElementById('access-word-input');
    const confirmBtn  = document.getElementById('access-confirm-btn');
    const errorMsg    = document.getElementById('access-error-message');
    const mainApp     = document.querySelector('.container');

    if (!gateScreen || !input || !confirmBtn || !mainApp) {
        document.body.innerHTML = '<h1>Error: Application components missing.</h1>';
        return;
    }

    // NOTE: This gate is intentionally not a security mechanism — it only
    // prevents casual accidental access. The word is visible in source.
    // For real security, enforce authentication in the Google Apps Script layer.
    const ACCESS_WORD = 'results';

    const tryAccess = async () => {
        if (input.value.trim().toLowerCase() === ACCESS_WORD) {
            gateScreen.style.display = 'none';
            mainApp.classList.remove('hidden-initial');
            errorMsg?.classList.add('hidden');
            await initApp();
        } else {
            errorMsg?.classList.remove('hidden');
            input.value = '';
            input.focus();
        }
    };

    confirmBtn.addEventListener('click', tryAccess);
    input.addEventListener('keypress', e => { if (e.key === 'Enter') { e.preventDefault(); tryAccess(); } });
    input.focus();
});

// ─── Private helpers ──────────────────────────────────────────────────────────

/** Add a listener to an element by ID, safely. */
function _on(id, event, handler) {
    document.getElementById(id)?.addEventListener(event, handler);
}

/** Set value of an element by ID, safely. */
function _setVal(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
}

/**
 * Attach a delegated listener to a container by ID.
 * The handler receives (event, matchedElement) where matchedElement is the
 * closest ancestor-or-self that has a data-action attribute.
 */
function _delegate(containerId, event, handler) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.addEventListener(event, e => {
        const el = e.target.closest('[data-action]');
        if (el && el.dataset.action && container.contains(el)) handler(e, el);
    });
}
