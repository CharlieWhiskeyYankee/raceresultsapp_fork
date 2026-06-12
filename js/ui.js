/**
 * ui.js
 * All DOM rendering and UI update functions.
 *
 * Inline onclick= attributes have been replaced with data-action / data-*
 * attributes throughout. Event delegation in app.js picks these up from
 * stable parent containers, so no handler references need to be on window.
 */

import { YARDSTICK_DATA, RACE_STATUSES, DIVISIONS } from './config.js';
import { state } from './state.js';
import { secondsToTime, escapeHtml, pluralize } from './utils.js';
import { deduplicateResults, calculateSeriesStandings } from './results.js';

// ─── Tab Navigation ───────────────────────────────────────────────────────────

export function setActiveTab(tabElement) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active-tab'));
    document.querySelectorAll('.tab-buttons button').forEach(b => b.classList.remove('active-button'));
    if (!tabElement) return;

    tabElement.classList.add('active-tab');
    const btn = document.getElementById('btn-' + tabElement.id.replace('-tab', ''));
    if (btn) btn.classList.add('active-button');

    if (tabElement.id !== 'race-tab') {
        state.editMode = false;
        document.getElementById('edit-mode-warning')?.classList.add('hidden');
    }
    if (tabElement.id !== 'boat-list-tab') document.getElementById('boat-list-form')?.classList.add('hidden');
    if (tabElement.id !== 'series-tab')    document.getElementById('create-series-form')?.classList.add('hidden');

    if (tabElement.id === 'results-tab')      loadRaceResults();
    if (tabElement.id === 'race-tab')         updateBulkAddSectionVisibility();
    if (tabElement.id === 'calendar-tab') {
        const ta = document.getElementById('calendar-textarea');
        if (ta) ta.value = state.savedCalendarText;
    }
}

// ─── Boat List ────────────────────────────────────────────────────────────────

export function renderBoatListTable() {
    const body = document.getElementById('boat-list-body');
    if (!body) return;
    body.innerHTML = '';

    const sorted = [...state.boatList].sort((a, b) => {
        const s = a.sailNumber.localeCompare(b.sailNumber, undefined, { numeric: true });
        return s !== 0 ? s : a.skipper.localeCompare(b.skipper);
    });

    if (sorted.length === 0) {
        const cell = body.insertRow().insertCell();
        cell.colSpan = 6; cell.textContent = 'No boats saved yet.';
        Object.assign(cell.style, { textAlign: 'center', fontStyle: 'italic', color: '#666' });
    } else {
        sorted.forEach(boat => {
            const row = body.insertRow();
            row.innerHTML = `
                <td>${escapeHtml(boat.sailNumber)}</td>
                <td>${escapeHtml(boat.boatClass)}</td>
                <td>${escapeHtml(boat.skipper)}</td>
                <td>${escapeHtml(boat.yardstick)}</td>
                <td>${escapeHtml(boat.division)}</td>
                <td class="actions">
                    <button class="btn-edit"   data-action="edit-boat"   data-boat-id="${boat.id}">Edit</button>
                    <button class="btn-danger" data-action="delete-boat" data-boat-id="${boat.id}">Delete</button>
                </td>`;
        });
    }
    populateSavedBoatDropdown();
    updateBulkAddSectionVisibility();
}

// ─── Race Entries Table ───────────────────────────────────────────────────────

export function renderEntriesTable() {
    const body      = document.getElementById('entries-body');
    const heading   = document.getElementById('current-entries-heading');
    const timerOn   = document.getElementById('use-race-start-time-checkbox')?.checked || false;
    if (!body) return;
    body.innerHTML  = '';

    if (heading) heading.textContent = state.currentRace ? `Entries — Race ${state.currentRace}` : 'Entries';

    if (state.entries.length === 0) {
        const cell = body.insertRow().insertCell();
        cell.colSpan = 8; cell.textContent = state.currentRace ? 'No entries for this race.' : 'Select a race to view entries.';
        Object.assign(cell.style, { textAlign: 'center', fontStyle: 'italic', color: '#666' });
        return;
    }

    state.entries.forEach((entry, index) => {
        const row = body.insertRow();
        row.dataset.entryIndex = index;

        const statusOpts   = _buildStatusOptions(entry.status);
        const divOpts      = _buildDivisionOptions(entry.division);
        const sailClass    = _getSailNumberClass(entry, timerOn);
        const timeDisabled = entry.status !== 'finished' ? 'disabled' : '';

        let actionsHTML = '';
        if (timerOn && (entry.status === '' || entry.status === 'finished')) {
            const finClass = (entry.elapsedTime && entry.elapsedTime.length > 0) ? 'btn-danger' : 'btn-edit';
            actionsHTML += `<button class="fin-btn ${finClass}" data-action="finish-entry" data-index="${index}">FINISH</button>`;
        }
        actionsHTML += `<button class="btn-danger" data-action="remove-entry" data-index="${index}">Rem</button>`;

        row.innerHTML = `
            <td class="${sailClass}" ${timerOn ? 'data-action="sail-click"' : ''} data-index="${index}">${escapeHtml(entry.sailNumber)}</td>
            <td>${escapeHtml(entry.boatClass)}</td>
            <td>${escapeHtml(entry.skipper)}</td>
            <td>${escapeHtml(entry.yardstick)}</td>
            <td><select class="table-entry-select" data-action="update-entry-field" data-index="${index}" data-field="division">${divOpts}</select></td>
            <td><select class="table-entry-select" data-action="update-entry-field" data-index="${index}" data-field="status">${statusOpts}</select></td>
            <td>
                <span style="display:flex;align-items:center;gap:4px;">
                    <input type="text" class="table-entry-input" value="${escapeHtml(entry.elapsedTime || '')}" placeholder="h:m:s or m:s" ${timeDisabled}>
                    <button class="btn-save" data-action="save-time" data-index="${index}" style="padding:3px 6px;font-size:10px;min-width:auto;">Save</button>
                </span>
            </td>
            <td class="actions">${actionsHTML}</td>`;
    });
}

