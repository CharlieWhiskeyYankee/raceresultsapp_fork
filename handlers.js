/**
 * handlers.js
 * Event handler functions and business-logic actions.
 * Wires user interactions to state mutations and render calls.
 * Depends on: config.js, state.js, utils.js, storage.js, results.js, ui.js, modal.js
 *
 * All user-facing dialogs use showAlert / showConfirm from modal.js.
 * Functions that await these are marked async.
 */

'use strict';

// ─── Entry Form Helpers ───────────────────────────────────────────────────────

function clearEntryForm() {
    const yardstickValue                   = document.getElementById('yardstick');
    const editingEntryIndexInput           = document.getElementById('editing-entry-index');
    const editingShortCourseRaceIndexInput = document.getElementById('editing-short-course-race-index');
    const addBoatBtn                       = document.getElementById('add-boat');
    const updateBoatBtn                    = document.getElementById('update-boat');
    const cancelUpdateBtn                  = document.getElementById('cancel-update');
    const selectSavedBoat                  = document.getElementById('select-saved-boat');
    const mainFormStatusGroup              = document.getElementById('main-form-status-group');
    const timeInputs                       = document.getElementById('time-inputs');

    if (yardstickValue)  yardstickValue.value = '';
    if (editingEntryIndexInput)           editingEntryIndexInput.value = '-1';
    if (editingShortCourseRaceIndexInput) editingShortCourseRaceIndexInput.value = '-1';
    if (addBoatBtn)      addBoatBtn.style.display = 'inline-block';
    if (updateBoatBtn)   updateBoatBtn.classList.add('hidden');
    if (cancelUpdateBtn) cancelUpdateBtn.classList.add('hidden');
    if (selectSavedBoat) selectSavedBoat.value = '';
    mainFormStatusGroup?.classList.add('hidden');
    timeInputs?.classList.add('hidden');
}

function handleStatusChange() {
    const selected   = document.querySelector('input[name="race-status"]:checked');
    if (!selected) return;
    const timeInputs = document.getElementById('time-inputs');
    const elapsedTime = document.getElementById('elapsed-time');
    if (!timeInputs) return;

    timeInputs.style.display = (selected.value === 'finished') ? 'block' : 'none';
    if (selected.value !== 'finished' && elapsedTime) elapsedTime.value = '';
}

/**
 * Reads the entry form and returns a structured entry object, or null on
 * validation failure.  Uses showAlert for errors (non-blocking).
 */
async function getEntryFormData() {
    const selectSavedBoat     = document.getElementById('select-saved-boat');
    const yardstickValue      = document.getElementById('yardstick');
    const elapsedTime         = document.getElementById('elapsed-time');
    const standardEntryFields = document.getElementById('standard-entry-fields');
    const mainFormStatusGroup = document.getElementById('main-form-status-group');

    const selectedBoatId = selectSavedBoat?.value;
    if (!selectedBoatId) { await showAlert('Please select a boat from the dropdown.'); return null; }

    const savedBoat = boatList.find(b => String(b.id) === String(selectedBoatId));
    if (!savedBoat)  { await showAlert('Selected boat not found. Please check the boat list.'); return null; }

    const currentYardstick = parseFloat(yardstickValue?.value);
    if (isNaN(currentYardstick) || currentYardstick <= 0) {
        await showAlert('Valid positive Yardstick is required.');
        yardstickValue?.focus();
        return null;
    }

    const inStandardContext = standardEntryFields && !standardEntryFields.classList.contains('hidden');
    const statusTimeActive  = mainFormStatusGroup  && !mainFormStatusGroup.classList.contains('hidden');
    let status = '', elapsed = '';

    if (inStandardContext && !statusTimeActive) {
        status = ''; elapsed = '';
    } else if (statusTimeActive) {
        status = document.querySelector('input[name="race-status"]:checked')?.value || '';
        const raw = elapsedTime?.value.trim() || '';
        if (status === 'finished') {
            if (!raw)                         { await showAlert('Elapsed time is required for finished status.'); return null; }
            if (timeToSeconds(raw) === -1)    { await showAlert('Invalid time format. Use h:m:s, h m s, m:s, or m s.'); return null; }
            elapsed = raw;
        }
    } else if (currentSeries?.isShortCourse) {
        status = 'pool'; elapsed = '';
    }

    return {
        savedBoatId: savedBoat.id,
        sailNumber:  savedBoat.sailNumber,
        boatClass:   savedBoat.boatClass,
        skipper:     savedBoat.skipper,
        yardstick:   currentYardstick,
        division:    savedBoat.division,
        status,
        elapsedTime: elapsed,
    };
}

// ─── Add / Update / Remove Entries ───────────────────────────────────────────

async function handleAddBoat() {
    const entryData = await getEntryFormData();
    if (!entryData) return;

    if (currentSeries?.isShortCourse) {
        if (entries.some(e => e.savedBoatId === entryData.savedBoatId)) {
            await showAlert(`Boat "${entryData.sailNumber} - ${entryData.skipper}" is already in the pool.`);
            return;
        }
        entries.push(entryData);
        if (shortCourseSessionRaces.length > 0) {
            shortCourseSessionRaces.forEach(race => {
                if (!race.entries.some(e => e.savedBoatId === entryData.savedBoatId)) {
                    race.entries.push({ ...entryData, status: 'DNS', elapsedTime: '' });
                }
            });
            renderShortCourseSessionRaces();
        }
        renderShortCoursePoolTable();
    } else {
        if (!currentRace) { await showAlert('Please select a race number before adding boats.'); return; }
        if (entries.some(e => e.savedBoatId === entryData.savedBoatId)) {
            await showAlert(`Boat "${entryData.sailNumber} - ${entryData.skipper}" is already entered in this race.`);
            return;
        }
        entries.push(entryData);
        renderEntriesTable();
    }

    const selectSavedBoat = document.getElementById('select-saved-boat');
    const yardstickValue  = document.getElementById('yardstick');
    if (selectSavedBoat) { selectSavedBoat.value = ''; selectSavedBoat.focus(); }
    if (yardstickValue)  yardstickValue.value = '';
}

