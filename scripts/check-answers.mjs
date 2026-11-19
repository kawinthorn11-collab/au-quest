// npm run check:answers [-- --model ag/claude-sonnet-5-5 --only L09]
// Second-opinion audit: asks a model (via local 9Router) which options are acceptable for each item, blind to our key.
// Flags items where the model finds 0 or 2+ acceptable options, or a different one. Writes reports/answer-audit.json.
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { loadContent, ROOT } from './lib.mjs';
const KEY = (await readFile(path.join(ROOT, '.env'), 'utf8').catch(() => '')).match(/^NINEROUTER_API_KEY=(.+)$/m)?.[1]?.trim();
if (!KEY) { console.log('Add NINEROUTER_API_KEY=... to .env first (9Router dashboard → API keys).'); process.exit(1); }

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : args[i + 1]; };
const MODEL = flag('model', 'cx/gpt-6.1-terra');
const ONLY = flag('only', '');
const c = await loadContent();

const jobs = [];
for (const l of c.lessons) l.questions.forEach((q) => jobs.push({ q, ctx: '' }));
for (const x of c.clozes) x.items.forEach((q) => jobs.push({ q, ctx: `PASSAGE (blanks numbered):\n${x.text}` }));
for (const r of c.readings) r.questions.forEach((q) => jobs.push({ q, ctx: `PASSAGE (line numbers shown):\n${r.lines.map((l, i) => `${i + 1} ${l.replace(/\*\*/g, '')}`).join('\n')}` }));
const todo = jobs.filter((j) => !ONLY || ONLY.split(",").some((o) => j.q.id === o || j.q.id.startsWith(o + "-") || (!o.includes("-") && j.q.id.startsWith(o))));

async function ask(group) {
  const prompt = group.map((j, k) => `#${k} ${j.q.id}\n${j.ctx ? j.ctx + '\n' : ''}QUESTION: ${j.q.stem}\n${j.q.options.map((o, i) => `${i}) ${o}`).join('\n')}`).join('\n\n---\n\n');
  const r = await fetch('http://localhost:20128/v1/chat/completions', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, temperature: 0, max_tokens: 2500, messages: [
      { role: 'system', content: 'You are a strict English exam editor. For each item, list EVERY option index that a careful native-speaker teacher would accept as correct in standard written English (for reading items: supported by the passage). Be strict but honest: if two options are both acceptable, list both. Reply ONLY JSON: {"items":[{"n":0,"ok":[1],"note":"short reason if more than one or none"}]}' },
      { role: 'user', content: prompt }] }),
  });
  if (!r.ok) throw new Error(`9Router ${r.status}`);
  const txt = (await r.json()).choices[0].message.content.replace(/^```json|```$/gm, '');
  return JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1)).items;
}

const flagged = [];
const size = 8;
const groups = []; for (let i = 0; i < todo.length; i += size) groups.push(todo.slice(i, i + size));
let done = 0; let failed = 0;
async function worker() {
  while (groups.length) {
    const g = groups.shift();
    let res;
    for (let t = 0; t < 2 && !res; t++) { try { res = await ask(g); } catch (e) { if (t) { failed += g.length; console.log('\nskip group', g[0].q.id, e.message); } } }
    for (const it of res ?? []) {
      const j = g[it.n]; if (!j) continue;
      const ok = [...new Set(it.ok)];
      if (ok.length !== 1 || ok[0] !== j.q.answer) flagged.push({ id: j.q.id, key: j.q.answer, model: ok, options: j.q.options, stem: j.q.stem, note: it.note });
    }
    done += g.length; process.stdout.write(`\r${done}/${todo.length} checked, ${flagged.length} flagged`);
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
await mkdir(path.join(ROOT, 'reports'), { recursive: true });
await writeFile(path.join(ROOT, 'reports/answer-audit.json'), JSON.stringify({ model: MODEL, at: new Date().toISOString(), checked: todo.length - failed, failed, flagged }, null, 1));
console.log(`\nchecked ${todo.length - failed}, NOT checked (errors) ${failed}, flagged ${flagged.length} → reports/answer-audit.json`);
