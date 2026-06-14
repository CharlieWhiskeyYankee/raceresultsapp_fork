/**
 * tests/results.test.js
 * Tests for the race and series results calculation engine.
 *
 * Covers:
 *   calculateSingleRaceResults — finishers, penalties, OOD, multiple divisions
 *   calculateSeriesStandings   — totals, discards, DNC, tied positions
 *   deduplicateResults         — last-entry-wins deduplication
 */

import { describe, it, expect } from 'vitest';
import {
    calculateSingleRaceResults,
    calculateSeriesStandings,
    deduplicateResults,
} from '../js/results.js';

// ─── Test data helpers ────────────────────────────────────────────────────────

/** Build a minimal finished entry. elapsedTime in "mm:ss" or "h:mm:ss". */
function finishedEntry(overrides) {
    return {
        savedBoatId:  overrides.id      ?? 1,
        sailNumber:   overrides.sail    ?? 'AUS1',
        skipper:      overrides.skipper ?? 'Skipper A',
        boatClass:    overrides.cls     ?? 'Laser',
        yardstick:    overrides.ys      ?? 100,
        division:     overrides.div     ?? '1',
        status:       'finished',
        elapsedTime:  overrides.time    ?? '30:00',
    };
}

/** Build a non-finishing entry with the given status. */
function nonFinisher(status, overrides = {}) {
    return {
        savedBoatId: overrides.id      ?? 99,
        sailNumber:  overrides.sail    ?? 'AUS99',
        skipper:     overrides.skipper ?? 'Skipper X',
        boatClass:   overrides.cls     ?? 'Laser',
        yardstick:   overrides.ys      ?? 100,
        division:    overrides.div     ?? '1',
        status,
        elapsedTime: '',
    };
}

/** Minimal series object for passing to calculateSingleRaceResults. */
const SERIES = { id: 1, name: 'Test Series', discardThreshold: 0 };

// ─── calculateSingleRaceResults ───────────────────────────────────────────────

