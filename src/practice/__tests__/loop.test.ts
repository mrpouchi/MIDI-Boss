import { describe, expect, it } from 'vitest';
import { foldLoop, loopPassAt } from '../loop';

const loop = { fromMs: 2000, toMs: 6000 }; // a 4 s section

describe('foldLoop', () => {
  it('leaves time before the loop and without loop unchanged', () => {
    expect(foldLoop(1500, loop)).toBe(1500);
    expect(foldLoop(9000, null)).toBe(9000);
  });

  it('folds every pass back into the section', () => {
    expect(foldLoop(2500, loop)).toBe(2500);
    expect(foldLoop(6500, loop)).toBe(2500); // second pass
    expect(foldLoop(14500, loop)).toBe(2500); // fourth pass
  });

  it('gives the last moments of a pass to the next one (early chord)', () => {
    expect(foldLoop(5900, loop, 250)).toBe(1900); // 100 ms before the loop's first bar
    expect(foldLoop(5700, loop, 250)).toBe(5700); // still in the last bar
  });
});

describe('loopPassAt', () => {
  it('counts finished passes, the lead moving the boundary earlier', () => {
    expect(loopPassAt(1000, loop)).toBe(0);
    expect(loopPassAt(5999, loop)).toBe(0);
    expect(loopPassAt(6000, loop)).toBe(1);
    expect(loopPassAt(5800, loop, 250)).toBe(1);
    expect(loopPassAt(13000, loop)).toBe(2);
  });
});
