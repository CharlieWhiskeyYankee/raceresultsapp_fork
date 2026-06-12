/**
 * state.js
 * Single source of truth for all mutable application state.
 *
 * Because ES module bindings are live but cannot be re-assigned by importers,
 * all state is held in a single exported `state` object. Modules mutate
 * properties of this object directly (e.g. `state.entries.push(...)` or
 * `state.currentSeries = x`). This gives every importer a live reference to
 * the same underlying data without needing setter functions for every field.
 */

export const state = {
    // ── Persisted (loaded from / saved to Google Sheets) ──
    entries:            [],
    results:            [],
    series:             [],
    boatList:           [],
    savedCalendarText:  '',

    // ── Session-only ──
    shortCourseSessionRaces: [],
    currentSeries:           null,
    currentRace:             null,   // integer race number, or null
    editMode:                false,

    // ── Save queue management ──
    isSaving:    false,
    saveQueued:  false,

    // ── Timer interval handle ──
    raceTimerDisplayInterval: null,
};
