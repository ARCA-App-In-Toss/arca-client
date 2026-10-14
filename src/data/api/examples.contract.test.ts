import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import type { ZodType } from 'zod';
import * as wire from './generated/zod.gen.ts';

const { cases } = JSON.parse(
  readFileSync(new URL('../../../.claude/spec/contract_examples.json', import.meta.url), 'utf8'),
) as { cases: { name: string; schema: string; valid: boolean; value: unknown }[] };
const validators = wire as unknown as Record<string, ZodType>;
test.each(cases)('$schema: $name', (c) => {
  expect(validators[`z${c.schema}`]?.safeParse(c.value).success).toBe(c.valid);
});
