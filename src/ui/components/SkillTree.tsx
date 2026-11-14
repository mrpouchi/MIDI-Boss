import { useState } from 'react';
import { SKILL_CATEGORY_LABELS, SkillCategory, getSkillById } from '../../content/skills';
import { SkillAssessment, SkillStatus } from '../../practice/mastery';

/**
 * Game-style skill tree: Foundations are the trunk growing from the bottom,
 * Harmony (left), Application (right) and Jazz (crown) branch upward.
 * Positions are presentation only; skills, dependencies and statuses come
 * from `content/skills.ts` and `practice/mastery.ts`.
 */

const W = 1000;
const H = 940;

const BRANCH_COLOR: Record<SkillCategory, string> = {
  foundations: '#2A9DF4',
  harmony: '#3DBE29',
  application: '#FF5A5F',
  jazz: '#FFB31A',
};

interface NodeLayout {
  x: number;
  y: number;
  glyph: string;
  big?: boolean;
}

const LAYOUT: Record<string, NodeLayout> = {
  // Trunk — foundations, straight up the middle
  'black-white-keys': { x: 500, y: 865, glyph: '♯♭' },
  'find-c': { x: 500, y: 790, glyph: 'Do' },
  'seven-notes': { x: 500, y: 705, glyph: '7 notes', big: true },
  octaves: { x: 500, y: 620, glyph: '8ve' },
  semitones: { x: 500, y: 545, glyph: '½', big: true },
  // Left branch — harmony, growing up and out
  'chord-roots': { x: 395, y: 620, glyph: '1' },
  fifths: { x: 330, y: 520, glyph: '1·5', big: true },
  'major-triads': { x: 205, y: 450, glyph: 'M' },
  'minor-triads': { x: 345, y: 415, glyph: 'm' },
  suspended: { x: 105, y: 360, glyph: 'sus' },
  sevenths: { x: 260, y: 320, glyph: '7', big: true },
  // Right branch — application
  'chord-changes': { x: 640, y: 520, glyph: '⇄', big: true },
  rhythm: { x: 770, y: 430, glyph: '♩♩' },
  accompany: { x: 875, y: 320, glyph: '♫', big: true },
  // Crown — jazz, at the top
  'ii-v-i': { x: 500, y: 300, glyph: 'II V I', big: true },
  'half-diminished': { x: 330, y: 205, glyph: 'ø' },
  inversions: { x: 420, y: 175, glyph: 'inv' },
  'swing-bossa': { x: 640, y: 195, glyph: 'swing' },
  'jazz-voicings': { x: 500, y: 140, glyph: 'voic.', big: true },
  extensions: { x: 500, y: 50, glyph: '9 13' },
};

const BRANCH_LABEL_POS: Record<SkillCategory, { x: number; y: number; anchor: 'start' | 'middle' | 'end' }> = {
  foundations: { x: 575, y: 800, anchor: 'start' },
  harmony: { x: 140, y: 585, anchor: 'middle' },
  application: { x: 860, y: 585, anchor: 'middle' },
  jazz: { x: 760, y: 75, anchor: 'middle' },
};

const BRANCH_SHORT: Record<SkillCategory, string> = {
  foundations: 'FONDATIONS',
  harmony: 'HARMONIE',
  application: 'APPLICATION',
  jazz: 'JAZZ',
};

const STATUS_TEXT: Record<SkillStatus, string> = {
  mastered: 'Maîtrisée',
  learning: 'En cours',
  fragile: 'Difficulté récurrente',
  'not-started': 'À découvrir',
  'no-exercise': 'Exercice à venir',
};

function edgePath(from: NodeLayout, to: NodeLayout): string {
  const midY = (from.y + to.y) / 2;
  return `M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`;
}

function radius(layout: NodeLayout) {
  return layout.big ? 34 : 25;
}

const isActive = (s: SkillStatus) => s === 'mastered' || s === 'learning' || s === 'fragile';

interface SkillTreeProps {
  assessments: SkillAssessment[];
}