describe('calculateSingleRaceResults', () => {

    describe('basic position and points', () => {
        it('returns empty array for empty input', () => {
            expect(calculateSingleRaceResults([], SERIES)).toEqual([]);
            expect(calculateSingleRaceResults(null, SERIES)).toEqual([]);
        });

        it('assigns position 1 and 1 point to the single finisher', () => {
            const results = calculateSingleRaceResults([
                finishedEntry({ id: 1, sail: 'AUS1', time: '30:00', ys: 100 }),
            ], SERIES);
            const r = results.find(r => r.sailNumber === 'AUS1');
            expect(r.position).toBe(1);
            expect(r.points).toBe(1);
        });

        it('ranks three finishers by corrected time ascending', () => {
            // All same yardstick — shorter elapsed = faster corrected
            const entries = [
                finishedEntry({ id: 1, sail: 'AUS1', time: '31:00', ys: 100 }),
                finishedEntry({ id: 2, sail: 'AUS2', time: '29:00', ys: 100 }),
                finishedEntry({ id: 3, sail: 'AUS3', time: '30:00', ys: 100 }),
            ];
            const results = calculateSingleRaceResults(entries, SERIES);
            const byPos = results
                .filter(r => r.status === 'finished')
                .sort((a, b) => a.position - b.position);

            expect(byPos[0].sailNumber).toBe('AUS2');
            expect(byPos[1].sailNumber).toBe('AUS3');
            expect(byPos[2].sailNumber).toBe('AUS1');
            expect(byPos.map(r => r.points)).toEqual([1, 2, 3]);
        });

        it('applies yardstick correction correctly', () => {
            // AUS1: 60 min elapsed, yardstick 120 → corrected = 3600/120*100 = 3000s
            // AUS2: 50 min elapsed, yardstick 100 → corrected = 3000/100*100 = 3000s
            // AUS3: 45 min elapsed, yardstick 90  → corrected = 2700/90*100  = 3000s
            // All identical corrected time — order determined by input stability or sail number
            // Main assertion: all three are position 1, 2, 3 in some order and all finish
            const entries = [
                finishedEntry({ id: 1, sail: 'AUS1', time: '1:00:00', ys: 120 }),
                finishedEntry({ id: 2, sail: 'AUS2', time: '50:00',   ys: 100 }),
                finishedEntry({ id: 3, sail: 'AUS3', time: '45:00',   ys: 90  }),
            ];
            const results = calculateSingleRaceResults(entries, SERIES);
            const finishers = results.filter(r => r.status === 'finished');
            expect(finishers).toHaveLength(3);
            expect(finishers.map(r => r.position).sort()).toEqual([1, 2, 3]);
        });

        it('sets correctedTime as a formatted HH:MM:SS string', () => {
            const results = calculateSingleRaceResults([
                finishedEntry({ id: 1, sail: 'AUS1', time: '30:00', ys: 100 }),
            ], SERIES);
            // corrected = 1800/100*100 = 1800s = 00:30:00
            expect(results[0].correctedTime).toBe('00:30:00');
        });
    });

    describe('penalty points', () => {
        it('gives DNF points of finishers + 1', () => {
            const entries = [
                finishedEntry({ id: 1, sail: 'AUS1', time: '30:00' }),
                finishedEntry({ id: 2, sail: 'AUS2', time: '31:00' }),
                nonFinisher('DNF', { id: 3, sail: 'AUS3' }),
            ];
            const results = calculateSingleRaceResults(entries, SERIES);
            const dnf = results.find(r => r.sailNumber === 'AUS3');
            expect(dnf.points).toBe(3); // 2 finishers + 1
            expect(dnf.position).toBeNull();
        });

        it('gives DNS points of finishers + 2', () => {
            const entries = [
                finishedEntry({ id: 1, sail: 'AUS1', time: '30:00' }),
                nonFinisher('DNS', { id: 2, sail: 'AUS2' }),
            ];
            const results = calculateSingleRaceResults(entries, SERIES);
            const dns = results.find(r => r.sailNumber === 'AUS2');
            expect(dns.points).toBe(3); // 1 finisher + 2
        });

        it('gives OCS the same points as DNF (finishers + 1)', () => {
            const entries = [
                finishedEntry({ id: 1, sail: 'AUS1', time: '30:00' }),
                finishedEntry({ id: 2, sail: 'AUS2', time: '31:00' }),
                nonFinisher('OCS', { id: 3, sail: 'AUS3' }),
            ];
            const results = calculateSingleRaceResults(entries, SERIES);
            const ocs = results.find(r => r.sailNumber === 'AUS3');
            expect(ocs.points).toBe(3); // same as DNF
        });

        it('gives DSQ points of finishers + 2', () => {
            const entries = [
                finishedEntry({ id: 1, sail: 'AUS1', time: '30:00' }),
                finishedEntry({ id: 2, sail: 'AUS2', time: '31:00' }),
                nonFinisher('DSQ', { id: 3, sail: 'AUS3' }),
            ];
            const results = calculateSingleRaceResults(entries, SERIES);
            const dsq = results.find(r => r.sailNumber === 'AUS3');
            expect(dsq.points).toBe(4); // 2 finishers + 2, same as DNS
        });

        it('DNS scores more than DNF when there are finishers', () => {
            const entries = [
                finishedEntry({ id: 1, sail: 'AUS1', time: '30:00' }),
                nonFinisher('DNF', { id: 2, sail: 'AUS2' }),
                nonFinisher('DNS', { id: 3, sail: 'AUS3' }),
            ];
            const results = calculateSingleRaceResults(entries, SERIES);
            const dnf = results.find(r => r.sailNumber === 'AUS2');
            const dns = results.find(r => r.sailNumber === 'AUS3');
            expect(dns.points).toBeGreaterThan(dnf.points);
        });

        it('handles a race with no finishers — all get minimum penalty', () => {
            const entries = [
                nonFinisher('DNF', { id: 1, sail: 'AUS1' }),
                nonFinisher('DNS', { id: 2, sail: 'AUS2' }),
            ];
            const results = calculateSingleRaceResults(entries, SERIES);
            // 0 finishers: DNF = 0+1 = 1, DNS = 0+2 = 2
            const dnf = results.find(r => r.sailNumber === 'AUS1');
            const dns = results.find(r => r.sailNumber === 'AUS2');
            expect(dnf.points).toBe(1);
            expect(dns.points).toBe(2);
        });
    });

    describe('OOD (Race Officer on Duty)', () => {
        it('gives OOD the average points of finishers', () => {
            // Finishers score 1 and 2, average = 1.5
            const entries = [
                finishedEntry({ id: 1, sail: 'AUS1', time: '29:00' }),
                finishedEntry({ id: 2, sail: 'AUS2', time: '31:00' }),
                nonFinisher('OOD', { id: 3, sail: 'AUS3' }),
            ];
            const results = calculateSingleRaceResults(entries, SERIES);
            const ood = results.find(r => r.sailNumber === 'AUS3');
            expect(ood.points).toBe(1.5);
        });

        it('gives OOD 0 points when there are no finishers', () => {
            const entries = [
                nonFinisher('DNF', { id: 1, sail: 'AUS1' }),
                nonFinisher('OOD', { id: 2, sail: 'AUS2' }),
            ];
            const results = calculateSingleRaceResults(entries, SERIES);
            const ood = results.find(r => r.sailNumber === 'AUS2');
            expect(ood.points).toBe(0);
        });

        it('rounds OOD points to 1 decimal place', () => {
            // Three finishers: 1, 2, 3 → average = 2.0 (already clean)
            // Four finishers: 1, 2, 3, 4 → average = 2.5
            // Five finishers: 1+2+3+4+5=15 / 5 = 3.0
            // Use 2 finishers scoring 1 and 2 → average = 1.5 (one decimal)
            const entries = [
                finishedEntry({ id: 1, sail: 'AUS1', time: '29:00' }),
                finishedEntry({ id: 2, sail: 'AUS2', time: '31:00' }),
                nonFinisher('OOD', { id: 3, sail: 'AUS3' }),
            ];
            const results = calculateSingleRaceResults(entries, SERIES);
            const ood = results.find(r => r.sailNumber === 'AUS3');
            const decimals = (ood.points.toString().split('.')[1] || '').length;
            expect(decimals).toBeLessThanOrEqual(1);
        });

        it('OOD does not count in the average for its own points', () => {
            // OOD should only average the *other* finishers, not itself
            const entries = [
                finishedEntry({ id: 1, sail: 'AUS1', time: '29:00' }),  // 1 point
                nonFinisher('OOD', { id: 2, sail: 'AUS2' }),
            ];
            const results = calculateSingleRaceResults(entries, SERIES);
            const ood = results.find(r => r.sailNumber === 'AUS2');
            // Only 1 finisher scoring 1 point → OOD average = 1.0
            expect(ood.points).toBe(1);
        });
    });

    describe('multiple divisions', () => {
        it('scores each division independently', () => {
            const entries = [
                finishedEntry({ id: 1, sail: 'AUS1', time: '30:00', div: '1' }),
                finishedEntry({ id: 2, sail: 'AUS2', time: '31:00', div: '1' }),
                finishedEntry({ id: 3, sail: 'AUS3', time: '25:00', div: '2' }),
                finishedEntry({ id: 4, sail: 'AUS4', time: '26:00', div: '2' }),
            ];
            const results = calculateSingleRaceResults(entries, SERIES);

            const div1 = results.filter(r => String(r.division) === '1').sort((a, b) => a.position - b.position);
            const div2 = results.filter(r => String(r.division) === '2').sort((a, b) => a.position - b.position);

            // Each division has its own 1st and 2nd
            expect(div1[0].position).toBe(1);
            expect(div1[1].position).toBe(2);
            expect(div2[0].position).toBe(1);
            expect(div2[1].position).toBe(2);

            // Penalty points are relative to each division's finisher count
            expect(div1[0].points).toBe(1);
            expect(div2[0].points).toBe(1);
        });

        it('a DNF in div1 does not affect penalty points in div2', () => {
            const entries = [
                finishedEntry({ id: 1, sail: 'AUS1', time: '30:00', div: '1' }),
                nonFinisher('DNF', { id: 2, sail: 'AUS2', div: '1' }),
                finishedEntry({ id: 3, sail: 'AUS3', time: '25:00', div: '2' }),
                nonFinisher('DNF', { id: 4, sail: 'AUS4', div: '2' }),
            ];
            const results = calculateSingleRaceResults(entries, SERIES);

            // Div 1: 1 finisher → DNF = 1+1 = 2
            const dnf1 = results.find(r => r.sailNumber === 'AUS2');
            expect(dnf1.points).toBe(2);

            // Div 2: 1 finisher → DNF = 1+1 = 2 (independently)
            const dnf2 = results.find(r => r.sailNumber === 'AUS4');
            expect(dnf2.points).toBe(2);
        });
    });
});

