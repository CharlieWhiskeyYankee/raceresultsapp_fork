/**
 * handlers.js
 * All user-action business logic.
 * All alert/confirm use modal.js. All state access uses state.xxx.
 */

import { YARDSTICK_DATA } from './config.js';
import { state, addEntry, removeEntry, updateEntry, setEntries, clearEntries, setResults, clearResults, addSeries, updateSeriesAtIndex, removeSeriesAtIndex, setBoatList, addBoat, updateBoatAtIndex, removeBoatAtIndex, setCalendarText, addShortCourseRace, removeLastShortCourseRace, clearShortCourseSession, setShortCourseSessionRaces, setCurrentSeries, setCurrentRace, setEditMode } from './state.js';
import { timeToSeconds, secondsToTime, isValidTimeFormat, pluralize } from './utils.js';
import { showAlert, showConfirm, showToast } from './modal.js';
import { triggerSave } from './storage.js';
import { saveSessionToStorage, clearSessionStorage } from './session.js';
import { calculateSingleRaceResults } from './results.js';
import {
    renderEntriesTable, renderShortCoursePoolTable, renderShortCourseSessionRaces,
    renderBoatListTable, renderRaceResults, refreshSeriesList, refreshSeriesDropdowns,
    calculateAndRenderSeriesResults, displayRaceViewer, loadRaceResults,
    populateSavedBoatDropdown, updateRaceEntryUI, updateRaceStartUI, clearEntryForm,
    switchToShortCourseUI, switchToStandardRaceUI, updateCreateRaceButton,
    updateRemoveLastRaceButtonVisibility, updateBulkAddSectionVisibility, setActiveTab,
} from './ui.js';

// ─── Entry Form ───────────────────────────────────────────────────────────────

export function handleStatusChange() {
    const selected  = document.querySelector('input[name="race-status"]:checked');
    const timeInputs = document.getElementById('time-inputs');
    const elapsed   = document.getElementById('elapsed-time');
    if (!selected || !timeInputs) return;
    timeInputs.style.display = selected.value === 'finished' ? 'block' : 'none';
    if (selected.value !== 'finished' && elapsed) elapsed.value = '';
}

async function _getEntryFormData() {
    const selectSavedBoat    = document.getElementById('select-saved-boat');
    const yardstickInput     = document.getElementById('yardstick');
    const elapsedTimeInput   = document.getElementById('elapsed-time');
    const standardFields     = document.getElementById('standard-entry-fields');
    const statusGroup        = document.getElementById('main-form-status-group');

    const boatId = selectSavedBoat?.value;
    if (!boatId)  { await showAlert('Please select a boat from the dropdown.'); return null; }

    const savedBoat = state.boatList.find(b => String(b.id) === String(boatId));
    if (!savedBoat) { await showAlert('Selected boat not found.'); return null; }

    const ys = parseFloat(yardstickInput?.value);
    if (isNaN(ys) || ys <= 0) { await showAlert('Valid positive Yardstick is required.'); yardstickInput?.focus(); return null; }

    const statusTimeActive = statusGroup && !statusGroup.classList.contains('hidden');
    let status = '', elapsed = '';

    if (statusTimeActive) {
        status = document.querySelector('input[name="race-status"]:checked')?.value || '';
        const raw = elapsedTimeInput?.value.trim() || '';
        if (status === 'finished') {
            if (!raw)                      { await showAlert('Elapsed time is required for finished status.'); return null; }
            if (timeToSeconds(raw) === -1) { await showAlert('Invalid time format. Use h:m:s, m:s, etc.'); return null; }
            elapsed = raw;
        }
    } else if (state.currentSeries?.isShortCourse) {
        status = 'pool';
    }

    return {
        savedBoatId: savedBoat.id, sailNumber: savedBoat.sailNumber, boatClass: savedBoat.boatClass,
        skipper: savedBoat.skipper, yardstick: ys, division: savedBoat.division, status, elapsedTime: elapsed,
    };
}

// ─── Add / Update / Remove ────────────────────────────────────────────────────

export async function handleAddBoat() {
    const entryData = await _getEntryFormData();
    if (!entryData) return;

    if (state.currentSeries?.isShortCourse) {
        if (state.entries.some(e => e.savedBoatId === entryData.savedBoatId)) {
            await showAlert(`Boat "${entryData.sailNumber}" is already in the pool.`); return;
        }
        addEntry(entryData);
        state.shortCourseSessionRaces.forEach(race => {
            if (!race.entries.some(e => e.savedBoatId === entryData.savedBoatId)) {
                race.entries.push({ ...entryData, status: 'DNS', elapsedTime: '' });
            }
        });
        if (state.shortCourseSessionRaces.length > 0) renderShortCourseSessionRaces();
        renderShortCoursePoolTable();
    } else {
        if (!state.currentRace) { await showAlert('Please select a race before adding boats.'); return; }
        if (state.entries.some(e => e.savedBoatId === entryData.savedBoatId)) {
            await showAlert(`Boat "${entryData.sailNumber}" is already in this race.`); return;
        }
        addEntry(entryData);
        renderEntriesTable();
    }

    const sel = document.getElementById('select-saved-boat');
    const ys  = document.getElementById('yardstick');
    if (sel) { sel.value = ''; sel.focus(); }
    if (ys)  ys.value = '';
}

