import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** Every `HOMEGANTRY_*` option the server reads, from `server/config.ts`. */
function configOptions(): string[] {
  const source = fs.readFileSync(path.resolve('server/config.ts'), 'utf-8');
  return [
    ...new Set([...source.matchAll(/env[A-Za-z]+\('(HOMEGANTRY_[A-Z_]+)'/g)].map((m) => m[1]!)),
  ];
}

describe('.env.example', () => {
  const example = fs.readFileSync(path.resolve('.env.example'), 'utf-8');
  const listed = new Set(
    example
      .split('\n')
      .map((line) => /^([A-Z_]+)=/.exec(line)?.[1])
      .filter((name): name is string => !!name),
  );

  it('finds the options in server/config.ts', () => {
    expect(configOptions()).toContain('HOMEGANTRY_ICON_SOURCE');
  });

  it.each(configOptions())('lists %s', (name) => {
    expect(listed.has(name), name).toBe(true);
  });
});