export function SkillTree({ assessments }: SkillTreeProps) {
  const byId = new Map(assessments.map((a) => [a.skill.id, a]));
  // Mouse: the info follows the pointer only. Keyboard: shown while a node has
  // visible focus. Touch: a tap pins it (there is no hover). A mouse click must
  // never pin it, otherwise it stays after the pointer leaves.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [keyboardId, setKeyboardId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const shownId = hoveredId ?? keyboardId ?? pinnedId;
  const selected = shownId ? byId.get(shownId) : undefined;
  const shownLayout = shownId ? LAYOUT[shownId] : undefined;

  const edges = assessments.flatMap((a) =>
    a.skill.dependsOn
      .filter((dep) => LAYOUT[dep] && LAYOUT[a.skill.id])
      .map((dep) => ({ from: dep, to: a.skill.id })),
  );

  const categoryCount = (cat: SkillCategory) => {
    const list = assessments.filter((a) => a.skill.category === cat);
    return {
      mastered: list.filter((a) => a.status === 'mastered').length,
      total: list.length,
    };
  };

  return (
    <div className="overflow-hidden rounded-[24px] bg-[#0d1124] bg-[radial-gradient(ellipse_at_50%_40%,#1d2547_0%,#0d1124_70%)]">
      {/* Same box as the SVG, so tooltips can be placed in SVG coordinates. */}
      <div className="overflow-x-auto">
      <div className="relative mx-auto w-full min-w-[620px]" style={{ maxWidth: `calc(82vh * ${W / H})` }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="group"
        aria-label="Arbre de compétences"
      >
        <defs>
          {(Object.keys(BRANCH_COLOR) as SkillCategory[]).map((cat) => (
            <filter key={cat} id={`glow-${cat}`} x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="7" floodColor={BRANCH_COLOR[cat]} floodOpacity=".75" />
            </filter>
          ))}
        </defs>

        {/* Trunk rising from the ground */}
        <path
          d={`M 500 ${H} L 500 ${LAYOUT['black-white-keys'].y}`}
          stroke={BRANCH_COLOR.foundations}
          strokeWidth="14"
          strokeLinecap="round"
        />

        {/* Links. Primary = inside a branch or a branch growing out of the trunk;
            secondary = cross-branch prerequisites, drawn thin so the tree stays readable. */}
        {[0, 1, 2].map((layer) =>
          edges.map(({ from, to }) => {
            const src = byId.get(from)!;
            const dst = byId.get(to)!;
            const sameBranch = src.skill.category === dst.skill.category;
            const fromTrunk = src.skill.category === 'foundations';
            const primary = sameBranch || fromTrunk;
            const active = isActive(src.status) && dst.status !== 'no-exercise';
            const reachable = src.status !== 'no-exercise' && dst.status !== 'no-exercise';
            // layer 0: secondary, 1: primary inactive, 2: primary active
            const myLayer = !primary ? 0 : active ? 2 : 1;
            if (myLayer !== layer) return null;
            const color = BRANCH_COLOR[dst.skill.category];
            const lockedLink = !reachable && !primary;
            return (
              <path
                key={`${from}-${to}`}
                d={edgePath(LAYOUT[from], LAYOUT[to])}
                fill="none"
                stroke={lockedLink ? '#3A4366' : color}
                strokeOpacity={!primary ? (active ? 0.55 : 0.28) : active ? 1 : reachable ? 0.6 : 0.35}
                strokeWidth={!primary ? 2.5 : active ? 9 : 6}
                strokeLinecap="round"
                strokeDasharray={!primary && !active ? '1 9' : undefined}
              />
            );
          }),
        )}

        {/* Branch titles with mastered counts */}
        {(Object.keys(BRANCH_LABEL_POS) as SkillCategory[]).map((cat) => {
          const pos = BRANCH_LABEL_POS[cat];
          const count = categoryCount(cat);
          return (
            <g key={cat} textAnchor={pos.anchor}>
              <text
                x={pos.x}
                y={pos.y}
                fill={BRANCH_COLOR[cat]}
                className="font-display"
                fontSize="19"
                fontWeight="600"
                letterSpacing="2"
              >
                {BRANCH_SHORT[cat]}
              </text>
              <text x={pos.x} y={pos.y + 34} fill="white" className="font-display" fontSize="30" fontWeight="700">
                {count.mastered}/{count.total}
              </text>
            </g>
          );
        })}

        {/* Nodes */}
        {assessments.map((a) => {
          const layout = LAYOUT[a.skill.id];
          if (!layout) return null;
          const color = BRANCH_COLOR[a.skill.category];
          const r = radius(layout);
          const isSelected = shownId === a.skill.id;
          const locked = a.status === 'no-exercise';
          const fill =
            a.status === 'mastered' ? color : locked ? '#1B2140' : '#141a33';
          const stroke = locked ? '#3A4366' : color;
          const strokeOpacity = a.status === 'not-started' ? 0.55 : 1;
          const glyphColor =
            a.status === 'mastered' ? '#12162B' : locked ? '#6E7899' : color;
          const fontSize = layout.glyph.length > 4 ? (layout.big ? 15 : 12) : layout.glyph.length > 2 ? (layout.big ? 19 : 15) : layout.big ? 26 : 20;

          return (
            <g
              key={a.skill.id}
              transform={`translate(${layout.x} ${layout.y})`}
              role="button"
              tabIndex={0}
              aria-label={`${a.skill.label} : ${STATUS_TEXT[a.status]}`}
              aria-describedby={isSelected ? 'skill-tooltip' : undefined}
              onPointerEnter={(e) => {
                if (e.pointerType === 'mouse') setHoveredId(a.skill.id);
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === 'mouse') setHoveredId(null);
              }}
              onPointerUp={(e) => {
                if (e.pointerType !== 'mouse') setPinnedId(pinnedId === a.skill.id ? null : a.skill.id);
              }}
              onFocus={(e) => {
                if (e.currentTarget.matches(':focus-visible')) setKeyboardId(a.skill.id);
              }}
              onBlur={() => setKeyboardId(null)}
              className="cursor-pointer outline-none [&:focus-visible>circle:first-child]:stroke-white"
            >
              <g className="mb-tree-node">
              {isSelected && <circle r={r + 10} fill="none" stroke="white" strokeWidth="3" opacity=".9" />}
              <circle
                r={r}
                fill={fill}
                stroke={stroke}
                strokeOpacity={strokeOpacity}
                strokeWidth={a.status === 'mastered' ? 0 : 5}
                filter={a.status === 'mastered' || a.status === 'learning' ? `url(#glow-${a.skill.category})` : undefined}
              />
              <text
                y={fontSize * 0.36}
                textAnchor="middle"
                fill={glyphColor}
                fontSize={fontSize}
                fontWeight="700"
                className="font-display select-none"
              >
                {layout.glyph}
              </text>

              {/* Lock badge */}
              {locked && (
                <g transform={`translate(${-r * 0.75} ${r * 0.7})`}>
                  <circle r="11" fill="#2B3358" />
                  <rect x="-5" y="-1" width="10" height="7" rx="1.5" fill="#9AA3C0" />
                  <path d="M -3 -1 v -3 a 3 3 0 0 1 6 0 v 3" stroke="#9AA3C0" strokeWidth="2" fill="none" />
                </g>
              )}

              {/* Recurring difficulty */}
              {a.status === 'fragile' && (
                <g transform={`translate(${r * 0.75} ${-r * 0.75})`}>
                  <circle r="11" fill="#FF5A5F" />
                  <text y="5" textAnchor="middle" fill="white" fontSize="15" fontWeight="900">!</text>
                </g>
              )}

              {/* Measured progress, like "2/3" */}
              {a.progress && a.status !== 'mastered' && (
                <g transform={`translate(0 ${r + 14})`}>
                  <rect x="-22" y="-11" width="44" height="22" rx="11" fill="#12162B" stroke={color} strokeOpacity=".7" strokeWidth="2" />
                  <text y="5" textAnchor="middle" fill="white" fontSize="13" fontWeight="800">
                    {a.progress.current}/{a.progress.target}
                  </text>
                </g>
              )}
              </g>
            </g>
          );
        })}
      </svg>

      {/* Tooltip next to the hovered skill */}
        {selected && shownLayout && (
          <div
            id="skill-tooltip"
            role="tooltip"
            className="pointer-events-none absolute z-10 w-80"
            style={{
              top: `${(shownLayout.y / H) * 100}%`,
              // Open towards the side with more room, clear of the node.
              ...(shownLayout.x < W * 0.55
                ? { left: `calc(${(shownLayout.x / W) * 100}% + ${radius(shownLayout) * 0.7 + 18}px)` }
                : { right: `calc(${100 - (shownLayout.x / W) * 100}% + ${radius(shownLayout) * 0.7 + 18}px)` }),
              transform: `translateY(${shownLayout.y > H * 0.7 ? '-88%' : shownLayout.y < H * 0.2 ? '-12%' : '-50%'})`,
            }}
          >
          {/* Inner box animates; the outer one owns the positioning transform. */}
          <div
            key={selected.skill.id}
            className="mb-pop rounded-2xl border-2 bg-[#141a33]/95 p-4 text-white shadow-2xl backdrop-blur"
            style={{ borderColor: BRANCH_COLOR[selected.skill.category] }}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-extrabold" style={{ color: BRANCH_COLOR[selected.skill.category] }}>
                {SKILL_CATEGORY_LABELS[selected.skill.category]}
              </p>
              <span className="rounded-lg bg-white/10 px-2 py-0.5 text-xs font-bold whitespace-nowrap">
                {STATUS_TEXT[selected.status]}
              </span>
            </div>
            <p className="mt-0.5 font-display text-xl leading-tight font-semibold">{selected.skill.label}</p>
            <p className="mt-1.5 text-sm font-semibold text-white/80">{selected.skill.description}</p>
            {selected.progress && selected.status !== 'mastered' && (
              <p className="mt-2 text-sm font-bold">
                {selected.skill.evidence?.progressionOnly
                  ? `${selected.progress.current} accords joués en grille sur ${selected.progress.target} nécessaires`
                  : `${selected.progress.current} accord${selected.progress.current > 1 ? 's' : ''} ancré${selected.progress.current > 1 ? 's' : ''} sur ${selected.progress.target} nécessaires`}
                {selected.accuracy !== null ? `, ${Math.round(selected.accuracy * 100)} % de réussite` : ''}
              </p>
            )}
            {selected.status === 'no-exercise' && (
              <p className="mt-2 text-sm font-bold text-white/70">Les exercices de cette notion arrivent bientôt.</p>
            )}
            {selected.skill.dependsOn.length > 0 && (
              <p className="mt-2 text-xs font-semibold text-white/60">
                S’appuie sur : {selected.skill.dependsOn.map((id) => getSkillById(id)?.label).filter(Boolean).join(', ')}
              </p>
            )}
          </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
