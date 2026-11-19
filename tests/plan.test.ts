import assert from 'node:assert/strict';
import { recordAnswer, DAY, defaultSettings } from '../src/store';
import { shuffled, timeline, blocksForDay, reviewQueue } from '../src/plan';
import { lessons } from '../src/content';
import type { Progress } from '../src/types';

const p = { createdAt: 0, placementDone: true, xp: 0, days: {}, attempts: [], lastSeen: {}, srs: {}, lessons: {}, readings: {}, mocks: [], bosses: {}, vocab: [], speak: { sessions: [0, 0, 0, 0, 0], interviews: 0 }, myAnswers: {} } as Progress;
const q = lessons[0].questions[0];

// wrong → due tomorrow; then each correct review pushes to 3, 7, 16 days, then it leaves the queue
recordAnswer(p, q, false);
assert.ok(Math.abs(p.srs[q.id].due - Date.now() - DAY) < 1000);
for (const days of [3, 7, 16]) { recordAnswer(p, q, true); assert.ok(Math.abs(p.srs[q.id].due - Date.now() - days * DAY) < 1000, `stage ${days}`); }
recordAnswer(p, q, true);
assert.equal(p.srs[q.id], undefined);

// a due item is served as a DIFFERENT question testing the same rule
recordAnswer(p, q, false); p.srs[q.id].due = Date.now() - 1;
const rq = reviewQueue(p);
assert.equal(rq.length, 1); assert.notEqual(rq[0].q.id, q.id); assert.equal(rq[0].q.skill, q.skill);

// option shuffling keeps the key and the reasons aligned
for (let i = 0; i < 50; i++) { const s = shuffled(q); assert.equal(s.options[s.answer], q.options[q.answer]); assert.equal(s.why_wrong[s.answer], null); }

// plan: phases are ordered and cover the whole period; day 0 after placement starts lesson 1
const s = { ...defaultSettings(), startDate: '2026-11-12', examDate: '2027-03-01' };
const tl = timeline(s);
assert.ok(tl.p1 > 0 && tl.p1 < tl.p3Start && tl.p3Start < tl.p4Start && tl.p4Start < tl.total);
assert.equal(tl.phaseOf(0), 1); assert.equal(tl.phaseOf(tl.total - 1), 4);
const day0 = blocksForDay({ ...p, srs: {} }, s, 0);
assert.ok(day0.some((b) => b.kind === 'lesson' && b.ref === 'L01'), JSON.stringify(day0));
const sunday = [...Array(7).keys()].find((d) => new Date(tl.start + d * DAY).getDay() === 0)!;
assert.deepEqual(blocksForDay(p, s, sunday).map((b) => b.kind), ['game', 'video']);
console.log('plan tests passed');

// full schedule: every lesson is introduced once, mocks/interviews appear in the arena phase, bosses on Saturdays
{
  const s2 = { ...defaultSettings(), startDate: '2026-11-12', examDate: '2027-03-01' };
  const t2 = timeline(s2);
  const fresh = { ...p, srs: {}, lessons: {} } as Progress;
  const all = Array.from({ length: t2.total }, (_, d) => blocksForDay(fresh, s2, d));
  const introduced = new Set(all.flat().filter((b) => b.kind === 'lesson').map((b) => (b as { ref: string }).ref));
  assert.equal(introduced.size, lessons.length, `scheduled ${introduced.size}/${lessons.length} lessons`);
  const mocksN = all.flat().filter((b) => b.kind === 'mock').length;
  const interviews = all.flat().filter((b) => b.kind === 'interview').length;
  assert.ok(mocksN >= 5 && interviews >= 8, `mocks ${mocksN}, interviews ${interviews}`);
  console.log(`schedule: ${t2.weeks} weeks, ${introduced.size} lessons, ${mocksN} mocks, ${interviews} interviews`);
}
