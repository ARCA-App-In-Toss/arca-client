import { z } from 'zod';
import { DRAFT_TTL_MS } from '../drafts/draftRepository.ts';
import { LocalPersistenceFailure } from '../failures.ts';
import type { JournalPort, ManifestScope } from '../ports/storage.ts';

const zInput = z.union([
  z.object({
    mode: z.literal('CREATE'),
    dailySemaId: z.string().min(1),
    semaId: z.string().min(1),
    questionId: z.string().min(1),
  }),
  z.object({ mode: z.literal('UPDATE'), answerId: z.string().min(1) }),
  z.object({ mode: z.literal('DELETE'), answerId: z.string().min(1) }),
]);
const zPending = z.object({ input: zInput, content: z.string().nullable(), lastModifiedAt: z.number() });
export type PendingAnswer = z.output<typeof zPending>;
export class AnswerWriteStore {
  private readonly deps: {
    journal: JournalPort;
    area: () => ManifestScope | null;
    namespace?: 'create' | 'answer';
    now?: () => number;
  };
  constructor(deps: {
    journal: JournalPort;
    area: () => ManifestScope | null;
    namespace?: 'create' | 'answer';
    now?: () => number;
  }) {
    this.deps = deps;
  }
  private prefix() {
    return `pending-answer:${this.deps.namespace ?? 'create'}:`;
  }
  private area() {
    const area = this.deps.area();
    if (!area) throw new LocalPersistenceFailure('unreadable');
    return area;
  }
  async get(target: string): Promise<PendingAnswer | null> {
    const area = this.area();
    const raw = await this.deps.journal.getRecord(area, this.prefix() + target);
    if (raw === null) return null;
    const p = zPending.safeParse(raw);
    if (!p.success) throw new LocalPersistenceFailure('corrupt');
    if ((this.deps.now?.() ?? Date.now()) >= p.data.lastModifiedAt + DRAFT_TTL_MS) {
      await this.deps.journal.removeRecord(area, this.prefix() + target);
      return null;
    }
    return p.data;
  }
  async put(target: string, pending: PendingAnswer) {
    const area = this.area();
    await this.deps.journal.putRecord(area, this.prefix() + target, pending);
    const read = await this.deps.journal.getRecord(area, this.prefix() + target);
    if (JSON.stringify(read) !== JSON.stringify(pending)) throw new LocalPersistenceFailure('read-back');
  }
  async purgeExpired(): Promise<void> {
    const area = this.area();
    const manifest = await this.deps.journal.readManifest(area);
    const now = this.deps.now?.() ?? Date.now();
    for (const name of Object.keys(manifest?.entries ?? {})) {
      if (!name.startsWith(this.prefix())) continue;
      const parsed = zPending.safeParse(await this.deps.journal.getRecord(area, name));
      if (parsed.success && now >= parsed.data.lastModifiedAt + DRAFT_TTL_MS)
        await this.deps.journal.removeRecord(area, name);
    }
  }
  remove(target: string) {
    return this.deps.journal.removeRecord(this.area(), this.prefix() + target);
  }
}