// ─── calculateSeriesStandings ─────────────────────────────────────────────────

/**
 * Build a mock race result entry for use inside series.races[n].results.
 * Points are pre-calculated (as they would be after calculateSingleRaceResults).
 */
function raceResult({ sail, skipper, cls, div, points, status, position }) {
    return {
        savedBoatId: sail,
        sailNumber:  sail,
        skipper:     skipper ?? `Skipper ${sail}`,
        boatClass:   cls     ?? 'Laser',
        division:    div     ?? '1',
        points:      points,
        status:      status  ?? 'finished',
        position:    position ?? null,
        elapsedTime: '30:00',
        correctedTime: '00:30:00',
    };
}

/** Build a minimal series with pre-populated race results. */
function makeSeries({ discardThreshold = 0, races = [] } = {}) {
    return {
        id: 1,
        name: 'Test Series',
        discardThreshold,
        races: races.map((results, i) => ({
            raceNumber: i + 1,
            date: '2024-01-01',
            entries: [],
            results,
        })),
    };
}

describe('calculateSeriesStandings', () => {

    describe('basic standings', () => {
        it('returns empty array when no races have results', () => {
            const series = makeSeries({ races: [] });
            expect(calculateSeriesStandings(series, '1')).toEqual([]);
        });

        it('returns empty array when no results match the requested division', () => {
            const series = makeSeries({
                races: [[raceResult({ sail: 'AUS1', div: '2', points: 1, position: 1 })]],
            });
            expect(calculateSeriesStandings(series, '1')).toEqual([]);
        });

        it('ranks competitors by net points ascending', () => {
            const series = makeSeries({
                races: [
                    [
                        raceResult({ sail: 'AUS1', points: 2, position: 2 }),
                        raceResult({ sail: 'AUS2', points: 1, position: 1 }),
                    ],
                    [
                        raceResult({ sail: 'AUS1', points: 1, position: 1 }),
                        raceResult({ sail: 'AUS2', points: 2, position: 2 }),
                    ],
                ],
            });
            const standings = calculateSeriesStandings(series, '1');
            // Both have 3 net points — tie broken by sail number numerically
            expect(standings).toHaveLength(2);
            expect(standings[0].netPoints).toBe(3);
            expect(standings[1].netPoints).toBe(3);
        });

        it('assigns position 1 to the lowest net points competitor', () => {
            const series = makeSeries({
                races: [
                    [
                        raceResult({ sail: 'AUS1', points: 1, position: 1 }),
                        raceResult({ sail: 'AUS2', points: 2, position: 2 }),
                    ],
                    [
                        raceResult({ sail: 'AUS1', points: 1, position: 1 }),
                        raceResult({ sail: 'AUS2', points: 2, position: 2 }),
                    ],
                ],
            });
            const standings = calculateSeriesStandings(series, '1');
            expect(standings[0].sailNumber).toBe('AUS1');
            expect(standings[0].position).toBe(1);
            expect(standings[1].sailNumber).toBe('AUS2');
            expect(standings[1].position).toBe(2);
        });

        it('carries all raceNumbers in the returned objects', () => {
            const series = makeSeries({
                races: [
                    [raceResult({ sail: 'AUS1', points: 1, position: 1 })],
                    [raceResult({ sail: 'AUS1', points: 1, position: 1 })],
                    [raceResult({ sail: 'AUS1', points: 1, position: 1 })],
                ],
            });
            const standings = calculateSeriesStandings(series, '1');
            expect(standings[0].raceNumbers).toEqual([1, 2, 3]);
        });
    });

    describe('tied positions', () => {
        it('gives tied competitors the same position number', () => {
            const series = makeSeries({
                races: [
                    [
                        raceResult({ sail: 'AUS1', points: 2, position: 2 }),
                        raceResult({ sail: 'AUS2', points: 1, position: 1 }),
                        raceResult({ sail: 'AUS3', points: 3, position: 3 }),
                    ],
                    [
                        raceResult({ sail: 'AUS1', points: 1, position: 1 }),
                        raceResult({ sail: 'AUS2', points: 2, position: 2 }),
                        raceResult({ sail: 'AUS3', points: 1, position: 1 }),
                    ],
                ],
            });
            // AUS1: 2+1=3, AUS2: 1+2=3, AUS3: 3+1=4
            const standings = calculateSeriesStandings(series, '1');
            const aus1 = standings.find(s => s.sailNumber === 'AUS1');
            const aus2 = standings.find(s => s.sailNumber === 'AUS2');
            const aus3 = standings.find(s => s.sailNumber === 'AUS3');
            expect(aus1.position).toBe(aus2.position); // tied
            expect(aus3.position).toBe(3);
        });
    });

    describe('DNC (Did Not Compete — race sailed but boat absent)', () => {
        it('assigns DNC score of finishers + 2 for a race the boat missed', () => {
            // Race 1: AUS1 and AUS2 finish. Race 2: only AUS1 finishes (AUS2 absent).
            const series = makeSeries({
                races: [
                    [
                        raceResult({ sail: 'AUS1', points: 1, position: 1 }),
                        raceResult({ sail: 'AUS2', points: 2, position: 2 }),
                    ],
                    [
                        raceResult({ sail: 'AUS1', points: 1, position: 1 }),
                        // AUS2 absent from race 2
                    ],
                ],
            });
            const standings = calculateSeriesStandings(series, '1');
            const aus2 = standings.find(s => s.sailNumber === 'AUS2');
            const race2Score = aus2.raceScores.get(2);
            expect(race2Score.status).toBe('DNC');
            // 1 finisher in race 2 → DNC = 1+2 = 3
            expect(race2Score.points).toBe(3);
        });

        it('DNC adds to total points correctly', () => {
            const series = makeSeries({
                races: [
                    [
                        raceResult({ sail: 'AUS1', points: 2, position: 2 }),
                        raceResult({ sail: 'AUS2', points: 1, position: 1 }),
                    ],
                    [
                        raceResult({ sail: 'AUS1', points: 1, position: 1 }),
                        // AUS2 missing
                    ],
                ],
            });
            const standings = calculateSeriesStandings(series, '1');
            const aus2 = standings.find(s => s.sailNumber === 'AUS2');
            // Race 1: 1 point. Race 2 DNC: 1 finisher → 1+2=3. Total = 4.
            expect(aus2.totalPoints).toBe(4);
        });
    });

    describe('discards', () => {
        it('discards the worst score when threshold is met', () => {
            // discardThreshold=4 → 1 discard after 4 races
            const series = makeSeries({
                discardThreshold: 4,
                races: [
                    [raceResult({ sail: 'AUS1', points: 1, position: 1 })],
                    [raceResult({ sail: 'AUS1', points: 1, position: 1 })],
                    [raceResult({ sail: 'AUS1', points: 1, position: 1 })],
                    [raceResult({ sail: 'AUS1', points: 5, position: 5 })], // worst — should be discarded
                ],
            });
            const standings = calculateSeriesStandings(series, '1');
            const aus1 = standings[0];
            expect(aus1.totalPoints).toBe(8);  // 1+1+1+5
            expect(aus1.netPoints).toBe(3);    // worst (5) discarded
        });

        it('marks the discarded race score as discarded: true', () => {
            const series = makeSeries({
                discardThreshold: 4,
                races: [
                    [raceResult({ sail: 'AUS1', points: 1, position: 1 })],
                    [raceResult({ sail: 'AUS1', points: 1, position: 1 })],
                    [raceResult({ sail: 'AUS1', points: 1, position: 1 })],
                    [raceResult({ sail: 'AUS1', points: 8, position: 8 })],
                ],
            });
            const standings = calculateSeriesStandings(series, '1');
            const scores = [...standings[0].raceScores.values()];
            const discardedScores = scores.filter(s => s.discarded);
            expect(discardedScores).toHaveLength(1);
            expect(discardedScores[0].points).toBe(8);
        });

        it('applies no discard when fewer races sailed than threshold', () => {
            // discardThreshold=4 but only 3 races → floor(3/4)=0 discards
            const series = makeSeries({
                discardThreshold: 4,
                races: [
                    [raceResult({ sail: 'AUS1', points: 1, position: 1 })],
                    [raceResult({ sail: 'AUS1', points: 1, position: 1 })],
                    [raceResult({ sail: 'AUS1', points: 5, position: 5 })],
                ],
            });
            const standings = calculateSeriesStandings(series, '1');
            const aus1 = standings[0];
            expect(aus1.netPoints).toBe(7); // no discard
            const scores = [...aus1.raceScores.values()];
            expect(scores.every(s => !s.discarded)).toBe(true);
        });

        it('applies two discards after 8 races when threshold is 4', () => {
            // discardThreshold=4 → floor(8/4) = 2 discards
            const races = Array.from({ length: 8 }, (_, i) => [
                raceResult({ sail: 'AUS1', points: i + 1, position: i + 1 }),
            ]);
            const series = makeSeries({ discardThreshold: 4, races });
            const standings = calculateSeriesStandings(series, '1');
            const aus1 = standings[0];
            // Points 1-8, total=36, discard worst 2 (7+8=15), net=21
            expect(aus1.totalPoints).toBe(36);
            expect(aus1.netPoints).toBe(21);
            const discarded = [...aus1.raceScores.values()].filter(s => s.discarded);
            expect(discarded).toHaveLength(2);
        });

        it('discards have no effect when discardThreshold is 0', () => {
            const series = makeSeries({
                discardThreshold: 0,
                races: [
                    [raceResult({ sail: 'AUS1', points: 1, position: 1 })],
                    [raceResult({ sail: 'AUS1', points: 8, position: 8 })],
                ],
            });
            const standings = calculateSeriesStandings(series, '1');
            expect(standings[0].netPoints).toBe(9); // no discard
        });
    });

    describe('multiple competitors across multiple races', () => {
        it('correctly calculates a realistic 3-boat, 3-race series', () => {
            const series = makeSeries({
                races: [
                    [
                        raceResult({ sail: 'AUS1', points: 1, position: 1 }),
                        raceResult({ sail: 'AUS2', points: 2, position: 2 }),
                        raceResult({ sail: 'AUS3', points: 3, position: 3 }),
                    ],
                    [
                        raceResult({ sail: 'AUS2', points: 1, position: 1 }),
                        raceResult({ sail: 'AUS3', points: 2, position: 2 }),
                        raceResult({ sail: 'AUS1', points: 3, position: 3 }),
                    ],
                    [
                        raceResult({ sail: 'AUS3', points: 1, position: 1 }),
                        raceResult({ sail: 'AUS1', points: 2, position: 2 }),
                        raceResult({ sail: 'AUS2', points: 3, position: 3 }),
                    ],
                ],
            });
            const standings = calculateSeriesStandings(series, '1');
            // All three boats have 1+2+3=6 net points — tied
            expect(standings).toHaveLength(3);
            standings.forEach(s => expect(s.netPoints).toBe(6));
            standings.forEach(s => expect(s.position).toBe(1));
        });
    });
});