// ─── Short Course Pool Table ──────────────────────────────────────────────────

export function renderShortCoursePoolTable() {
    const body    = document.getElementById('short-course-pool-body');
    const heading = document.getElementById('short-course-pool-heading');
    const display = document.getElementById('short-course-staging-display');
    if (!body) return;
    body.innerHTML = '';
    if (heading) heading.textContent = 'Race Entries Pool';
    display?.classList.remove('hidden');

    if (state.entries.length === 0) {
        const cell = body.insertRow().insertCell();
        cell.colSpan = 6; cell.textContent = 'No boats in pool.';
        Object.assign(cell.style, { textAlign: 'center', fontStyle: 'italic', color: '#666' });
        return;
    }

    state.entries.forEach((entry, index) => {
        const row = body.insertRow();
        row.innerHTML = `
            <td>${escapeHtml(entry.sailNumber)}</td>
            <td>${escapeHtml(entry.boatClass)}</td>
            <td>${escapeHtml(entry.skipper)}</td>
            <td>${escapeHtml(entry.yardstick)}</td>
            <td><select class="table-entry-select" data-action="update-pool-division" data-index="${index}">${_buildDivisionOptions(entry.division)}</select></td>
            <td class="actions"><button class="btn-danger" data-action="remove-entry" data-index="${index}">Rem</button></td>`;
    });
}

// ─── Short Course Session Races ───────────────────────────────────────────────

export function renderShortCourseSessionRaces() {
    const container = document.getElementById('short-course-races-container');
    const timerOn   = document.getElementById('use-race-start-time-checkbox')?.checked || false;
    if (!container) return;
    container.innerHTML = '<h3>Created Races (This Session)</h3>';

    if (state.shortCourseSessionRaces.length === 0) {
        container.innerHTML += '<p>No races created yet.</p>';
        return;
    }

    [...state.shortCourseSessionRaces]
        .sort((a, b) => a.raceNumber - b.raceNumber)
        .forEach((raceData, sessionIdx) => {
            const isStarted = !!raceData.startTime;
            const section   = document.createElement('div');
            section.classList.add('short-course-race-section');

            const widgetHTML = `
                <div class="sc-race-controls" data-race-index="${sessionIdx}">
                    <h4 style="margin-top:0;">Race ${raceData.raceNumber} (${raceData.entries.length} ${pluralize(raceData.entries.length, 'Boat')})</h4>
                    <p class="start-time-display">Race Not Started</p>
                    <div class="elapsed-time-box elapsed-time-highlight">00:00:00</div>
                    <div>
                        <button class="btn-warning ${isStarted ? 'hidden' : ''}" data-action="sc-countdown" data-sc-index="${sessionIdx}">3 Min Countdown</button>
                        <button class="btn-edit ${isStarted ? 'hidden' : ''}"    data-action="sc-start"     data-sc-index="${sessionIdx}">Start Race</button>
                        <button class="btn-danger ${!isStarted ? 'hidden' : ''}" data-action="sc-reset"     data-sc-index="${sessionIdx}">Reset Start Time</button>
                    </div>
                </div>`;

            const sortedEntries = [...raceData.entries].sort((a, b) =>
                a.sailNumber.localeCompare(b.sailNumber, undefined, { numeric: true })
            );

            let rows = '';
            sortedEntries.forEach((entry, entryIdx) => {
                const sailClass    = _getSailNumberClass(entry, timerOn);
                const timeDisabled = (entry.status !== 'finished' && entry.status !== '') ? 'disabled' : '';

                let actionsHTML = '';
                if (timerOn && (entry.status === '' || entry.status === 'finished')) {
                    const finClass = (entry.elapsedTime?.length > 0) ? 'btn-danger' : 'btn-edit';
                    actionsHTML += `<button class="fin-btn ${finClass}" data-action="finish-entry" data-index="${entryIdx}" data-sc-index="${sessionIdx}">FINISH</button>`;
                }
                actionsHTML += `<button class="btn-danger" data-action="remove-sc-entry" data-index="${entryIdx}" data-sc-index="${sessionIdx}">Rem</button>`;

                rows += `
                    <tr data-entry-index="${entryIdx}">
                        <td class="${sailClass}" ${timerOn ? 'data-action="sail-click"' : ''} data-index="${entryIdx}" data-sc-index="${sessionIdx}">${escapeHtml(entry.sailNumber)}</td>
                        <td>${escapeHtml(entry.boatClass)}</td>
                        <td>${escapeHtml(entry.skipper)}</td>
                        <td>${escapeHtml(entry.yardstick)}</td>
                        <td><select class="table-entry-select" data-action="update-sc-field" data-index="${entryIdx}" data-sc-index="${sessionIdx}" data-field="division">${_buildDivisionOptions(entry.division)}</select></td>
                        <td class="short-course-race-entry"><select class="sc-status-select" data-action="update-sc-field" data-index="${entryIdx}" data-sc-index="${sessionIdx}" data-field="status">${_buildStatusOptions(entry.status)}</select></td>
                        <td class="short-course-race-entry">
                            <span style="display:flex;align-items:center;gap:4px;">
                                <input type="text" class="sc-time-input table-entry-input" value="${escapeHtml(entry.elapsedTime || '')}" placeholder="h:m:s / m:s" ${timeDisabled}>
                                <button class="btn-save" data-action="save-time" data-index="${entryIdx}" data-sc-index="${sessionIdx}" style="padding:3px 6px;font-size:10px;min-width:auto;">Save</button>
                            </span>
                        </td>
                        <td class="actions">${actionsHTML}</td>
                    </tr>`;
            });

            section.innerHTML = widgetHTML + `
                <div style="overflow-x:auto;">
                    <table class="short-course-race-table">
                        <thead><tr>
                            <th>Sail #</th><th>Boat Class</th><th>Skipper</th><th>Yardstick</th>
                            <th>Div</th><th>Status</th><th>Elapsed Time</th><th>Actions</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`;
            container.appendChild(section);
        });
}

