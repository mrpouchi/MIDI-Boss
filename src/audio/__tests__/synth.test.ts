import { describe, expect, it } from 'vitest';
import { softClipCurve } from '../synth';

describe('softClipCurve', () => {
  const curve = softClipCurve(4097, 0.6);
  const at = (x: number) => curve[Math.round(((x + 1) / 2) * (curve.length - 1))];

  it('leaves normal levels untouched', () => {
    expect(at(0)).toBeCloseTo(0, 6);
    expect(at(0.5)).toBeCloseTo(0.5, 3);
    expect(at(-0.6)).toBeCloseTo(-0.6, 3);
  });

  it('bends loud peaks below full scale, smoothly and symmetrically', () => {
    expect(at(1)).toBeLessThan(1);
    expect(at(1)).toBeGreaterThan(0.85);
    expect(at(-1)).toBeCloseTo(-at(1), 6);
    for (let i = 1; i < curve.length; i += 1) expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
  });
});
