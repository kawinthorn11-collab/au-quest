import { lessons, practiceClozes, practiceReadings, mocks, standalonePool, practicePool, levelRank, skills } from './content';
import { DAY, dateKey, parseDate, skillStats } from './store';
import type { MCQ, Progress, Settings } from './types';
import type { Land } from './theme';

export type Block =
  | { id: string; kind: 'placement' }
  | { id: string; kind: 'review'; mins: number }
  | { id: string; kind: 'lesson'; ref: string }
  | { id: string; kind: 'repair'; skill: string }
  | { id: string; kind: 'reading'; ref: string }
  | { id: string; kind: 'speak'; step: number }
  | { id: string; kind: 'interview' }
  | { id: string; kind: 'mock'; ref: string }
  | { id: string; kind: 'boss'; ref: string }
  | { id: string; kind: 'game' }
  | { id: string; kind: 'video' };

export const PHASES: { n: Land; name: string; en: string; desc: string }[] = [
  { n: 1, name: 'ป่าปูพื้น', en: 'Foundation Forest', desc: 'ส่วนประกอบประโยค tense หลัก pronoun article preposition' },
  { n: 2, name: 'ภูเขาไวยากรณ์', en: 'Grammar Mountains', desc: 'คำเชื่อม relative passive word form gerund modal conditional parallel' },
  { n: 3, name: 'แม่น้ำนักอ่าน', en: 'Reading River', desc: 'reference ศัพท์จากบริบท รายละเอียด inference จับเวลา' },
  { n: 4, name: 'สนามจริง', en: 'The Arena', desc: 'Mock 60 ข้อ 60 นาที + สัมภาษณ์จำลอง' },
];

export function timeline(s: Settings) {
  const start = parseDate(s.startDate).getTime();
  const exam = parseDate(s.examDate).getTime();
  const total = Math.max(14, Math.round((exam - start) / DAY));
  const p4 = Math.min(21, Math.round(total * 0.2));
  const rest = total - p4;
  const p1 = Math.round((rest * 4) / 9);
  const today = Math.round((parseDate(dateKey()).getTime() - start) / DAY);
  const p3Start = p1 + Math.round((rest - p1) * 0.4); // reading land overlaps the second half of grammar land
  const phaseOf = (d: number) => (d >= total - p4 ? 4 : d >= p3Start ? 3 : d >= p1 ? 2 : 1);
  return { start, exam, total, p1, p3Start, p4Start: total - p4, today, phaseOf, weeks: Math.ceil(total / 7), daysLeft: Math.max(0, Math.round((exam - parseDate(dateKey()).getTime()) / DAY)) };
}

/** Lesson sequence: phase-1 lessons, then grammar lessons with reading-skill lessons mixed in from 40% onward. */
function lessonSequence() {
  const p1 = lessons.filter((l) => l.phase === 1).map((l) => l.id);
  const p2 = lessons.filter((l) => l.phase === 2).map((l) => l.id);
  const p3 = lessons.filter((l) => l.phase === 3).map((l) => l.id);
  const seq2: string[] = [];
  const startMix = Math.floor(p2.length * 0.4);
  p2.forEach((id, i) => { seq2.push(id); if (i >= startMix && p3.length) seq2.push(p3.shift()!); });
  return { p1, p2: [...seq2, ...p3] };
}

const isWeekday = (t: number) => { const g = new Date(t).getDay(); return g >= 1 && g <= 5; };

/** Which lesson (if any) is introduced on day index d. */
function lessonForDay(s: Settings, d: number): string | null {
  const tl = timeline(s);
  const { p1, p2 } = lessonSequence();
  const days = (from: number, to: number) => { const out: number[] = []; for (let i = from; i < to; i++) if (isWeekday(tl.start + i * DAY)) out.push(i); return out; };
  const pick = (seq: string[], ds: number[]) => {
    if (!seq.length || !ds.length) return null;
    const slot = ds.indexOf(d);
    if (slot < 0) return null;
    for (let i = 0; i < seq.length; i++) if (Math.floor((i * ds.length) / seq.length) === slot) return seq[i];
    return null;
  };
  if (d < tl.p1) return pick(p1, days(0, tl.p1)); // day 0 = placement test, then the first lesson
  if (d < tl.p4Start) return pick(p2, days(tl.p1, tl.p4Start));
  return null;
}

