import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useStore, skillStats, addXp, markDone, dateKey, defaultSettings } from './store';
import { blocksForDay, timeline, PHASES, reviewQueue, passChance, pickForSkill, weakestSkills, type Block } from './plan';
import { lessons, lessonById, readingById, clozeById, mocks, skills, skillName, practiceReadings, videos, standalonePool, practiceClozes } from './content';
import { Quiz } from './Quiz';
import { ReadingPractice, ClozePractice } from './Passage';
import { TwistCard, twistFromMcq } from './Twist';
import { HookScene } from './HookScene';
import { Pip } from './characters';
import { LineChart, DailyQuestion } from './Speak';
import { exportAll, importAll, idbSet } from './db';
import { Back, Card, Check, Icon, celebrate, go, rich } from './ui';
import { KIND_STYLE, LAND_THEME, tint } from './theme';
import { setSfx, sfx, HAS_SERVER } from './audio';
import { TRACKS, playMusic, type TrackId } from './music';
import { reducedMotion } from './motion';
import type { Beat } from './types';
import landFilms from '../content/land-films.json';

/* ---------------- Home ---------------- */
const BLOCK_INFO: Record<Block['kind'], { name: string; mins: number }> = {
  placement: { name: 'แบบทดสอบวัดระดับ (60 ข้อ)', mins: 60 },
  review: { name: 'ทบทวนข้อที่เคยพลาด', mins: 5 },
  lesson: { name: 'ด่านใหม่', mins: 10 },
  repair: { name: 'ซ่อมจุดอ่อน', mins: 10 },
  reading: { name: 'อ่าน', mins: 10 },
  speak: { name: 'พูด', mins: 10 },
  interview: { name: 'สัมภาษณ์จำลอง', mins: 10 },
  mock: { name: 'Mock 60 ข้อ 60 นาที', mins: 60 },
  boss: { name: 'บอสประจำสัปดาห์ (Cloze จับเวลา)', mins: 8 },
  game: { name: 'มินิเกม', mins: 10 },
  video: { name: 'คลิปเสริม', mins: 10 },
};

const CONTENTS: { path: string; label: string; note: string }[] = [
  { path: '/lessons', label: 'ด่านทั้งหมด', note: '28 ด่าน' },
  { path: '/daily', label: 'คำถามสัมภาษณ์วันนี้', note: 'ตอบ 1 ประโยคก็นับ' },
  { path: '/interview', label: 'ห้องสัมภาษณ์', note: 'กรรมการ 3 คน' },
  { path: '/speak', label: 'บันไดความกล้า', note: 'ฝึกพูดทีละขั้น' },
  { path: '/mocks', label: 'Mock exam', note: '60 ข้อ 60 นาที' },
  { path: '/review', label: 'ทบทวนข้อที่พลาด', note: 'ตามรอบ 1 3 7 16 วัน' },
  { path: '/twist', label: 'โจทย์พลิก', note: 'กฎเดิม หน้าตาใหม่' },
  { path: '/games', label: 'มินิเกม', note: 'เล่นเบา ๆ' },
  { path: '/readings', label: 'คลังบทอ่าน', note: 'Reading + Cloze' },
  { path: '/vocab', label: 'คลังศัพท์', note: 'คำที่เก็บไว้' },
  { path: '/videos', label: 'คลิปเสริม', note: 'ดูแล้วตอบ' },
  { path: '/cheatbook', label: 'สมุดโกง', note: 'การ์ดกฎ' },
  { path: '/map', label: 'แผนที่', note: '4 ดินแดน' },
  { path: '/plan', label: 'แผนถึงวันสอบ', note: 'รายวัน' },
  { path: '/stats', label: 'สถิติ', note: 'จุดแข็ง จุดอ่อน' },
  { path: '/learn', label: 'วิธีเรียนให้จำ', note: 'จากงานวิจัย' },
  { path: '/seniors', label: 'เรื่องเล่ารุ่นพี่', note: 'คลิป' },
  { path: '/settings', label: 'ตั้งค่า', note: 'เสียง ธีม วันสอบ' },
];

export function blockPath(b: Block) {
  switch (b.kind) {
    case 'placement': return '/placement';
    case 'review': return '/review';
    case 'lesson': return `/lesson/${b.ref}`;
    case 'repair': return `/repair/${b.skill}`;
    case 'reading': return `/reading/${b.ref}`;
    case 'speak': return b.step >= 5 ? '/interview' : `/speak/${b.step}`;
    case 'interview': return '/interview';
    case 'mock': return `/mock/${b.ref}`;
    case 'boss': return `/boss/${b.ref}`;
    case 'game': return '/games';
    case 'video': return '/videos';
  }
}

function blockLabel(b: Block) {
  if (b.kind === 'lesson') return lessonById(b.ref)?.title_th ?? b.ref;
  if (b.kind === 'reading') return readingById(b.ref)?.title ?? b.ref;
  if (b.kind === 'repair') return skillName(b.skill);
  if (b.kind === 'speak') return `บันไดขั้น ${b.step}`;
  return '';
}

