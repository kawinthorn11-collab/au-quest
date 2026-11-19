import { mockSections, VARIANTS } from '../src/Mock';
import { mocks, clozeById, readingById } from '../src/content';

const assert = (ok: unknown, msg: string) => { if (!ok) throw new Error(msg); };
for (const m of mocks) {
  const base = mockSections(m.id, 1).flatMap((s) => s.items);
  const sigs = new Set<string>();
  for (let v = 1; v <= VARIANTS; v++) {
    const secs = mockSections(m.id, v);
    const items = secs.flatMap((s) => s.items);
    assert(items.length === base.length, `${m.id} v${v} keeps all ${base.length} items`);
    assert(secs.slice(0, 3).every((s) => s.kind === 'cloze'), `${m.id} v${v} Part I stays first`);
    for (const q of items) {
      const orig = [...(clozeById(q.id.split('-').slice(0, 2).join('-'))?.items ?? []), ...(readingById(q.id.split('-').slice(0, 2).join('-'))?.questions ?? [])].find((x) => x.id === q.id)!;
      assert(orig, `${q.id} found`);
      assert(q.options[q.answer] === orig.options[orig.answer], `${m.id} v${v} ${q.id} answer text kept`);
      assert(q.why_wrong[q.answer] === null, `${m.id} v${v} ${q.id} why_wrong aligned`);
    }
    for (const s of secs.filter((x) => x.kind === 'cloze')) assert(s.items.map((q) => q.id).join() === clozeById(s.id)!.items.map((q) => q.id).join(), `${m.id} v${v} cloze blanks keep passage order`);
    assert(mockSections(m.id, v).flatMap((s) => s.items.map((q) => q.options.join('|'))).join() === items.map((q) => q.options.join('|')).join(), `${m.id} v${v} is stable`);
    sigs.add(items.map((q) => `${q.id}:${q.answer}`).join());
  }
  assert(sigs.size === VARIANTS, `${m.id} has ${VARIANTS} distinct variants`);
}
console.log(`mock variant tests passed: ${mocks.length} mocks x ${VARIANTS}`);
