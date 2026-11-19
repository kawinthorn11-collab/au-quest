import { Fragment, useEffect, useState } from 'react';
import { Quiz } from './Quiz';
import { rich, fmtTime } from './ui';
import type { Cloze, Reading } from './types';

/** Cloze text with numbered blanks "(1)". `fills` shows chosen words; `focus` highlights the current blank. */
export function ClozeText({ c, focus, fills = {} }: { c: Cloze; focus?: number; fills?: Record<number, string> }) {
  const parts = c.text.split(/(\(\d+\))/g);
  return (
    <div className="passage cloze-text">
      {parts.map((p, i) => {
        const m = p.match(/^\((\d+)\)$/);
        if (!m) return <Fragment key={i}>{p.split('\n').map((line, k) => <Fragment key={k}>{k > 0 && <br />}{line}</Fragment>)}</Fragment>;
        const n = Number(m[1]);
        return <span key={i} className={`blank ${focus === n ? 'focus' : ''}`}>{fills[n] ? <b>{fills[n]}</b> : `__(${n})__`}</span>;
      })}
    </div>
  );
}

/** Reading passage printed like the exam: line numbers every 5 lines, key words in bold. */
export function ReadingText({ r }: { r: Reading }) {
  return (
    <div className="passage reading-text">
      {r.lines.map((l, i) => (
        <div key={i} className="rline"><span className="lno">{(i + 1) % 5 === 0 ? i + 1 : ''}</span><span>{rich(l)}</span></div>
      ))}
    </div>
  );
}

export function Timer({ start, limit }: { start: number; limit?: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const el = (now - start) / 1000;
  return <span className={`timer ${limit && el > limit ? 'over' : ''}`}>{fmtTime(el)}{limit ? ` / ${fmtTime(limit)}` : ''}</span>;
}

export function ClozePractice({ c, onDone, timed }: { c: Cloze; onDone: (score: number, total: number) => void; timed?: number }) {
  const [start] = useState(Date.now());
  const [cur, setCur] = useState(0);
  return (
    <div className="split">
      <div className="sticky">
        <div className="row spread"><h3>{c.title}</h3>{timed && <Timer start={start} limit={timed} />}</div>
        <ClozeText c={c} focus={Number(c.items[cur]?.stem.match(/\((\d+)\)/)?.[1])} />
      </div>
      <Quiz items={c.items} title="Cloze" onDone={onDone} onIndex={setCur} />
    </div>
  );
}

export function ReadingPractice({ r, onDone }: { r: Reading; onDone: (score: number, total: number) => void }) {
  const [start] = useState(Date.now());
  return (
    <div className="split">
      <div className="sticky">
        <div className="row spread"><h3>{r.title}</h3><Timer start={start} limit={r.questions.length * 60} /></div>
        <ReadingText r={r} />
      </div>
      <Quiz items={r.questions} title="Reading" onDone={onDone} />
    </div>
  );
}
