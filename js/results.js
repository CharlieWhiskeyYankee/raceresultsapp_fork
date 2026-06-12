/**
 * results.js
 * Race and series results calculation engine.
 * Pure logic: no DOM manipulation.
 */

import { timeToSeconds, secondsToTime } from './utils.js';

// ─── Single Race Results ──────────────────────────────────────────────────────

export function calculateSingleRaceResults(entriesArray, seriesData, raceNumber) {
    if (!entriesArray || entriesArray.length === 0) return [];

    const allDivisions = [...new Set(entriesArray.map(e => String(e.division)))].sort();
    let allResults = [];

    allDivisions.forEach(division => {
        const divEntries = entriesArray.filter(e => String(e.division) === division);
        allResults = allResults.concat(_calculateDivisionResults(divEntries, seriesData, raceNumber, division));
    });

    return allResults;
}

function _calculateDivisionResults(divEntries, seriesData, raceNumber, division) {
    const finishers = divEntries.filter(e => e.status === 'finished').map(e => {
        const elapsed   = timeToSeconds(e.elapsedTime);
        const corrected = elapsed > 0 ? (elapsed / e.yardstick) * 100 : Infinity;
        return { ...e, elapsedSeconds: elapsed, correctedSeconds: corrected };
    });

    finishers.sort((a, b) => a.correctedSeconds - b.correctedSeconds);

    const nonFinishers   = divEntries.filter(e => e.status !== 'finished');
    const totalFinishers = finishers.length;

    finishers.forEach((entry, idx) => {
        entry.position      = idx + 1;
        entry.points        = idx + 1;
        entry.correctedTime = secondsToTime(Math.round(entry.correctedSeconds));
    });

    const dnfOcsPoints = totalFinishers + 1;
    const dsqPoints    = totalFinishers + 2;

    const processedNonFinishers = nonFinishers.map(entry => {
        let pts;
        const s = (entry.status || '').toLowerCase();
        if (s === 'dns')      pts = totalFinishers + 2;
        else if (s === 'dnf') pts = dnfOcsPoints;
        else if (s === 'ocs') pts = dnfOcsPoints;
        else if (s === 'dsq') pts = dsqPoints;
        else if (s === 'ood') pts = 0; // Re-calculated below.
        else                  pts = totalFinishers + 1;
        return { ...entry, position: null, points: pts, correctedTime: '' };
    });

    const combined = [...finishers, ...processedNonFinishers];
    combined.forEach(entry => {
        if ((entry.status || '').toLowerCase() === 'ood') {
            entry.points = _calculateOODPoints(entry, combined);
        }
    });

    return combined;
}

function _calculateOODPoints(oodEntry, allResults) {
    const finisherPoints = allResults
        .filter(r => r !== oodEntry && r.status === 'finished' && typeof r.points === 'number')
        .map(r => r.points);
    if (finisherPoints.length === 0) return 0;
    const avg = finisherPoints.reduce((sum, p) => sum + p, 0) / finisherPoints.length;
    return Math.round(avg * 10) / 10;
}

// ─── Series Results ───────────────────────────────────────────────────────────

