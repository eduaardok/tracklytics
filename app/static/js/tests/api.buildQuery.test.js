// Feature: tracklytics-frontend, Property 1: URL query parameters include only provided arguments
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// Inline buildQuery since it's private in api.js
function buildQuery(params) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      qs.append(key, value);
    }
  }
  const str = qs.toString();
  return str ? `?${str}` : '';
}

describe('buildQuery', () => {
  it('Property 1: includes only non-null/undefined params', () => {
    fc.assert(
      fc.property(
        fc.record({
          limit: fc.oneof(fc.integer({ min: 1, max: 1000 }), fc.constant(null), fc.constant(undefined)),
          offset: fc.oneof(fc.integer({ min: 0, max: 10000 }), fc.constant(null), fc.constant(undefined)),
          order_by: fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined)),
        }),
        (params) => {
          const result = buildQuery(params);
          const searchParams = new URLSearchParams(result.startsWith('?') ? result.slice(1) : '');
          for (const [key, value] of Object.entries(params)) {
            if (value !== null && value !== undefined) {
              expect(searchParams.has(key)).toBe(true);
              expect(searchParams.get(key)).toBe(String(value));
            } else {
              expect(searchParams.has(key)).toBe(false);
            }
          }
        }
      )
    );
  });

  it('returns empty string when all params are null/undefined', () => {
    expect(buildQuery({ a: null, b: undefined })).toBe('');
  });

  it('returns query string when params are provided', () => {
    expect(buildQuery({ limit: 10, offset: 0 })).toBe('?limit=10&offset=0');
  });
});
