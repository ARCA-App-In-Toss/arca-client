import { describe, expect, test } from 'vitest';
import { measureAnswer } from '../text/graphemes.ts';
import { checkNickname } from '../text/nickname.ts';

describe('backend content limits', () => {
  test('answer preserves whitespace and permits whitespace-only content', () => {
    expect(measureAnswer('   ').savable).toBe(true);
    expect(measureAnswer('').savable).toBe(false);
  });
  test('2000 graphemes is valid and 2001 is refused', () => {
    expect(measureAnswer('가'.repeat(2000)).savable).toBe(true);
    expect(measureAnswer('가'.repeat(2001)).savable).toBe(false);
  });
  test('15000-code-point bound applies even for a single combined grapheme', () => {
    expect(measureAnswer(`a${'\u0301'.repeat(15000)}`).savable).toBe(false);
  });
  test('nickname UTF-16 bound is applied in addition to grapheme bound', () => {
    expect(checkNickname(`a${'\u0301'.repeat(255)}b`).error).toBe('too-long');
  });
});
