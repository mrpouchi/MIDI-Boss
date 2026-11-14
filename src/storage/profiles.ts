/**
 * Local accounts ("profiles"): several people can learn on the same computer,
 * each with their own progress. Everything stays in this browser's
 * localStorage — nothing is sent anywhere. The optional code only keeps
 * people from opening each other's profile by mistake; it is not security.
 *
 * Storage layout:
 *  - PROFILES_KEY          → the profile list and the signed-in profile
 *  - profileKey(id)        → one profile's progress and settings (StoredData minus shared parts)
 *  - SHARED_KEY            → what every profile shares: iReal library, MIDI mixes
 *  - LEGACY_KEY            → pre-profile save, adopted by the first profile created
 */

export const PROFILES_KEY = 'midiboss:profiles:v1';
export const SHARED_KEY = 'midiboss:shared:v1';
export const LEGACY_KEY = 'chord-practice:v1';
export const profileKey = (id: string) => `midiboss:profile:${id}:v1`;

export const PROFILE_COLORS = ['#3DBE29', '#2A9DF4', '#FFB31A', '#FF5A5F', '#8B5CF6', '#14B8A6'] as const;

export interface Profile {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  lastUsedAt: string;
  /** SHA-256 of the optional 4-digit code (salted with the profile id). */
  pinHash?: string;
}

export interface ProfilesState {
  profiles: Profile[];
  activeId: string | null;
}

/** Minimal storage interface so the logic is testable without a browser. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStore(): KeyValueStore | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readJson<T>(store: KeyValueStore | null, key: string): T | null {
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(store: KeyValueStore | null, key: string, value: unknown): boolean {
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // quota or private mode
  }
}

export function loadProfiles(store: KeyValueStore | null = browserStore()): ProfilesState {
  const state = readJson<ProfilesState>(store, PROFILES_KEY);
  if (!state || !Array.isArray(state.profiles)) return { profiles: [], activeId: null };
  const activeId = state.profiles.some((p) => p.id === state.activeId) ? state.activeId : null;
  return { profiles: state.profiles, activeId };
}

export function saveProfiles(state: ProfilesState, store: KeyValueStore | null = browserStore()): void {
  writeJson(store, PROFILES_KEY, state);
}

function newId(): string {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

export async function hashPin(profileId: string, pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(`midiboss:${profileId}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function checkPin(profile: Profile, pin: string): Promise<boolean> {
  if (!profile.pinHash) return true;
  return (await hashPin(profile.id, pin)) === profile.pinHash;
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

/**
 * Creates a profile and signs it in. The very first profile adopts the
 * pre-profile save (unless it only held demo data), so nobody loses progress.
 */
export async function createProfile(
  state: ProfilesState,
  input: { name: string; color: string; pin?: string },
  store: KeyValueStore | null = browserStore(),
): Promise<{ state: ProfilesState; profile: Profile }> {
  const now = new Date().toISOString();
  const id = newId();
  const profile: Profile = {
    id,
    name: input.name.trim().slice(0, 24) || 'Musicien',
    color: input.color,
    createdAt: now,
    lastUsedAt: now,
    ...(input.pin && isValidPin(input.pin) ? { pinHash: await hashPin(id, input.pin) } : {}),
  };
  if (state.profiles.length === 0) adoptLegacySave(id, store);
  const next: ProfilesState = { profiles: [...state.profiles, profile], activeId: id };
  saveProfiles(next, store);
  return { state: next, profile };
}

/** Moves the pre-profile save into a profile (progress) and the shared store (library). */
export function adoptLegacySave(profileId: string, store: KeyValueStore | null = browserStore()): void {
  const legacy = readJson<Record<string, unknown>>(store, LEGACY_KEY);
  if (!legacy) return;
  const { irealLibrary, midiSetups, ...progress } = legacy;
  const shared = readJson<Record<string, unknown>>(store, SHARED_KEY) ?? {};
  writeJson(store, SHARED_KEY, {
    irealLibrary: Array.isArray(shared.irealLibrary) && shared.irealLibrary.length ? shared.irealLibrary : irealLibrary ?? [],
    midiSetups: { ...((midiSetups as object) ?? {}), ...((shared.midiSetups as object) ?? {}) },
  });
  if (!legacy.isDemoData && !store?.getItem(profileKey(profileId))) {
    writeJson(store, profileKey(profileId), progress);
  }
  // Kept as a backup; it is only read when no profile exists yet.
}

export function signIn(state: ProfilesState, id: string, store: KeyValueStore | null = browserStore()): ProfilesState {
  const now = new Date().toISOString();
  const next: ProfilesState = {
    profiles: state.profiles.map((p) => (p.id === id ? { ...p, lastUsedAt: now } : p)),
    activeId: id,
  };
  saveProfiles(next, store);
  return next;
}

export function signOut(state: ProfilesState, store: KeyValueStore | null = browserStore()): ProfilesState {
  const next = { ...state, activeId: null };
  saveProfiles(next, store);
  return next;
}

export function deleteProfile(state: ProfilesState, id: string, store: KeyValueStore | null = browserStore()): ProfilesState {
  store?.removeItem(profileKey(id));
  const next: ProfilesState = {
    profiles: state.profiles.filter((p) => p.id !== id),
    activeId: state.activeId === id ? null : state.activeId,
  };
  saveProfiles(next, store);
  return next;
}

export { readJson as readStoredJson, writeJson as writeStoredJson, browserStore };