export async function handleUpdateBoat() {
    const index       = parseInt(document.getElementById('editing-entry-index')?.value);
    const scRaceIndex = parseInt(document.getElementById('editing-short-course-race-index')?.value);

    if (state.currentSeries?.isShortCourse) {
        if (scRaceIndex >= 0 && scRaceIndex < state.shortCourseSessionRaces.length && index >= 0) {
            await _updateShortCourseRaceEntry(scRaceIndex, index);
        } else if (scRaceIndex === -1 && index >= 0 && index < state.entries.length) {
            await _updatePoolEntry(index);
        } else {
            await showAlert('Error updating entry. Index out of bounds.');
        }
    } else {
        await _updateStandardEntry(index);
    }

    clearEntryForm();
    if (state.currentSeries?.isShortCourse) switchToShortCourseUI();
    else switchToStandardRaceUI();
}

async function _updateShortCourseRaceEntry(scIdx, index) {
    const targetEntries = state.shortCourseSessionRaces[scIdx].entries;
    if (index >= targetEntries.length) { await showAlert('Index out of bounds.'); return; }
    const boat = await _getBoatAndYardstickFromForm();
    if (!boat) return;
    if (targetEntries.some((e, i) => i !== index && e.savedBoatId === boat.savedBoatId)) {
        await showAlert(`Boat "${boat.sailNumber}" is already in this race.`); return;
    }
    const formData = await _getEntryFormData();
    Object.assign(targetEntries[index], boat);
    if (formData) { targetEntries[index].status = formData.status; targetEntries[index].elapsedTime = formData.elapsedTime; }
    renderShortCourseSessionRaces();
}

async function _updatePoolEntry(index) {
    const entryData = await _getEntryFormData();
    if (!entryData) return;
    if (state.entries.some((e, i) => i !== index && e.savedBoatId === entryData.savedBoatId)) {
        await showAlert(`Boat "${entryData.sailNumber}" is already in the pool.`); return;
    }
    setEntries(state.entries.map((e, i) => i === index ? entryData : e));
    state.shortCourseSessionRaces.forEach(race => {
        const e = race.entries.find(e => e.savedBoatId === entryData.savedBoatId);
        if (e) e.division = entryData.division;
    });
    renderShortCoursePoolTable();
    renderShortCourseSessionRaces();
}

async function _updateStandardEntry(index) {
    const entryData = await _getEntryFormData();
    if (!entryData) return;
    if (!state.currentRace)                                  { await showAlert('No race selected.'); return; }
    if (index < 0 || index >= state.entries.length)         { await showAlert('Index out of bounds.'); return; }
    if (state.entries.some((e, i) => i !== index && e.savedBoatId === entryData.savedBoatId)) {
        await showAlert(`Boat "${entryData.sailNumber}" is already in this race.`); return;
    }
    Object.assign(state.entries[index], entryData);
    renderEntriesTable();
}

async function _getBoatAndYardstickFromForm() {
    const sel = document.getElementById('select-saved-boat');
    const ys  = document.getElementById('yardstick');
    const boatId = sel?.value;
    if (!boatId) { await showAlert('Please select a boat.'); return null; }
    const boat = state.boatList.find(b => String(b.id) === String(boatId));
    if (!boat)  { await showAlert('Boat not found.'); return null; }
    const yardstick = parseFloat(ys?.value);
    if (isNaN(yardstick) || yardstick <= 0) { await showAlert('Valid positive Yardstick is required.'); ys?.focus(); return null; }
    return { savedBoatId: boat.id, sailNumber: boat.sailNumber, boatClass: boat.boatClass, skipper: boat.skipper, yardstick, division: boat.division };
}

export async function removeEntry(index) {
    if (index < 0 || index >= state.entries.length) return;
    if (!await showConfirm(`Remove entry for ${state.entries[index]?.sailNumber || 'this boat'}?`)) return;
    if (state.currentSeries?.isShortCourse) {
        const boatId = state.entries[index].savedBoatId;
        state.shortCourseSessionRaces.forEach(race => { race.entries = race.entries.filter(e => e.savedBoatId !== boatId); });
    }
    removeEntry(index);
    if (state.currentSeries?.isShortCourse) { renderShortCoursePoolTable(); renderShortCourseSessionRaces(); }
    else renderEntriesTable();
}

export async function removeShortCourseEntry(raceIdx, entryIdx) {
    if (raceIdx < 0 || raceIdx >= state.shortCourseSessionRaces.length) return;
    const entries = state.shortCourseSessionRaces[raceIdx].entries;
    if (entryIdx < 0 || entryIdx >= entries.length) return;
    if (!await showConfirm(`Remove ${entries[entryIdx]?.sailNumber || 'this boat'} from Race ${state.shortCourseSessionRaces[raceIdx].raceNumber}?`)) return;
    entries.splice(entryIdx, 1);
    renderShortCourseSessionRaces();
}