const PIP_LINES = ['แค่ 2 นาที เดี๋ยวก็จบ', 'วันนี้ไม่ต้องเก่ง แค่เริ่ม', 'เตรียมโจทย์ไว้ 6 ข้อแล้ว', 'มีข้อพูดด้วย 1 ประโยค', 'แตะปุ่มเหลืองเลย'];
const WEEK = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
let arrived = false;

export function Home() {
  const { p, s } = useStore();
  const tl = timeline(s);
  const today = p.days[dateKey()]?.done ?? [];
  const ranToday = today.includes('quick-run');
  const blocks = blocksForDay(p, s);
  const reviewN = reviewQueue(p).length;
  const [arrive, setArrive] = useState(() => !arrived && !reducedMotion());
  useEffect(() => { arrived = true; const t = setTimeout(() => setArrive(false), 2600); return () => clearTimeout(t); }, []);
  const line = PIP_LINES[(tl.today + (p.runs?.length ?? 0)) % PIP_LINES.length];
  const monday = Date.now() - ((new Date().getDay() + 6) % 7) * 86400000;
  const week = WEEK.map((d, k) => {
    const key = dateKey(monday + k * 86400000);
    return { d, key, done: (p.days[key]?.done.length ?? 0) > 0, today: key === dateKey() };
  });
  const runsAll = p.runs?.length ?? 0;
  const bestCombo = Math.max(0, ...(p.runs ?? []).map((r) => r.best));
  return (
    <div className={`home ${arrive ? 'arrive' : ''}`} onPointerDown={() => arrive && setArrive(false)}>
      <section className="entry">
        <div className="entry-copy">
          <p className="kicker">{s.name ? `${s.name} ` : ''}{ranToday ? 'วันนี้ทำแล้ว เก่งมาก' : 'ไม่ต้องคิด ไม่ต้องเลือก'}</p>
          <h1 className="riso" data-text={ranToday ? 'ครบแล้ว\nวันนี้' : 'วันนี้\nเอาแค่\n2 นาที'}>
            {ranToday ? <><span>ครบแล้ว</span><span>วันนี้</span></> : <><span>วันนี้</span><span>เอาแค่</span><span>2 นาที</span></>}
          </h1>
          <p className="entry-sub">{ranToday ? 'จะเล่นอีกรอบก็ได้ หรือพักเลยก็ได้' : '6 ข้อไว ๆ กับพูด 1 ประโยค จบแล้วนับว่าวันนี้ทำแล้ว'}</p>
          <ol className="week" aria-label="สัปดาห์นี้">
            {week.map((w) => <li key={w.key} className={`${w.done ? 'done' : ''} ${w.today ? 'today' : ''}`}><span className="week-d">{w.d}</span><span className="week-box">{w.done && <Check size={16} />}</span></li>)}
          </ol>
        </div>
        <div className="entry-go">
          <button className={`go ${ranToday ? 'small' : ''}`} onClick={() => { sfx('tap'); go('/run'); }}>
            <span className="go-dots" aria-hidden="true" />
            <span className="go-face"><b>{ranToday ? 'อีกรอบ' : 'เริ่ม'}</b><small>2 นาที</small></span>
          </button>
          <div className="pip-perch" aria-hidden="true">
            <span className="pip-say">{ranToday ? 'วันนี้ครบแล้วนะ' : line}</span>
            <Pip size={92} mood={ranToday ? 'wow' : 'happy'} />
          </div>
        </div>
      </section>

      {ranToday && !today.includes('daily-q') && (
        <button className="dare wide" onClick={() => go('/daily')}>
          <span className="dare-text"><small>ท้าเล็ก ๆ 30 วินาที</small><b>ตอบคำถามสัมภาษณ์ 1 ข้อ</b><span>ไม่มีถูกผิด พูด 1 ประโยคก็นับ</span></span>
        </button>
      )}

      <section className="more">
        <h2 className="section-title"><span>ถ้ายังมีแรง</span><span>{runsAll ? `เล่นมาแล้ว ${runsAll} รอบ · คอมโบสูงสุด x${Math.min(4, bestCombo)}` : 'ไม่ทำก็ได้ ไม่หักอะไร'}</span></h2>
        <ol className="mission">
          {blocks.map((b) => {
            const done = today.includes(b.id);
            const info = BLOCK_INFO[b.kind];
            const sub = b.kind === 'review' ? (reviewN ? `${reviewN} ข้อถึงรอบ` : 'ฝึกจุดอ่อนแทน') : blockLabel(b);
            return (
              <li key={b.id}>
                <button className={`mission-row ${done ? 'done' : ''}`} style={tint(KIND_STYLE[b.kind].tint)} onClick={() => go(blockPath(b))}>
                  <span className="mark" aria-hidden="true" />
                  <span className="mission-main"><b>{info.name}</b>{sub && <span className="small muted">{sub}</span>}</span>
                  <span className="mins">{done ? <><Icon name="check" />เสร็จ</> : `${b.kind === 'review' ? 5 : info.mins} นาที`}</span>
                </button>
              </li>
            );
          })}
          {!p.placementDone && <li><button className="mission-row" onClick={() => go('/placement')}><span className="mark" aria-hidden="true" /><span className="mission-main"><b>วัดระดับ 60 ข้อ</b><span className="small muted">ทำเมื่อพร้อม ไม่บังคับ</span></span><span className="mins">60 นาที</span></button></li>}
        </ol>
      </section>

      <section className="contents">
        <h2 className="section-title"><span>สารบัญ</span><span>ทุกอย่างในแอป</span></h2>
        <ol className="toc">
          {CONTENTS.map((x, k) => <li key={x.path}><a href={`#${x.path}`}><span className="toc-n">{String(k + 1).padStart(2, '0')}</span><span className="toc-label">{x.label}</span><span className="toc-note">{x.note}</span></a></li>)}
        </ol>
      </section>

      <aside className="notice">
        กำหนดการทุนปี 2570 ยังไม่ประกาศ (ตรวจล่าสุด 12 พ.ย. 2569) รอบที่แล้วปิดรับสมัคร <b>31 ม.ค.</b> ต้องมีรหัสนักศึกษา AU ก่อนสมัครทุน
        เช็กที่ <a href="https://admissions.au.edu/?page_id=1327" target="_blank" rel="noreferrer">admissions.au.edu</a> หรือ LINE @abac · วันสอบที่ตั้งไว้ <b>{s.examDate}</b> เหลือ {tl.daysLeft} วัน (แก้ได้ใน <a href="#/settings">ตั้งค่า</a>)
      </aside>
    </div>
  );
}

