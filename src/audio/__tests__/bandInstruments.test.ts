import { describe, expect, it } from 'vitest';
import { SOUND_LIBRARY, defaultSound, familyOf, resolveSound } from '../bandInstruments';

describe('band sound library', () => {
  it('sorts parts into families', () => {
    expect(familyOf(32, 1)).toBe('bass');
    expect(familyOf(66, 2)).toBe('sax');
    expect(familyOf(56, 0)).toBe('trumpet');
    expect(familyOf(0, 3)).toBe('piano');
    expect(familyOf(32, 9)).toBe('drums');
  });

  it('defaults to the real sampled instruments, an electric part to an electric sound', () => {
    expect(defaultSound(32, 1).id).toBe('bass-smolken');
    expect(defaultSound(66, 2).id).toBe('sax-vcsl-straight');
    expect(defaultSound(65, 2).id).toBe('sax-vcsl-straight');
    expect(defaultSound(56, 0).id).toBe('tp-sweet');
    expect(defaultSound(57, 4).id).toBe('brass-gu');
    expect(defaultSound(0, 3).id).toBe('piano-salamander');
    expect(defaultSound(33, 1).id).toBe('bass-finger');
    expect(defaultSound(59, 0).id).toBe('tp-muted');
    expect(defaultSound(0, 9).id).toBe('drums-gu2-brush-ride');
  });

  it('has a valid default for every family and program', () => {
    for (let program = 0; program < 128; program++) {
      for (const channel of [0, 9]) expect(defaultSound(program, channel)).toBeDefined();
    }
  });

  it('only accepts a sound from the part own family', () => {
    expect(resolveSound(32, 1, 'bass-upright').id).toBe('bass-upright');
    expect(resolveSound(32, 1, 'piano-cp80').id).toBe('bass-smolken');
    expect(resolveSound(32, 1, undefined).id).toBe('bass-smolken');
  });

  it('offers several sounds per family, with unique ids', () => {
    for (const family of ['piano', 'bass', 'sax', 'trumpet', 'drums'] as const) expect(SOUND_LIBRARY[family].length).toBeGreaterThanOrEqual(5);
    const ids = Object.values(SOUND_LIBRARY).flat().map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
