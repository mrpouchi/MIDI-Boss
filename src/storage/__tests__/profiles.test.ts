import { describe, expect, it } from 'vitest';
import { loadStoredData, saveStoredData } from '../localStore';
import {
  KeyValueStore,
  LEGACY_KEY,
  SHARED_KEY,
  checkPin,
  createProfile,
  deleteProfile,
  loadProfiles,
  profileKey,
  setAdmin,
  signIn,
  signOut,
} from '../profiles';

function memoryStore(initial: Record<string, unknown> = {}): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const legacy = (isDemoData: boolean) => ({
  version: 1,
  isDemoData,
  settings: { theme: 'dark' },
  sessions: [{ id: 's1' }],
  playAlongRuns: [{ id: 'r1', songTitle: 'Blue Bossa' }],
  irealLibrary: [{ title: 'Blue Bossa' }],
  midiSetups: { a: { fileName: 'x' } },
});

describe('local profiles', () => {
  it('the first profile adopts the previous save; the library becomes shared', async () => {
    const store = memoryStore({ [LEGACY_KEY]: legacy(false) });
    const { state, profile } = await createProfile({ profiles: [], activeId: null }, { name: ' Youss ', color: '#3DBE29' }, store);
    expect(state.activeId).toBe(profile.id);
    expect(profile.name).toBe('Youss');
    const data = loadStoredData(profile.id, store);
    expect(data.settings.theme).toBe('dark');
    expect(data.sessions).toHaveLength(1);
    expect(data.playAlongRuns).toHaveLength(1); // play-along progress survives a reload
    expect(data.irealLibrary).toHaveLength(1);
    expect(JSON.parse(store.data.get(profileKey(profile.id))!).irealLibrary).toBeUndefined();

    // A second profile starts empty but sees the same library.
    const second = await createProfile(state, { name: 'Sam', color: '#2A9DF4' }, store);
    const other = loadStoredData(second.profile.id, store);
    expect(other.sessions).toHaveLength(0);
    expect(other.playAlongRuns).toHaveLength(0);
    expect(other.isDemoData).toBe(false);
    expect(other.irealLibrary).toHaveLength(1);
  });

  it('does not adopt a save that only held demo data', async () => {
    const store = memoryStore({ [LEGACY_KEY]: legacy(true) });
    const { profile } = await createProfile({ profiles: [], activeId: null }, { name: 'A', color: '#000' }, store);
    const data = loadStoredData(profile.id, store);
    expect(data.sessions).toHaveLength(0);
    expect(data.irealLibrary).toHaveLength(1);
  });

  it('keeps progress per profile and the shared parts in one place', async () => {
    const store = memoryStore();
    const a = await createProfile({ profiles: [], activeId: null }, { name: 'A', color: '#000' }, store);
    const data = loadStoredData(a.profile.id, store);
    saveStoredData(a.profile.id, { ...data, sessions: [{ id: 'x' } as never], irealLibrary: [{ title: 'So What' } as never] }, store);
    expect(loadStoredData(a.profile.id, store).sessions).toHaveLength(1);
    expect(JSON.parse(store.data.get(SHARED_KEY)!).irealLibrary).toHaveLength(1);
  });

  it('checks the optional code and signs in / out / deletes', async () => {
    const store = memoryStore();
    const { state, profile } = await createProfile({ profiles: [], activeId: null }, { name: 'A', color: '#000', pin: '1234' }, store);
    expect(profile.pinHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await checkPin(profile, '1234')).toBe(true);
    expect(await checkPin(profile, '0000')).toBe(false);
    const out = signOut(state, store);
    expect(loadProfiles(store).activeId).toBeNull();
    expect(signIn(out, profile.id, store).activeId).toBe(profile.id);
    const gone = deleteProfile(loadProfiles(store), profile.id, store);
    expect(gone.profiles).toHaveLength(0);
    expect(store.data.has(profileKey(profile.id))).toBe(false);
  });
});

describe('admin profile', () => {
  it('turns admin on and off and saves it', async () => {
    const store = memoryStore();
    const { state, profile } = await createProfile({ profiles: [], activeId: null }, { name: 'Prof', color: '#000' }, store);
    const on = setAdmin(state, profile.id, true, store);
    expect(loadProfiles(store).profiles[0].admin).toBe(true);
    const off = setAdmin(on, profile.id, false, store);
    expect(off.profiles[0].admin).toBeUndefined();
    expect(loadProfiles(store).profiles[0].admin).toBeUndefined();
  });
});