export function DailyPage() {
  return <div className="daily-page"><Back /><DailyQuestion /></div>;
}

/* ---------------- Plan overview ---------------- */
export function PlanPage() {
  const { p, s } = useStore();
  const tl = timeline(s);
  const weeks = Array.from({ length: tl.weeks }, (_, w) => w);
  return (
    <div>
      <Back />
      <h2>แผนรายวันถึงวันสอบ ({s.examDate})</h2>
      <p className="muted">คำนวณย้อนจากวันสอบอัตโนมัติ ถ้าเปลี่ยนวันสอบในตั้งค่า แผนจะปรับเอง · วันอาทิตย์เป็นวันเบา (มินิเกม + คลิป) · วันเสาร์มีบอส</p>
      {weeks.map((w) => {
        const days = Array.from({ length: 7 }, (_, k) => w * 7 + k).filter((d) => d < tl.total);
        const ph = PHASES[tl.phaseOf(days[0]) - 1];
        return (
          <details key={w} open={Math.floor(tl.today / 7) === w}>
            <summary style={tint(LAND_THEME[tl.phaseOf(days[0])].accent)}><span className="mark" aria-hidden="true" /><b>สัปดาห์ {w + 1}</b> · {ph.name}</summary>
            <table className="plan"><tbody>{days.map((d) => {
              const date = new Date(tl.start + d * 86400000);
              const bs = d === tl.today || d > tl.today ? blocksForDay(p, s, d) : [];
              return <tr key={d} className={d === tl.today ? 'today' : ''}><td>{date.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                <td>{d < tl.today ? <span className="muted">ผ่านมาแล้ว{p.days[dateKey(date)]?.done.length ? ' · ทำแล้ว' : ''}</span> : bs.map((b) => blockLabel(b) || BLOCK_INFO[b.kind].name).join(' · ')}</td></tr>;
            })}</tbody></table>
          </details>
        );
      })}
    </div>
  );
}

/* ---------------- Map ---------------- */
const LAND_FILMS = landFilms as Beat[][];

export function MapPage() {
  const { p, s } = useStore();
  const tl = timeline(s);
  const wins = Object.values(p.bosses).filter((b) => b.won).length;
  const ph = tl.phaseOf(tl.today);
  const [film, setFilm] = useState<number | null>(null);
  const unlocked = (n: number) => n <= ph || wins >= (n - 1) * 2;
  const pts = [[80, 290], [210, 200], [345, 262], [466, 168], [590, 88]];
  const progress = Math.min(1, tl.today / tl.total);
  const route = `M${pts[0].join(' ')} C 140 260, 160 214, ${pts[1].join(' ')} S 300 282, ${pts[2].join(' ')} S 420 196, ${pts[3].join(' ')} S 556 112, ${pts[4].join(' ')}`;
  const routeRef = useRef<SVGPathElement>(null);
  const [you, setYou] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const el = routeRef.current;
    if (el) { const pt = el.getPointAtLength(progress * el.getTotalLength()); setYou({ x: pt.x, y: pt.y }); }
  }, [progress]);
  return (
    <div>
      <Back />
      <h2>แผนที่สู่ประตู AU</h2>
      <svg viewBox="0 0 660 380" className="map" role="img" aria-label="แผนที่ 4 ดินแดนสู่ประตู AU">
        <rect width="660" height="380" className="map-sky" />
        <path d="M0 330 Q 90 290 180 322 T 360 318 T 540 300 T 660 290 V 380 H 0 Z" className="map-hill back" />
        <path d="M0 352 Q 120 324 240 350 T 480 344 T 660 330 V 380 H 0 Z" className="map-hill" />
        <mask id="route-reveal"><path d={route} className="map-draw" pathLength={1} /></mask>
        <path ref={routeRef} d={route} className="map-route" mask="url(#route-reveal)" />
        {PHASES.map((x, i) => {
          const open = unlocked(x.n);
          return (
            <g key={x.n} className={`land ${open ? 'open' : 'locked'}`} onClick={() => open && setFilm(i)} style={{ cursor: open ? 'pointer' : 'default', '--i': i } as CSSProperties}>
              <circle cx={pts[i][0]} cy={pts[i][1]} r="34" fill={open ? LAND_THEME[x.n].accent : 'var(--line-strong)'} className="map-land" />
              <text x={pts[i][0]} y={pts[i][1] + 9} textAnchor="middle" className="map-num">{x.n}</text>
              <text x={pts[i][0]} y={pts[i][1] + 58} textAnchor="middle" className="map-label">{x.name}{open ? '' : ' (ล็อก)'}</text>
            </g>
          );
        })}
        <g className="land" style={{ '--i': 4 } as CSSProperties}>
          <rect x={pts[4][0] - 30} y={pts[4][1] - 40} width="60" height="68" rx="6" className="map-gate" />
          <text x={pts[4][0]} y={pts[4][1] + 2} textAnchor="middle" className="map-gate-text">AU</text>
          <text x={pts[4][0]} y={pts[4][1] + 50} textAnchor="middle" className="map-label small">ประตู AU</text>
          <text x={pts[4][0]} y={pts[4][1] + 68} textAnchor="middle" className="map-label small">{s.examDate}</text>
        </g>
        {you && <g transform={`translate(${you.x - 24} ${you.y - 76})`} aria-label="ตำแหน่งของเราวันนี้">
          <g className="map-pip"><Pip size={48} /></g>
        </g>}
      </svg>
      <p className="muted">ชนะบอสแล้ว {wins} ครั้ง · ชนะบอส 2 ครั้งปลดล็อกดินแดนถัดไปได้ก่อนกำหนด · แตะดินแดนเพื่อดูการ์ตูนเปิดดินแดน</p>
      {film !== null && <Card><HookScene key={film} title={`การ์ตูนเปิดดินแดน: ${PHASES[film].name}`} land={film + 1} beats={LAND_FILMS[film]} villain={['arti', 'knotto', 'boo', 'tikki'][film]} onDone={() => setFilm(null)} /></Card>}
      {PHASES.map((x) => <Card key={x.n} className="land-card" style={tint(LAND_THEME[x.n].accent)}><span className="mark" aria-hidden="true" /><b>{x.n}. {x.name}</b> <span className="muted small">({x.en})</span><div className="small">{x.desc}</div></Card>)}
    </div>
  );
}
export const LAND_FILM_BEATS = LAND_FILMS;

