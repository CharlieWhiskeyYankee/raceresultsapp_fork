/**
 * app.js
 * Application bootstrap.
 * Wires all DOM event listeners, exposes globals required by inline onclick
 * handlers in rendered HTML, and kicks off initialisation once the gate
 * screen is passed.
 *
 * Load order (see index.html):
 *   config.js → state.js → utils.js → storage.js → results.js → ui.js → handlers.js → app.js
 */

'use strict';

// ─── Globals required by inline onclick attributes in dynamically-rendered HTML ──
// These are functions defined in handlers.js / ui.js that get called from
// innerHTML strings.  Attaching them to window makes them reachable.
window.editEntry                        = editEntry;
window.removeEntry                      = removeEntry;
window.updateStandardEntryInTable       = updateStandardEntryInTable;
window.updateShortCoursePoolEntryDivision = updateShortCoursePoolEntryDivision;
window.editSeries                       = editSeries;
window.deleteSeries                     = deleteSeries;
window.exportSingleSeries               = exportSingleSeries;
window.editBoatInList                   = editBoatInList;
window.deleteBoatFromList               = deleteBoatFromList;
window.editShortCourseEntry             = editShortCourseEntry;
window.removeShortCourseEntry           = removeShortCourseEntry;
window.updateShortCourseEntry           = updateShortCourseEntry;
window.handleFinButtonClick             = handleFinButtonClick;
window.handleManualTimeSave             = handleManualTimeSave;
window.handleStartRace                  = handleStartRace;
window.handleStartCountdown             = handleStartCountdown;
window.handleResetStartTime             = handleResetStartTime;
window.handleSailNumberClick            = handleSailNumberClick;

// Called by storage.js after any import completes to refresh UI.
window._afterImport = function () {
    refreshSeriesList();
    refreshSeriesDropdowns();
    renderBoatListTable();
};


// ─── Main Initialisation ─────────────────────────────────────────────────────

async function initApp() {
    console.log('Initialising Lysterfield Sailing App...');

    initYardsticks();

    // Start the live timer refresh loop.
    if (raceTimerDisplayInterval) clearInterval(raceTimerDisplayInterval);
    raceTimerDisplayInterval = setInterval(updateAllVisibleTimers, 1000);

    updateSaveStatus('idle');

    // Wire the Calculate / Save buttons.
    const calculateResultsBtn = document.getElementById('calculate-results');
    if (calculateResultsBtn) {
        calculateResultsBtn.textContent = 'Calculate Results and Save';
        calculateResultsBtn.addEventListener('click', handleCalculateResults);
    }

    const saveCurrentEntriesBtn = document.getElementById('save-current-entries-btn');
    const saveScSessionBtn      = document.getElementById('save-sc-session-btn');
    saveCurrentEntriesBtn?.addEventListener('click', handleSaveCurrentEntries);
    saveScSessionBtn?.addEventListener('click', handleSaveCurrentEntries);

    // Load cloud data.
    await loadDataFromGoogleSheet();

    // Attempt to restore an interrupted short-course session from sessionStorage.
    // Must run after cloud load so the seriesId can be validated against loaded series.
    const sessionRestored = restoreSessionFromStorage();

    // Populate UI from loaded state.
    refreshSeriesList();
    refreshSeriesDropdowns();
    renderBoatListTable();
    setActiveTab(document.getElementById('series-tab'));
    updateRaceStartUI();

    // If a session was restored, switch straight to the Race Entry tab
    // on the correct series so the race officer can continue immediately.
    if (sessionRestored && currentSeries) {
        const selectSeriesEl = document.getElementById('select-series');
        if (selectSeriesEl) {
            selectSeriesEl.value = currentSeries.id;
            updateRaceEntryUI();
        }
        setActiveTab(document.getElementById('race-tab'));
        showToast(`Session restored for "${currentSeries.name}" — ${shortCourseSessionRaces.length} race(s) reloaded.`, 'info', 6000);
    }

    // Wire remaining event listeners.
    _bindStaticEventListeners();

    console.log(
        `App ready. Series: ${series.length}, Boats: ${boatList.length}, Calendar: ${savedCalendarText.length > 0}`
    );
}


// ─── Static Event Listener Wiring ────────────────────────────────────────────