// ─── Race Results Tab ─────────────────────────────────────────────────────────

export function renderRaceResults() {
    const container = document.getElementById('results-output-container');
    const infoEl    = document.getElementById('result-race-info');
    if (!container || !infoEl) return;
    container.innerHTML = '';

    if (!state.currentSeries || typeof state.currentRace !== 'number') {
        infoEl.innerHTML    = `<div class="race-info-panel"><h3>Race Information</h3><p>No results calculated yet. Use the Race Entry tab.</p></div>`;
        container.innerHTML = '<p style="text-align:center;font-style:italic;color:#666;">No results to display.</p>';
        return;
    }

    infoEl.innerHTML = `
        <div class="race-info-panel">
            <h3>Race Information</h3>
            <p><strong>Series:</strong> ${escapeHtml(state.currentSeries.name)}</p>
            <p><strong>Race Number:</strong> ${state.currentRace}</p>
            <p><strong>Entries:</strong> ${state.results?.length || 0}</p>
        </div>
        <p style="margin-top:10px;">Results calculated. Review carefully before publishing.</p>`;

    if (!state.results?.length) {
        container.innerHTML = '<p style="text-align:center;font-style:italic;color:#666;">No results for this race.</p>';
        return;
    }
    _renderResultsTable(container, deduplicateResults(state.results));
}

export function loadRaceResults() {
    if (!state.currentSeries || typeof state.currentRace !== 'number') { renderRaceResults(); return; }
    const s    = state.series.find(s => s.id === state.currentSeries.id);
    const race = s?.races.find(r => r.raceNumber === state.currentRace);
    if (race?.results?.length > 0) state.results = race.results;
    renderRaceResults();
}

// ─── Series Results ───────────────────────────────────────────────────────────

