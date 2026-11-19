import { useEffect, useRef, useState } from 'react';
import { useStore, level } from './store';
import { timeline, PHASES } from './plan';
import { applyLand } from './theme';
import { Home, DailyPage, MapPage, PlanPage, LessonsList, ReadingsList, MocksList, ReviewPage, RepairPage, TwistMode, BossPage, ReadingPage, ClozePage, CheatBook, Stats, SettingsPage, Seniors, useTheme } from './pages';
import { LessonPlayer } from './Lesson';
import { MockExam } from './Mock';
import { SpeakHub, Survival, Calm, VoiceProgress } from './Speak';
import { InterviewRoom } from './Interview';
import { Builder } from './Builder';
import { VideosPage, VideoPage, VocabPage } from './Videos';
import { GamesPage } from './Games';
import { LearnPage } from './Learn';
import { QuickRun } from './QuickRun';
import { celebrate, go } from './ui';
import { reducedMotion } from './motion';

function useHash() {
  const [h, setH] = useState(location.hash.slice(1) || '/');
  useEffect(() => {
    const f = () => {
      setH(location.hash.slice(1) || '/'); window.scrollTo(0, 0);
      const still = reducedMotion();
      document.querySelector('main.wrap')?.animate(
        still ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
        { duration: still ? 150 : 320, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    };
    addEventListener('hashchange', f); return () => removeEventListener('hashchange', f);
  }, []);
  return h;
}

/** Level chip that floats every real XP gain above the header, and celebrates once when the level goes up. */
function XpChip({ xp }: { xp: number }) {
  const prev = useRef(xp);
  const [gain, setGain] = useState<{ n: number; up: number | null; id: number } | null>(null);
  useEffect(() => {
    const before = prev.current; prev.current = xp;
    if (xp <= before) { setGain(null); return; }
    const up = level(xp) > level(before) ? level(xp) : null;
    setGain({ n: xp - before, up, id: Date.now() });
    if (up) celebrate();
    const t = setTimeout(() => setGain(null), up ? 3200 : 1800);
    return () => clearTimeout(t);
  }, [xp]);
  return (
    <>
      <span className={`lv ${gain ? 'bump' : ''}`} key={`lv${gain?.id ?? ''}`}>Lv.{level(xp)} · {xp} XP</span>
      {gain && <div className={`xp-toast ${gain.up ? 'level-up' : ''}`} key={gain.id} role="status">
        <span>+{gain.n} XP</span>{gain.up && <b>เลเวลอัป! Lv.{gain.up}</b>}
      </div>}
    </>
  );
}

export default function App() {
  const { ready, p, s, setSettings } = useStore();
  const h = useHash();
  useTheme();
  const tl = timeline(s);
  const land = tl.phaseOf(tl.today);
  useEffect(() => applyLand(land), [land]);
  const route = (h.split('/')[1] || 'home').replace(/[^a-z-]/g, '');
  useEffect(() => { document.documentElement.dataset.route = route; }, [route]);
  if (!ready) return <div className="center pad">กำลังโหลด…</div>;
  const [, a, b] = h.split('/');
  const nav = (path: string, label: string) => <button className={a === path ? 'on' : ''} aria-current={a === path ? 'page' : undefined} onClick={() => go(`/${path}`)}>{label}</button>;
  let page;
  switch (a) {
    case '': page = <Home />; break;
    case 'run': page = <QuickRun />; break;
    case 'daily': page = <DailyPage />; break;
    case 'placement': page = <MockExam id="M01" placement />; break;
    case 'map': page = <MapPage />; break;
    case 'plan': page = <PlanPage />; break;
    case 'lessons': page = <LessonsList />; break;
    case 'lesson': page = <LessonPlayer key={b} id={b} />; break;
    case 'readings': page = <ReadingsList />; break;
    case 'reading': page = <ReadingPage key={b} id={b} />; break;
    case 'cloze': page = <ClozePage key={b} id={b} />; break;
    case 'mocks': page = <MocksList />; break;
    case 'mock': page = <MockExam key={b} id={b} />; break;
    case 'review': page = <ReviewPage />; break;
    case 'repair': page = <RepairPage key={b} skill={b} />; break;
    case 'twist': page = <TwistMode />; break;
    case 'boss': page = <BossPage key={b} id={b} />; break;
    case 'speak': page = <SpeakHub key={b} step={b ? Number(b) : undefined} />; break;
    case 'interview': page = <InterviewRoom />; break;
    case 'builder': page = <Builder />; break;
    case 'survival': page = <Survival />; break;
    case 'calm': page = <Calm />; break;
    case 'voice-progress': page = <VoiceProgress />; break;
    case 'videos': page = <VideosPage />; break;
    case 'video': page = <VideoPage key={b} id={b} />; break;
    case 'vocab': page = <VocabPage />; break;
    case 'games': page = <GamesPage key={b} id={b} />; break;
    case 'cheatbook': page = <CheatBook />; break;
    case 'stats': page = <Stats />; break;
    case 'settings': page = <SettingsPage />; break;
    case 'learn': page = <LearnPage />; break;
    case 'seniors': page = <Seniors />; break;
    default: page = <Home />;
  }
  return (
    <>
      <header className="top">
        <div className="brand-row">
          <button className="brand" onClick={() => go('/')}><span className="brand-mark" aria-hidden="true" />AU Quest</button>
          <button className="land-link" onClick={() => go('/map')} title={PHASES[land - 1].en}><span className="mark" />{PHASES[land - 1].name}</button>
        </div>
        <nav>
          {nav('map', 'แผนที่')}
          {nav('speak', 'พูด')}
          {nav('vocab', 'คลังศัพท์')}
          {nav('settings', 'ตั้งค่า')}
          <button className={`sound-toggle ${s.music ? 'on' : ''}`} aria-pressed={s.music} title={s.music ? 'ปิดเสียงประกอบ' : 'เปิดเสียงประกอบ'} onClick={() => setSettings({ music: !s.music })}>
            <span className="eq" aria-hidden="true"><i /><i /><i /></span><span className="sr">เสียงประกอบ</span>
          </button>
          <XpChip xp={p.xp} />
        </nav>
      </header>
      <main className="wrap">{page}</main>
    </>
  );
}