export function editEntry(index) {
    const entry = state.entries[index];
    if (!entry) return;
    _populateEditForm(entry, index, -1, state.currentSeries?.isShortCourse ? 'Edit Pool Entry' : `Edit Entry (Race ${state.currentRace})`);
}

export function editShortCourseEntry(raceIdx, entryIdx) {
    if (raceIdx < 0 || raceIdx >= state.shortCourseSessionRaces.length) return;
    const entry = state.shortCourseSessionRaces[raceIdx].entries[entryIdx];
    if (!entry) return;
    _populateEditForm(entry, entryIdx, raceIdx, `Edit Entry in SC Race ${state.shortCourseSessionRaces[raceIdx].raceNumber}`);
}

function _populateEditForm(entry, index, scRaceIndex, title) {
    clearEntryForm();
    const checkbox    = document.getElementById('use-single-entry-checkbox');
    const form        = document.getElementById('single-entry-form');
    if (checkbox) checkbox.checked = true;
    form?.classList.remove('hidden');

    const els = {
        sel:     document.getElementById('select-saved-boat'),
        ys:      document.getElementById('yardstick'),
        eidx:    document.getElementById('editing-entry-index'),
        scidx:   document.getElementById('editing-short-course-race-index'),
        statusG: document.getElementById('main-form-status-group'),
        stdF:    document.getElementById('standard-entry-fields'),
        title:   document.getElementById('entry-form-title'),
        add:     document.getElementById('add-boat'),
        upd:     document.getElementById('update-boat'),
        canc:    document.getElementById('cancel-update'),
        elapsed: document.getElementById('elapsed-time'),
    };

    if (els.sel && entry.savedBoatId) els.sel.value = entry.savedBoatId;
    if (els.ys)    els.ys.value    = entry.yardstick;
    if (els.eidx)  els.eidx.value  = index;
    if (els.scidx) els.scidx.value = scRaceIndex;
    if (els.statusG) els.statusG.classList.remove('hidden');
    if (els.elapsed) els.elapsed.value = entry.elapsedTime || '';
    if (els.stdF)  els.stdF.classList.remove('hidden');
    if (els.title) els.title.textContent = title;
    if (els.add)   els.add.style.display = 'none';
    els.upd?.classList.remove('hidden');
    els.canc?.classList.remove('hidden');

    const radio = document.getElementById(`status-${(entry.status || '').toLowerCase()}`);
    if (radio) radio.checked = true;
    else { const fin = document.getElementById('status-finished'); if (fin) fin.checked = true; }
    handleStatusChange();
    els.sel?.focus();
    els.sel?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ─── In-table Updates ────────────────────────────────────────────────────────

export function updateEntryField(index, field, value) {
    if (index < 0 || index >= state.entries.length) return;
    const updated = { ...state.entries[index], [field]: value };
    if (field === 'status' && value !== 'finished') updated.elapsedTime = '';
    updateEntry(index, updated);
    if (field === 'status') renderEntriesTable();
}

export function updateShortCourseEntryField(raceIdx, entryIdx, field, value) {
    if (raceIdx < 0 || raceIdx >= state.shortCourseSessionRaces.length) return;
    const entry = state.shortCourseSessionRaces[raceIdx].entries[entryIdx];
    if (!entry) return;
    entry[field] = value;
    if (field === 'status' && value !== 'finished') entry.elapsedTime = '';
    if (field === 'status') renderShortCourseSessionRaces();
}

export function updatePoolEntryDivision(index, value) {
    if (index < 0 || index >= state.entries.length) return;
    const boatId = state.entries[index].savedBoatId;
    updateEntry(index, { division: value });
    state.shortCourseSessionRaces.forEach(race => {
        const e = race.entries.find(e => e.savedBoatId === boatId);
        if (e) e.division = value;
    });
    renderShortCourseSessionRaces();
}

// ─── Manual Time Save ────────────────────────────────────────────────────────

export async function handleManualTimeSave(btn, entryIndex, scIdx = -1) {
    const row       = btn.closest('tr');
    const timeInput = row?.querySelector('input[type="text"]');
    if (!timeInput) return;

    const raw   = timeInput.value.trim();
    const entry = scIdx >= 0 ? state.shortCourseSessionRaces[scIdx]?.entries[entryIndex] : state.entries[entryIndex];
    if (!entry) return;

    if (!raw) {
        if (entry.status === 'finished') { entry.elapsedTime = ''; entry.status = ''; }
    } else {
        const secs = timeToSeconds(raw);
        if (secs === -1) { await showAlert('Invalid time format. Use h:m:s, m:s, etc.'); return; }
        entry.elapsedTime = secondsToTime(secs);
        if (entry.status !== 'finished') entry.status = 'finished';
    }

    _persistEntryChange(entry, scIdx);
    triggerSave();
    if (scIdx >= 0) { saveSessionToStorage(); renderShortCourseSessionRaces(); }
    else renderEntriesTable();
}

// ─── Finish / Sail Number Click ───────────────────────────────────────────────

export async function handleFinButtonClick(btn, entryIndex, scIdx = -1) {
    const raceData    = scIdx >= 0 ? state.shortCourseSessionRaces[scIdx] : state.currentSeries?.races.find(r => r.raceNumber === state.currentRace);
    const raceStart   = raceData?.startTime || null;
    const entry       = scIdx >= 0 ? raceData?.entries[entryIndex] : state.entries[entryIndex];
    if (!entry) return;

    if (entry.status !== 'finished' && entry.status !== '') {
        await showAlert("Boat status must be 'Finished' or blank to use the Finish button."); return;
    }
    if (entry.elapsedTime && isValidTimeFormat(entry.elapsedTime)) {
        if (!await showConfirm('Clear the finish time for this boat?')) return;
        entry.elapsedTime = ''; entry.status = '';
    } else {
        if (!raceStart)        { await showAlert("Race start time not recorded. Click 'Start Race' first."); return; }
        if (Date.now() < raceStart) { await showAlert('Error: Current time is before race start.'); return; }
        entry.elapsedTime = secondsToTime(Math.round((Date.now() - raceStart) / 1000));
        entry.status = 'finished';
    }

    _persistEntryChange(entry, scIdx);
    triggerSave();
    if (scIdx >= 0) { saveSessionToStorage(); renderShortCourseSessionRaces(); }
    else renderEntriesTable();
}

export async function handleSailNumberClick(entryIndex, scIdx = -1) {
    if (!document.getElementById('use-race-start-time-checkbox')?.checked) return;
    const raceData  = scIdx >= 0 ? state.shortCourseSessionRaces[scIdx] : state.currentSeries?.races.find(r => r.raceNumber === state.currentRace);
    const raceStart = raceData?.startTime || null;
    const entry     = scIdx >= 0 ? raceData?.entries[entryIndex] : state.entries[entryIndex];
    if (!entry) return;

    if (entry.status !== '') {
        if (!await showConfirm(`Reset status for ${entry.sailNumber}? Clears "${entry.status.toUpperCase()}" and any finish time.`)) return;
        entry.elapsedTime = ''; entry.status = '';
    } else {
        if (!raceStart)        { await showAlert("Race start time not recorded. Click 'Start Race' first."); return; }
        if (Date.now() < raceStart) { await showAlert('Error: Current time is before race start.'); return; }
        entry.elapsedTime = secondsToTime(Math.round((Date.now() - raceStart) / 1000));
        entry.status = 'finished';
    }

    _persistEntryChange(entry, scIdx);
    triggerSave();
    if (scIdx >= 0) { saveSessionToStorage(); renderShortCourseSessionRaces(); }
    else renderEntriesTable();
}

function _persistEntryChange(entry, scIdx) {
    if (scIdx >= 0) return;
    const race = state.currentSeries?.races.find(r => r.raceNumber === state.currentRace);
    if (!race?.entries) return;
    const idx = race.entries.findIndex(e => e.savedBoatId === entry.savedBoatId);
    if (idx !== -1) { race.entries[idx].elapsedTime = entry.elapsedTime; race.entries[idx].status = entry.status; }
}

// ─── Race Start / Timer ───────────────────────────────────────────────────────

export function handleStartRace(event, scIdx = -1) {
    if (scIdx !== -1) {
        const race = state.shortCourseSessionRaces[scIdx];
        if (race) { race.startTime = Date.now(); renderShortCourseSessionRaces(); saveSessionToStorage(); triggerSave(); }
    } else {
        const race = state.currentSeries?.races.find(r => r.raceNumber === state.currentRace);
        if (race) { race.startTime = Date.now(); race.entries = JSON.parse(JSON.stringify(state.entries)); updateRaceStartUI(); triggerSave(); }
    }
}

export function handleStartCountdown(event, scIdx = -1) {
    const threeMin = 3 * 60 * 1000;
    if (scIdx !== -1) {
        const race = state.shortCourseSessionRaces[scIdx];
        if (race) { race.startTime = Date.now() + threeMin; renderShortCourseSessionRaces(); saveSessionToStorage(); triggerSave(); }
    } else {
        const race = state.currentSeries?.races.find(r => r.raceNumber === state.currentRace);
        if (race) { race.startTime = Date.now() + threeMin; updateRaceStartUI(); triggerSave(); }
    }
}

export async function handleResetStartTime(event, scIdx = -1) {
    if (!await showConfirm('Reset the race start time?')) return;
    if (scIdx !== -1) {
        const race = state.shortCourseSessionRaces[scIdx];
        if (race) { race.startTime = null; renderShortCourseSessionRaces(); saveSessionToStorage(); triggerSave(); }
    } else {
        const race = state.currentSeries?.races.find(r => r.raceNumber === state.currentRace);
        if (race) { race.startTime = null; updateRaceStartUI(); triggerSave(); }
    }
}

// ─── Boat List ────────────────────────────────────────────────────────────────

export function editBoatInList(id) {
    const boat = state.boatList.find(b => b.id === id);
    if (!boat) return;
    clearBoatListForm();

    const els = {
        editId:      document.getElementById('editing-boat-id'),
        sailNumber:  document.getElementById('boat-sail-number'),
        skipper:     document.getElementById('boat-skipper'),
        yardstick:   document.getElementById('boat-yardstick'),
        division:    document.getElementById('boat-division'),
        title:       document.getElementById('boat-form-title'),
        classList:   document.getElementById('boat-class-list'),
        manualCheck: document.getElementById('boat-manual-class-check'),
        manualInput: document.getElementById('boat-manual-class-input'),
        manualClass: document.getElementById('boat-manual-boat-class'),
        form:        document.getElementById('boat-list-form'),
    };

    if (els.editId)     els.editId.value     = boat.id;
    if (els.sailNumber) els.sailNumber.value = boat.sailNumber;
    if (els.skipper)    els.skipper.value    = boat.skipper;
    if (els.yardstick)  els.yardstick.value  = boat.yardstick;
    if (els.division)   els.division.value   = boat.division || '';
    if (els.title)      els.title.textContent = `Edit Boat: ${boat.sailNumber} — ${boat.skipper}`;

    const isStandard = YARDSTICK_DATA.some(y => y.boatClass === boat.boatClass) &&
        els.classList?.querySelector(`option[value="${boat.boatClass}"]`);

    if (isStandard && els.classList) {
        if (els.manualCheck) els.manualCheck.checked = false;
        els.classList.value = boat.boatClass;
        els.manualInput?.classList.add('hidden');
        els.classList.disabled = false;
        if (els.manualClass) els.manualClass.value = '';
        const ysData = YARDSTICK_DATA.find(y => y.boatClass === boat.boatClass);
        if (els.yardstick) els.yardstick.readOnly = !!(ysData && boat.yardstick === ysData.yardstick);
    } else {
        if (els.manualCheck) els.manualCheck.checked = true;
        if (els.manualClass) els.manualClass.value   = boat.boatClass;
        if (els.classList)   { els.classList.value = ''; els.classList.disabled = true; }
        els.manualInput?.classList.remove('hidden');
        if (els.yardstick) els.yardstick.readOnly = false;
    }

    if (els.form) { els.form.classList.remove('hidden'); els.form.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}

export async function deleteBoatFromList(id) {
    const idx = state.boatList.findIndex(b => b.id === id);
    if (idx === -1) return;
    const boat = state.boatList[idx];
    if (!await showConfirm(`Delete ${boat.sailNumber} (${boat.skipper})?`, { danger: true })) return;
    removeBoatAtIndex(idx);
    triggerSave();
    renderBoatListTable();
}

export function clearBoatListForm() {
    ['boat-sail-number', 'boat-skipper', 'boat-manual-boat-class', 'editing-boat-id']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const ys = document.getElementById('boat-yardstick');
    if (ys) { ys.value = ''; ys.readOnly = true; }
    const cl = document.getElementById('boat-class-list');
    if (cl) cl.value = '';
    const div = document.getElementById('boat-division');
    if (div) div.value = '';
    const ch = document.getElementById('boat-manual-class-check');
    if (ch) ch.checked = false;
    document.getElementById('boat-manual-class-input')?.classList.add('hidden');
    document.getElementById('boat-list-form')?.classList.add('hidden');
    const title = document.getElementById('boat-form-title');
    if (title) title.textContent = 'Add New Boat';
    cl?.dispatchEvent(new Event('change'));
}

export async function handleSaveBoat() {
    const isManual  = document.getElementById('boat-manual-class-check')?.checked;
    const sailNum   = document.getElementById('boat-sail-number')?.value.trim().toUpperCase();
    const skipper   = document.getElementById('boat-skipper')?.value.trim();
    const ys        = parseFloat(document.getElementById('boat-yardstick')?.value);
    const division  = document.getElementById('boat-division')?.value;
    const boatClass = isManual
        ? document.getElementById('boat-manual-boat-class')?.value.trim()
        : document.getElementById('boat-class-list')?.value;
    const idStr     = document.getElementById('editing-boat-id')?.value;
    const id        = idStr ? parseInt(idStr, 10) : null;

    if (!sailNum)              { await showAlert('Sail Number is required.');              return; }
    if (!boatClass)            { await showAlert('Boat Class is required.');               return; }
    if (!skipper)              { await showAlert('Skipper Name is required.');             return; }
    if (isNaN(ys) || ys <= 0) { await showAlert('Valid positive Yardstick is required.'); return; }
    if (!division)             { await showAlert('Division is required.');                 return; }

    const boatData = { id: id || Date.now(), sailNumber: sailNum, boatClass, skipper, yardstick: ys, division };
    if (id) {
        const idx = state.boatList.findIndex(b => b.id === id);
        if (idx !== -1) updateBoatAtIndex(idx, boatData); else addBoat(boatData);
    } else {
        addBoat(boatData);
    }

    triggerSave();
    renderBoatListTable();
    clearBoatListForm();
    showToast(`Boat ${sailNum} saved.`, 'success');
}

// ─── Series Management ────────────────────────────────────────────────────────

export function editSeries(id) {
    const s = state.series.find(s => s.id === id);
    if (!s) return;
    const form = document.getElementById('create-series-form');
    const name = document.getElementById('series-name');
    const sc   = document.getElementById('series-short-course');
    const nr   = document.getElementById('number-of-races');
    const rpd  = document.getElementById('races-per-discard');
    const eid  = document.getElementById('edit-series-id');

    if (name) name.value = s.name;
    if (sc)   { sc.checked = s.isShortCourse || false; sc.dispatchEvent(new Event('change')); }
    if (nr)   nr.value  = s.isShortCourse ? '0' : s.numberOfRaces;
    if (rpd)  rpd.value = s.discardThreshold ?? 0;
    if (eid)  eid.value = s.id;
    if (form) { form.classList.remove('hidden'); form.scrollIntoView({ behavior: 'smooth' }); }
}

export async function deleteSeries(id) {
    const idx = state.series.findIndex(s => s.id === id);
    if (idx === -1) return;
    const s = state.series[idx];
    if (!await showConfirm(`DELETE Series "${s.name}" permanently?`, { danger: true, confirmText: 'Delete' })) return;

    removeSeriesAtIndex(idx);
    triggerSave();
    refreshSeriesList();
    refreshSeriesDropdowns();

    ['select-series', 'view-series-select', 'view-all-series-select'].forEach(elId => {
        const el = document.getElementById(elId);
        if (el?.value == id) {
            el.value = '';
            if (elId === 'view-series-select')    calculateAndRenderSeriesResults();
            if (elId === 'view-all-series-select') displayRaceViewer();
        }
    });

    if (state.currentSeries?.id === id) {
        setCurrentSeries(null); setCurrentRace(null); clearEntries(); clearResults(); setShortCourseSessionRaces([]);
        if (document.getElementById('race-tab')?.classList.contains('active-tab'))    updateRaceEntryUI();
        if (document.getElementById('results-tab')?.classList.contains('active-tab')) loadRaceResults();
    }
    showToast(`Series "${s.name}" deleted.`, 'info');
}

export async function handleSaveSeries() {
    const name        = document.getElementById('series-name')?.value.trim();
    const isShortCourse = document.getElementById('series-short-course')?.checked || false;
    let   racesPlanned  = isShortCourse ? 0 : parseInt(document.getElementById('number-of-races')?.value);
    const discardThreshold = parseInt(document.getElementById('races-per-discard')?.value);
    const editId        = document.getElementById('edit-series-id')?.value;
    const form          = document.getElementById('create-series-form');

    if (!name)                                                              { await showAlert('Series Name is required.'); return; }
    if (isNaN(discardThreshold) || discardThreshold < 0 || discardThreshold > 20) { await showAlert('Races Per Discard must be 0–20.'); return; }
    if (!isShortCourse) {
        if (isNaN(racesPlanned))                  { await showAlert('Number of Races Planned is required.'); return; }
        if (racesPlanned < 1 || racesPlanned > 50) { await showAlert('Number of races must be 1–50.'); return; }
    }

    if (editId) {
        const existing = state.series.find(s => s.id === parseInt(editId));
        if (!existing) { await showAlert('Series not found.'); return; }
        existing.name = name; existing.isShortCourse = isShortCourse; existing.discardThreshold = discardThreshold;

        if (isShortCourse) {
            existing.numberOfRaces = existing.races.length;
        } else {
            const old = existing.numberOfRaces;
            existing.numberOfRaces = racesPlanned;
            if (racesPlanned > old) {
                for (let i = old + 1; i <= racesPlanned; i++)
                    existing.races.push({ raceNumber: i, date: null, entries: [], results: [], startTime: null });
            } else if (racesPlanned < old) {
                if (existing.races.slice(racesPlanned).some(r => r.results?.length > 0)) {
                    if (!await showConfirm(`Reducing races will remove Race ${racesPlanned + 1}+, including saved results. Continue?`, { danger: true, confirmText: 'Remove' })) {
                        document.getElementById('number-of-races').value = old;
                        existing.numberOfRaces = old; return;
                    }
                }
                existing.races = existing.races.slice(0, racesPlanned);
            }
            existing.races.sort((a, b) => a.raceNumber - b.raceNumber);
        }
        showToast(`Series "${name}" updated.`, 'success');
    } else {
        const newSeries = { id: Date.now(), name, isShortCourse, numberOfRaces: isShortCourse ? 0 : racesPlanned, discardThreshold, races: [] };
        if (!isShortCourse)
            for (let i = 1; i <= racesPlanned; i++)
                newSeries.races.push({ raceNumber: i, date: null, entries: [], results: [], startTime: null });
        addSeries(newSeries);
        showToast(`Series "${name}" created.`, 'success');
    }

    triggerSave();
    refreshSeriesList();
    refreshSeriesDropdowns();
    form?.classList.add('hidden');
}

// ─── Calculate & Save Results ─────────────────────────────────────────────────

export async function handleCalculateResults() {
    if (state.currentSeries?.isShortCourse) await _calculateShortCourseResults();
    else await _calculateStandardResults();
}

async function _calculateShortCourseResults() {
    if (state.shortCourseSessionRaces.length === 0) { await showAlert('No races in this session.'); return; }
    if (!state.currentSeries)                        { await showAlert('No series selected.'); return; }

    for (const race of state.shortCourseSessionRaces) {
        for (const entry of race.entries) {
            if (entry.status === 'finished' && !isValidTimeFormat(entry.elapsedTime)) {
                await showAlert(`Missing or invalid time for ${entry.sailNumber} in Race ${race.raceNumber}.`); return;
            }
        }
    }

    if (!await showConfirm(
        `Calculate and SAVE results for all ${state.shortCourseSessionRaces.length} race(s)?\n\nThis will OVERWRITE all saved races for "${state.currentSeries.name}".`,
        { danger: true, confirmText: 'Save Results' }
    )) return;

    try {
        const target = state.series.find(s => s.id === state.currentSeries.id);
        if (!target) throw new Error('Series not found.');
        const date     = document.getElementById('race-date')?.value || new Date().toISOString().split('T')[0];
        const newRaces = state.shortCourseSessionRaces
            .filter(r => r.entries.length > 0)
            .map(r => {
                const calc = calculateSingleRaceResults(r.entries, target);
                return { raceNumber: r.raceNumber, date, entries: calc.map(_entryFromResult), results: calc, startTime: r.startTime };
            });

        target.races = newRaces; target.numberOfRaces = newRaces.length;
        target.races.sort((a, b) => a.raceNumber - b.raceNumber);
        triggerSave(); refreshSeriesDropdowns(); refreshSeriesList(); clearSessionStorage();
        showToast(`${newRaces.length} ${pluralize(newRaces.length, 'race')} saved to "${target.name}".`, 'success', 5000);
    } catch (err) { console.error(err); await showAlert('Error: ' + err.message); }
}

async function _calculateStandardResults() {
    const map = new Map();
    state.entries.forEach(e => { if (e.savedBoatId) map.set(e.savedBoatId, e); });
    setEntries([...map.values()]);
    renderEntriesTable();

    if (!state.entries.length)                                      { await showAlert('Add at least one entry first.'); return; }
    if (!state.currentSeries || typeof state.currentRace !== 'number') { await showAlert('Select a series and race number first.'); return; }

    for (const entry of state.entries) {
        if (entry.status === 'finished' && !isValidTimeFormat(entry.elapsedTime)) {
            await showAlert(`Missing or invalid time for ${entry.sailNumber}.`); return;
        }
    }

    if (!await showConfirm(
        `Calculate results for Race ${state.currentRace} in "${state.currentSeries.name}"?\n\nThis cannot be undone.`,
        { danger: true, confirmText: 'Save Results' }
    )) return;

    const calculated = calculateSingleRaceResults(state.entries, state.currentSeries, state.currentRace);
    const target     = state.series.find(s => s.id === state.currentSeries.id);
    if (!target) { await showAlert('Series not found.'); return; }
    const raceIdx = target.races.findIndex(r => r.raceNumber === state.currentRace);
    if (raceIdx === -1) { await showAlert(`Race ${state.currentRace} not found.`); return; }

    if (target.races[raceIdx].results?.length > 0 && calculated.length > 0) {
        if (!await showConfirm(`Race ${state.currentRace} already has results. Overwrite?`, { danger: true, confirmText: 'Overwrite' })) return;
    }

    const date = document.getElementById('race-date')?.value || new Date().toISOString().split('T')[0];
    target.races[raceIdx] = { ...target.races[raceIdx], date, entries: calculated.map(_entryFromResult), results: JSON.parse(JSON.stringify(calculated)) };

    triggerSave();
    setEditMode(false);
    document.getElementById('edit-mode-warning')?.classList.add('hidden');
    showToast(`Race ${state.currentRace} results saved for "${target.name}".`, 'success', 5000);
    refreshSeriesDropdowns();
    setResults(calculated);
    setActiveTab(document.getElementById('results-tab'));
}

export async function handleSaveCurrentEntries() {
    if (!state.currentSeries) { await showAlert('Select a series first.'); return; }
    const target = state.series.find(s => s.id === state.currentSeries.id);
    if (!target)  { await showAlert('Series not found.'); return; }
    const date = document.getElementById('race-date')?.value || new Date().toISOString().split('T')[0];

    if (state.currentSeries.isShortCourse) {
        const newRaces = state.shortCourseSessionRaces
            .filter(r => r.entries.length > 0)
            .map(r => ({ raceNumber: r.raceNumber, date, entries: JSON.parse(JSON.stringify(r.entries)), results: [], startTime: r.startTime }));
        target.races = newRaces; target.numberOfRaces = newRaces.length;
        target.races.sort((a, b) => a.raceNumber - b.raceNumber);
        triggerSave();
        showToast(`Session with ${newRaces.length} race(s) saved.`, 'success');
    } else {
        if (!state.currentRace) { await showAlert('Select a race first.'); return; }
        const race = target.races.find(r => r.raceNumber === state.currentRace);
        if (!race)  { await showAlert(`Race ${state.currentRace} not found.`); return; }
        const map = new Map();
        state.entries.forEach(e => { if (e.savedBoatId) map.set(e.savedBoatId, e); });
        race.entries = [...map.values()]; race.date = date;
        triggerSave();
        showToast(`Entries for Race ${state.currentRace} saved.`, 'success');
    }
}

// ─── Short Course Session ─────────────────────────────────────────────────────

export async function handleCreateShortCourseRace() {
    if (!state.entries.length)          { await showAlert('Pool is empty. Add boats first.'); return; }
    if (!state.currentSeries?.isShortCourse) { await showAlert('Not a short course series.'); return; }
    const nums   = state.shortCourseSessionRaces.map(r => r.raceNumber);
    const next   = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    const newEntries = JSON.parse(JSON.stringify(state.entries)).map(e => ({ ...e, status: '', elapsedTime: '' }));
    addShortCourseRace({ raceNumber: next, entries: newEntries, startTime: null });
    renderShortCourseSessionRaces();
    updateCreateRaceButton();
    updateRemoveLastRaceButtonVisibility();
    saveSessionToStorage();
}

export async function handleRemoveLastShortCourseRace() {
    if (!state.shortCourseSessionRaces.length) { await showAlert('No races to remove.'); return; }
    const last = state.shortCourseSessionRaces[state.shortCourseSessionRaces.length - 1];
    if (!await showConfirm(`Remove Race ${last.raceNumber}?`, { danger: true, confirmText: 'Remove' })) return;
    const removedIdx = state.shortCourseSessionRaces.length - 1;
    removeLastShortCourseRace();
    renderShortCourseSessionRaces();
    updateCreateRaceButton();
    updateRemoveLastRaceButtonVisibility();
    saveSessionToStorage();
    if (parseInt(document.getElementById('editing-short-course-race-index')?.value) === removedIdx) {
        clearEntryForm();
        const title = document.getElementById('entry-form-title');
        if (title) title.textContent = 'Add Boat to Entries';
    }
}

export async function handleClearShortCourseSession() {
    if (!state.shortCourseSessionRaces.length && !state.entries.length) {
        await showAlert('Nothing to clear.'); return;
    }
    if (!await showConfirm(
        `Clear all ${state.shortCourseSessionRaces.length} ${pluralize(state.shortCourseSessionRaces.length, 'race', 'races')} and all pool entries?`,
        { danger: true, confirmText: 'Clear Session' }
    )) return;
    clearShortCourseSession(); clearEntries();
    renderShortCoursePoolTable(); renderShortCourseSessionRaces();
    updateCreateRaceButton(); updateRemoveLastRaceButtonVisibility();
    clearSessionStorage();
}

export function handleAddSelectedBoats() {
    const checkboxes = document.querySelectorAll('#bulk-boat-list-container input[type="checkbox"]:checked');
    if (!checkboxes.length) return;
    let added = 0, skipped = 0;
    checkboxes.forEach(cb => {
        const boat = state.boatList.find(b => b.id === parseInt(cb.value));
        if (!boat) return;
        const entryData = {
            savedBoatId: boat.id, sailNumber: boat.sailNumber, boatClass: boat.boatClass,
            skipper: boat.skipper, yardstick: boat.yardstick, division: boat.division,
            status: state.currentSeries?.isShortCourse ? 'pool' : '', elapsedTime: '',
        };
        if (state.entries.some(e => e.savedBoatId === entryData.savedBoatId)) { skipped++; return; }
        addEntry(entryData); added++;
        if (state.currentSeries?.isShortCourse) {
            state.shortCourseSessionRaces.forEach(race => {
                if (!race.entries.some(e => e.savedBoatId === entryData.savedBoatId))
                    race.entries.push({ ...entryData, status: 'DNS', elapsedTime: '' });
            });
        }
    });

    if (state.currentSeries?.isShortCourse) {
        renderShortCoursePoolTable();
        if (added > 0 && state.shortCourseSessionRaces.length > 0) renderShortCourseSessionRaces();
    } else {
        renderEntriesTable();
    }
    checkboxes.forEach(cb => cb.checked = false);
    if (added > 0) showToast(`${added} ${pluralize(added, 'boat')} added.`, 'success');
}

// ─── Calendar ────────────────────────────────────────────────────────────────

export function saveCalendarText() {
    const ta = document.getElementById('calendar-textarea');
    if (ta) { setCalendarText(ta.value); triggerSave(); showToast('Calendar queued for saving.', 'success'); }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function _entryFromResult(res) {
    return {
        savedBoatId: res.savedBoatId, sailNumber: res.sailNumber, boatClass: res.boatClass,
        skipper: res.skipper, yardstick: res.yardstick, status: res.status,
        elapsedTime: res.elapsedTime || '', division: res.division,
    };
}
