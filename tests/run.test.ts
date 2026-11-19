import assert from 'node:assert/strict';
import { buildRun, score, RUN_LENGTH } from '../src/run';
import { recordAnswer, defaultSettings } from '../src/store';
import { lessons } from '../src/content';
import type { Progress } from '../src/types';

const blank = (): Progress => ({ createdAt: 0, placementDone: true, xp: 0, days: {}, attempts: [], lastSeen: {}, srs: {}, lessons: {}, readings: {}, mocks: [], bosses: {}, vocab: [], speak: { sessions: [0, 0, 0, 0, 0], interviews: 0 }, myAnswers: {} });
const s = { ...defaultSettings(), startDate: '2026-11-12', examDate: '2027-03-01' };

for (let n = 0; n < 40; n++) {
  const run = buildRun(blank(), s);
  assert.equal(run.length, RUN_LENGTH, 'a run has a fixed short length');
  assert.ok(new Set(run.map((r) => r.kind)).size >= 4, `a run mixes formats: ${run.map((r) => r.kind)}`);
  assert.equal(run.filter((r) => r.kind === 'say').length, 1, 'every run has exactly one say-it-aloud round');
  assert.equal(new Set(run.map((r) => r.key)).size, run.length, `no item repeats: ${run.map((r) => r.key)}`);
  for (const r of run) if (r.kind === 'pick') assert.equal(r.q.why_wrong[r.q.answer], null, 'options stay aligned after shuffling');
  for (const r of run) if (r.kind === 'match') assert.ok(r.options.length >= 2 && r.options[r.answer] !== undefined, 'match round has a valid answer');
}

{
  const p = blank();
  const missed = [lessons[3].questions[0], lessons[7].questions[1]];
  for (const q of missed) { recordAnswer(p, q, false); p.srs[q.id].due = Date.now() - 1000; }
  const run = buildRun(p, s);
  assert.deepEqual(run.slice(0, 2).map((r) => r.kind === 'pick' && r.srsKey).sort(), missed.map((q) => q.id).sort(), 'due SRS items come first');
  assert.ok(run.slice(0, 2).every((r) => r.kind === 'pick' && r.skill === missed.find((q) => q.id === r.srsKey)!.skill), 'a due item is served on its own rule');
  assert.equal(run.length, RUN_LENGTH);
  assert.ok(run.some((r) => r.kind === 'say'), 'due items do not crowd out speaking');
}

{
  const p = blank();
  const weak = lessons.find((l) => l.skill === 'g.passive')!;
  const strong = lessons.find((l) => l.skill === 'g.article')!;
  for (const q of weak.questions.slice(0, 6)) recordAnswer(p, q, false);
  for (const q of strong.questions.slice(0, 6)) recordAnswer(p, q, true);
  for (const k of Object.keys(p.srs)) delete p.srs[k];
  const hits = Array.from({ length: 20 }, () => buildRun(p, s).filter((r) => r.skill === 'g.passive').length);
  assert.ok(hits.every((h) => h >= 1), `the weakest skill shows up in every run: ${hits}`);
}

{
  const p = blank();
  let prev = new Set<string>();
  for (let n = 0; n < 8; n++) {
    const run = buildRun(p, s);
    const graded = run.filter((r) => r.kind !== 'say');
    const again = graded.filter((r) => prev.has(r.key)).map((r) => r.key);
    assert.deepEqual(again, [], `run ${n + 1} repeats nothing from the run before`);
    assert.ok(new Set(run.map((r) => r.kind)).size >= 4, `run ${n + 1} still mixes formats: ${run.map((r) => r.kind)}`);
    for (const r of graded) recordAnswer(p, r.kind === 'pick' ? r.q : { id: r.key, skill: r.skill }, true);
    prev = new Set(graded.map((r) => r.key));
  }
}

assert.deepEqual(score(0, true, false), { combo: 1, mult: 1, bonus: 0 });
assert.deepEqual(score(1, true, true), { combo: 2, mult: 2, bonus: 6 });
assert.equal(score(9, true, false).mult, 4, 'combo multiplier caps at x4');
assert.equal(score(5, false, true).combo, 0, 'a miss resets the combo');
assert.ok(score(2, true, false).bonus > 0, 'a slow right answer still earns its combo bonus');
console.log('quick run tests passed');
