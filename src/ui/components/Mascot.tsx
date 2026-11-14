export type MascotMood = 'idle' | 'happy' | 'oops' | 'listen';

interface MascotProps {
  mood?: MascotMood;
  size?: number;
  className?: string;
}

/**
 * "Boss" — MIDI Boss's original mascot: a small keyboard with a jazz pork-pie
 * hat. Drawn inline so it follows the theme and needs no asset pipeline.
 */
export function Mascot({ mood = 'idle', size = 96, className = '' }: MascotProps) {
  const eyes =
    mood === 'happy' ? (
      <>
        <path d="M37 58 q6 -7 12 0" stroke="white" strokeWidth="4.5" fill="none" strokeLinecap="round" />
        <path d="M71 58 q6 -7 12 0" stroke="white" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      </>
    ) : mood === 'listen' ? (
      <>
        <path d="M37 57 q6 5 12 0" stroke="white" strokeWidth="4.5" fill="none" strokeLinecap="round" />
        <path d="M71 57 q6 5 12 0" stroke="white" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      </>
    ) : (
      <>
        <circle cx="43" cy="57" r="9" fill="white" />
        <circle cx="77" cy="57" r="9" fill="white" />
        <circle cx={mood === 'oops' ? 41 : 45} cy="58" r="4.5" fill="#1B2140" />
        <circle cx={mood === 'oops' ? 75 : 79} cy="58" r="4.5" fill="#1B2140" />
        {mood === 'oops' && (
          <>
            <path d="M34 47 l12 -4" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
            <path d="M86 47 l-12 -4" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
          </>
        )}
      </>
    );

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label="Boss, la mascotte de MIDI Boss"
      className={className}
    >
      {/* shadow */}
      <ellipse cx="60" cy="113" rx="34" ry="5" fill="#1B2140" opacity=".12" />
      {/* body: an ebony keyboard case */}
      <rect x="18" y="36" width="84" height="72" rx="22" fill="#1B2140" />
      <rect x="18" y="36" width="84" height="64" rx="22" fill="#2B3358" />
      {/* face plate */}
      <rect x="27" y="44" width="66" height="28" rx="14" fill="#FFB31A" opacity=".18" />
      {eyes}
      {/* keys as a smile */}
      <g>
        <rect x="30" y="78" width="60" height="18" rx="6" fill="white" />
        <path d="M45 78 v18 M60 78 v18 M75 78 v18" stroke="#CBD1E0" strokeWidth="2" />
        <rect x="40" y="78" width="7" height="10" rx="2" fill="#1B2140" />
        <rect x="55.5" y="78" width="7" height="10" rx="2" fill="#1B2140" />
        <rect x="71" y="78" width="7" height="10" rx="2" fill="#1B2140" />
        {mood === 'happy' && <rect x="30" y="78" width="60" height="18" rx="6" fill="#3DBE29" opacity=".18" />}
      </g>
      {/* pork-pie hat */}
      <path d="M26 38 q34 -8 68 0 q2 4 -2 5 q-32 -6 -64 0 q-4 -1 -2 -5z" fill="#12162B" />
      <path d="M36 37 q2 -18 24 -18 q22 0 24 18 q-24 -5 -48 0z" fill="#1B2140" />
      <path d="M37 33 q23 -5 46 0 l0.6 4 q-23.6 -5 -47.2 0z" fill="#FFB31A" />
      {/* cheeks */}
      {mood !== 'oops' && (
        <>
          <circle cx="31" cy="69" r="4" fill="#FF5A5F" opacity=".35" />
          <circle cx="89" cy="69" r="4" fill="#FF5A5F" opacity=".35" />
        </>
      )}
      {mood === 'listen' && (
        <g fill="#2A9DF4">
          <path d="M104 22 v14 a4 4 0 1 1 -2 -3.4 v-8.6 l8 -2 v3z" />
          <path d="M10 30 v10 a3.5 3.5 0 1 1 -2 -3 v-7z" opacity=".7" />
        </g>
      )}
    </svg>
  );
}
