import { lessons, shadowing, standalonePool } from './content';
import { pickForSkill, reviewQueue, shuffle, shuffled, timeline, weakestSkills } from './plan';
import { DAY } from './store';
import type { MCQ, Progress, Settings, Twist } from './types';

type ErrorTwist = Extract<Twist, { type: 'error' }>;
type OrderTwist = Extract<Twist, { type: 'order' }>;

/** One rapid round of a Quick Run. `key` is unique within a run and names the underlying item. */
export type Round =
  | { kind: 'pick'; key: string; skill: string; q: MCQ; srsKey?: string }
  | { kind: 'spot'; key: string; skill: string; t: ErrorTwist }
  | { kind: 'order'; key: string; skill: string; t: OrderTwist }
  | { kind: 'match'; key: string; skill: string; prompt: string; left: string; options: string[]; answer: number; explain: string }
  | { kind: 'say'; key: string; skill: string; text: string; th: string };

export type RoundKind = Round['kind'];

export const RUN_LENGTH = 6;
/** Single-sentence items read in seconds; paragraph items are kept for skills that have nothing shorter. */
const oneLiners = standalonePool.filter((q) => (q.stage ?? 1) === 1);
const MAX_DUE = 2;
/** Widens a format to every lesson once the target skills have nothing fresh left in it. */
const ANY = '*';
/** A quick win first, the voice in the middle, the three twist formats in a new order every run. */
const template = (): RoundKind[] => {
  const [a, b, c] = shuffle<RoundKind>(['spot', 'match', 'order']);
  return ['pick', a, 'say', b, c, 'pick', a];
};

/** Seconds before the speed bonus is gone. Running out never fails the round. */
export const ROUND_SECONDS: Record<RoundKind, number> = { pick: 12, spot: 14, match: 12, order: 20, say: 0 };

/** Skills to aim at: weakest first, then whatever the learner has started, then the opening lessons of the current land. */
export function targetSkills(p: Progress, s: Settings): string[] {
  const tl = timeline(s);
  const land = Math.min(3, tl.phaseOf(Math.max(0, tl.today)));
  const started = lessons.filter((l) => p.lessons[l.id]).map((l) => l.skill);
  const opening = lessons.filter((l) => l.phase === land).slice(0, 3).map((l) => l.skill);
  return [...new Set([...weakestSkills(p).slice(0, 3), ...started.slice(-2), ...opening])].slice(0, 4);
}

export function buildRun(p: Progress, s: Settings): Round[] {
  const used = new Set<string>();
  // Items met in the last day are skipped, so a missed item waits for its spaced review instead of reappearing next run.
  const usedQ: string[] = Object.keys(p.lastSeen).filter((id) => Date.now() - p.lastSeen[id] < DAY);
  const take = <T extends Round>(r: T | null): T | null => {
    if (!r || used.has(r.key)) return null;
    used.add(r.key);
    if (r.kind === 'pick') usedQ.push(r.q.id);
    return r;
  };

  const due: Round[] = reviewQueue(p, MAX_DUE).flatMap(({ q, key }) => {
    const r = take({ kind: 'pick', key: q.id, skill: q.skill, q: shuffled(q), srsKey: key });
    return r ? [r] : [];
  });

  const skills = targetSkills(p, s);
  const skillAt = (i: number) => skills[i % skills.length];
  const lessonsFor = (skill: string) => {
    if (skill === ANY) return lessons;
    const own = lessons.filter((l) => l.skill === skill);
    return own.length ? own : lessons.filter((l) => l.phase === 1);
  };
  const seenAt = (id: string) => p.lastSeen[id] ?? 0;
  const freshest = <T extends { id: string }>(xs: T[]) => shuffle(xs.filter((x) => Date.now() - seenAt(x.id) > DAY)).sort((a, b) => seenAt(a.id) - seenAt(b.id));

  const make: Record<RoundKind, (skill: string) => Round | null> = {
    pick: (skill) => {
      const q = pickForSkill(p, skill, 1, usedQ, oneLiners)[0] ?? pickForSkill(p, skill, 1, usedQ)[0] ?? shuffle(oneLiners.filter((x) => !usedQ.includes(x.id)))[0];
      return q ? { kind: 'pick', key: q.id, skill: q.skill, q: shuffled(q) } : null;
    },
    spot: (skill) => {
      const t = freshest(lessonsFor(skill).flatMap((l) => l.twists).filter((x): x is ErrorTwist => x.type === 'error' && !used.has(x.id)))[0];
      return t ? { kind: 'spot', key: t.id, skill: t.skill, t } : null;
    },
    order: (skill) => {
      const t = freshest(lessonsFor(skill).flatMap((l) => l.twists).filter((x): x is OrderTwist => x.type === 'order' && !used.has(x.id)))[0];
      return t ? { kind: 'order', key: t.id, skill: t.skill, t } : null;
    },
    match: (skill) => {
      const pairs = lessonsFor(skill).flatMap((l) => l.twists)
        .flatMap((t) => (t.type === 'match' ? t.pairs.map((_, i) => ({ t, i, id: `${t.id}#${i}` })) : []))
        .filter((x) => !used.has(x.id));
      const pick = freshest(pairs)[0];
      if (!pick) return null;
      const { t, i } = pick;
      const rights = [...new Set(t.pairs.map((x) => x[1]))];
      const wrong = shuffle(rights.filter((r) => r !== t.pairs[i][1])).slice(0, 3);
      const options = shuffle([t.pairs[i][1], ...wrong]);
      return { kind: 'match', key: pick.id, skill: t.skill, prompt: t.prompt_th, left: t.pairs[i][0], options, answer: options.indexOf(t.pairs[i][1]), explain: t.explanation_th };
    },
    say: (skill) => {
      const fromLesson = lessonsFor(skill).flatMap((l) => l.speak.map((text) => ({ text, th: l.title_th })));
      const fromShadow = shadowing.filter((x) => x.level === 'A2').map((x) => ({ text: x.text, th: x.th }));
      const line = shuffle([...fromLesson, ...fromShadow]).find((x) => !used.has(`say:${x.text}`));
      return line ? { kind: 'say', key: `say:${line.text}`, skill, text: line.text, th: line.th } : null;
    },
  };

  const plan = template().slice(due.length ? 1 : 0);
  const rounds: Round[] = [...due];
  for (let i = 0; rounds.length < RUN_LENGTH && i < plan.length * 3; i++) {
    const kind = plan[i % plan.length];
    const tries = [...skills.map((_, k) => skillAt(i + k)), ANY];
    const r = tries.reduce<Round | null>((got, sk) => got ?? take(make[kind](sk)), null) ?? take(make.pick(skillAt(i + 1)));
    if (r) rounds.push(r);
  }
  return rounds;
}

/** Combo and XP for one answer. Slow answers lose only the speed bonus; a miss resets the combo and nothing else. */
export function score(combo: number, ok: boolean, fast: boolean) {
  if (!ok) return { combo: 0, mult: 1, bonus: 0 };
  const next = combo + 1;
  const mult = Math.min(4, next);
  return { combo: next, mult, bonus: (mult - 1) * 3 + (fast ? 3 : 0) };
}

export const RUN_FINISH_XP = 15;
export const SAY_XP = 8;
