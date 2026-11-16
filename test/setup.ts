// Make every test file start from a clean, deterministic environment:
// no HOMEGANTRY_* variables leak in from the developer's shell or CI.
for (const key of Object.keys(process.env)) {
  if (key.startsWith('HOMEGANTRY_')) delete process.env[key];
}
