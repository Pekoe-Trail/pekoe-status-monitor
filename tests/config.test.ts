import { describe, expect, it } from 'vitest';
import { loadConfig } from '../scripts/lib/config.ts';

describe('config/systems.yml', () => {
  const config = loadConfig();

  it('is valid', () => {
    expect(config.systems.length).toBeGreaterThan(0);
  });

  it('only checks HTTPS addresses', () => {
    for (const { check } of config.systems) {
      const url = check.type === 'http' ? check.url : check.baseUrl;
      expect(url.startsWith('https://'), url).toBe(true);
    }
  });
});
