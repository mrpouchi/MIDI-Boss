import { useState } from 'react';
import App from './App';
import { loadProfiles, signOut } from './storage/profiles';
import { ProfileScreen } from './ui/screens/ProfileScreen';

/** Local accounts: shows "Qui joue ?" until a profile is signed in. */
export function Root() {
  const [state, setState] = useState(() => loadProfiles());
  const active = state.profiles.find((p) => p.id === state.activeId);
  if (active) {
    // key: switching profile remounts the app with that profile's save.
    return <App key={active.id} profile={active} onSwitchProfile={() => setState((s) => signOut(s))} />;
  }
  return <ProfileScreen state={state} onChange={setState} />;
}