export function calculateSeriesStandings(selectedSeries, division) {
    const racesWithResults = selectedSeries.races
        .filter(r => r.results?.length > 0 && r.results.some(res => String(res.division) === String(division)))
        .sort((a, b) => a.raceNumber - b.raceNumber);

    if (racesWithResults.length === 0) return [];

    const raceNumbers      = racesWithResults.map(r => r.raceNumber);
    const discardThreshold = selectedSeries.discardThreshold || 0;
    const numDiscards      = discardThreshold > 0 ? Math.floor(racesWithResults.length / discardThreshold) : 0;

    const competitors = new Map();

    racesWithResults.forEach(race => {
        race.results
            .filter(res => String(res.division) === String(division))
            .forEach(res => {
                const key = `${res.sailNumber}-${res.skipper}`;
                if (!competitors.has(key)) {
                    competitors.set(key, {
                        sailNumber: res.sailNumber, skipper: res.skipper, boatClass: res.boatClass,
                        raceScores: new Map(), totalPoints: 0, netPoints: 0, position: null,
                    });
                }
                competitors.get(key).boatClass = res.boatClass;
            });
    });

    racesWithResults.forEach(race => {
        race.results
            .filter(res => String(res.division) === String(division))
            .forEach(res => {
                const key = `${res.sailNumber}-${res.skipper}`;
                competitors.get(key)?.raceScores.set(race.raceNumber, {
                    points: res.points, status: (res.status || '').toUpperCase(),
                    position: res.position, discarded: false,
                });
            });
    });

    competitors.forEach(competitor => {
        raceNumbers.forEach(raceNum => {
            if (!competitor.raceScores.has(raceNum)) {
                const race       = selectedSeries.races.find(r => r.raceNumber === raceNum);
                const hasResults = race?.results?.some(r => String(r.division) === String(division));
                const numScored  = hasResults
                    ? race.results.filter(r => String(r.division) === String(division) && r.status !== 'OOD').length
                    : 0;
                competitor.raceScores.set(raceNum, hasResults
                    ? { points: numScored + 2, status: 'DNC', position: 'DNC', discarded: false }
                    : { points: null, status: 'NR', position: 'NR', discarded: false }
                );
            } else {
                const score = competitor.raceScores.get(raceNum);
                if (score.status === 'OOD') {
                    score.points = _calculateOODPointsSeriesContext(
                        competitor.sailNumber, competitor.skipper, raceNum, selectedSeries, division
                    );
                }
            }
        });

        const validScores = [...competitor.raceScores.values()].filter(s => s?.points !== null && !isNaN(s?.points));
        competitor.totalPoints = validScores.reduce((sum, s) => sum + s.points, 0);

        if (validScores.length > 0 && numDiscards > 0) {
            const eligible = [...competitor.raceScores.entries()]
                .filter(([, s]) => s?.points !== null && !isNaN(s?.points))
                .map(([rn, s]) => ({ ...s, raceNumber: rn }))
                .sort((a, b) => b.points - a.points);
            for (let i = 0; i < Math.min(numDiscards, eligible.length); i++) {
                const s = competitor.raceScores.get(eligible[i].raceNumber);
                if (s) s.discarded = true;
            }
        }

        competitor.netPoints = [...competitor.raceScores.values()]
            .reduce((sum, s) => (s?.points !== null && !isNaN(s?.points) && !s.discarded ? sum + s.points : sum), 0);
    });

    const sorted = [...competitors.values()].sort((a, b) => {
        if (a.netPoints !== b.netPoints) return a.netPoints - b.netPoints;
        const sc = a.sailNumber.localeCompare(b.sailNumber, undefined, { numeric: true });
        return sc !== 0 ? sc : a.skipper.localeCompare(b.skipper);
    });

    let rank = 0, pos = 0;
    sorted.forEach((c, i) => {
        rank++;
        if (i === 0 || c.netPoints > sorted[i - 1].netPoints) pos = rank;
        c.position = pos;
    });

    return sorted.map(c => ({ ...c, raceNumbers }));
}

function _calculateOODPointsSeriesContext(sailNo, skipper, raceNum, seriesData, division) {
    const raceData = seriesData.races.find(r => r.raceNumber === raceNum);
    if (!raceData?.results) return 0;
    const pts = raceData.results
        .filter(r => (r.sailNumber !== sailNo || r.skipper !== skipper) &&
            r.status === 'finished' && String(r.division) === String(division) &&
            r.points != null && !isNaN(r.points))
        .map(r => r.points);
    if (pts.length === 0) return 0;
    return Math.round((pts.reduce((s, p) => s + p, 0) / pts.length) * 10) / 10;
}

export function deduplicateResults(resultsArray) {
    const map = new Map();
    (resultsArray || []).forEach(r => { if (r.savedBoatId) map.set(r.savedBoatId, r); });
    return [...map.values()];
}