/* ---------------- Lists ---------------- */
export function LessonsList() {
  const { p } = useStore();
  return (
    <div>
      <Back />
      <h2>ด่านทั้งหมด ({lessons.length})</h2>
      {PHASES.slice(0, 3).map((ph) => (
        <div key={ph.n}>
          <h3 className="section-title" style={tint(LAND_THEME[ph.n].accent)}><span><span className="mark" aria-hidden="true" />{ph.name}</span></h3>
          <div className="grid2">{lessons.filter((l) => l.phase === ph.n).map((l) => (
            <Card key={l.id} onClick={() => go(`/lesson/${l.id}`)} className={`lesson-tile ${p.lessons[l.id]?.done ? 'done' : ''}`}>
              <span className="tile-n" aria-hidden="true">{l.id.slice(1)}</span>
              <span className="tile-main"><b>{l.title_th}</b><span className="small muted">{l.title_en}</span></span>
              {p.lessons[l.id]?.done && <span className="tile-stamp">ผ่าน</span>}
            </Card>))}</div>
        </div>
      ))}
    </div>
  );
}

export function ReadingsList() {
  const { p } = useStore();
  return (
    <div>
      <Back />
      <h2>คลังบทอ่าน ({practiceReadings.length} เรื่องสำหรับฝึก)</h2>
      <p className="muted">บทอ่านที่สงวนไว้สำหรับ mock จะไม่อยู่ในนี้ เพื่อให้ mock เป็นของใหม่จริง ๆ</p>
      <div className="grid2">{practiceReadings.map((r) => (
        <Card key={r.id} onClick={() => go(`/reading/${r.id}`)} className={p.readings[r.id] ? 'done' : ''}>
          <b>{r.title}</b><div className="small muted">{r.level} · {r.topic} · {r.questions.length} ข้อ {p.readings[r.id] ? `· ล่าสุด ${p.readings[r.id].score}%` : ''}</div>
        </Card>))}</div>
      <h3>Cloze สำหรับฝึก</h3>
      <div className="grid2">{practiceClozes.map((c) => <Card key={c.id} onClick={() => go(`/cloze/${c.id}`)}><b>{c.title}</b><div className="small muted">{c.level} · {c.genre}</div></Card>)}</div>
    </div>
  );
}