function _bindStaticEventListeners() {

    // -- Tab Navigation --
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

    // -- Series Management --
    _on('create-series-btn', 'click', () => {
        const f = document.getElementById('create-series-form');
        const seriesName        = document.getElementById('series-name');
        const shortCourseCheck  = document.getElementById('series-short-course');
        const numRaces          = document.getElementById('number-of-races');
        const racesPerDiscard   = document.getElementById('races-per-discard');
        const editSeriesId      = document.getElementById('edit-series-id');
        const numRacesGroup     = document.getElementById('number-of-races-group');

        if (seriesName)       seriesName.value       = '';
        if (shortCourseCheck) { shortCourseCheck.checked = false; shortCourseCheck.dispatchEvent(new Event('change')); }
        if (numRaces)         numRaces.value          = '8';
        if (racesPerDiscard)  racesPerDiscard.value   = '4';
        if (editSeriesId)     editSeriesId.value      = '';
        if (numRacesGroup)    numRacesGroup.classList.remove('hidden');
        f?.classList.remove('hidden');
    });
    _on('save-series-btn',   'click', handleSaveSeries);
    _on('cancel-series-btn', 'click', () => document.getElementById('create-series-form')?.classList.add('hidden'));

    _on('series-short-course', 'change', e => {
        document.getElementById('number-of-races-group')?.classList.toggle('hidden', e.target.checked);
    });

    _on('view-series-select',    'change', calculateAndRenderSeriesResults);
    _on('view-all-series-select','change', displayRaceViewer);

    // -- Boat List --
    _on('show-add-boat-form-btn', 'click', () => {
        clearBoatListForm();
        document.getElementById('boat-list-form')?.classList.remove('hidden');
        document.getElementById('boat-sail-number')?.focus();
    });
    _on('save-boat-list-btn',   'click', handleSaveBoat);
    _on('cancel-boat-list-btn', 'click', clearBoatListForm);

    _on('boat-class-list', 'change', () => {
        const boatClassList       = document.getElementById('boat-class-list');
        const boatManualClassCheck = document.getElementById('boat-manual-class-check');
        const boatYardstick       = document.getElementById('boat-yardstick');
        if (boatManualClassCheck?.checked) return;
        const selected = boatClassList?.value;
        const data     = YARDSTICK_DATA.find(b => b.boatClass === selected);
        if (boatYardstick) {
            boatYardstick.value    = data ? data.yardstick : '';
            boatYardstick.readOnly = !!selected;
        }
    });

    _on('boat-manual-class-check', 'change', () => {
        const isManual            = document.getElementById('boat-manual-class-check')?.checked;
        const boatClassList       = document.getElementById('boat-class-list');
        const boatManualClassInput = document.getElementById('boat-manual-class-input');
        const boatManualBoatClass  = document.getElementById('boat-manual-boat-class');
        const boatYardstick       = document.getElementById('boat-yardstick');

        if (boatClassList)        boatClassList.disabled = isManual;
        boatManualClassInput?.classList.toggle('hidden', !isManual);

        if (!isManual) {
            if (boatManualBoatClass) boatManualBoatClass.value = '';
            boatClassList?.dispatchEvent(new Event('change'));
        } else {
            if (boatYardstick) { boatYardstick.value = ''; boatYardstick.readOnly = false; }
            if (boatClassList) boatClassList.value = '';
            boatManualBoatClass?.focus();
        }
    });

    _on('boat-yardstick', 'focus', () => {
        const isManual = document.getElementById('boat-manual-class-check')?.checked;
        const ys       = document.getElementById('boat-yardstick');
        if (!isManual && ys) ys.readOnly = false;
    });

    // -- Data Import / Export --
    _on('export-all-data-btn',  'click', exportAllData);
    _on('export-boat-list-btn', 'click', exportBoatList);

    _on('import-data-btn', 'click', () => document.getElementById('import-file-input')?.click());
    _on('import-file-input', 'change', importData);

    _on('import-series-btn', 'click', () => document.getElementById('import-series-file-input')?.click());
    _on('import-series-file-input', 'change', importSingleSeries);

    _on('import-boat-list-btn', 'click', () => document.getElementById('import-boat-list-file-input')?.click());
    _on('import-boat-list-file-input', 'change', importBoatList);

    // -- Race Entry --
    _on('select-series', 'change', updateRaceEntryUI);
    _on('select-race',   'change', updateRaceInfoAndEntries);

    _on('use-race-start-time-checkbox', 'change', () => {
        renderEntriesTable();
        renderShortCourseSessionRaces();
        updateRaceStartUI();
    });

    _on('use-bulk-entry-checkbox',   'change', updateBulkAddSectionVisibility);
    _on('use-single-entry-checkbox', 'change', () => {
        const form = document.getElementById('single-entry-form');
        form?.classList.toggle('hidden', !document.getElementById('use-single-entry-checkbox')?.checked);
    });

    _on('select-saved-boat', 'change', () => {
        const id   = document.getElementById('select-saved-boat')?.value;
        const ysEl = document.getElementById('yardstick');
        if (!ysEl) return;
        const boat = id ? boatList.find(b => String(b.id) === String(id)) : null;
        ysEl.value = boat ? boat.yardstick : '';
    });

    document.querySelectorAll('input[name="race-status"]').forEach(r =>
        r.addEventListener('change', handleStatusChange)
    );

    _on('add-boat',      'click', handleAddBoat);
    _on('update-boat',   'click', handleUpdateBoat);
    _on('cancel-update', 'click', () => {
        clearEntryForm();
        if (currentSeries?.isShortCourse) switchToShortCourseUI();
        else switchToStandardRaceUI();
    });
    _on('clear-form', 'click', () => {
        clearEntryForm();
        if (currentSeries?.isShortCourse) switchToShortCourseUI();
        else switchToStandardRaceUI();
    });
    _on('clear-all', 'click', async () => {
        if (currentSeries?.isShortCourse) {
            if (entries.length === 0) { await showAlert('Pool is already empty.'); return; }
            if (await showConfirm('Clear all boats from the Race Entries pool?')) {
                entries = [];
                renderShortCoursePoolTable();
                clearEntryForm();
            }
        } else {
            if (!currentRace) { await showAlert('Please select a race before clearing entries.'); return; }
            if (entries.length === 0) { await showAlert('Entry list is already empty.'); return; }
            if (await showConfirm(`Clear all entries for Race ${currentRace}? (Does not affect saved data.)`)) {
                entries = [];
                renderEntriesTable();
                clearEntryForm();
            }
        }
    });

    // -- Short Course Session --
    _on('create-short-course-race-btn',      'click', handleCreateShortCourseRace);
    _on('remove-last-short-course-race-btn', 'click', handleRemoveLastShortCourseRace);
    _on('clear-short-course-session-btn',    'click', handleClearShortCourseSession);
    _on('btn-add-selected-boats',            'click', handleAddSelectedBoats);

    // -- Calendar --
    _on('save-calendar-btn', 'click', saveCalendarText);
}


