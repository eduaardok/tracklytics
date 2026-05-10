// Feature: tracklytics-frontend, Property 6: Marker size scaling maps track counts to [6, 30] px
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

function scaleMarkerSizes(trackCounts) {
  const min = Math.min(...trackCounts);
  const max = Math.max(...trackCounts);
  const range = max - min || 1;
  return trackCounts.map(c => 6 + ((c - min) / range) * 24);
}

describe('scaleMarkerSizes', () => {
  it('Property 6: all values in [6, 30] for any non-empty array of non-negative counts', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 100000 }), { minLength: 1 }),
        (counts) => {
          const sizes = scaleMarkerSizes(counts);
          expect(sizes).toHaveLength(counts.length);
          for (const size of sizes) {
            expect(size).toBeGreaterThanOrEqual(6);
            expect(size).toBeLessThanOrEqual(30);
          }
        }
      )
    );
  });

  it('min count maps to 6, max count maps to 30 when min !== max', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 100000 }), { minLength: 2 }).filter(arr => Math.min(...arr) !== Math.max(...arr)),
        (counts) => {
          const sizes = scaleMarkerSizes(counts);
          const minIdx = counts.indexOf(Math.min(...counts));
          const maxIdx = counts.indexOf(Math.max(...counts));
          expect(sizes[minIdx]).toBeCloseTo(6, 5);
          expect(sizes[maxIdx]).toBeCloseTo(30, 5);
        }
      )
    );
  });
});