export function MocksList() {
  const { p } = useStore();
  return (
    <div>
      <Back />
      <h2>Mock exam ({mocks.length} ชุด)</h2>
      <p className="muted">แต่ละชุด 60 ข้อ 60 นาที โครงเหมือนข้อสอบจริง: Grammar cloze 3 เรื่อง × 10 + Reading 3 เรื่อง × 10 (แนวเดียวกับข้อสอบปี 2553 ที่แนบมา)</p>
      <p className="muted">ทุกชุดมี 10 แบบ ทุกครั้งที่เปิดจะสุ่มแบบใหม่ที่ไม่ซ้ำกับครั้งก่อน ลำดับเรื่อง ลำดับคำถามอ่าน และตำแหน่งตัวเลือกจะเปลี่ยน จึงจำตำแหน่งคำตอบไม่ได้ ต้องเข้าใจจริง</p>
      {mocks.map((m) => {
        const rs = p.mocks.filter((x) => x.id === m.id);
        return <Card key={m.id} onClick={() => go(`/mock/${m.id}`)}><b>{m.id} · {m.title}</b><div className="small muted">{rs.length ? `ทำแล้ว ${rs.length} ครั้ง · ล่าสุด ${rs[rs.length - 1].score}/${rs[rs.length - 1].total}` : 'ยังไม่เคยทำ'}</div></Card>;
      })}
    </div>
  );
}

/* ---------------- Review / Repair / Twist / Boss / Reading ---------------- */
export function ReviewPage() {
  const { p, update } = useStore();
  const [q] = useState(() => reviewQueue(p));
  const [items] = useState(() => (q.length ? q.map((x) => x.q) : weakestSkills(p).slice(0, 3).flatMap((sk) => pickForSkill(p, sk, 2)).slice(0, 5)));
  const [done, setDone] = useState(false);
  if (!items.length) return <div><Back /><Card>ยังไม่มีอะไรให้ทบทวน ไปเล่นด่านแรกก่อนเลย <button onClick={() => { update((pp) => markDone(pp, 'review')); go('/'); }}>โอเค</button></Card></div>;
  return (
    <div>
      <Back />
      <h2>ทบทวน {q.length ? '(ข้อที่เคยพลาด มาในประโยคใหม่ กฎเดิม)' : '(ยังไม่มีข้อถึงรอบ → ฝึกจุดอ่อน)'}</h2>
      {done ? <Card className="center"><h3>ทบทวนเสร็จแล้ว</h3><button className="primary" onClick={() => go('/')}>กลับภารกิจ</button></Card>
        : <Quiz items={items} srsKeys={q.length ? q.map((x) => x.key) : undefined} title="ทบทวน" onDone={() => { update((pp) => { markDone(pp, 'review'); addXp(pp, 20); }); setDone(true); }} />}
    </div>
  );
}

export function RepairPage({ skill }: { skill: string }) {
  const { p, update } = useStore();
  const [items] = useState(() => pickForSkill(p, skill, 8));
  const [phase, setPhase] = useState<'quiz' | 'twist' | 'done'>('quiz');
  const [tw] = useState(() => pickForSkill(p, skill, 2, items.map((x) => x.id)).map(twistFromMcq));
  const [ti, setTi] = useState(0);
  const l = lessons.find((x) => x.skill === skill);
  return (
    <div>
      <Back />
      <h2>ซ่อมจุดอ่อน: {skillName(skill)}</h2>
      {l && <Card className="rulecard"><b>ทวนกฎ:</b> {l.rule.line_th}<div className="muted small">{l.rule.memory_th}</div></Card>}
      {phase === 'quiz' && <Quiz items={items} title="ซ่อม" onDone={() => setPhase(tw.length ? 'twist' : 'done')} />}
      {phase === 'twist' && tw[ti] && <TwistCard key={ti} t={tw[ti]} onDone={() => (ti + 1 < tw.length ? setTi(ti + 1) : setPhase('done'))} />}
      {phase === 'done' && <Card className="center"><h3>ซ่อมเสร็จแล้ว</h3><button className="primary" onClick={() => { update((pp) => { markDone(pp, `repair-${skill}`); addXp(pp, 30); }); go('/'); }}>กลับภารกิจ</button></Card>}
    </div>
  );
}

