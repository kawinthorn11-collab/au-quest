import { useEffect, useMemo, useState } from 'react';
import { mocks, clozeById, readingById, skillName } from './content';
import { useStore, recordAnswer, addXp, markDone } from './store';
import { ClozeText, ReadingText } from './Passage';
import { Explain } from './Quiz';
import { celebrate, fmtTime, go, LETTERS, rich, Back } from './ui';
import { sfx } from './audio';
import type { MCQ, MockResult, Progress } from './types';

type Section = { title: string; kind: 'cloze' | 'reading'; id: string; items: MCQ[] };

export const VARIANTS = 10;

function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}
function seededShuffle<T>(a: T[], r: () => number): T[] { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
function reorderOptions(q: MCQ, r: () => number): MCQ {
  const order = seededShuffle(q.options.map((_, i) => i), r);
  return { ...q, options: order.map((i) => q.options[i]), why_wrong: order.map((i) => q.why_wrong[i]), answer: order.indexOf(q.answer) };
}

/** Variant 1 is the original paper. Variants 2-10 reorder the passages inside each part, the reading questions, and every option list. Cloze blanks keep their order because the passage numbers them. */
export function mockSections(id: string, variant = 1): Section[] {
  const m = mocks.find((x) => x.id === id);
  if (!m) return [];
  const r = rng(`${id}#${variant}`);
  const mix = <T,>(a: T[]) => (variant === 1 ? a : seededShuffle(a, r));
  const opts = (q: MCQ) => (variant === 1 ? q : reorderOptions(q, r));
  return [
    ...mix(m.cloze).map((c) => ({ title: `Part I · ${clozeById(c)?.title}`, kind: 'cloze' as const, id: c, items: (clozeById(c)?.items ?? []).map(opts) })),
    ...mix(m.reading).map((x) => ({ title: `Part II · ${readingById(x)?.title}`, kind: 'reading' as const, id: x, items: mix(readingById(x)?.questions ?? []).map(opts) })),
  ];
}

/** A random variant, never the one used last time for this mock. */
export function nextVariant(p: Progress, id: string) {
  const last = [...p.mocks].reverse().find((m) => m.id === id)?.variant;
  let v = 1 + Math.floor(Math.random() * VARIANTS);
  if (v === last) v = (v % VARIANTS) + 1;
  return v;
}

const LIMIT = 60 * 60;

export function MockExam({ id, placement = false }: { id: string; placement?: boolean }) {
  const { p, update } = useStore();
  const [variant] = useState(() => nextVariant(p, id));
  const secs = useMemo(() => mockSections(id, variant), [id, variant]);
  const all = secs.flatMap((s) => s.items);
  const [ans, setAns] = useState<(number | null)[]>(() => all.map(() => null));
  const [sec, setSec] = useState(0);
  const [start] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [result, setResult] = useState<MockResult | null>(null);
  const [noTimer, setNoTimer] = useState(false);
  const offset = (k: number) => secs.slice(0, k).reduce((a, s) => a + s.items.length, 0);
  const left = LIMIT - (now - start) / 1000;

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!noTimer && left <= 0 && !result) submit(); }, [left <= 0]);

  function submit() {
    const bySkill: Record<string, [number, number]> = {};
    let score = 0;
    all.forEach((q, i) => { const ok = ans[i] === q.answer; if (ok) score++; const b = (bySkill[q.skill] ??= [0, 0]); b[0] += ok ? 1 : 0; b[1]++; });
    const r: MockResult = { id, t: Date.now(), score, total: all.length, bySkill, answers: ans, minutes: Math.round((Date.now() - start) / 60000), variant };
    update((pp) => {
      all.forEach((q, i) => recordAnswer(pp, q, ans[i] === q.answer));
      pp.mocks.push(r);
      addXp(pp, 100 + score * 2);
      markDone(pp, `mock-${id}`);
      if (placement) { pp.placementDone = true; markDone(pp, 'placement'); }
    });
    setResult(r);
    sfx('win'); if (score / all.length >= 0.8) celebrate();
    window.scrollTo(0, 0);
  }

  if (!secs.length || !all.length) return <div className="card">ยังไม่มีชุดสอบนี้ <Back /></div>;
  if (result) return <MockReport r={result} items={all} placement={placement} />;

  const s = secs[sec];
  const passage = s.kind === 'cloze' ? clozeById(s.id) : readingById(s.id);
  return (
    <div className="mock">
      <div className="mock-bar">
        <b>{placement ? 'แบบทดสอบวัดระดับ (Mock ชุดที่ 1)' : `Mock ${id}`} · แบบที่ {variant}/{VARIANTS}</b>
        <span className={left < 300 ? 'timer over' : 'timer'}>{noTimer ? 'ไม่จับเวลา' : fmtTime(Math.max(0, left))}</span>
        <span>ตอบแล้ว {ans.filter((x) => x !== null).length}/{all.length}</span>
        <button className="primary" onClick={() => confirm('ส่งกระดาษคำตอบเลยไหม?') && submit()}>ส่งคำตอบ</button>
      </div>
      {placement && <div className="card note">นี่คือแบบวัดระดับ ทำเท่าที่ทำได้ ไม่ต้องเครียด ข้อไหนไม่รู้ให้เดาได้ ผลนี้ใช้จัดแผนให้ตรงจุดอ่อน
        <label className="row"><input type="checkbox" checked={noTimer} onChange={(e) => setNoTimer(e.target.checked)} /> วันนี้ขอไม่จับเวลา</label></div>}
      <div className="tabs">{secs.map((x, k) => <button key={k} className={k === sec ? 'on' : ''} onClick={() => { setSec(k); window.scrollTo(0, 0); }}>{k < 3 ? `Grammar ${k + 1}` : `Reading ${k - 2}`}</button>)}</div>
      <div className="mock-grid">
        <div>
          <h3>{s.title}</h3>
          {s.kind === 'cloze' && passage && <ClozeText c={passage as never} />}
          {s.kind === 'reading' && passage && <ReadingText r={passage as never} />}
          <div className="mock-qs">
            {s.items.map((q, k) => {
              const n = offset(sec) + k;
              return (
                <div key={q.id} className="mock-q">
                  <div className="stem"><b>{n + 1}.</b> {s.kind === 'cloze' ? '' : rich(q.stem)}</div>
                  <div className="mock-opts">{q.options.map((o, i) => (
                    <label key={i} className={ans[n] === i ? 'on' : ''}><input type="radio" name={`q${n}`} checked={ans[n] === i} onChange={() => setAns((a) => a.map((x, j) => (j === n ? i : x)))} /> {LETTERS[i]}. {o}</label>
                  ))}</div>
                </div>
              );
            })}
          </div>
          {sec < secs.length - 1 && <button className="primary" onClick={() => { setSec(sec + 1); window.scrollTo(0, 0); }}>ส่วนถัดไป →</button>}
        </div>
        <AnswerSheet ans={ans} setAns={setAns} jump={(n) => { let k = 0; while (n >= offset(k + 1) && k < secs.length - 1) k++; setSec(k); }} />
      </div>
    </div>
  );
}

