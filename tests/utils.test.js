import { describe, it, expect } from 'vitest';
import { timeToSeconds, secondsToTime, escapeHtml, pluralize } from '../js/utils.js';

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

describe('secondsToTime', () => {
  it('parses h:m:s format', () => {
    expect(secondsToTime(5445)).toBe('01:30:45');
  });
  it('parses m:s format', () => {
    expect(secondsToTime(1845)).toBe('00:30:45');
  });
  it("returns '' for invalid input", () => {
    expect(secondsToTime(NaN)).toBe('');
    expect(secondsToTime(null)).toBe('');
    expect(secondsToTime(-1)).toBe('');
  });
});

describe('escapeHtml', () => {
  it('escapes script tags', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });
  it('handles null/undefined gracefully', () => {
    expect(escapeHtml(null)).toBe('');
  });
    it('escapes correctly', () => {
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#39;');
  });
});

describe('pluralize', () => {
  it('count of one stays singular', () => {
    expect(pluralize(1, "boat")).toBe("boat");
    expect(pluralize(1, "goose", "geese")).toBe("goose");
  });
  it('count of more than one becomes plural', () => {
    expect(pluralize(2, "boat")).toBe("boats");
    expect(pluralize(100, "goose", "geese")).toBe("geese");
  });
  it('handles count of zero as plural', () => {
    expect(pluralize(0, "boat")).toBe("boats");
    expect(pluralize(0, "goose", "geese")).toBe("geese");
  });
});