export function TwistMode() {
  const { p } = useStore();
  const [list] = useState(() => {
    // learned lessons first; before any lesson is done, use everything
    const learned = lessons.filter((l) => p.lessons[l.id]?.done);
    const authored = (learned.length ? learned : lessons).flatMap((l) => l.twists);
    const derived = [...standalonePool].sort(() => Math.random() - 0.5).slice(0, 6).map(twistFromMcq);
    return [...authored.sort(() => Math.random() - 0.5).slice(0, 6), ...derived].sort(() => Math.random() - 0.5);
  });
  const [i, setI] = useState(0);
  const [ok, setOk] = useState(0);
  return (
    <div>
      <Back />
      <h2>โหมดโจทย์พลิก</h2>
      <p className="muted">กฎเดิม แต่หน้าตาโจทย์ไม่เหมือนเดิม: หาจุดผิด, เติมเอง, เรียงประโยค, จับคู่ ฝึกให้ไม่ยึดติดกับแบบ 4 ตัวเลือก ({i}/{list.length} · ถูก {ok})</p>
      {i < list.length ? <TwistCard key={i} t={list[i]} onDone={(r) => { if (r) setOk(ok + 1); setI(i + 1); }} />
        : <Card className="center"><h3>ครบ {list.length} ข้อ ถูก {ok}</h3><button onClick={() => location.reload()}>เล่นชุดใหม่</button></Card>}
    </div>
  );
}

export function BossPage({ id }: { id: string }) {
  const { update } = useStore();
  const c = clozeById(id);
  const [res, setRes] = useState<null | number>(null);
  if (!c) return <div><Back />ไม่พบบอส</div>;
  return (
    <div>
      <Back />
      <h2>บอสประจำสัปดาห์</h2><p className="muted">ชนะเมื่อถูก 8 จาก 10 ภายใน 8 นาที</p>
      {res === null ? <ClozePractice c={c} timed={480} onDone={(ok) => {
        const won = ok >= 8; setRes(ok);
        update((pp) => { pp.bosses[dateKey()] = { won, score: ok }; addXp(pp, won ? 150 : 40); markDone(pp, `boss-${id}`); });
        if (won) { celebrate(); sfx('level'); }
      }} />
        : <Card className="center"><h3>{res >= 8 ? `ชนะบอส! ${res}/10` : `บอสยังไม่ล้ม ${res}/10 ข้อที่พลาดเข้าคิวทบทวนแล้ว สัปดาห์หน้าเอาใหม่!`}</h3><button className="primary" onClick={() => go('/map')}>ดูแผนที่</button></Card>}
    </div>
  );
}

export function ReadingPage({ id }: { id: string }) {
  const { update } = useStore();
  const r = readingById(id);
  const [res, setRes] = useState<null | [number, number]>(null);
  if (!r || r.mock) return <div><Back />ไม่พบบทอ่าน</div>;
  return (
    <div>
      <Back />
      {res === null ? <ReadingPractice r={r} onDone={(ok, n) => {
        setRes([ok, n]);
        update((pp) => { pp.readings[id] = { score: Math.round((100 * ok) / n), t: Date.now() }; addXp(pp, 40); markDone(pp, `reading-${id}`); });
      }} />
        : <Card className="center"><h3>อ่านจบ: {res[0]}/{res[1]}</h3><p className="muted">คำถาม reference (he / this / them) คือหัวใจของพาร์ทนี้ ถ้าพลาดข้อแบบนี้ ลองย้อนอ่านประโยคก่อนหน้าคำนั้นเสมอ</p><button className="primary" onClick={() => go('/')}>กลับภารกิจ</button></Card>}
    </div>
  );
}

export function ClozePage({ id }: { id: string }) {
  const c = clozeById(id);
  const [res, setRes] = useState<null | number>(null);
  if (!c || c.mock) return <div><Back />ไม่พบ cloze</div>;
  return <div><Back />{res === null ? <ClozePractice c={c} onDone={(ok) => setRes(ok)} /> : <Card className="center"><h3>{res}/10</h3><button onClick={() => go('/readings')}>กลับ</button></Card>}</div>;
}

/* ---------------- Cheat book ---------------- */
export function CheatBook() {
  const { p } = useStore();
  const got = lessons.filter((l) => p.lessons[l.id]?.done);
  return (
    <div>
      <Back />
      <h2>สมุดโกง ({got.length}/{lessons.length} การ์ด)</h2>
      <p className="muted">การ์ดกฎปลดล็อกเมื่อผ่านด่าน เปิดทวนก่อนนอนหรือก่อนสอบ</p>
      <div className="grid2">{lessons.map((l) => p.lessons[l.id]?.done ? (
        <Card key={l.id} className="rulecard"><b>{l.title_th}</b> <span className="muted small">{l.title_en}</span>
          <p className="rule-line">{l.rule.line_th}</p><p className="memory">{l.rule.memory_th}</p>
          <ul className="small">{l.discover.examples.slice(0, 3).map((e, i) => <li key={i}>{rich(e)}</li>)}</ul>
          <div className="terms">{l.rule.terms.map(([en, th]) => <span key={en} className="term"><b>{en}</b> = {th}</span>)}</div>
        </Card>) : <Card key={l.id} className="locked"><b>{l.title_th}</b><div className="small muted">ผ่านด่าน {l.id} เพื่อปลดล็อก</div></Card>)}</div>
    </div>
  );
}

