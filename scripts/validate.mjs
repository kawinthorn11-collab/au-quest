// npm run validate — every item has one answer, an explanation, and a reason for each wrong option; no text copied from the exam PDF.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { loadContent, ROOT } from './lib.mjs';

const errors = []; const warns = [];
const err = (where, msg) => errors.push(`✗ ${where}: ${msg}`);
const warn = (where, msg) => warns.push(`! ${where}: ${msg}`);
const c = await loadContent();
const skillIds = new Set(c.skills.map((s) => s.id));
const ids = new Map();

function checkMcq(q, where, { needBlank = true } = {}) {
  const w = `${where} ${q.id ?? '?'}`;
  if (!q.id) return err(where, 'missing id');
  if (ids.has(q.id)) err(w, `duplicate id (also in ${ids.get(q.id)})`); else ids.set(q.id, where);
  if (!skillIds.has(q.skill)) err(w, `unknown skill "${q.skill}"`);
  if (![1, 2, 3].includes(q.difficulty)) err(w, 'difficulty must be 1-3');
  if (!q.stem?.trim()) err(w, 'empty stem');
  if (needBlank && !q.stem.includes('___')) err(w, 'stem has no ___ blank');
  if (!Array.isArray(q.options) || q.options.length !== 4) return err(w, 'needs exactly 4 options');
  if (new Set(q.options.map((o) => o.trim().toLowerCase())).size !== 4) err(w, 'options are not unique');
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) err(w, 'answer must be 0-3');
  if (!q.explanation_th?.trim()) err(w, 'missing explanation_th');
  if (!Array.isArray(q.why_wrong) || q.why_wrong.length !== 4) return err(w, 'why_wrong must have 4 entries');
  q.why_wrong.forEach((r, i) => {
    if (i === q.answer && r !== null) err(w, `why_wrong[${i}] is the correct answer — must be null`);
    if (i !== q.answer && !(typeof r === 'string' && r.trim().length >= 4)) err(w, `why_wrong[${i}] ("${q.options[i]}") needs a reason`);
  });
  // the explanation should name the right answer, not a wrong one (catches key/explanation mismatch)
  const right = q.options[q.answer]?.toLowerCase();
  if (needBlank && q.skill.startsWith('g.') && q.explanation_th && right && !q.explanation_th.toLowerCase().includes(right.split(' ')[0]) && !/^[0-9]/.test(right))
    warn(w, `explanation does not mention the answer "${q.options[q.answer]}"`);
}

function checkTwist(t, where) {
  const w = `${where} ${t.id}`;
  if (ids.has(t.id)) err(w, 'duplicate id'); else ids.set(t.id, where);
  if (!skillIds.has(t.skill)) err(w, `unknown skill ${t.skill}`);
  if (!t.explanation_th) err(w, 'missing explanation_th');
  if (t.type === 'error') { if (!(t.parts?.length >= 3 && t.answer >= 0 && t.answer < t.parts.length && t.why_wrong?.length === t.parts.length && t.why_wrong[t.answer] === null)) err(w, 'bad error-spot twist'); }
  else if (t.type === 'fill') { if (!(t.stem?.split('___').length === 2 && t.accept?.length && t.hint_th)) err(w, 'fill twist needs one ___, accept[], hint_th'); }
  else if (t.type === 'order') { if (!(t.words?.length >= 4)) err(w, 'order twist needs >=4 words'); }
  else if (t.type === 'match') { if (!(t.pairs?.length >= 3 && t.prompt_th)) err(w, 'match twist needs >=3 pairs'); }
  else err(w, `unknown twist type ${t.type}`);
}

/* lessons */
for (const l of c.lessons) {
  const w = l.__file;
  if (!skillIds.has(l.skill)) err(w, `unknown skill ${l.skill}`);
  if (!(l.hook?.beats?.length >= 4)) err(w, 'hook needs >=4 beats');
  if (!(l.discover?.examples?.length >= 3)) err(w, 'discover needs 3-4 examples');
  if (!(l.discover?.answer >= 0 && l.discover.answer < l.discover.options_th.length)) err(w, 'discover answer out of range');
  if (!l.rule?.line_th || !l.rule?.memory_th) err(w, 'rule needs line_th and memory_th');
  if (!(l.speak?.length >= 2)) err(w, 'speak needs 2-3 sentences');
  if (!(l.twists?.length >= 3)) err(w, 'needs >=3 twists');
  if (!(l.questions?.length >= 25)) err(w, `needs >=25 questions (has ${l.questions?.length ?? 0})`);
  if (l.questions.filter((q) => (q.stage ?? 1) === 1).length < 5 || l.questions.filter((q) => q.stage === 2).length < 3) err(w, 'needs >=5 stage-1 and >=3 stage-2 questions');
  if (!c.clozes.some((x) => x.id === l.cloze)) err(w, `cloze ${l.cloze} not found`);
  l.questions.forEach((q) => checkMcq(q, w));
  l.twists.forEach((t) => checkTwist(t, w));
}