function AnswerSheet({ ans, setAns, jump }: { ans: (number | null)[]; setAns: (f: (a: (number | null)[]) => (number | null)[]) => void; jump: (n: number) => void }) {
  return (
    <div className="sheet" aria-label="กระดาษคำตอบ">
      <div className="sheet-title">กระดาษคำตอบ (ฝน)</div>
      {ans.map((a, n) => (
        <div key={n} className="sheet-row">
          <button className="link" onClick={() => jump(n)}>{n + 1}</button>
          {[0, 1, 2, 3].map((i) => <button key={i} aria-label={`ข้อ ${n + 1} ตัวเลือก ${i + 1}`} className={`bubble-dot ${a === i ? 'filled' : ''}`} onClick={() => setAns((all) => all.map((x, j) => (j === n ? (x === i ? null : i) : x)))}>{i + 1}</button>)}
        </div>
      ))}
    </div>
  );
}

export function MockReport({ r, items, placement }: { r: MockResult; items: MCQ[]; placement?: boolean }) {
  const pct = Math.round((100 * r.score) / r.total);
  const [showWrong, setShowWrong] = useState(false);
  const rows = Object.entries(r.bySkill).sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1]);
  return (
    <div>
      <div className="card report">
        <h2>{placement ? 'ผลวัดระดับ' : 'ผลสอบ'}: {r.score}/{r.total} ({pct}%)</h2>
        <div className="scorebar"><div className="fill" style={{ width: `${pct}%` }} /><div className="line80" title="เส้นผ่าน 80%" /><div className="line90" title="เป้า 90%" /></div>
        <p>{pct >= 90 ? 'ทะลุเป้า 90% แล้ว! รักษาฟอร์มไว้' : pct >= 80 ? 'ผ่านเส้น 80% แล้ว ต่อไปคือเพิ่มกันชนให้ถึง 90%' : `ยังขาดอีก ${Math.ceil(0.8 * r.total) - r.score} ข้อถึงเส้น 80% ไม่ต้องตกใจ แผนจะดึงจุดอ่อนข้างล่างขึ้นมาก่อน`}</p>
        <p className="muted">ใช้เวลา {r.minutes} นาที · Part I {items.slice(0, 30).filter((q, i) => r.answers[i] === q.answer).length}/30 · Part II {items.slice(30).filter((q, i) => r.answers[i + 30] === q.answer).length}/{items.length - 30}</p>
      </div>
      <div className="card">
        <h3>แยกตามทักษะ (อ่อนสุดอยู่บน)</h3>
        <table className="skills"><tbody>{rows.map(([k, [ok, n]]) => (
          <tr key={k}><td>{skillName(k)}</td><td>{ok}/{n}</td><td style={{ width: '45%' }}><div className="bar"><div style={{ width: `${(100 * ok) / n}%`, background: ok / n >= 0.8 ? 'var(--ok)' : ok / n >= 0.5 ? 'var(--warn)' : 'var(--no)' }} /></div></td></tr>
        ))}</tbody></table>
      </div>
      <div className="row">
        <button onClick={() => setShowWrong(!showWrong)}>{showWrong ? 'ซ่อนข้อที่ผิด' : `ดูข้อที่ผิด (${r.total - r.score} ข้อ) พร้อมเหตุผล`}</button>
        <button className="primary" onClick={() => go('/')}>{placement ? 'ดูแผนรายวันของฉัน →' : 'กลับหน้าแรก'}</button>
      </div>
      {showWrong && items.map((q, i) => r.answers[i] !== q.answer && (
        <div key={q.id} className="card"><div className="stem"><b>{i + 1}.</b> {rich(q.stem)}</div>
          {r.answers[i] === null ? <div className="explain no"><p className="muted">ไม่ได้ตอบข้อนี้</p><p><b>คำตอบคือ "{q.options[q.answer]}":</b> {q.explanation_th}</p></div> : <Explain q={q} picked={r.answers[i]!} />}
        </div>
      ))}
    </div>
  );
}