/* ---------------- Stats ---------------- */
export function Stats() {
  const { p } = useStore();
  const st = skillStats(p);
  const chance = passChance(p);
  const rows = skills.filter((k) => st[k.id]).map((k) => ({ k, ok: st[k.id].ok, n: st[k.id].n })).sort((a, b) => a.ok / a.n - b.ok / b.n);
  const ms = p.mocks;
  const chances = ms.map((_, i) => passChance({ ...p, mocks: ms.slice(0, i + 1) }) ?? 0);
  return (
    <div>
      <Back />
      <h2>สถิติ</h2>
      <Card>
        <h3>โอกาสผ่าน 80% {chance !== null ? `≈ ${chance}%` : ''}</h3>
        {ms.length ? <>
          <LineChart title="คะแนน mock (%) · เส้นแดง = 80%" pts={ms.map((m) => Math.round((100 * m.score) / m.total))} labels={ms.map((m) => m.id)} max={100} line={80} />
          <LineChart title="โอกาสผ่าน 80% (คำนวณจาก mock 3 ครั้งล่าสุด)" pts={chances} labels={ms.map((m) => m.id)} max={100} />
        </> : <p className="muted">ทำ mock ชุดแรกก่อน กราฟจะขึ้นที่นี่</p>}
      </Card>
      <Card>
        <h3>ความแม่นแยกตามกฎ (40 ข้อล่าสุดต่อกฎ, อ่อนสุดอยู่บน)</h3>
        {!rows.length && <p className="muted">ยังไม่มีข้อมูล</p>}
        <table className="skills"><tbody>{rows.map(({ k, ok, n }) => (
          <tr key={k.id}><td>{k.name_th}</td><td>{ok}/{n}</td><td style={{ width: '45%' }}><div className="bar"><div style={{ width: `${(100 * ok) / n}%`, background: ok / n >= 0.9 ? 'var(--ok)' : ok / n >= 0.7 ? 'var(--warn)' : 'var(--no)' }} /></div></td></tr>
        ))}</tbody></table>
      </Card>
      <Card><h3>XP รายวัน</h3><LineChart title="XP 14 วันล่าสุด" pts={Array.from({ length: 14 }, (_, i) => p.days[dateKey(Date.now() - (13 - i) * 86400000)]?.xp ?? 0)} labels={Array.from({ length: 14 }, (_, i) => dateKey(Date.now() - (13 - i) * 86400000).slice(8))} /></Card>
    </div>
  );
}