export function calculateAndRenderSeriesResults() {
    const viewSeries = document.getElementById('view-series-select');
    const container  = document.getElementById('series-results-container');
    const legendEl   = document.querySelector('.legend');
    if (!container) return;
    container.innerHTML = '';

    const selectedSeries = state.series.find(s => s.id == viewSeries?.value);
    if (!selectedSeries) { container.innerHTML = '<p>Select a series to view standings.</p>'; return; }

    const allDivisions = [...new Set(
        selectedSeries.races.flatMap(r => (r.results || []).map(res => String(res.division)))
    )].sort();

    if (allDivisions.length === 0) { container.innerHTML = '<p>No results saved yet.</p>'; return; }

    allDivisions.forEach(division => {
        const standings = calculateSeriesStandings(selectedSeries, division);
        if (!standings.length) return;

        const header = document.createElement('h2');
        header.classList.add('division-results-header');
        header.textContent = `Div ${division}`;
        container.appendChild(header);

        const raceNumbers = standings[0]?.raceNumbers || [];
        const table = document.createElement('table');
        table.classList.add('results-table', 'series-results-table');
        let headRow = '<tr><th>Pos</th><th>Sail #</th><th>Skipper</th><th>Boat Class</th>';
        raceNumbers.forEach(rn => headRow += `<th>R${rn}</th>`);
        headRow += '<th>Total</th><th>Net</th></tr>';
        table.innerHTML = `<thead>${headRow}</thead><tbody></tbody>`;

        standings.forEach(competitor => {
            const row = table.querySelector('tbody').insertRow();
            let html  = `<td>${competitor.position}</td><td>${escapeHtml(competitor.sailNumber)}</td><td>${escapeHtml(competitor.skipper)}</td><td>${escapeHtml(competitor.boatClass)}</td>`;
            raceNumbers.forEach(rn => {
                const score = competitor.raceScores.get(rn);
                if (!score || score.status === 'NR') {
                    html += `<td class="nr-cell" title="No Race">NR</td>`;
                } else {
                    const pts  = score.points !== null && !isNaN(score.points) ? score.points : '-';
                    const st   = score.status.toUpperCase();
                    const cell = st !== 'FINISHED' ? `${pts}(${st})` : pts;
                    html += `<td class="${score.discarded ? 'discarded' : ''}" title="${escapeHtml(st)} (Pos: ${score.position ?? st})">${cell}</td>`;
                }
            });
            html += `<td>${competitor.totalPoints}</td><td><strong>${competitor.netPoints}</strong></td>`;
            row.innerHTML = html;
        });

        container.appendChild(table);
    });

    if (legendEl) {
        legendEl.innerHTML = `<strong>Legend:</strong>
            <span class="discarded-example">15</span> Discarded,&nbsp;
            <span class="nr-cell">NR</span> No Race,&nbsp; DNF Did Not Finish,&nbsp; DNS Did Not Start,&nbsp;
            OCS On Course Side,&nbsp; DSQ Disqualified,&nbsp; OOD Race Officer Duty,&nbsp; DNC Did Not Compete`;
    }
}

// ─── Race Viewer Tab ──────────────────────────────────────────────────────────

export function displayRaceViewer() {
    const viewAllSeries = document.getElementById('view-all-series-select');
    const raceSummary   = document.getElementById('race-summary-view');
    const raceSelector  = document.querySelector('.race-selector');
    const raceInfo      = document.getElementById('individual-race-info');
    const raceResults   = document.getElementById('individual-race-results-container');
    if (!raceSelector) return;

    raceSelector.innerHTML = '';
    if (raceInfo)    raceInfo.innerHTML    = '';
    if (raceResults) raceResults.innerHTML = '';

    const selectedSeries = state.series.find(s => s.id == viewAllSeries?.value);
    if (!selectedSeries) { if (raceSummary) raceSummary.innerHTML = '<p>Select a series above.</p>'; return; }
    if (raceSummary) raceSummary.innerHTML = '';

    const raceNumbers = selectedSeries.isShortCourse
        ? selectedSeries.races.map(r => r.raceNumber)
        : Array.from({ length: selectedSeries.numberOfRaces }, (_, i) => i + 1);

    let lastWithResults = -1;
    raceNumbers.forEach(num => {
        const race = selectedSeries.races.find(r => r.raceNumber === num);
        const btn  = document.createElement('button');
        btn.classList.add('race-button');
        btn.dataset.raceNumber = num;
        btn.textContent = `Race ${num}`;
        if (race?.results?.length > 0) { btn.classList.add('has-results'); lastWithResults = num; }
        btn.addEventListener('click', e => {
            document.querySelectorAll('.race-button.active').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            displayRaceResultsView(selectedSeries, num);
        });
        raceSelector.appendChild(btn);
    });

    const target = lastWithResults !== -1 ? lastWithResults : (raceNumbers[0] ?? null);
    if (target !== null) {
        const btn = raceSelector.querySelector(`.race-button[data-race-number="${target}"]`);
        if (btn) { btn.classList.add('active'); displayRaceResultsView(selectedSeries, target); }
    }
}

export function displayRaceResultsView(selectedSeriesData, raceNumber) {
    const raceResults = document.getElementById('individual-race-results-container');
    const raceInfo    = document.getElementById('individual-race-info');
    if (!raceResults || !raceInfo || !selectedSeriesData) return;
    raceResults.innerHTML = '';
    raceInfo.innerHTML    = '';

    const race = selectedSeriesData.races.find(r => r.raceNumber === parseInt(raceNumber));
    if (!race?.results?.length) {
        raceInfo.innerHTML    = `<div class="race-info-panel"><h3>Race ${raceNumber}</h3><p>No results saved.</p></div>`;
        raceResults.innerHTML = '<p style="text-align:center;font-style:italic;color:#666;">No results for this race.</p>';
        return;
    }

    let html = `<div class="race-info-panel"><h3>Race ${race.raceNumber} Results</h3>
        <p><strong>Date:</strong> ${race.date || 'Not Set'}</p>`;
    if (race.startTime) html += `<p><strong>Start:</strong> ${new Date(race.startTime).toLocaleTimeString()}</p>`;
    html += `<p><strong>Entries:</strong> ${race.results.length}</p></div>`;
    raceInfo.innerHTML = html;

    _renderResultsTable(raceResults, deduplicateResults(race.results));
}

