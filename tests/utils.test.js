import { describe, it, expect } from 'vitest';
import { timeToSeconds, secondsToTime, escapeHtml } from '../js/utils.js';

describe('timeToSeconds', () => {
  it('parses h:m:s format', () => {
    expect(timeToSeconds('1:30:45')).toBe(5445);
  });
  it('parses m:s format', () => {
    expect(timeToSeconds('30:45')).toBe(1845);
  });
  it('returns -1 for invalid input', () => {
    expect(timeToSeconds('garbage')).toBe(-1);
    expect(timeToSeconds('')).toBe(-1);
  });
});

describe('escapeHtml', () => {
  it('escapes script tags', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });
  it('handles null/undefined gracefully', () => {
    expect(escapeHtml(null)).toBe('');
  });
});