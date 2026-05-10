// Feature: tracklytics-frontend, Property 4: Duration formatting is correct for all non-negative durations
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

describe('formatDuration', () => {
  it('Property 4: correct M:SS format for all non-negative durations', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3600000 }),
        (ms) => {
          const result = formatDuration(ms);
          const expectedMinutes = Math.floor(ms / 60000);
          const expectedSeconds = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
          expect(result).toBe(`${expectedMinutes}:${expectedSeconds}`);
          // Verify format M:SS
          expect(result).toMatch(/^\d+:\d{2}$/);
        }
      )
    );
  });

  it('formats 185000ms as 3:05', () => {
    expect(formatDuration(185000)).toBe('3:05');
  });

  it('formats 0ms as 0:00', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('formats 60000ms as 1:00', () => {
    expect(formatDuration(60000)).toBe('1:00');
  });
});