// ─── Series List ──────────────────────────────────────────────────────────────

export function refreshSeriesList() {
    const list = document.getElementById('series-list');
    if (!list) return;
    list.innerHTML = '';

    if (state.series.length === 0) { list.innerHTML = '<p>No series defined. Create one first.</p>'; return; }

    state.series.forEach(s => {
        const card    = document.createElement('div');
        const withRes = s.races.filter(r => r.results?.length > 0).length;
        const type    = s.isShortCourse ? 'Short Course' : 'Standard';
        const disc    = (s.discardThreshold ?? 0) > 0 ? `1 per ${s.discardThreshold} completed` : 'No discards';

        let details = `<strong>Type:</strong> ${type}`;
        details += s.isShortCourse
            ? ` | <strong>Races Saved:</strong> ${s.races.length}`
            : ` | <strong>Races:</strong> ${s.numberOfRaces} planned (${withRes} done)`;
        details += ` | <strong>Discards:</strong> ${disc}`;

        card.classList.add('race-card');
        card.innerHTML = `
            <div class="race-info"><h3>${escapeHtml(s.name)}</h3></div>
            <p class="series-card-details">${details}</p>
            <div class="race-actions">
                <button class="btn-edit"      data-action="edit-series"   data-series-id="${s.id}">Edit</button>
                <button class="btn-secondary" data-action="export-series" data-series-id="${s.id}">Export</button>
                <button class="btn-danger"    data-action="delete-series" data-series-id="${s.id}">Del</button>
            </div>`;
        list.appendChild(card);
    });
}

export function refreshSeriesDropdowns() {
    ['select-series', 'view-series-select', 'view-all-series-select'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const prev = el.value;
        el.innerHTML = '<option value="">Select Series</option>';
        [...state.series].sort((a, b) => a.name.localeCompare(b.name)).forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id; opt.textContent = s.name + (s.isShortCourse ? ' (Short Course)' : '');
            el.appendChild(opt);
        });
        if (prev && state.series.some(s => s.id == prev)) el.value = prev;
    });

    setTimeout(() => {
        if (document.getElementById('race-tab')?.classList.contains('active-tab')) updateRaceEntryUI();
    }, 0);
}

// ─── Race Entry UI helpers ────────────────────────────────────────────────────

export function populateSavedBoatDropdown() {
    const el = document.getElementById('select-saved-boat');
    if (!el) return;
    const prev = el.value;
    el.innerHTML = '<option value="">-- Select Saved Boat --</option>';
    [...state.boatList]
        .sort((a, b) => {
            const s = a.sailNumber.localeCompare(b.sailNumber, undefined, { numeric: true });
            return s !== 0 ? s : a.skipper.localeCompare(b.skipper);
        })
        .forEach(boat => {
            const opt = document.createElement('option');
            opt.value = boat.id;
            opt.textContent = `${boat.sailNumber} - ${boat.skipper} (${boat.boatClass} YS:${boat.yardstick} Div:${boat.division})`;
            el.appendChild(opt);
        });
    if (state.boatList.some(b => b.id == prev)) el.value = prev;
}

export function updateRaceEntryUI() {
    const selectSeries   = document.getElementById('select-series');
    const selectRace     = document.getElementById('select-race');
    const raceDateGroup  = document.getElementById('race-date-group');
    const saveEntriesBtn = document.getElementById('save-current-entries-btn');
    const saveScBtn      = document.getElementById('save-sc-session-btn');

    state.entries = [];
    state.shortCourseSessionRaces = [];
    raceDateGroup?.classList.add('hidden');
    saveEntriesBtn?.classList.add('hidden');
    saveScBtn?.classList.add('hidden');
    updateBulkAddSectionVisibility();

    const seriesId = selectSeries?.value;
    if (!seriesId) {
        state.currentSeries = null; state.currentRace = null;
        switchToStandardRaceUI();
        if (selectRace) selectRace.innerHTML = '<option value="">-- Select Race --</option>';
        renderEntriesTable(); clearEntryForm(); renderShortCoursePoolTable(); renderShortCourseSessionRaces(); updateRaceStartUI();
        return;
    }

    state.currentSeries = state.series.find(s => s.id === parseInt(seriesId)) || null;
    if (!state.currentSeries) { updateRaceEntryUI(); return; }

    if (state.currentSeries.isShortCourse) {
        switchToShortCourseUI();
    } else {
        switchToStandardRaceUI();
        updateRaceDropdown();
    }
}

