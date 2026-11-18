// Automatic checks. GitHub runs these before every publish;
// if any fail, the live site is left untouched.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const test = async (name, fn) => {
  try { await fn(); console.log('  ✓ ' + name); }
  catch (e) { failures++; console.log('  ✗ ' + name + '\n      ' + e.message); }
};

for (const app of ['', 'beta']) {
  const dir = join(root, app);
  if (!existsSync(join(dir, 'index.html'))) continue;
  console.log(`\n${app || 'live'} version`);

  await test('every JavaScript file is valid', () => {
    for (const f of readdirSync(join(dir, 'js')).filter(f => f.endsWith('.js'))) {
      execFileSync(process.execPath, ['--check', join(dir, 'js', f)], { stdio: 'pipe' });
    }
  });

  await test('index.html points at files that exist', () => {
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    for (const [, ref] of html.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)) {
      assert.ok(existsSync(join(dir, ref)), 'missing ' + ref);
    }
  });

  await test('relative imports between modules resolve', () => {
    for (const f of readdirSync(join(dir, 'js')).filter(f => f.endsWith('.js'))) {
      const src = readFileSync(join(dir, 'js', f), 'utf8');
      for (const [, ref] of src.matchAll(/from\s+['"](\.\/[^'"]+)['"]/g)) {
        assert.ok(existsSync(join(dir, 'js', ref)), `${f} imports missing ${ref}`);
      }
    }
  });

  const schema = await import(pathToFileURL(join(dir, 'js', 'schema.js')));
  const seasons = await import(pathToFileURL(join(dir, 'js', 'seasons.js')));

  await test('old (v1) farm files upgrade without losing anything', () => {
    const v1 = { name: 'My Farm', width: 42, depth: 54, location: { name: '12.517, 77.683', lat: 12.517, lon: 77.683 },
      season: 'auto', items: [
        { id: 'a1', type: 'tree', x: 3, z: -4, rot: 0, name: 't', species: 'teek', habit: 'evergreen', height: 7, canopy: 5, planted: '', notes: '' },
        { id: 'h1', type: 'house', x: 0, z: 0, rot: 90, name: 'House', w: 14, d: 10, h: 3, roof: 'gable', wall: '#e8dcc8', roofColor: '#8a3b2e' },
        { id: 'p1', type: 'pond', x: 5, z: 5, name: 'Pond' },          // missing fields
        { id: 'zz', type: 'spaceship', x: 0, z: 0 }                     // unknown type
      ] };
    const f = schema.migrate(v1);
    assert.equal(f.schema, schema.SCHEMA);
    assert.equal(f.items.length, 3, 'unknown types are dropped, everything else kept');
    assert.equal(f.width, 42); assert.equal(f.location.lat, 12.517);
    const tree = f.items.find(i => i.id === 'a1');
    assert.equal(tree.species, 'teek'); assert.equal(tree.x, 3);
    const pond = f.items.find(i => i.id === 'p1');
    assert.equal(pond.shape, 'oval'); assert.equal(pond.w, 14);
  });

  await test('migrating twice changes nothing', () => {
    const once = schema.migrate({ items: [{ id: 'x', type: 'bed', x: '2', z: 1, w: 'abc' }] });
    assert.deepEqual(schema.migrate(once), once);
    assert.equal(once.items[0].x, 2); assert.equal(once.items[0].w, 6);
  });

  await test('every object type has defaults, fields, an icon and a 3D model', () => {
    const models = readFileSync(join(dir, 'js', 'items3d.js'), 'utf8');
    for (const t of schema.TYPES) {
      assert.ok(schema.FIELDS[t], 'no FIELDS for ' + t);
      assert.ok(schema.ICON[t], 'no ICON for ' + t);
      assert.ok(models.includes(`'${t}'`), 'no 3D model for ' + t);
      for (const [k] of schema.FIELDS[t]) assert.ok(k in schema.DEFAULTS[t], `${t}.${k} has no default`);
    }
  });

  if (existsSync(join(dir, 'js', 'link.js'))) {
    const link = await import(pathToFileURL(join(dir, 'js', 'link.js')));
    await test('family links are long, random and read back correctly', () => {
      const a = link.makeCode(), b = link.makeCode();
      assert.match(a, /^farm-[A-Za-z0-9]{22}$/); assert.notEqual(a, b);
      assert.ok(('test-' + a).length >= 20, 'database rules need ids of 20+ characters');
      assert.equal(link.parseCode('https://x.github.io/farm-planner/#' + a), a);
      assert.equal(link.parseCode('#' + a), a);
      assert.equal(link.parseCode(a + '  '), a);
      assert.equal(link.parseCode('hello'), null);
      assert.equal(link.parseCode('#farm-short'), null);
    });
  }

  await test('seasons follow the hemisphere', () => {
    const nov = new Date(2026, 10, 18);
    assert.equal(seasons.autoSeason({ location: { lat: 12.5 } }, nov), 'autumn');
    assert.equal(seasons.autoSeason({ location: { lat: -37.8 } }, nov), 'spring');
    assert.equal(seasons.currentSeason({ season: 'winter', location: { lat: 12.5 } }), 'winter');
  });
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