/* ---------------- Settings ---------------- */
export function SettingsPage() {
  const { s, setSettings } = useStore();
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<{ mlxWhisper: boolean; elevenlabs: boolean; routerKey: boolean } | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { if (HAS_SERVER) fetch('/api/status').then((r) => r.json()).then((d) => { setModels(d.routerModels); setStatus(d); }).catch(() => setStatus(null)); }, []);
  const tl = timeline(s);
  return (
    <div>
      <Back />
      <h2>ตั้งค่า</h2>
      <div className="settings stagger">
      <Card>
        <h3>ข้อมูลของฉัน</h3>
        <label className="field">ชื่อเล่น <input value={s.name} onChange={(e) => setSettings({ name: e.target.value })} /></label>
        <label className="field">วันสอบ (แก้ได้เมื่อ AU ประกาศ) <input type="date" value={s.examDate} onChange={(e) => e.target.value && setSettings({ examDate: e.target.value })} /></label>
        <label className="field">วันเริ่มแผน <input type="date" value={s.startDate} onChange={(e) => e.target.value && setSettings({ startDate: e.target.value })} /></label>
        <p className="small muted">แผนตอนนี้: {tl.total} วัน ({tl.weeks} สัปดาห์) · ปูพื้น {tl.p1} วัน · ไวยากรณ์+อ่าน {tl.p4Start - tl.p1} วัน · สนามจริง {tl.total - tl.p4Start} วัน</p>
      </Card>
      <Card>
        <h3>หน้าตาและเสียง</h3>
        <label className="field">ธีม <select value={s.theme} onChange={(e) => setSettings({ theme: e.target.value as never })}><option value="auto">ตามเครื่อง</option><option value="light">สว่าง</option><option value="dark">มืด</option></select></label>
        <label className="check"><input type="checkbox" checked={s.sfx} onChange={(e) => { setSettings({ sfx: e.target.checked }); setSfx(e.target.checked); }} /> เสียงเอฟเฟกต์</label>
      </Card>
      <Card>
        <h3>เสียงประกอบตอนเรียน</h3>
        <label className="check"><input type="checkbox" checked={s.music} onChange={(e) => setSettings({ music: e.target.checked })} /> เปิดเสียงประกอบ</label>
        <div className="sound-list" role="radiogroup" aria-label="แนวเสียง">
          {(Object.keys(TRACKS) as TrackId[]).map((id) => (
            <label key={id} className={`sound ${s.musicTrack === id ? 'on' : ''}`}>
              <input type="radio" name="track" checked={s.musicTrack === id} onChange={() => setSettings({ musicTrack: id, music: true })} />
              <span><b>{TRACKS[id].name_th}</b><span className="small muted">{TRACKS[id].note_th}</span></span>
            </label>
          ))}
        </div>
        <label className="field">ความดัง <input type="range" min="0.05" max="1" step="0.05" value={s.musicVol} onChange={(e) => setSettings({ musicVol: Number(e.target.value) })} /></label>
        <p className="small muted">ทุกแนวไม่มีเนื้อร้อง เพราะงานวิจัยพบว่าเนื้อร้องรบกวนการอ่าน ส่วนดนตรีบรรเลงเบา ๆ แทบไม่รบกวน เสียงจะเงียบเองตอนอัดเสียงพูด เพลงไม่ได้ทำให้ฉลาดขึ้นโดยตรง แต่ช่วยให้นั่งเรียนได้นานขึ้นถ้าเราชอบ อ่านเพิ่มที่ <a href="#/learn">วิธีเรียนให้จำ</a></p>
      </Card>
      <Card>
        <h3>เสียงและ AI</h3>
        <label className="field">ระบบถอดเสียงพูด <select value={s.stt} onChange={(e) => setSettings({ stt: e.target.value as never })}>
          <option value="auto">อัตโนมัติ (ในเครื่องก่อน)</option><option value="local">MLX Whisper ในเครื่อง {status?.mlxWhisper ? '(พร้อม)' : '(ไม่พบ)'}</option>
          <option value="eleven">ElevenLabs Speech-to-Text {status?.elevenlabs ? '(พร้อม)' : '(ไม่มี key)'}</option><option value="webspeech">Web Speech ของเบราว์เซอร์</option></select></label>
        <label className="field">โมเดล AI สำหรับสัมภาษณ์/ผลตอบกลับ (9Router) <select value={s.aiModel} onChange={(e) => setSettings({ aiModel: e.target.value })}>
          <option value="">ไม่ใช้ AI (ใช้ชุดคำถามที่เตรียมไว้)</option>{models.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
        {!models.length && <p className="small muted">ไม่พบ 9Router ที่ localhost:20128 แอปยังใช้ได้ครบโดยไม่ต้องมี AI</p>}
        {models.length > 0 && status && !status.routerKey && <p className="small no-text">9Router ต้องใช้ API key: คัดลอกจากหน้า dashboard ของ 9Router แล้วเพิ่มบรรทัด NINEROUTER_API_KEY=... ในไฟล์ .env แล้วรัน npm run dev ใหม่ (ระหว่างนี้แอปใช้ชุดคำถามที่เตรียมไว้)</p>}
        <label className="field">ภาษาห้องสัมภาษณ์ <select value={s.interviewLang} onChange={(e) => setSettings({ interviewLang: e.target.value as never })}><option value="en">อังกฤษ (หลัก)</option><option value="th">ไทย (ชุดสำรอง)</option></select></label>
      </Card>
      <Card>
        <h3>สำรองข้อมูล</h3>
        <div className="row">
          <button onClick={async () => { const blob = new Blob([await exportAll()], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `au-quest-backup-${dateKey()}.json`; a.click(); }}>Export</button>
          <label className="button">Import <input type="file" accept=".json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { await importAll(await f.text()); setMsg('นำเข้าแล้ว กำลังโหลดใหม่…'); setTimeout(() => location.reload(), 800); } catch (err) { setMsg((err as Error).message); } }} /></label>
          <button className="danger" onClick={async () => { if (confirm('ล้างความคืบหน้าทั้งหมด? (export ไว้ก่อนนะ)')) { await idbSet('progress', undefined); await idbSet('settings', defaultSettings()); location.reload(); } }}>ล้างข้อมูล</button>
        </div>
        {msg && <p>{msg}</p>}
      </Card>
      </div>
    </div>
  );
}

/* ---------------- Seniors ---------------- */
export function Seniors() {
  const v = videos.senior;
  return (
    <div>
      <Back />
      <h2>เรื่องเล่ารุ่นพี่</h2>
      <Card>
        <div className="video"><iframe src={`https://www.youtube-nocookie.com/embed/${v.id}?cc_load_policy=1&cc_lang_pref=th`} title={v.title} allowFullScreen /></div>
        <b>{v.title}</b> <span className="muted small">· {v.channel} · {v.duration} · ตรวจ {v.checked}</span>
        <p className="note">{v.note_th}</p>
      </Card>
    </div>
  );
}

export function useTheme() {
  const { s } = useStore();
  useEffect(() => { document.documentElement.dataset.theme = s.theme; setSfx(s.sfx); }, [s.theme, s.sfx]);
  useEffect(() => { playMusic(s.music ? s.musicTrack : null, s.musicVol); }, [s.music, s.musicTrack, s.musicVol]);
}
