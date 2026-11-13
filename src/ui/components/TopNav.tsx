import { SlidersHorizontal } from 'lucide-react';

export type AppTab = 'today' | 'play' | 'progress';

interface TopNavProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  onOpenSettings: () => void;
}

const NAV_ITEMS: { id: AppTab; label: string }[] = [
  { id: 'today', label: "Aujourd'hui" },
  { id: 'play', label: 'Jouer' },
  { id: 'progress', label: 'Progrès' },
];

export function TopNav({ activeTab, onSelectTab, onOpenSettings }: TopNavProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-stone-200/90 bg-[#faf8f5]/90 backdrop-blur-md dark:border-slate-800/80 dark:bg-[#0f1422]/90">
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
            className="text-indigo-600 dark:text-indigo-400"
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
          <span className="font-display text-lg font-semibold tracking-tight text-stone-900 dark:text-slate-100">
            Chord Practice
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
                    ? 'text-indigo-600 dark:text-indigo-300'
                    : 'text-stone-600 hover:text-stone-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-indigo-600 dark:bg-indigo-400"
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
            className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-700 whitespace-nowrap shrink-0 transition-colors hover:bg-stone-50 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Réglages</span>
          </button>
        </div>
      </div>
    </header>
  );
}