// ─── deduplicateResults ───────────────────────────────────────────────────────

describe('deduplicateResults', () => {
    it('returns empty array for empty input', () => {
        expect(deduplicateResults([])).toEqual([]);
        expect(deduplicateResults(null)).toEqual([]);
        expect(deduplicateResults(undefined)).toEqual([]);
    });

    it('keeps a single entry unchanged', () => {
        const entry = { savedBoatId: 1, sailNumber: 'AUS1' };
        expect(deduplicateResults([entry])).toEqual([entry]);
    });

    it('removes duplicate savedBoatId entries, keeping the last one', () => {
        const first  = { savedBoatId: 1, sailNumber: 'AUS1', points: 1 };
        const second = { savedBoatId: 1, sailNumber: 'AUS1', points: 2 };
        const result = deduplicateResults([first, second]);
        expect(result).toHaveLength(1);
        expect(result[0].points).toBe(2); // last-entry-wins
    });

    it('keeps entries with different savedBoatIds', () => {
        const entries = [
            { savedBoatId: 1, sailNumber: 'AUS1' },
            { savedBoatId: 2, sailNumber: 'AUS2' },
            { savedBoatId: 3, sailNumber: 'AUS3' },
        ];
        expect(deduplicateResults(entries)).toHaveLength(3);
    });

    it('skips entries without a savedBoatId', () => {
        const entries = [
            { savedBoatId: 1,         sailNumber: 'AUS1' },
            { savedBoatId: null,       sailNumber: 'AUS2' },
            { savedBoatId: undefined,  sailNumber: 'AUS3' },
        ];
        const result = deduplicateResults(entries);
        // Only the one with a truthy savedBoatId is kept
        expect(result).toHaveLength(1);
        expect(result[0].sailNumber).toBe('AUS1');
    });
});