async function handleUpdateBoat() {
    const editingEntryIndexInput           = document.getElementById('editing-entry-index');
    const editingShortCourseRaceIndexInput = document.getElementById('editing-short-course-race-index');
    const index       = parseInt(editingEntryIndexInput?.value);
    const scRaceIndex = parseInt(editingShortCourseRaceIndexInput?.value);

    if (currentSeries?.isShortCourse) {
        if (scRaceIndex >= 0 && scRaceIndex < shortCourseSessionRaces.length && index >= 0) {
            await _updateShortCourseRaceEntry(scRaceIndex, index);
        } else if (scRaceIndex === -1 && index >= 0 && index < entries.length) {
            await _updatePoolEntry(index);
        } else {
            await showAlert('Error updating entry. Index out of bounds.');
        }
    } else {
        await _updateStandardEntry(index);
    }

    clearEntryForm();
    if (currentSeries?.isShortCourse) switchToShortCourseUI();
    else switchToStandardRaceUI();
}

async function _updateShortCourseRaceEntry(scRaceIndex, index) {
    const targetEntries = shortCourseSessionRaces[scRaceIndex].entries;
    if (index >= targetEntries.length) { await showAlert('Error updating SC entry. Index out of bounds.'); return; }

    const boatDetails = await _getBoatAndYardstickFromForm();
    if (!boatDetails) return;

    if (targetEntries.some((e, i) => i !== index && e.savedBoatId === boatDetails.savedBoatId)) {
        await showAlert(`Boat "${boatDetails.sailNumber}" is already entered in this race.`);
        return;
    }
    const formData = await getEntryFormData();
    if (!formData && document.querySelector('input[name="race-status"]:checked')?.value === 'finished') return;

    Object.assign(targetEntries[index], boatDetails);
    if (formData) {
        targetEntries[index].status      = formData.status;
        targetEntries[index].elapsedTime = formData.elapsedTime;
    } else if (document.querySelector('input[name="race-status"]:checked')?.value !== 'finished') {
        targetEntries[index].status      = document.querySelector('input[name="race-status"]:checked')?.value || '';
        targetEntries[index].elapsedTime = '';
    }
    renderShortCourseSessionRaces();
}

async function _updatePoolEntry(index) {
    const entryData = await getEntryFormData();
    if (!entryData) return;
    if (entries.some((e, i) => i !== index && e.savedBoatId === entryData.savedBoatId)) {
        await showAlert(`Boat "${entryData.sailNumber}" is already in the pool.`);
        return;
    }
    entries[index] = entryData;
    shortCourseSessionRaces.forEach(race => {
        const raceEntry = race.entries.find(e => e.savedBoatId === entryData.savedBoatId);
        if (raceEntry) raceEntry.division = entryData.division;
    });
    renderShortCoursePoolTable();
    renderShortCourseSessionRaces();
}

async function _updateStandardEntry(index) {
    const entryData = await getEntryFormData();
    if (!entryData) return;
    if (!currentRace) { await showAlert('Error: No standard race selected for update.'); return; }
    if (index < 0 || index >= entries.length) { await showAlert('Error: Index out of bounds.'); return; }
    if (entries.some((e, i) => i !== index && e.savedBoatId === entryData.savedBoatId)) {
        await showAlert(`Boat "${entryData.sailNumber}" is already entered in this race.`);
        return;
    }
    Object.assign(entries[index], entryData);
    renderEntriesTable();
}

async function _getBoatAndYardstickFromForm() {
    const selectSavedBoat = document.getElementById('select-saved-boat');
    const yardstickValue  = document.getElementById('yardstick');
    const boatId = selectSavedBoat?.value;
    if (!boatId) { await showAlert('Please select a boat.'); return null; }
    const boat = boatList.find(b => String(b.id) === String(boatId));
    if (!boat)  { await showAlert('Selected boat not found.'); return null; }
    const ys = parseFloat(yardstickValue?.value);
    if (isNaN(ys) || ys <= 0) {
        await showAlert('Valid positive Yardstick is required.');
        yardstickValue?.focus();
        return null;
    }
    return {
        savedBoatId: boat.id, sailNumber: boat.sailNumber, boatClass: boat.boatClass,
        skipper: boat.skipper, yardstick: ys, division: boat.division,
    };
}

async function removeEntry(index) {
    const target = entries;
    if (index < 0 || index >= target.length) return;
    if (!await showConfirm(`Remove entry for ${target[index]?.sailNumber || 'this boat'}?`)) return;

    if (currentSeries?.isShortCourse) {
        const boatId = target[index].savedBoatId;
        shortCourseSessionRaces.forEach(race => {
            race.entries = race.entries.filter(e => e.savedBoatId !== boatId);
        });
    }
    target.splice(index, 1);

    if (currentSeries?.isShortCourse) {
        renderShortCoursePoolTable();
        renderShortCourseSessionRaces();
    } else {
        renderEntriesTable();
    }
}

async function removeShortCourseEntry(raceIdx, entryIdx) {
    if (raceIdx < 0 || raceIdx >= shortCourseSessionRaces.length) return;
    const entries_sc = shortCourseSessionRaces[raceIdx].entries;
    if (entryIdx < 0 || entryIdx >= entries_sc.length) return;
    const entry = entries_sc[entryIdx];
    if (!await showConfirm(`Remove entry for ${entry?.sailNumber || 'this boat'} from Race ${shortCourseSessionRaces[raceIdx].raceNumber}?`)) return;
    entries_sc.splice(entryIdx, 1);
    renderShortCourseSessionRaces();
}