/* cloze */
for (const x of c.clozes) {
  const w = x.__file;
  if (x.items?.length !== 10) err(w, `cloze needs 10 items (has ${x.items?.length})`);
  for (let n = 1; n <= (x.items?.length ?? 0); n++) {
    const hits = x.text.split(`(${n})`).length - 1;
    if (hits !== 1) err(w, `blank (${n}) appears ${hits} times in text`);
    if (!x.items[n - 1]?.stem.startsWith(`(${n})`)) err(w, `item ${n} stem must start with (${n})`);
  }
  x.items?.forEach((q) => checkMcq(q, w));
  if (!['A2', 'B1', 'B2'].includes(x.level)) err(w, 'level must be A2/B1/B2');
}

/* reading */
for (const r of c.readings) {
  const w = r.__file;
  if (!(r.lines?.length >= 6)) err(w, 'reading needs lines[]');
  if (!(r.questions?.length >= 6)) err(w, 'reading needs >=6 questions');
  const words = r.lines.join(' ').split(/\s+/).length;
  if (words < 120 || words > 320) warn(w, `passage length ${words} words (target 150-250)`);
  r.questions?.forEach((q) => {
    checkMcq(q, w, { needBlank: false });
    const m = q.stem.match(/[‘'"“]([^'"’”]+)[’'"”] in line (\d+)/i);
    if (m) {
      const line = r.lines[Number(m[2]) - 1] ?? '';
      if (!line.toLowerCase().includes(`**${m[1].toLowerCase()}**`)) err(`${w} ${q.id}`, `line ${m[2]} has no bold **${m[1]}**`);
    }
  });
}

/* mocks */
for (const m of c.mocks) {
  const w = `mocks.json ${m.id}`;
  const cl = m.cloze.map((id) => c.clozes.find((x) => x.id === id));
  const rd = m.reading.map((id) => c.readings.find((x) => x.id === id));
  if (cl.length !== 3 || cl.some((x) => !x)) err(w, 'needs 3 existing cloze passages');
  if (rd.length !== 3 || rd.some((x) => !x)) err(w, 'needs 3 existing reading passages');
  [...cl, ...rd].forEach((x) => x && x.mock !== m.id && err(w, `${x.id} must have "mock": "${m.id}" so it is kept out of practice`));
  const items = [...cl, ...rd].flatMap((x) => x?.items ?? x?.questions ?? []);
  if (items.length !== 60) err(w, `has ${items.length} items, needs 60`);
  const pos = [0, 0, 0, 0]; items.forEach((q) => pos[q.answer]++);
  if (Math.max(...pos) > 24) warn(w, `answer positions unbalanced ${pos.join('/')}`);
}

/* interview */
const iq = c.interview.questions ?? [];
iq.forEach((q) => {
  if (ids.has(q.id)) err(`interview ${q.id}`, 'duplicate id'); else ids.set(q.id, 'interview');
  for (const k of ['q', 'q_th', 'sample', 'frame', 'tip_th', 'cat']) if (!q[k]) err(`interview ${q.id}`, `missing ${k}`);
  if (!c.interview.categories.some((x) => x.id === q.cat)) err(`interview ${q.id}`, `unknown category ${q.cat}`);
});
if (iq.length < 60) warn('interview.json', `${iq.length} questions (target >= 60)`);

/* videos */
for (const v of c.videos.videos) for (const k of ['id', 'topic', 'lang', 'title', 'channel', 'duration', 'checked']) if (!v[k]) err(`videos ${v.id}`, `missing ${k}`);

/* copied text from the exam PDF: compare 6-word shingles with hashed fingerprints */
const fp = JSON.parse(await readFile(path.join(ROOT, 'reference/fingerprints.json'), 'utf8'));
const bad = new Set(fp.hashes);
const texts = [];
const walk = (v, where) => { if (typeof v === 'string') texts.push([where, v]); else if (Array.isArray(v)) v.forEach((x) => walk(x, where)); else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => k !== '__file' && walk(x, where)); };
[...c.lessons, ...c.clozes, ...c.readings].forEach((x) => walk(x, x.__file)); walk(c.interview, 'interview.json'); walk(c.games, 'games.json');
let copied = 0;
for (const [where, t] of texts) {
  const ws = t.toLowerCase().match(/[a-z']+/g) ?? [];
  for (let i = 0; i + fp.n <= ws.length; i++) {
    const h = createHash('sha1').update(ws.slice(i, i + fp.n).join(' ')).digest('hex').slice(0, 16);
    if (bad.has(h)) { copied++; err(where, `6 words match the exam PDF: "${ws.slice(i, i + fp.n).join(' ')}"`); }
  }
}

/* summary */
const sum = {
  lessons: c.lessons.length, lessonQuestions: c.lessons.reduce((a, l) => a + l.questions.length, 0), twists: c.lessons.reduce((a, l) => a + l.twists.length, 0),
  cloze: `${c.clozes.length} (${c.clozes.filter((x) => !x.mock).length} practice)`, reading: `${c.readings.length} (${c.readings.filter((x) => !x.mock).length} practice)`,
  mocks: c.mocks.length, interview: iq.length, shadowing: c.shadowing.length, videos: c.videos.videos.length, copiedFromPdf: copied,
};
console.log('AU Quest content:', sum);
warns.forEach((x) => console.log(x));
if (errors.length) { errors.forEach((x) => console.log(x)); console.log(`\n${errors.length} error(s)`); process.exit(1); }
console.log(`\n✓ validate passed (${warns.length} warning(s))`);
