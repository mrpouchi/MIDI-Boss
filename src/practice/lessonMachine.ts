// Foundation for a robust, single-transition lesson flow.
// Not yet wired into PlayScreen; prepared to replace the mutable queue logic.

export type LessonPhase =
  | 'demonstrating'
  | 'waiting-for-release'
  | 'waiting-for-input'
  | 'confirmed';

export interface LessonMachineState {
  phase: LessonPhase;
  challengeKey: string;
  resolvedKey: string | null;
}

export type LessonEvent =
  | { type: 'DEMO_DONE' }
  | { type: 'NOTES_CHANGED'; allReleased: boolean; correct: boolean }
  | { type: 'CONTINUE' };

export function initialLessonState(challengeKey: string): LessonMachineState {
  return { phase: 'demonstrating', challengeKey, resolvedKey: null };
}

export function transition(
  state: LessonMachineState,
  event: LessonEvent,
): LessonMachineState {
  switch (state.phase) {
    case 'demonstrating':
      if (event.type === 'DEMO_DONE') {
        return { ...state, phase: 'waiting-for-input' };
      }
      return state;
    case 'waiting-for-input':
      if (event.type === 'NOTES_CHANGED' && event.correct && !event.allReleased) {
        return { ...state, phase: 'waiting-for-release', resolvedKey: state.challengeKey };
      }
      return state;
    case 'waiting-for-release':
      if (event.type === 'NOTES_CHANGED' && event.allReleased) {
        return { ...state, phase: 'confirmed' };
      }
      return state;
    case 'confirmed':
      if (event.type === 'CONTINUE') {
        return { ...state, phase: 'demonstrating', resolvedKey: null };
      }
      return state;
    default:
      return state;
  }
}