export function readingLevelForWeek(w: number): 'A2' | 'B1' | 'B2' { return w < 3 ? 'A2' : w < 9 ? 'B1' : 'B2'; }

export function nextReading(p: Progress, s: Settings) {
  const w = Math.floor(timeline(s).today / 7);
  const cap = levelRank[readingLevelForWeek(w)];
  const pool = [...practiceReadings].sort((a, b) => levelRank[a.level] - levelRank[b.level] || a.id.localeCompare(b.id));
  return pool.find((r) => !p.readings[r.id] && levelRank[r.level] <= cap)
    ?? pool.filter((r) => levelRank[r.level] <= cap).sort((a, b) => (p.readings[a.id]?.score ?? 0) - (p.readings[b.id]?.score ?? 0))[0]
    ?? pool[0];
}

export function speakStep(p: Progress, phase: number) {
  const byPhase = phase === 1 ? 2 : phase === 2 ? 3 : phase === 3 ? 4 : 5;
  let unlocked = 1;
  for (let i = 1; i < 5; i++) if (p.speak.sessions[i - 1] >= 3) unlocked = i + 1;
  return Math.max(1, Math.min(5, Math.max(unlocked, byPhase)));
}

export function unlockedSteps(p: Progress, phase: number) { return speakStep(p, phase); }

export function weakestSkills(p: Progress): string[] {
  const st = skillStats(p);
  const learned = new Set([...Object.keys(p.lessons).filter((id) => p.lessons[id].done).map((id) => lessons.find((l) => l.id === id)?.skill), ...Object.keys(st)]);
  return skills.map((k) => k.id).filter((id) => learned.has(id))
    .map((id) => ({ id, acc: ((st[id]?.ok ?? 0) + 1) / ((st[id]?.n ?? 0) + 2) }))
    .sort((a, b) => a.acc - b.acc).map((x) => x.id);
}

const talkFirst = (bs: Block[]) => {
  const talk = (b: Block) => b.kind === 'speak' || b.kind === 'interview';
  return [...bs.filter((b) => b.kind === 'review'), ...bs.filter(talk), ...bs.filter((b) => b.kind !== 'review' && !talk(b))];
};

/** Speaking comes right after review every day: the interview is the hardest part, so it gets the fresh minutes. */
export function blocksForDay(p: Progress, s: Settings, d = timeline(s).today): Block[] {
  return talkFirst(dayBlocks(p, s, d));
}