// ─── Gate Screen ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded. Setting up access gate.');

    const gateScreen       = document.getElementById('gate-screen');
    const accessWordInput  = document.getElementById('access-word-input');
    const accessConfirmBtn = document.getElementById('access-confirm-btn');
    const accessErrorMsg   = document.getElementById('access-error-message');
    const mainContainer    = document.querySelector('.container');

    if (!gateScreen || !accessWordInput || !accessConfirmBtn || !mainContainer) {
        console.error('Gate screen elements missing. Cannot load app.');
        document.body.innerHTML = '<h1>Error: Application components missing. Cannot load.</h1>';
        return;
    }

    gateScreen.style.display = 'flex';

    const tryAccess = async () => {
        // NOTE: This gate is intentionally not a security mechanism — it only
        // prevents accidental access by casual visitors.  The access word is
        // visible in source and provides no real protection.  If proper
        // authentication is needed, enforce it in the Google Apps Script layer
        // so that unauthenticated requests cannot read or write data at all.
        // See TODO #9 for the full discussion.
        const ACCESS_WORD = 'results';

        if (accessWordInput.value.trim().toLowerCase() === ACCESS_WORD) {
            gateScreen.style.display = 'none';
            mainContainer.classList.remove('hidden-initial');
            accessErrorMsg?.classList.add('hidden');
            await initApp();
        } else {
            accessErrorMsg?.classList.remove('hidden');
            accessWordInput.value = '';
            accessWordInput.focus();
        }
    };

    accessConfirmBtn.addEventListener('click', tryAccess);
    accessWordInput.addEventListener('keypress', e => { if (e.key === 'Enter') { e.preventDefault(); tryAccess(); } });
    accessWordInput.focus();
});


// ─── Private Helpers ─────────────────────────────────────────────────────────

/**
 * Shorthand: add an event listener to an element by id, safely.
 * @param {string}   id
 * @param {string}   event
 * @param {Function} handler
 */
function _on(id, event, handler) {
    document.getElementById(id)?.addEventListener(event, handler);
}