export function updateRaceDropdown() {
    const selectRace = document.getElementById('select-race');
    if (!selectRace || !state.currentSeries || state.currentSeries.isShortCourse) {
        if (selectRace) selectRace.innerHTML = '';
        updateRaceInfoAndEntries(); return;
    }
    const oldVal = selectRace.value;
    _populateRaceOptions(selectRace, state.currentSeries, true, true);
    selectRace.value = ([...selectRace.options].some(o => o.value === oldVal)) ? oldVal : '';
    updateRaceInfoAndEntries();
}

export function updateRaceInfoAndEntries() {
    const selectRace      = document.getElementById('select-race');
    const raceDateGroup   = document.getElementById('race-date-group');
    const raceDateInput   = document.getElementById('race-date');
    const raceDateLabel   = document.getElementById('race-date-label');
    const saveEntriesBtn  = document.getElementById('save-current-entries-btn');
    const editModeWarning = document.getElementById('edit-mode-warning');

    const noRace = () => {
        state.entries = []; state.currentRace = null; state.editMode = false;
        editModeWarning?.classList.add('hidden');
        raceDateGroup?.classList.add('hidden');
        saveEntriesBtn?.classList.add('hidden');
        renderEntriesTable(); clearEntryForm(); updateRaceStartUI();
    };

    if (!state.currentSeries || state.currentSeries.isShortCourse) { noRace(); return; }
    if (!selectRace?.value) { noRace(); return; }

    state.currentRace = parseInt(selectRace.value);
    if (isNaN(state.currentRace)) { state.currentRace = null; noRace(); return; }

    saveEntriesBtn?.classList.remove('hidden');
    raceDateGroup?.classList.remove('hidden');
    if (raceDateLabel) raceDateLabel.textContent = 'Race Date:';

    const race = state.currentSeries.races.find(r => r.raceNumber === state.currentRace);
    if (raceDateInput) raceDateInput.value = race?.date || new Date().toISOString().split('T')[0];

    const savedEntries = race?.entries || [];
    if (savedEntries.length > 0) {
        state.entries  = JSON.parse(JSON.stringify(savedEntries));
        state.editMode = !!(race?.results?.length > 0);
        if (state.editMode && editModeWarning) {
            editModeWarning.classList.remove('hidden');
            editModeWarning.textContent = `⚠ Race ${state.currentRace} has saved results. Editing entries may require recalculating.`;
        }
    } else {
        state.entries  = [];
        state.editMode = false;
        editModeWarning?.classList.add('hidden');
    }

    renderEntriesTable(); clearEntryForm(); updateRaceStartUI();
}

export function switchToStandardRaceUI() {
    document.getElementById('race-selector-wrapper')?.classList.remove('hidden');
    document.getElementById('standard-entry-fields')?.classList.remove('hidden');
    document.getElementById('standard-entries-display')?.classList.remove('hidden');
    document.getElementById('short-course-staging-display')?.classList.add('hidden');
    document.getElementById('short-course-races-container')?.classList.add('hidden');
    document.getElementById('clear-short-course-session-btn')?.classList.add('hidden');
    const et = document.getElementById('entry-form-title');
    const ab = document.getElementById('add-boat');
    const ca = document.getElementById('clear-all');
    if (et) et.textContent = 'Add Boat to Race';
    if (ab) ab.textContent = 'Add Boat';
    if (ca) ca.textContent = 'Clear All Entries';
}

export function switchToShortCourseUI() {
    document.getElementById('race-selector-wrapper')?.classList.add('hidden');
    document.getElementById('standard-entry-fields')?.classList.add('hidden');
    document.getElementById('main-form-status-group')?.classList.add('hidden');
    document.getElementById('time-inputs')?.classList.add('hidden');
    document.getElementById('standard-entries-display')?.classList.add('hidden');
    document.getElementById('short-course-staging-display')?.classList.remove('hidden');
    document.getElementById('short-course-races-container')?.classList.remove('hidden');
    document.getElementById('clear-short-course-session-btn')?.classList.remove('hidden');

    const et = document.getElementById('entry-form-title');
    const ab = document.getElementById('add-boat');
    const ca = document.getElementById('clear-all');
    const sr = document.getElementById('select-race');
    const dg = document.getElementById('race-date-group');
    const dl = document.getElementById('race-date-label');
    const di = document.getElementById('race-date');
    if (et) et.textContent = 'Add Boat to Entries';
    if (ab) ab.textContent = 'Add Single Boat';
    if (ca) ca.textContent = 'Clear Current Entries';
    if (sr) sr.innerHTML   = '';
    state.currentRace = null;

    if (dg) dg.classList.remove('hidden');
    if (dl) dl.textContent = 'Session Date:';
    const firstDate = state.currentSeries?.races.reduce((min, r) => r.raceNumber < min.num ? { num: r.raceNumber, date: r.date } : min, { num: Infinity, date: null })?.date;
    if (di) di.value = firstDate || new Date().toISOString().split('T')[0];

    renderShortCoursePoolTable();
    renderShortCourseSessionRaces();
    updateCreateRaceButton();
    updateRemoveLastRaceButtonVisibility();
    updateRaceStartUI();
}

