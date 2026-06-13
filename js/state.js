/**
 * state.js
 * Single source of truth for all mutable application state.
 *
 * The `state` object is exported for *reading* anywhere in the app.
 * All *writes* must go through the named setter functions exported below.
 * No other module should assign directly to state properties.
 *
 * This makes every mutation point explicit, traceable, and easy to extend
 * (e.g. adding logging, undo/redo, or change hooks in one place).
 */

// ─── State object (read-only outside this module by convention) ───────────────

export const state = {
    // Persisted (loaded from / saved to Google Sheets)
    entries:           [],
    results:           [],
    series:            [],
    boatList:          [],
    savedCalendarText: '',

    // Session-only
    shortCourseSessionRaces: [],
    currentSeries:           null,
    currentRace:             null,
    editMode:                false,

    // Save queue management (used only by storage.js)
    isSaving:   false,
    saveQueued: false,

    // Timer interval handle (used only by app.js)
    raceTimerDisplayInterval: null,
};

// ─── Entries ──────────────────────────────────────────────────────────────────

export function addEntry(entry) {
    state.entries.push(entry);
}

export function removeEntry(index) {
    state.entries.splice(index, 1);
}

export function updateEntry(index, fields) {
    Object.assign(state.entries[index], fields);
}

export function setEntries(entries) {
    state.entries = entries;
}

export function clearEntries() {
    state.entries = [];
}

// ─── Results ──────────────────────────────────────────────────────────────────

export function setResults(results) {
    state.results = results;
}

export function clearResults() {
    state.results = [];
}

// ─── Series ───────────────────────────────────────────────────────────────────

export function setSeries(series) {
    state.series = series;
}

export function addSeries(s) {
    state.series.push(s);
}

export function updateSeriesAtIndex(index, s) {
    state.series[index] = s;
}

export function removeSeriesAtIndex(index) {
    state.series.splice(index, 1);
}

// ─── Boat List ────────────────────────────────────────────────────────────────

export function setBoatList(boats) {
    state.boatList = boats;
}

export function addBoat(boat) {
    state.boatList.push(boat);
}

export function updateBoatAtIndex(index, boat) {
    state.boatList[index] = boat;
}

export function removeBoatAtIndex(index) {
    state.boatList.splice(index, 1);
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

export function setCalendarText(text) {
    state.savedCalendarText = text;
}

// ─── Short Course Session ─────────────────────────────────────────────────────

export function setShortCourseSessionRaces(races) {
    state.shortCourseSessionRaces = races;
}

export function addShortCourseRace(race) {
    state.shortCourseSessionRaces.push(race);
}

export function removeLastShortCourseRace() {
    state.shortCourseSessionRaces.pop();
}

export function clearShortCourseSession() {
    state.shortCourseSessionRaces = [];
}

// ─── Navigation / UI state ────────────────────────────────────────────────────

export function setCurrentSeries(series) {
    state.currentSeries = series;
}

export function setCurrentRace(race) {
    state.currentRace = race;
}

export function setEditMode(value) {
    state.editMode = value;
}

// ─── Save queue (storage.js internal use) ────────────────────────────────────

export function setIsSaving(value) {
    state.isSaving = value;
}

export function setSaveQueued(value) {
    state.saveQueued = value;
}

// ─── Timer (app.js internal use) ─────────────────────────────────────────────

export function setTimerInterval(id) {
    state.raceTimerDisplayInterval = id;
}
