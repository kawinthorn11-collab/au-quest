import { useEffect, useMemo, useState } from 'react';
import gamesJson from '../content/games.json';
import { standalonePool, lessons } from './content';
import { useStore, addXp, markDone, recordAnswer } from './store';
import { shuffle, shuffled } from './plan';
import { sfx } from './audio';
import { TwistCard } from './Twist';
import { Back, Card, celebrate, go } from './ui';
import type { Twist } from './types';

type GamesData = {
  conj: { s: string; a: string; opts: string[] }[];
  pronoun: { text: string; pairs: [string, string][] }[];
  wordform: { s: string; root: string; forms: string[]; a: string; why: string }[];
};
const G = gamesJson as GamesData;

const LIST = [
  { id: 'conj', name: 'ยิงคำเชื่อม', desc: 'คำเชื่อมลอยผ่าน ยิงตัวที่เติมประโยคได้ถูก' },
  { id: 'pronoun', name: 'จับคู่ pronoun', desc: 'he / it / they / this หมายถึงอะไรในเรื่อง' },
  { id: 'order', name: 'เรียงประโยค', desc: 'แตะคำตามลำดับให้เป็นประโยคถูก' },
  { id: 'wordform', name: 'Word-form slot', desc: 'เลือกรูปคำ noun / adj / adv ให้พอดีช่อง' },
  { id: 'speed', name: 'Speed round 60 วิ', desc: 'ตอบให้ได้มากที่สุดใน 60 วินาที' },
];

function useWin() {
  const { update } = useStore();
  return (xp: number) => { update((p) => { addXp(p, xp); markDone(p, 'game'); }); celebrate(); sfx('win'); };
}

export function GamesPage({ id }: { id?: string }) {
  if (id === 'conj') return <Conj />;
  if (id === 'pronoun') return <Pronoun />;
  if (id === 'order') return <OrderGame />;
  if (id === 'wordform') return <WordForm />;
  if (id === 'speed') return <Speed />;
  return (
    <div>
      <Back />
      <h2>มินิเกม</h2>
      <p className="muted">เล่นวันอาทิตย์หรือเวลาเบื่อ ทุกเกมฝึกจุดที่ข้อสอบถามจริง</p>
      <div className="grid2">{LIST.map((g) => <Card key={g.id} onClick={() => go(`/games/${g.id}`)}><b>{g.name}</b><div className="small muted">{g.desc}</div></Card>)}</div>
    </div>
  );
}

function Conj() {
  const items = useMemo(() => shuffle(G.conj).slice(0, 8), []);
  const [i, setI] = useState(0); const [ok, setOk] = useState(0); const [flash, setFlash] = useState<string | null>(null);
  const win = useWin();
  const it = items[i];
  const words = useMemo(() => (it ? shuffle(it.opts) : []), [i]);
  if (!it) return <Done title={`ยิงโดน ${ok}/${items.length}`} onBack={() => win(ok * 5)} />;
  const shoot = (w: string) => {
    const good = w === it.a; setFlash(good ? 'ok' : 'no'); sfx(good ? 'ok' : 'no'); if (good) setOk(ok + 1);
    setTimeout(() => { setFlash(null); setI(i + 1); }, good ? 500 : 1300);
  };
  return (
    <div>
      <Back to="/games" />
      <h2>ยิงคำเชื่อม {i + 1}/{items.length}</h2>
      <Card><div className="big-text">{it.s.replace('___', flash ? `[${it.a}]` : '_____')}</div></Card>
      <div className={`sky ${flash ?? ''}`}>{words.map((w, k) => <button key={w + i} className="floater" style={{ animationDelay: `${k * 0.9}s`, top: `${15 + k * 20}%` }} onClick={() => !flash && shoot(w)}>{w}</button>)}</div>
      <p className="muted small">คำจะลอยวนไปเรื่อย ๆ ใจเย็น ๆ อ่านประโยคให้จบก่อนยิง</p>
    </div>
  );
}

function Pronoun() {
  const items = useMemo(() => shuffle(G.pronoun).slice(0, 3), []);
  const [i, setI] = useState(0); const [ok, setOk] = useState(0);
  const win = useWin();
  if (!items[i]) return <Done title={`จับคู่ถูก ${ok}/${items.length} เรื่อง`} onBack={() => win(ok * 10)} />;
  const t: Twist = { id: `game-pr-${i}`, skill: 'r.reference', type: 'match', prompt_th: 'คำตัวหนาแต่ละคำหมายถึงอะไร', pairs: items[i].pairs, explanation_th: 'เคล็ดลับ: ย้อนไปหาคำนามหรือความคิดที่อยู่ก่อนหน้าคำนั้น แล้วลองแทนค่าดูว่าประโยคยังมีความหมายเหมือนเดิมไหม' };
  return (
    <div>
      <Back to="/games" />
      <h2>จับคู่ pronoun {i + 1}/{items.length}</h2>
      <Card><p className="passage">{items[i].text.split(/(\*\*[^*]+\*\*)/).map((x, k) => x.startsWith('**') ? <b key={k} className="hl">{x.slice(2, -2)}</b> : x)}</p></Card>
      <TwistCard key={i} t={t} onDone={(r) => { if (r) setOk(ok + 1); setI(i + 1); }} />
    </div>
  );
}