export function updateCreateRaceButton() {
    const btn = document.getElementById('create-short-course-race-btn');
    if (!btn) return;
    const nums = state.shortCourseSessionRaces.map(r => r.raceNumber);
    btn.textContent = `Create Race ${nums.length > 0 ? Math.max(...nums) + 1 : 1}`;
}

export function updateRemoveLastRaceButtonVisibility() {
    document.getElementById('remove-last-short-course-race-btn')
        ?.classList.toggle('hidden', state.shortCourseSessionRaces.length === 0);
}

export function updateRaceStartUI() {
    const widget   = document.getElementById('race-start-widget');
    const checkbox = document.getElementById('use-race-start-time-checkbox');
    if (!widget) return;
    const show = checkbox?.checked && state.currentSeries && !state.currentSeries.isShortCourse && state.currentRace;
    widget.classList.toggle('hidden', !show);
    if (!show) return;

    const race        = state.currentSeries.races.find(r => r.raceNumber === state.currentRace);
    const hasStart    = !!race?.startTime;
    widget.querySelector('button.btn-warning')?.classList.toggle('hidden', hasStart);
    widget.querySelector('button.btn-edit')?.classList.toggle('hidden', hasStart);
    widget.querySelector('button.btn-danger')?.classList.toggle('hidden', !hasStart);
}