function editEntry(index) {
    const useSingleEntryCheckbox = document.getElementById('use-single-entry-checkbox');
    const singleEntryForm        = document.getElementById('single-entry-form');
    const entry = entries[index];
    if (!entry) return;
    clearEntryForm();

    if (useSingleEntryCheckbox) useSingleEntryCheckbox.checked = true;
    if (singleEntryForm) singleEntryForm.classList.remove('hidden');

    const selectSavedBoat              = document.getElementById('select-saved-boat');
    const yardstickValue               = document.getElementById('yardstick');
    const editingEntryIndexInput       = document.getElementById('editing-entry-index');
    const editingScRaceIndexInput      = document.getElementById('editing-short-course-race-index');
    const mainFormStatusGroup          = document.getElementById('main-form-status-group');
    const standardEntryFields          = document.getElementById('standard-entry-fields');
    const entryFormTitle               = document.getElementById('entry-form-title');
    const addBoatBtn                   = document.getElementById('add-boat');
    const updateBoatBtn                = document.getElementById('update-boat');
    const cancelUpdateBtn              = document.getElementById('cancel-update');
    const elapsedTime                  = document.getElementById('elapsed-time');

    if (selectSavedBoat && entry.savedBoatId) selectSavedBoat.value = entry.savedBoatId;
    if (yardstickValue)          yardstickValue.value = entry.yardstick;
    if (editingEntryIndexInput)  editingEntryIndexInput.value = index;
    if (editingScRaceIndexInput) editingScRaceIndexInput.value = '-1';
    if (mainFormStatusGroup)     mainFormStatusGroup.classList.remove('hidden');
    if (elapsedTime)             elapsedTime.value = entry.elapsedTime || '';
    if (standardEntryFields)     standardEntryFields.classList.remove('hidden');
    if (entryFormTitle)          entryFormTitle.textContent = currentSeries?.isShortCourse ? 'Edit Pool Entry' : `Edit Entry (Race ${currentRace})`;
    if (addBoatBtn)              addBoatBtn.style.display = 'none';
    if (updateBoatBtn)           updateBoatBtn.classList.remove('hidden');
    if (cancelUpdateBtn)         cancelUpdateBtn.classList.remove('hidden');

    const statusRadio = document.getElementById(`status-${(entry.status || '').toLowerCase()}`);
    if (statusRadio) statusRadio.checked = true;
    else { const fin = document.getElementById('status-finished'); if (fin) fin.checked = true; }
    handleStatusChange();
    selectSavedBoat?.focus();
    selectSavedBoat?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function editShortCourseEntry(raceIdx, entryIdx) {
    if (raceIdx < 0 || raceIdx >= shortCourseSessionRaces.length) return;
    const entry = shortCourseSessionRaces[raceIdx].entries[entryIdx];
    if (!entry) return;
    clearEntryForm();

    const useSingleEntryCheckbox  = document.getElementById('use-single-entry-checkbox');
    const singleEntryForm         = document.getElementById('single-entry-form');
    const selectSavedBoat         = document.getElementById('select-saved-boat');
    const yardstickValue          = document.getElementById('yardstick');
    const editingEntryIndexInput  = document.getElementById('editing-entry-index');
    const editingScRaceIndexInput = document.getElementById('editing-short-course-race-index');
    const mainFormStatusGroup     = document.getElementById('main-form-status-group');
    const standardEntryFields     = document.getElementById('standard-entry-fields');
    const entryFormTitle          = document.getElementById('entry-form-title');
    const addBoatBtn              = document.getElementById('add-boat');
    const updateBoatBtn           = document.getElementById('update-boat');
    const cancelUpdateBtn         = document.getElementById('cancel-update');
    const elapsedTime             = document.getElementById('elapsed-time');

    if (useSingleEntryCheckbox)  useSingleEntryCheckbox.checked = true;
    if (singleEntryForm)         singleEntryForm.classList.remove('hidden');
    if (selectSavedBoat && entry.savedBoatId) selectSavedBoat.value = entry.savedBoatId;
    if (yardstickValue)          yardstickValue.value = entry.yardstick;
    if (editingEntryIndexInput)  editingEntryIndexInput.value = entryIdx;
    if (editingScRaceIndexInput) editingScRaceIndexInput.value = raceIdx;
    if (mainFormStatusGroup)     mainFormStatusGroup.classList.remove('hidden');
    if (elapsedTime)             elapsedTime.value = entry.elapsedTime || '';
    if (standardEntryFields)     standardEntryFields.classList.remove('hidden');
    if (entryFormTitle)          entryFormTitle.textContent = `Edit Entry in SC Race ${shortCourseSessionRaces[raceIdx].raceNumber}`;
    if (addBoatBtn)              addBoatBtn.style.display = 'none';
    if (updateBoatBtn)           updateBoatBtn.classList.remove('hidden');
    if (cancelUpdateBtn)         cancelUpdateBtn.classList.remove('hidden');

    const statusRadio = document.getElementById(`status-${(entry.status || '').toLowerCase()}`);
    if (statusRadio) statusRadio.checked = true;
    else { const fin = document.getElementById('status-finished'); if (fin) fin.checked = true; }
    handleStatusChange();
    selectSavedBoat?.focus();
    selectSavedBoat?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ─── In-table Entry Updates ───────────────────────────────────────────────────

function updateStandardEntryInTable(index, field, value) {
    if (index < 0 || index >= entries.length) { console.error('updateStandardEntryInTable: invalid index'); return; }
    entries[index][field] = value;
    if (field === 'status' && value !== 'finished') entries[index].elapsedTime = '';
    if (field === 'status') renderEntriesTable();
}

function updateShortCourseEntry(raceIdx, entryIdx, field, value) {
    if (raceIdx < 0 || raceIdx >= shortCourseSessionRaces.length) { console.error('updateShortCourseEntry: invalid raceIdx'); return; }
    const entry = shortCourseSessionRaces[raceIdx].entries[entryIdx];
    if (!entry) { console.error('updateShortCourseEntry: entry not found'); return; }
    entry[field] = value;
    if (field === 'status' && value !== 'finished') entry.elapsedTime = '';
    if (field === 'status') renderShortCourseSessionRaces();
}

function updateShortCoursePoolEntryDivision(index, value) {
    if (index < 0 || index >= entries.length) { console.error('updateShortCoursePoolEntryDivision: invalid index'); return; }
    const boatId = entries[index].savedBoatId;
    entries[index].division = value;
    shortCourseSessionRaces.forEach(race => {
        const e = race.entries.find(e => e.savedBoatId === boatId);
        if (e) e.division = value;
    });
    renderShortCourseSessionRaces();
}

// ─── Manual Time Save ────────────────────────────────────────────────────────

async function handleManualTimeSave(btn, entryIndex, scIdx = -1) {
    const row       = btn.closest('tr');
    const timeInput = row?.querySelector('input[type="text"]');
    if (!timeInput) return;

    const raw = timeInput.value.trim();
    let entry;

    if (scIdx >= 0 && scIdx < shortCourseSessionRaces.length) {
        entry = shortCourseSessionRaces[scIdx].entries[entryIndex];
    } else {
        entry = entries[entryIndex];
    }
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

    if (scIdx >= 0) {
        saveSessionToStorage();
        renderShortCourseSessionRaces();
    } else {
        renderEntriesTable();
    }
}

// ─── Finish Button & Sail Number Click ────────────────────────────────────────

async function handleFinButtonClick(btn, entryIndex, scIdx = -1) {
    let entry, raceStartTime;
    if (scIdx >= 0 && scIdx < shortCourseSessionRaces.length) {
        const raceData = shortCourseSessionRaces[scIdx];
        raceStartTime  = raceData?.startTime || null;
        entry          = raceData.entries[entryIndex];
    } else {
        const raceData = currentSeries?.races.find(r => r.raceNumber === currentRace);
        raceStartTime  = raceData?.startTime || null;
        entry          = entries[entryIndex];
    }
    if (!entry) return;

    if (entry.status !== 'finished' && entry.status !== '') {
        await showAlert("Boat status must be 'Finished' or '-- Select --' to use the Finish button.");
        return;
    }

    if (entry.elapsedTime && isValidTimeFormat(entry.elapsedTime)) {
        if (!await showConfirm('Clear the finish time for this boat?')) return;
        entry.elapsedTime = ''; entry.status = '';
    } else {
        if (!raceStartTime) { await showAlert("Race start time not recorded. Click 'Start Race' first."); return; }
        const now = Date.now();
        if (now < raceStartTime) { await showAlert('Error: Current time is before the race start time.'); return; }
        entry.elapsedTime = secondsToTime(Math.round((now - raceStartTime) / 1000));
        entry.status = 'finished';
    }

    _persistEntryChange(entry, scIdx);
    triggerSave();
    if (scIdx >= 0) {
        saveSessionToStorage();
        renderShortCourseSessionRaces();
    } else {
        renderEntriesTable();
    }
}

async function handleSailNumberClick(entryIndex, scIdx = -1) {
    const useTimerCheckbox = document.getElementById('use-race-start-time-checkbox');
    if (!useTimerCheckbox?.checked) return;

    let entry, raceStartTime;
    if (scIdx >= 0 && scIdx < shortCourseSessionRaces.length) {
        const raceData = shortCourseSessionRaces[scIdx];
        raceStartTime  = raceData?.startTime || null;
        entry          = raceData.entries[entryIndex];
    } else {
        const raceData = currentSeries?.races.find(r => r.raceNumber === currentRace);
        raceStartTime  = raceData?.startTime || null;
        entry          = entries[entryIndex];
    }
    if (!entry) return;

    if (entry.status !== '') {
        if (!await showConfirm(`Reset status for Boat ${entry.sailNumber}? This clears "${entry.status.toUpperCase()}" and any finish time.`)) return;
        entry.elapsedTime = ''; entry.status = '';
    } else {
        if (!raceStartTime) { await showAlert("Race start time not recorded. Click 'Start Race' first."); return; }
        const now = Date.now();
        if (now < raceStartTime) { await showAlert('Error: Current time is before the race start time.'); return; }
        entry.elapsedTime = secondsToTime(Math.round((now - raceStartTime) / 1000));
        entry.status = 'finished';
    }

    _persistEntryChange(entry, scIdx);
    triggerSave();
    if (scIdx >= 0) {
        saveSessionToStorage();
        renderShortCourseSessionRaces();
    } else {
        renderEntriesTable();
    }
}

/** Writes a changed entry back into the persistent series races data. */
function _persistEntryChange(entry, scIdx) {
    if (scIdx >= 0) return; // SC entries live in shortCourseSessionRaces directly.
    const race = currentSeries?.races.find(r => r.raceNumber === currentRace);
    if (!race?.entries) return;
    const idx = race.entries.findIndex(e => e.savedBoatId === entry.savedBoatId);
    if (idx !== -1) {
        race.entries[idx].elapsedTime = entry.elapsedTime;
        race.entries[idx].status      = entry.status;
    }
}

// ─── Race Start / Timer Controls ─────────────────────────────────────────────

function handleStartRace(event, scIdx = -1) {
    if (scIdx !== -1) {
        const race = shortCourseSessionRaces[scIdx];
        if (race) { race.startTime = Date.now(); renderShortCourseSessionRaces(); saveSessionToStorage(); triggerSave(); }
    } else {
        const race = currentSeries?.races.find(r => r.raceNumber === currentRace);
        if (race) { race.startTime = Date.now(); race.entries = JSON.parse(JSON.stringify(entries)); updateRaceStartUI(); triggerSave(); }
    }
}

function handleStartCountdown(event, scIdx = -1) {
    const threeMin = 3 * 60 * 1000;
    if (scIdx !== -1) {
        const race = shortCourseSessionRaces[scIdx];
        if (race) { race.startTime = Date.now() + threeMin; renderShortCourseSessionRaces(); saveSessionToStorage(); triggerSave(); }
    } else {
        const race = currentSeries?.races.find(r => r.raceNumber === currentRace);
        if (race) { race.startTime = Date.now() + threeMin; updateRaceStartUI(); triggerSave(); }
    }
}

async function handleResetStartTime(event, scIdx = -1) {
    if (!await showConfirm('Reset the race start time? This will be saved immediately.')) return;
    if (scIdx !== -1) {
        const race = shortCourseSessionRaces[scIdx];
        if (race) { race.startTime = null; renderShortCourseSessionRaces(); saveSessionToStorage(); triggerSave(); }
    } else {
        const race = currentSeries?.races.find(r => r.raceNumber === currentRace);
        if (race) { race.startTime = null; updateRaceStartUI(); triggerSave(); }
    }
}

// ─── Boat List ────────────────────────────────────────────────────────────────

function editBoatInList(id) {
    const boat = boatList.find(b => b.id === id);
    if (!boat) return;
    clearBoatListForm();

    const editingBoatId        = document.getElementById('editing-boat-id');
    const boatSailNumber       = document.getElementById('boat-sail-number');
    const boatSkipper          = document.getElementById('boat-skipper');
    const boatYardstick        = document.getElementById('boat-yardstick');
    const boatDivision         = document.getElementById('boat-division');
    const boatFormTitle        = document.getElementById('boat-form-title');
    const boatClassList        = document.getElementById('boat-class-list');
    const boatManualClassCheck = document.getElementById('boat-manual-class-check');
    const boatManualClassInput = document.getElementById('boat-manual-class-input');
    const boatManualBoatClass  = document.getElementById('boat-manual-boat-class');
    const boatListForm         = document.getElementById('boat-list-form');

    if (editingBoatId)  editingBoatId.value  = boat.id;
    if (boatSailNumber) boatSailNumber.value = boat.sailNumber;
    if (boatSkipper)    boatSkipper.value    = boat.skipper;
    if (boatYardstick)  boatYardstick.value  = boat.yardstick;
    if (boatDivision)   boatDivision.value   = boat.division || '';
    if (boatFormTitle)  boatFormTitle.textContent = `Edit Boat: ${boat.sailNumber} — ${boat.skipper}`;

    const isStandardClass = YARDSTICK_DATA.some(yc => yc.boatClass === boat.boatClass) &&
        boatClassList?.querySelector(`option[value="${boat.boatClass}"]`);

    if (isStandardClass && boatClassList) {
        if (boatManualClassCheck) boatManualClassCheck.checked = false;
        boatClassList.value = boat.boatClass;
        boatManualClassInput?.classList.add('hidden');
        boatClassList.disabled = false;
        if (boatManualBoatClass) boatManualBoatClass.value = '';
        const ysData = YARDSTICK_DATA.find(b => b.boatClass === boat.boatClass);
        if (boatYardstick) boatYardstick.readOnly = !!(ysData && boat.yardstick === ysData.yardstick);
    } else {
        if (boatManualClassCheck) boatManualClassCheck.checked = true;
        if (boatManualBoatClass)  boatManualBoatClass.value    = boat.boatClass;
        if (boatClassList)        { boatClassList.value = ''; boatClassList.disabled = true; }
        boatManualClassInput?.classList.remove('hidden');
        if (boatYardstick) boatYardstick.readOnly = false;
    }

    if (boatListForm) {
        boatListForm.classList.remove('hidden');
        boatListForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

async function deleteBoatFromList(id) {
    const idx  = boatList.findIndex(b => b.id === id);
    if (idx === -1) return;
    const boat = boatList[idx];
    if (!await showConfirm(`Delete ${boat.sailNumber} (${boat.skipper}) from the boat list?`, { danger: true })) return;
    boatList.splice(idx, 1);
    triggerSave();
    renderBoatListTable();
}

function clearBoatListForm() {
    ['boat-sail-number', 'boat-skipper', 'boat-manual-boat-class', 'editing-boat-id'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });

    const boatYardstick = document.getElementById('boat-yardstick');
    if (boatYardstick) { boatYardstick.value = ''; boatYardstick.readOnly = true; }

    const boatClassList = document.getElementById('boat-class-list');
    if (boatClassList)  boatClassList.value = '';

    const boatDivision = document.getElementById('boat-division');
    if (boatDivision) boatDivision.value = '';

    const check = document.getElementById('boat-manual-class-check');
    if (check) check.checked = false;

    document.getElementById('boat-manual-class-input')?.classList.add('hidden');
    document.getElementById('boat-list-form')?.classList.add('hidden');

    const formTitle = document.getElementById('boat-form-title');
    if (formTitle) formTitle.textContent = 'Add New Boat';

    if (boatClassList) boatClassList.dispatchEvent(new Event('change'));
}

async function handleSaveBoat() {
    const editingBoatId        = document.getElementById('editing-boat-id');
    const boatSailNumber       = document.getElementById('boat-sail-number');
    const boatSkipper          = document.getElementById('boat-skipper');
    const boatYardstick        = document.getElementById('boat-yardstick');
    const boatDivision         = document.getElementById('boat-division');
    const boatManualClassCheck = document.getElementById('boat-manual-class-check');
    const boatManualBoatClass  = document.getElementById('boat-manual-boat-class');
    const boatClassList        = document.getElementById('boat-class-list');

    const idStr     = editingBoatId?.value;
    const id        = idStr ? parseInt(idStr, 10) : null;
    const sailNum   = boatSailNumber?.value.trim().toUpperCase();
    const skipper   = boatSkipper?.value.trim();
    const ys        = parseFloat(boatYardstick?.value);
    const division  = boatDivision?.value;
    const isManual  = boatManualClassCheck?.checked;
    const boatClass = isManual ? boatManualBoatClass?.value.trim() : boatClassList?.value;

    if (!sailNum)              { await showAlert('Sail Number is required.');              return; }
    if (!boatClass)            { await showAlert('Boat Class is required.');               return; }
    if (!skipper)              { await showAlert('Skipper Name is required.');             return; }
    if (isNaN(ys) || ys <= 0) { await showAlert('Valid positive Yardstick is required.'); return; }
    if (!division)             { await showAlert('Division is required.');                 return; }

    const boatData = { id: id || Date.now(), sailNumber: sailNum, boatClass, skipper, yardstick: ys, division };

    if (id) {
        const idx = boatList.findIndex(b => b.id === id);
        if (idx !== -1) boatList[idx] = boatData;
        else            boatList.push(boatData);
    } else {
        boatList.push(boatData);
    }

    triggerSave();
    renderBoatListTable();
    clearBoatListForm();
    showToast(`Boat ${sailNum} saved.`, 'success');
}

// ─── Series Management ────────────────────────────────────────────────────────

function editSeries(id) {
    const s = series.find(s => s.id === id);
    if (!s) return;
    const seriesName        = document.getElementById('series-name');
    const seriesShortCourse = document.getElementById('series-short-course');
    const numberOfRaces     = document.getElementById('number-of-races');
    const racesPerDiscard   = document.getElementById('races-per-discard');
    const editSeriesId      = document.getElementById('edit-series-id');
    const createSeriesForm  = document.getElementById('create-series-form');

    if (seriesName)        seriesName.value      = s.name;
    if (seriesShortCourse) { seriesShortCourse.checked = s.isShortCourse || false; seriesShortCourse.dispatchEvent(new Event('change')); }
    if (numberOfRaces)     numberOfRaces.value   = s.isShortCourse ? '0' : s.numberOfRaces;
    if (racesPerDiscard)   racesPerDiscard.value = s.discardThreshold ?? 0;
    if (editSeriesId)      editSeriesId.value    = s.id;
    if (createSeriesForm)  { createSeriesForm.classList.remove('hidden'); createSeriesForm.scrollIntoView({ behavior: 'smooth' }); }
}

async function deleteSeries(id) {
    const idx = series.findIndex(s => s.id === id);
    if (idx === -1) return;
    const s = series[idx];
    if (!await showConfirm(`DELETE Series "${s.name}" and ALL its data permanently? This cannot be undone.`, { danger: true, confirmText: 'Delete' })) return;

    series.splice(idx, 1);
    triggerSave();
    refreshSeriesList();
    refreshSeriesDropdowns();

    const selectSeries  = document.getElementById('select-series');
    const viewSeries    = document.getElementById('view-series-select');
    const viewAllSeries = document.getElementById('view-all-series-select');

    if (selectSeries?.value  == id) selectSeries.value = '';
    if (viewSeries?.value    == id) { viewSeries.value = '';    calculateAndRenderSeriesResults(); }
    if (viewAllSeries?.value == id) { viewAllSeries.value = ''; displayRaceViewer(); }

    if (currentSeries?.id === id) {
        currentSeries = null; currentRace = null; entries = []; results = []; shortCourseSessionRaces = [];
        const raceTab    = document.getElementById('race-tab');
        const resultsTab = document.getElementById('results-tab');
        if (raceTab?.classList.contains('active-tab'))    updateRaceEntryUI();
        if (resultsTab?.classList.contains('active-tab')) loadRaceResults();
    }
    showToast(`Series "${s.name}" deleted.`, 'info');
}

async function handleSaveSeries() {
    const seriesName        = document.getElementById('series-name');
    const seriesShortCourse = document.getElementById('series-short-course');
    const numberOfRaces     = document.getElementById('number-of-races');
    const racesPerDiscard   = document.getElementById('races-per-discard');
    const editSeriesId      = document.getElementById('edit-series-id');
    const createSeriesForm  = document.getElementById('create-series-form');

    const name             = seriesName?.value.trim();
    const isShortCourse    = seriesShortCourse?.checked || false;
    let   racesPlanned     = isShortCourse ? 0 : parseInt(numberOfRaces?.value);
    const discardThreshold = parseInt(racesPerDiscard?.value);
    const editId           = editSeriesId?.value;

    if (!name)                                                       { await showAlert('Series Name is required.'); return; }
    if (isNaN(discardThreshold) || discardThreshold < 0 || discardThreshold > 20) { await showAlert('Races Per Discard must be 0–20.'); return; }
    if (!isShortCourse) {
        if (isNaN(racesPlanned))                  { await showAlert('Number of Races Planned is required.'); return; }
        if (racesPlanned < 1 || racesPlanned > 50) { await showAlert('Number of races must be 1–50.'); return; }
    }

    if (editId) {
        const existing = series.find(s => s.id === parseInt(editId));
        if (!existing) { await showAlert('Error finding series to update.'); return; }

        existing.name             = name;
        existing.isShortCourse    = isShortCourse;
        existing.discardThreshold = discardThreshold;

        if (isShortCourse) {
            existing.numberOfRaces = existing.races.length;
        } else {
            const old = existing.numberOfRaces;
            existing.numberOfRaces = racesPlanned;
            if (racesPlanned > old) {
                for (let i = old + 1; i <= racesPlanned; i++) {
                    existing.races.push({ raceNumber: i, date: null, entries: [], results: [], startTime: null });
                }
            } else if (racesPlanned < old) {
                const toRemove = existing.races.slice(racesPlanned);
                if (toRemove.some(r => r.results?.length > 0)) {
                    if (!await showConfirm(`Reducing races removes Race ${racesPlanned + 1} onwards, including any saved results. Continue?`, { danger: true, confirmText: 'Remove' })) {
                        if (numberOfRaces) numberOfRaces.value = old;
                        existing.numberOfRaces = old;
                        return;
                    }
                }
                existing.races = existing.races.slice(0, racesPlanned);
            }
            existing.races.sort((a, b) => a.raceNumber - b.raceNumber);
        }
        showToast(`Series "${name}" updated.`, 'success');
    } else {
        const newSeries = {
            id: Date.now(), name, isShortCourse,
            numberOfRaces: isShortCourse ? 0 : racesPlanned,
            discardThreshold,
            races: [],
        };
        if (!isShortCourse) {
            for (let i = 1; i <= racesPlanned; i++) {
                newSeries.races.push({ raceNumber: i, date: null, entries: [], results: [], startTime: null });
            }
        }
        series.push(newSeries);
        showToast(`Series "${name}" (${isShortCourse ? 'Short Course' : 'Standard'}) created.`, 'success');
    }

    triggerSave();
    refreshSeriesList();
    refreshSeriesDropdowns();
    createSeriesForm?.classList.add('hidden');
}

// ─── Calculate & Save Results ─────────────────────────────────────────────────

async function handleCalculateResults() {
    if (currentSeries?.isShortCourse) {
        await _handleCalculateShortCourseResults();
    } else {
        await _handleCalculateStandardResults();
    }
}

async function _handleCalculateShortCourseResults() {
    if (shortCourseSessionRaces.length === 0) { await showAlert('No races in this session to save.'); return; }
    if (!currentSeries)                        { await showAlert('No series selected.'); return; }

    for (const race of shortCourseSessionRaces) {
        for (const entry of race.entries) {
            if (entry.status === 'finished' && (!entry.elapsedTime || !isValidTimeFormat(entry.elapsedTime))) {
                await showAlert(`Missing or invalid time for ${entry.sailNumber} (finished) in Race ${race.raceNumber}.`);
                return;
            }
        }
    }

    if (!await showConfirm(
        `Calculate and SAVE results for all ${shortCourseSessionRaces.length} race(s)?\n\nThis will OVERWRITE all previously saved races for "${currentSeries.name}".`,
        { confirmText: 'Save Results', danger: true }
    )) return;

    try {
        const target = series.find(s => s.id === currentSeries.id);
        if (!target)  throw new Error('Series not found.');
        const raceDateInput = document.getElementById('race-date');
        const date          = raceDateInput?.value || new Date().toISOString().split('T')[0];
        const newRaces      = [];

        shortCourseSessionRaces.forEach(raceData => {
            if (raceData.entries.length === 0) return;
            const calculated = calculateSingleRaceResults(raceData.entries, target);
            newRaces.push({
                raceNumber: raceData.raceNumber,
                date,
                entries:   calculated.map(_entryFromResult),
                results:   calculated,
                startTime: raceData.startTime,
            });
        });

        target.races         = newRaces;
        target.numberOfRaces = newRaces.length;
        target.races.sort((a, b) => a.raceNumber - b.raceNumber);

        triggerSave();
        refreshSeriesDropdowns();
        refreshSeriesList();
        clearSessionStorage();
        showToast(`${target.races.length} ${pluralize(target.races.length, 'race')} saved to "${target.name}".`, 'success', 5000);
    } catch (err) {
        console.error('Error calculating SC results:', err);
        await showAlert('Error: ' + err.message);
    }
}

async function _handleCalculateStandardResults() {
    const map = new Map();
    entries.forEach(e => { if (e.savedBoatId) map.set(e.savedBoatId, e); });
    entries = [...map.values()];
    renderEntriesTable();

    if (entries.length === 0)                          { await showAlert('Add at least one boat entry first.'); return; }
    if (!currentSeries || typeof currentRace !== 'number') { await showAlert('Select a series and race number first.'); return; }

    for (const entry of entries) {
        if (entry.status === 'finished' && (!entry.elapsedTime || !isValidTimeFormat(entry.elapsedTime))) {
            await showAlert(`Missing or invalid time for ${entry.sailNumber} (finished).`);
            return;
        }
    }

    if (!await showConfirm(
        `Calculate results for Race ${currentRace} in "${currentSeries.name}" and save?\n\nThis cannot be undone.`,
        { confirmText: 'Save Results', danger: true }
    )) return;

    const calculated = calculateSingleRaceResults(entries, currentSeries, currentRace);
    const target     = series.find(s => s.id === currentSeries.id);
    if (!target) { await showAlert('Error: Series not found.'); return; }

    const raceIdx = target.races.findIndex(r => r.raceNumber === currentRace);
    if (raceIdx === -1) { await showAlert(`Error: Race ${currentRace} not found.`); return; }

    if (target.races[raceIdx].results?.length > 0 && calculated.length > 0) {
        if (!await showConfirm(`Race ${currentRace} already has results. Overwrite?`, { danger: true, confirmText: 'Overwrite' })) return;
    }

    const raceDateInput = document.getElementById('race-date');
    const date = raceDateInput?.value || new Date().toISOString().split('T')[0];

    target.races[raceIdx] = {
        ...target.races[raceIdx],
        date,
        entries: calculated.map(_entryFromResult),
        results: JSON.parse(JSON.stringify(calculated)),
    };

    triggerSave();
    editMode = false;
    document.getElementById('edit-mode-warning')?.classList.add('hidden');
    showToast(`Race ${currentRace} results saved for "${target.name}".`, 'success', 5000);
    refreshSeriesDropdowns();
    results = calculated;
    setActiveTab(document.getElementById('results-tab'));
}

async function handleSaveCurrentEntries() {
    if (!currentSeries) { await showAlert('Please select a series first.'); return; }
    const target = series.find(s => s.id === currentSeries.id);
    if (!target)  { await showAlert('Error: Could not find the selected series.'); return; }

    const raceDateInput = document.getElementById('race-date');

    if (currentSeries.isShortCourse) {
        const date     = raceDateInput?.value || new Date().toISOString().split('T')[0];
        const newRaces = shortCourseSessionRaces
            .filter(r => r.entries.length > 0)
            .map(r => ({
                raceNumber: r.raceNumber,
                date,
                entries:   JSON.parse(JSON.stringify(r.entries)),
                results:   [],
                startTime: r.startTime,
            }));

        target.races         = newRaces;
        target.numberOfRaces = newRaces.length;
        target.races.sort((a, b) => a.raceNumber - b.raceNumber);
        triggerSave();
        showToast(`Short course session with ${newRaces.length} race(s) saved.`, 'success');
    } else {
        if (!currentRace) { await showAlert('Please select a race.'); return; }
        const race = target.races.find(r => r.raceNumber === currentRace);
        if (!race)        { await showAlert(`Race ${currentRace} not found.`); return; }

        const map = new Map();
        entries.forEach(e => { if (e.savedBoatId) map.set(e.savedBoatId, e); });
        race.entries = [...map.values()];
        race.date    = raceDateInput?.value || new Date().toISOString().split('T')[0];
        triggerSave();
        showToast(`Entries for Race ${currentRace} saved.`, 'success');
    }
}

// ─── Short Course Session Management ─────────────────────────────────────────

async function handleCreateShortCourseRace() {
    if (entries.length === 0)              { await showAlert('The Race Entries pool is empty. Add boats first.'); return; }
    if (!currentSeries?.isShortCourse)     { await showAlert('Error: Not a short course series.'); return; }

    const existing    = shortCourseSessionRaces.map(r => r.raceNumber);
    const nextNum     = existing.length > 0 ? Math.max(...existing) + 1 : 1;
    const raceEntries = JSON.parse(JSON.stringify(entries)).map(e => ({ ...e, status: '', elapsedTime: '' }));

    shortCourseSessionRaces.push({ raceNumber: nextNum, entries: raceEntries, startTime: null });
    renderShortCourseSessionRaces();
    updateCreateRaceButton();
    updateRemoveLastRaceButtonVisibility();
    saveSessionToStorage();
}

async function handleRemoveLastShortCourseRace() {
    if (shortCourseSessionRaces.length === 0) { await showAlert('No created races to remove.'); return; }
    const last = shortCourseSessionRaces[shortCourseSessionRaces.length - 1];
    if (!await showConfirm(`Remove Race ${last.raceNumber} (last in session)? If already saved, this change will be permanent.`, { danger: true, confirmText: 'Remove' })) return;

    const removedIdx = shortCourseSessionRaces.length - 1;
    shortCourseSessionRaces.pop();
    renderShortCourseSessionRaces();
    updateCreateRaceButton();
    updateRemoveLastRaceButtonVisibility();
    saveSessionToStorage();

    const editingScIdx = parseInt(document.getElementById('editing-short-course-race-index')?.value);
    if (editingScIdx === removedIdx) {
        clearEntryForm();
        const title = document.getElementById('entry-form-title');
        if (title) title.textContent = 'Add Boat to Entries';
    }
}

async function handleClearShortCourseSession() {
    if (shortCourseSessionRaces.length === 0 && entries.length === 0) {
        await showAlert('No created races or pool entries to clear.');
        return;
    }
    if (!await showConfirm(
        `Clear all ${shortCourseSessionRaces.length} ${pluralize(shortCourseSessionRaces.length, 'race', 'races')} and all pool entries from this session?`,
        { danger: true, confirmText: 'Clear Session' }
    )) return;

    shortCourseSessionRaces = []; entries = [];
    renderShortCoursePoolTable();
    renderShortCourseSessionRaces();
    updateCreateRaceButton();
    updateRemoveLastRaceButtonVisibility();
    clearSessionStorage();
}

function handleAddSelectedBoats() {
    if (!currentSeries) { console.warn('No series selected.'); return; }
    if (!currentSeries.isShortCourse && !currentRace) { console.warn('No race selected.'); return; }

    const checkboxes = document.querySelectorAll('#bulk-boat-list-container input[type="checkbox"]:checked');
    if (checkboxes.length === 0) return;

    let added = 0, skipped = 0;
    checkboxes.forEach(cb => {
        const boat = boatList.find(b => b.id === parseInt(cb.value));
        if (!boat) return;
        const entryData = {
            savedBoatId: boat.id, sailNumber: boat.sailNumber, boatClass: boat.boatClass,
            skipper: boat.skipper, yardstick: boat.yardstick, division: boat.division,
            status: currentSeries.isShortCourse ? 'pool' : '', elapsedTime: '',
        };

        if (currentSeries.isShortCourse) {
            if (entries.some(e => e.savedBoatId === entryData.savedBoatId)) { skipped++; return; }
            entries.push(entryData);
            added++;
            shortCourseSessionRaces.forEach(race => {
                if (!race.entries.some(e => e.savedBoatId === entryData.savedBoatId)) {
                    race.entries.push({ ...entryData, status: 'DNS', elapsedTime: '' });
                }
            });
        } else {
            if (entries.some(e => e.savedBoatId === entryData.savedBoatId)) { skipped++; return; }
            entries.push(entryData);
            added++;
        }
    });

    if (currentSeries.isShortCourse) {
        renderShortCoursePoolTable();
        if (added > 0 && shortCourseSessionRaces.length > 0) renderShortCourseSessionRaces();
    } else {
        renderEntriesTable();
    }

    checkboxes.forEach(cb => cb.checked = false);
    if (added > 0) showToast(`${added} ${pluralize(added, 'boat')} added.`, 'success');
}

// ─── Calendar ────────────────────────────────────────────────────────────────

function saveCalendarText() {
    const textarea = document.getElementById('calendar-textarea');
    if (textarea) {
        savedCalendarText = textarea.value;
        triggerSave();
        showToast('Calendar queued for saving to cloud.', 'success');
    }
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

function _entryFromResult(res) {
    return {
        savedBoatId: res.savedBoatId,
        sailNumber:  res.sailNumber,
        boatClass:   res.boatClass,
        skipper:     res.skipper,
        yardstick:   res.yardstick,
        status:      res.status,
        elapsedTime: res.elapsedTime || '',
        division:    res.division,
    };
}
