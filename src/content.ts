// All content is bundled at build time, so lessons and mocks work offline.
import type { Lesson, Cloze, Reading, Mock, Interview, Shadow, Skill, VideoFile, MCQ } from './types';
import skillsJson from '../content/skills.json';
import mocksJson from '../content/mocks.json';
import interviewJson from '../content/interview.json';
import shadowJson from '../content/shadowing.json';
import videosJson from '../content/videos.json';

const pick = <T,>(mods: Record<string, unknown>) =>
  Object.keys(mods).sort().map((k) => (mods[k] as { default: T }).default);

export const lessons: Lesson[] = pick<Lesson>(import.meta.glob('../content/lessons/*.json', { eager: true }));
export const clozes: Cloze[] = pick<Cloze>(import.meta.glob('../content/cloze/*.json', { eager: true }));
export const readings: Reading[] = pick<Reading>(import.meta.glob('../content/reading/*.json', { eager: true }));
export const mocks = mocksJson as Mock[];
export const interview = interviewJson as Interview;
export const shadowing = shadowJson as Shadow[];
export const skills = skillsJson as Skill[];
export const videos = videosJson as VideoFile;

export const lessonById = (id: string) => lessons.find((l) => l.id === id);
export const clozeById = (id: string) => clozes.find((c) => c.id === id);
export const readingById = (id: string) => readings.find((r) => r.id === id);
export const skillName = (id: string) => skills.find((s) => s.id === id)?.name_th ?? id;

// Practice pools exclude passages reserved for mock exams.
export const practiceClozes = clozes.filter((c) => !c.mock);
export const practiceReadings = readings.filter((r) => !r.mock);

/** Every multiple-choice item that may appear in practice/review (mock items excluded). */
export const practicePool: MCQ[] = [
  ...lessons.flatMap((l) => l.questions),
  ...practiceClozes.flatMap((c) => c.items),
  ...practiceReadings.flatMap((r) => r.questions),
];
export const standalonePool: MCQ[] = lessons.flatMap((l) => l.questions); // items that make sense without a passage

export const levelRank = { A2: 1, B1: 2, B2: 3 } as const;
