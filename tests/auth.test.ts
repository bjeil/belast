import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/lib/sha256';

describe('sha256', () => {
  it('hasher kjent verdi riktig', async () => {
    // sha256("Belast2026") – samme verdi som er hardkodet i auth.ts
    expect(await sha256Hex('Belast2026')).toBe(
      '91346aa7a88f13032c90d6a4775d0448f7fbbb48accbf25b815d9c3f66572e23'
    );
  });

  it('er deterministisk', async () => {
    expect(await sha256Hex('abc')).toBe(await sha256Hex('abc'));
    expect(await sha256Hex('abc')).not.toBe(await sha256Hex('abd'));
  });
});
