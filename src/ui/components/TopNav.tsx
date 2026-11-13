import { SlidersHorizontal } from 'lucide-react';

export type AppTab = 'today' | 'library' | 'play' | 'progress';

interface TopNavProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  onOpenSettings: () => void;
}

const NAV_ITEMS: { id: AppTab; label: string }[] = [
  { id: 'today', label: "Aujourd'hui" },
  { id: 'library', label: 'Répertoire' },
  { id: 'play', label: 'Jouer' },
  { id: 'progress', label: 'Progrès' },
];

export function TopNav({ activeTab, onSelectTab, onOpenSettings }: TopNavProps) {
  return (
    <header className="sticky top-0 z-30 border-b-2 border-[var(--duo-swan)] bg-[var(--duo-snow)]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:gap-8 sm:px-6">
        <button
          type="button"
          onClick={() => onSelectTab('today')}
          className="flex shrink-0 items-center gap-2.5 text-left whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-500"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className="text-[var(--duo-green)]"
          >
            <rect
              x="2.5"
              y="4"
              width="19"
              height="16"
              rx="3"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path d="M8.5 4V14.5M15.5 4V14.5" stroke="currentColor" strokeWidth="1.6" />
            <rect x="6.75" y="4" width="3.5" height="7.5" rx="0.8" fill="currentColor" />
            <rect x="13.75" y="4" width="3.5" height="7.5" rx="0.8" fill="currentColor" />
          </svg>
          <span className="duo-title text-lg">
            Piano Path
          </span>
        </button>

        <nav aria-label="Navigation principale" className="flex items-center gap-5 sm:gap-8">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative py-1.5 text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-500 ${
                  isActive
                    ? 'text-[var(--duo-blue)]'
                    : 'text-[var(--duo-wolf)] hover:text-[var(--duo-eel)]'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[15px] h-1 rounded-full bg-[var(--duo-blue)]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={onOpenSettings}
            className="duo-button duo-button-outline duo-focus shrink-0 whitespace-nowrap px-3 py-2 text-[.7rem]"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Réglages</span>
          </button>
        </div>
      </div>
    </header>
  );
}