export function updateAllVisibleTimers() {
    const now = Date.now();
    const updateWidget = (widget, startTime) => {
        if (!widget) return;
        const displayEl = widget.querySelector('.elapsed-time-box');
        const startDisp = widget.querySelector('.start-time-display');
        if (!displayEl || !startDisp) return;

        if (startTime) {
            const diff = startTime - now;
            startDisp.textContent = `Starts at: ${new Date(startTime).toLocaleTimeString()}`;
            if (diff > 0) {
                const sec = Math.ceil(diff / 1000);
                displayEl.textContent = `-${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
                displayEl.classList.add('countdown-highlight');
                displayEl.classList.remove('elapsed-time-highlight');
            } else {
                displayEl.textContent = secondsToTime(Math.floor(-diff / 1000));
                displayEl.classList.remove('countdown-highlight');
                displayEl.classList.add('elapsed-time-highlight');
            }
        } else {
            displayEl.textContent = '00:00:00';
            displayEl.classList.remove('countdown-highlight');
            displayEl.classList.add('elapsed-time-highlight');
            startDisp.textContent = 'Race Not Started';
        }
    };

    const mainWidget = document.getElementById('race-start-widget');
    if (mainWidget && !mainWidget.classList.contains('hidden')) {
        const race = state.currentSeries && !state.currentSeries.isShortCourse && state.currentRace
            ? state.currentSeries.races.find(r => r.raceNumber === state.currentRace) : null;
        updateWidget(mainWidget, race?.startTime || null);
    }

    document.querySelectorAll('.sc-race-controls').forEach(w => {
        const idx = parseInt(w.dataset.raceIndex, 10);
        if (!isNaN(idx) && state.shortCourseSessionRaces[idx]) {
            updateWidget(w, state.shortCourseSessionRaces[idx].startTime || null);
        }
    });
}

export function updateBulkAddSectionVisibility() {
    const checkbox  = document.getElementById('use-bulk-entry-checkbox');
    const section   = document.getElementById('bulk-add-boats-section');
    const container = document.getElementById('bulk-boat-list-container');
    if (!section || !container) return;
    const show = checkbox?.checked && state.boatList.length > 0 && state.currentSeries;
    section.classList.toggle('hidden', !show);
    if (!show) return;

    container.innerHTML = '';
    [...state.boatList]
        .sort((a, b) => a.sailNumber.localeCompare(b.sailNumber, undefined, { numeric: true }))
        .forEach(boat => {
            const item = document.createElement('div');
            item.classList.add('bulk-boat-item');
            item.innerHTML = `
                <input type="checkbox" id="bulk-boat-${boat.id}" value="${boat.id}">
                <label for="bulk-boat-${boat.id}">
                    <span class="bulk-boat-details">
                        ${escapeHtml(boat.sailNumber)} — ${escapeHtml(boat.skipper)} (${escapeHtml(boat.boatClass)}, YS: ${boat.yardstick}, Div: ${boat.division})
                    </span>
                </label>`;
            container.appendChild(item);
        });
}

export function initYardsticks() {
    const list = document.getElementById('boat-class-list');
    if (!list) return;
    list.innerHTML = '<option value="">Select boat class</option>';
    [...YARDSTICK_DATA].sort((a, b) => a.boatClass.localeCompare(b.boatClass)).forEach(({ boatClass, yardstick }) => {
        const opt = document.createElement('option');
        opt.value = boatClass; opt.textContent = `${boatClass} (${yardstick})`;
        list.appendChild(opt);
    });
}

export function clearEntryForm() {
    const ys   = document.getElementById('yardstick');
    const eidx = document.getElementById('editing-entry-index');
    const scidx = document.getElementById('editing-short-course-race-index');
    const add  = document.getElementById('add-boat');
    const upd  = document.getElementById('update-boat');
    const canc = document.getElementById('cancel-update');
    const sel  = document.getElementById('select-saved-boat');
    if (ys)   ys.value   = '';
    if (eidx) eidx.value = '-1';
    if (scidx) scidx.value = '-1';
    if (add)  add.style.display = 'inline-block';
    upd?.classList.add('hidden');
    canc?.classList.add('hidden');
    if (sel)  sel.value = '';
    document.getElementById('main-form-status-group')?.classList.add('hidden');
    document.getElementById('time-inputs')?.classList.add('hidden');
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function _buildStatusOptions(current) {
    return RACE_STATUSES.map(s =>
        `<option value="${s}" ${current === s ? 'selected' : ''}>${s === '' ? '-- Select --' : s.toUpperCase()}</option>`
    ).join('');
}

function _buildDivisionOptions(current) {
    return DIVISIONS.map(d =>
        `<option value="${d}" ${current == d ? 'selected' : ''}>${d}</option>`
    ).join('');
}

function _getSailNumberClass(entry, timerOn) {
    if (!timerOn) return 'sail-number-disabled';
    return 'sail-number-btn' + (entry.status !== '' ? ' finished' : '');
}

function _populateRaceOptions(dropdown, seriesData, showDetails, addPlaceholder = false) {
    dropdown.innerHTML = '';
    if (addPlaceholder) {
        const ph = document.createElement('option');
        ph.value = ''; ph.textContent = '-- Select Race --';
        dropdown.appendChild(ph);
    }
    const hasPotential = seriesData.isShortCourse
        ? seriesData.races?.length > 0
        : (typeof seriesData.numberOfRaces === 'number' && seriesData.numberOfRaces > 0);
    if (!hasPotential) { dropdown.disabled = true; return; }
    dropdown.disabled = false;

    const sorted   = [...(seriesData.races || [])].sort((a, b) => a.raceNumber - b.raceNumber);
    const raceNums = seriesData.isShortCourse
        ? sorted.map(r => r.raceNumber)
        : Array.from({ length: seriesData.numberOfRaces }, (_, i) => i + 1);

    raceNums.forEach(num => {
        const race = sorted.find(r => r.raceNumber === num);
        const opt  = document.createElement('option');
        opt.value  = num;
        let text   = `Race ${num}`;
        if (showDetails) text += race?.results?.length > 0 ? ' (Saved)' : (!seriesData.isShortCourse ? ' (Not Saved)' : '');
        opt.textContent = text;
        dropdown.appendChild(opt);
    });
}

function _renderResultsTable(container, resultsArray) {
    const divisions = [...new Set(resultsArray.map(r => String(r.division)))].sort();
    divisions.forEach(division => {
        const divResults = resultsArray
            .filter(r => String(r.division) === division)
            .sort((a, b) => {
                const posA = typeof a.position === 'number' ? a.position : Infinity;
                const posB = typeof b.position === 'number' ? b.position : Infinity;
                return posA !== posB ? posA - posB : (a.points ?? Infinity) - (b.points ?? Infinity);
            });
        if (!divResults.length) return;

        const header = document.createElement('h2');
        header.classList.add('division-results-header');
        header.textContent = `Div ${division}`;
        container.appendChild(header);

        const table = document.createElement('table');
        table.classList.add('results-table');
        table.innerHTML = `
            <thead><tr>
                <th>Pos</th><th>Sail No</th><th>Boat Type</th><th>Helm</th>
                <th>YS</th><th>Finish</th><th>Elapsed</th><th>Corrected</th><th>Points</th>
            </tr></thead><tbody></tbody>`;

        divResults.forEach(r => {
            const row = table.querySelector('tbody').insertRow();
            row.innerHTML = `
                <td>${r.position ?? '-'}</td>
                <td>${escapeHtml(r.sailNumber)}</td>
                <td>${escapeHtml(r.boatClass)}</td>
                <td>${escapeHtml(r.skipper)}</td>
                <td>${escapeHtml(r.yardstick)}</td>
                <td>${escapeHtml((r.status || '').toUpperCase()) || 'N/F'}</td>
                <td>${escapeHtml(r.elapsedTime || '-')}</td>
                <td>${escapeHtml(r.correctedTime || '-')}</td>
                <td>${r.points ?? '-'}</td>`;
        });
        container.appendChild(table);
    });
}
