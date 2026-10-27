import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/lib/sha256';

describe('sha256', () => {
  it('hasher kjent verdi riktig', async () => {
    // sha256("Viking1899") – samme verdi som er hardkodet i auth.ts
    expect(await sha256Hex('Viking1899')).toBe(
      'f02412662c4ea691b66f25b45cc84a80f8b4f335eafb3a6c1b493eb382f47f27'
    );
  });

  it('er deterministisk', async () => {
    expect(await sha256Hex('abc')).toBe(await sha256Hex('abc'));
    expect(await sha256Hex('abc')).not.toBe(await sha256Hex('abd'));
  });
});
