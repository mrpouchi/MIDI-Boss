import { SkillAssessment, recommendNextSkills } from '../../practice/mastery';
import { SkillTree } from './SkillTree';

interface SkillTreePanelProps {
  assessments: SkillAssessment[];
}

/** Skill tree fed only by recorded practice, with what to work on next. */
export function SkillTreePanel({ assessments }: SkillTreePanelProps) {
  const next = recommendNextSkills(assessments);
  const masteredCount = assessments.filter((a) => a.status === 'mastered').length;
  const practicable = assessments.filter((a) => a.status !== 'no-exercise').length;

  return (
    <section aria-labelledby="skill-tree-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="skill-tree-title" className="duo-title text-2xl">
          Arbre de compétences
        </h2>
        <p className="text-sm font-bold text-muted">
          {masteredCount} maîtrisée{masteredCount > 1 ? 's' : ''} sur {practicable} déjà praticables
        </p>
      </div>

      {next.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-extrabold text-muted">À travailler ensuite :</span>
          {next.map((a) => (
            <span
              key={a.skill.id}
              className={`rounded-xl border-2 px-3 py-1 text-sm font-bold ${
                a.status === 'fragile'
                  ? 'border-coral/50 bg-coral/10 text-coral-press'
                  : 'border-line bg-mist'
              }`}
            >
              {a.skill.label}
              {a.status === 'fragile' ? ' (erreurs répétées)' : ''}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4">
        <SkillTree assessments={assessments} />
      </div>
    </section>
  );
}
