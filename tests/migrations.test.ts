import { describe, expect, it } from 'vitest';
import { mapLegacyActivities, mapLegacyActivityKey } from '../src/lib/migrations';

describe('mapLegacyActivityKey', () => {
  it('mapper sonelag-nøkler til akademi', () => {
    expect(mapLegacyActivityKey('kamp_sonelag')).toBe('kamp_akademi');
    expect(mapLegacyActivityKey('trening_sonelag')).toBe('trening_akademi');
  });

  it('lar andre nøkler være urørt', () => {
    expect(mapLegacyActivityKey('kamp_hana')).toBe('kamp_hana');
    expect(mapLegacyActivityKey('egentrening')).toBe('egentrening');
    expect(mapLegacyActivityKey('hviledag')).toBe('hviledag');
    expect(mapLegacyActivityKey('styrketrening')).toBe('styrketrening');
  });
});

describe('mapLegacyActivities', () => {
  it('mapper alle aktiviteter i en liste', () => {
    const { activities, changed } = mapLegacyActivities(['kamp_sonelag', 'egentrening']);
    expect(activities).toEqual(['kamp_akademi', 'egentrening']);
    expect(changed).toBe(true);
  });

  it('fjerner duplikater som oppstår ved mapping', () => {
    const { activities, changed } = mapLegacyActivities(['kamp_sonelag', 'kamp_akademi']);
    expect(activities).toEqual(['kamp_akademi']);
    expect(changed).toBe(true);
  });

  it('rapporterer changed=false når ingenting må mappes', () => {
    const { activities, changed } = mapLegacyActivities(['trening_hana', 'hviledag']);
    expect(activities).toEqual(['trening_hana', 'hviledag']);
    expect(changed).toBe(false);
  });
});
