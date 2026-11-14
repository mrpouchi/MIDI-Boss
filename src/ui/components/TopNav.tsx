import { Moon, Settings2, Sun } from 'lucide-react';
import type { ReactElement } from 'react';
import { MidiState } from '../../input/types';
import { Profile } from '../../storage/profiles';
import { ProfileAvatar } from './ProfileAvatar';
import { Mascot } from './Mascot';

export type AppTab = 'today' | 'library' | 'play' | 'progress';

interface AppNavProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  onOpenSettings: () => void;
  midiState: MidiState;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  profile: Profile;
  onSwitchProfile: () => void;
}

function PathIcon() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
      <circle cx="16" cy="6.5" r="4.5" fill="#3DBE29" />
      <circle cx="9" cy="16" r="4.5" fill="#FFB31A" />
      <circle cx="16" cy="25.5" r="4.5" fill="#CBD1E0" />
      <path d="M14 10.5 L11 12.5 M11 20 L14 22" stroke="#CBD1E0" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
function SongsIcon() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
      <circle cx="16" cy="16" r="13" fill="#1B2140" />
      <circle cx="16" cy="16" r="8.5" fill="none" stroke="#3A4366" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="4.5" fill="#FF5A5F" />
      <circle cx="16" cy="16" r="1.4" fill="#1B2140" />
    </svg>
  );
}
function SkillsIcon() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
      <path d="M16 9 L8 21 M16 9 L24 21" stroke="#CBD1E0" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="16" cy="8" r="5" fill="#2A9DF4" />
      <circle cx="8" cy="23" r="5" fill="#3DBE29" />
      <circle cx="24" cy="23" r="5" fill="#FFB31A" />
    </svg>
  );
}
function KeysIcon() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
      <rect x="3" y="7" width="26" height="19" rx="4" fill="#fff" stroke="#1B2140" strokeWidth="2" />
      <path d="M11.7 7 v19 M20.3 7 v19" stroke="#1B2140" strokeWidth="1.6" />
      <rect x="9" y="7" width="5.4" height="10" rx="1.2" fill="#1B2140" />
      <rect x="17.6" y="7" width="5.4" height="10" rx="1.2" fill="#1B2140" />
    </svg>
  );
}

const NAV_ITEMS: { id: AppTab; label: string; Icon: () => ReactElement }[] = [
  { id: 'today', label: 'Parcours', Icon: PathIcon },
  { id: 'library', label: 'Chansons', Icon: SongsIcon },
  { id: 'progress', label: 'Compétences', Icon: SkillsIcon },
  { id: 'play', label: 'Pratique libre', Icon: KeysIcon },
];

function midiLabel(state: MidiState): { text: string; ok: boolean } {
  if (state.status === 'connected') return { text: state.activeDeviceName ?? 'Clavier MIDI', ok: true };
  if (state.status === 'permission-denied') return { text: 'MIDI refusé', ok: false };
  if (state.status === 'unsupported') return { text: 'MIDI indisponible', ok: false };
  if (state.status === 'initializing') return { text: 'Recherche MIDI…', ok: false };
  return { text: 'Aucun clavier MIDI', ok: false };
}

/** Left sidebar on laptops, bottom bar on narrow screens. */
export function TopNav({
  activeTab,
  onSelectTab,
  onOpenSettings,
  midiState,
  theme,
  onToggleTheme,
  profile,
  onSwitchProfile,
}: AppNavProps) {
  const midi = midiLabel(midiState);

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r-2 border-line bg-page px-4 py-6 lg:flex">
        <button
          type="button"
          onClick={() => onSelectTab('today')}
          className="mb-8 flex items-center gap-2 rounded-2xl px-2 text-left"
        >
          <Mascot size={46} mood="happy" />
          <span className="font-display text-[1.6rem] leading-none font-bold tracking-tight text-ink dark:text-white">
            MIDI <span className="text-green">Boss</span>
          </span>
        </button>

        <nav aria-label="Navigation principale" className="flex flex-col gap-1.5">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelectTab(id)}
                aria-current={active ? 'page' : undefined}
                className={`mb-wiggle flex items-center gap-4 rounded-2xl border-2 px-3 py-2.5 text-left font-display text-[1.05rem] font-semibold transition-colors ${
                  active
                    ? 'border-sky/50 bg-sky/10 text-sky-press dark:text-sky'
                    : 'border-transparent text-muted hover:bg-mist hover:text-text'
                }`}
              >
                <Icon />
                {label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto space-y-2">
          <button
            type="button"
            onClick={onSwitchProfile}
            className="mb-lift flex w-full items-center gap-3 rounded-2xl border-2 border-line px-3 py-2 text-left"
            title="Changer de profil"
          >
            <ProfileAvatar profile={profile} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display font-semibold">{profile.name}</span>
              <span className="block text-xs font-bold text-muted">{profile.admin ? "Admin · changer de profil" : "Changer de profil"}</span>
            </span>
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex w-full items-center gap-3 rounded-2xl border-2 border-line px-3 py-2.5 text-left text-sm font-bold"
            title="Réglages MIDI"
          >
            <span
              className={`h-3 w-3 shrink-0 rounded-full ${midi.ok ? 'bg-green shadow-[0_0_0_4px_rgb(61_190_41/.2)]' : 'bg-stone-300'}`}
              aria-hidden="true"
            />
            <span className="truncate">{midi.text}</span>
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-bold text-muted hover:bg-mist hover:text-text"
            >
              <Settings2 className="h-4 w-4" aria-hidden="true" />
              Réglages
            </button>
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'}
              className="grid h-10 w-10 place-items-center rounded-2xl text-muted hover:bg-mist hover:text-text"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </aside>

      {/* Compact header + bottom tab bar under the lg breakpoint */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b-2 border-line bg-page px-4 py-2 lg:hidden">
        <span className="flex items-center gap-2 font-display text-xl font-bold">
          <Mascot size={34} mood="happy" />
          MIDI <span className="text-green">Boss</span>
        </span>
        <div className="flex items-center gap-1">
          <span className={`h-2.5 w-2.5 rounded-full ${midi.ok ? 'bg-green' : 'bg-stone-300'}`} title={midi.text} />
          <button type="button" onClick={onSwitchProfile} aria-label={`Profil : ${profile.name}. Changer de profil`} className="grid h-10 w-10 place-items-center rounded-xl">
            <ProfileAvatar profile={profile} size={30} />
          </button>
          <button type="button" onClick={onToggleTheme} aria-label="Changer de thème" className="grid h-10 w-10 place-items-center rounded-xl text-muted">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button type="button" onClick={onOpenSettings} aria-label="Réglages" className="grid h-10 w-10 place-items-center rounded-xl text-muted">
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
      </header>
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t-2 border-line bg-page pb-[env(safe-area-inset-bottom,0px)] lg:hidden"
      >
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onSelectTab(id)}
            aria-label={label}
            aria-current={activeTab === id ? 'page' : undefined}
            className={`mb-wiggle m-1.5 rounded-xl border-2 p-1.5 ${activeTab === id ? 'border-sky/50 bg-sky/10' : 'border-transparent'}`}
          >
            <Icon />
          </button>
        ))}
      </nav>
    </>
  );
}