function dayBlocks(p: Progress, s: Settings, d: number): Block[] {
  const tl = timeline(s);
  const t = tl.start + d * DAY;
  const dow = new Date(t).getDay();
  const phase = tl.phaseOf(d);
  const w = Math.floor(d / 7);
  if (dow === 0) return [{ id: 'game', kind: 'game' }, { id: 'video', kind: 'video' }]; // Sunday = light day

  const blocks: Block[] = [{ id: 'review', kind: 'review', mins: 5 }];
  const weak = weakestSkills(p)[0];
  if (phase === 4) {
    const mockDays = [2, 5];
    const done = new Set(p.mocks.map((m) => m.id));
    if (mockDays.includes(dow)) {
      const next = mocks.find((m) => !done.has(m.id)) ?? mocks[(w + dow) % mocks.length];
      if (next) blocks.push({ id: `mock-${next.id}`, kind: 'mock', ref: next.id });
    } else if (weak) blocks.push({ id: `repair-${weak}`, kind: 'repair', skill: weak });
    if ([1, 3, 6].includes(dow)) blocks.push({ id: 'interview', kind: 'interview' });
    else blocks.push({ id: 'speak', kind: 'speak', step: 4 });
    return blocks;
  }
  if (dow === 6) {
    const boss = practiceClozes[w % Math.max(1, practiceClozes.length)];
    if (boss) blocks.push({ id: `boss-${boss.id}`, kind: 'boss', ref: boss.id });
    blocks.push({ id: 'speak', kind: 'speak', step: speakStep(p, phase) });
    return blocks;
  }
  const lid = lessonForDay(s, d);
  // catch up: a started-but-unfinished lesson, or the earliest scheduled lesson that was skipped
  const behind = Array.from({ length: d }, (_, k) => lessonForDay(s, k)).find((id) => id && !p.lessons[id]?.done);
  const pending = lessons.find((l) => p.lessons[l.id]?.step && !p.lessons[l.id].done) ?? lessons.find((l) => l.id === behind);
  if (lid) blocks.push({ id: `lesson-${lid}`, kind: 'lesson', ref: lid });
  else if (pending) blocks.push({ id: `lesson-${pending.id}`, kind: 'lesson', ref: pending.id });
  else if (weak) blocks.push({ id: `repair-${weak}`, kind: 'repair', skill: weak });
  const r = nextReading(p, s);
  if (r) blocks.push({ id: `reading-${r.id}`, kind: 'reading', ref: r.id });
  blocks.push({ id: 'speak', kind: 'speak', step: speakStep(p, phase) });
  return blocks;
}

/* ---------- question selection ---------- */

export function shuffle<T>(a: T[]): T[] { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

/** Shuffle options every time, keeping answer and why_wrong aligned. */
export function shuffled(q: MCQ): MCQ {
  const order = shuffle(q.options.map((_, i) => i));
  return { ...q, options: order.map((i) => q.options[i]), why_wrong: order.map((i) => q.why_wrong[i]), answer: order.indexOf(q.answer) };
}

const fresh = (p: Progress, q: MCQ) => !p.lastSeen[q.id] || Date.now() - p.lastSeen[q.id] > 7 * DAY || !!p.srs[q.id];

/** Pick n questions for a skill, unseen-in-7-days first, never the excluded ids. */
export function pickForSkill(p: Progress, skill: string, n: number, exclude: string[] = [], pool = standalonePool) {
  const all = pool.filter((q) => q.skill === skill && !exclude.includes(q.id));
  const a = shuffle(all.filter((q) => fresh(p, q)));
  const b = shuffle(all.filter((q) => !fresh(p, q))).sort((x, y) => (p.lastSeen[x.id] ?? 0) - (p.lastSeen[y.id] ?? 0));
  return [...a, ...b].slice(0, n);
}

/** Today's review: each due SRS item is served as a *different* question that tests the same rule when possible. */
export function reviewQueue(p: Progress, max = 10): { q: MCQ; key: string }[] {
  const now = Date.now();
  const due = Object.entries(p.srs).filter(([, v]) => v.due <= now).sort((a, b) => a[1].due - b[1].due).slice(0, max);
  const used: string[] = [];
  return due.map(([key, v]) => {
    const sub = pickForSkill(p, v.skill, 1, [v.qid, ...used])[0];
    const orig = practicePool.find((q) => q.id === v.qid);
    const q = sub ?? orig!;
    used.push(q?.id);
    return { q, key };
  }).filter((x) => x.q);
}

/** Probability of scoring >= 80% on the real test, from the latest mock results (normal approximation). */
export function passChance(p: Progress) {
  const scores = p.mocks.map((m) => (100 * m.score) / m.total);
  if (!scores.length) return null;
  const last = scores.slice(-3);
  const mean = last.reduce((a, b) => a + b, 0) / last.length;
  const sd = Math.max(6, Math.sqrt(last.reduce((a, b) => a + (b - mean) ** 2, 0) / last.length));
  const z = (80 - mean) / sd;
  return Math.round(100 * (1 - normCdf(z)));
}

function normCdf(z: number) {
  // Abramowitz–Stegun approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const pr = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - pr : pr;
}