function OrderGame() {
  const items = useMemo(() => shuffle(lessons.flatMap((l) => l.twists).filter((t) => t.type === 'order')).slice(0, 5), []);
  const [i, setI] = useState(0); const [ok, setOk] = useState(0);
  const win = useWin();
  if (!items[i]) return <Done title={`เรียงถูก ${ok}/${items.length}`} onBack={() => win(ok * 6)} />;
  return <div><Back to="/games" /><h2>เรียงประโยค {i + 1}/{items.length}</h2><TwistCard key={i} t={items[i]} onDone={(r) => { if (r) setOk(ok + 1); setI(i + 1); }} /></div>;
}

function WordForm() {
  const items = useMemo(() => shuffle(G.wordform).slice(0, 8), []);
  const [i, setI] = useState(0); const [ok, setOk] = useState(0); const [pick, setPick] = useState<string | null>(null);
  const win = useWin();
  const it = items[i];
  const forms = useMemo(() => (it ? shuffle(it.forms) : []), [i]);
  if (!it) return <Done title={`ใส่ถูก ${ok}/${items.length}`} onBack={() => win(ok * 5)} />;
  return (
    <div>
      <Back to="/games" />
      <h2>Word-form slot {i + 1}/{items.length}</h2>
      <Card>
        <div className="muted">รากคำ: <b>{it.root}</b></div>
        <div className="big-text">{it.s.split('___')[0]}<span className={`slot ${pick ? (pick === it.a ? 'right' : 'wrong') : ''}`}>{pick ?? '?'}</span>{it.s.split('___')[1]}</div>
        <div className="chips">{forms.map((f) => <button key={f} className="chip" disabled={!!pick} onClick={() => { setPick(f); sfx(f === it.a ? 'ok' : 'no'); if (f === it.a) setOk(ok + 1); }}>{f}</button>)}</div>
        {pick && <div className={`explain ${pick === it.a ? 'ok' : 'no'}`}><p><b>{it.a}</b>: {it.why}</p><button className="primary" onClick={() => { setPick(null); setI(i + 1); }}>ต่อไป →</button></div>}
      </Card>
    </div>
  );
}

function Speed() {
  const { p, update } = useStore();
  const pool = useMemo(() => shuffle(standalonePool.filter((q) => (q.stage ?? 1) === 1)).map(shuffled), []);
  const [i, setI] = useState(0); const [ok, setOk] = useState(0); const [left, setLeft] = useState(60); const [started, setStarted] = useState(false);
  const win = useWin();
  useEffect(() => { if (!started || left <= 0) return; const t = setTimeout(() => setLeft(left - 1), 1000); return () => clearTimeout(t); }, [started, left]);
  const best = Number(localStorage.getItem('speedBest') ?? 0);
  if (!started) return <div><Back to="/games" /><h2>Speed round</h2><Card className="center"><p>60 วินาที ตอบให้ได้มากที่สุด (สถิติสูงสุด: {best})</p><button className="primary big" onClick={() => setStarted(true)}>เริ่ม!</button></Card></div>;
  if (left <= 0 || !pool[i]) {
    return <Done title={`ได้ ${ok} ข้อ ใน 60 วินาที ${ok > best ? '· สถิติใหม่!' : ''}`} onBack={() => { try { if (ok > best) localStorage.setItem('speedBest', String(ok)); } catch {} win(ok * 3); }} />;
  }
  const q = pool[i];
  return (
    <div>
      <Back to="/games" />
      <div className="row spread"><h2>เหลือ {left} วินาที</h2><b>ถูก {ok}</b></div>
      <Card><div className="stem">{q.stem.replace('___', '_____')}</div>
        <div className="opts">{q.options.map((o, k) => <button key={k} className="opt" onClick={() => { const r = k === q.answer; sfx(r ? 'ok' : 'no'); if (r) setOk(ok + 1); update((pp) => recordAnswer(pp, q, r)); setI(i + 1); }}>{o}</button>)}</div>
      </Card>
      <p className="muted small">เกมนี้ไม่โชว์เหตุผลเพื่อความเร็ว ข้อที่ผิดจะเข้าคิวทบทวนพร้อมคำอธิบายเต็ม ({p.attempts.length} ข้อที่เคยตอบทั้งหมด)</p>
    </div>
  );
}

function Done({ title, onBack }: { title: string; onBack: () => void }) {
  const [given, setGiven] = useState(false);
  useEffect(() => { if (!given) { setGiven(true); onBack(); } }, []);
  return <Card className="center"><h2>{title}</h2><div className="row center"><button onClick={() => location.reload()}>เล่นอีกรอบ</button><button className="primary" onClick={() => go('/games')}>เกมอื่น</button></div></Card>;
}
