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

  if (existsSync(join(dir, 'js', 'advice.js'))) {
    const ins = await import(pathToFileURL(join(dir, 'js', 'insights.js')));
    const adv = await import(pathToFileURL(join(dir, 'js', 'advice.js')));
    const tree = (id, x, z, extra = {}) => ({ id, type: 'tree', x, z, rot: 0, name: 'T' + id, species: 'Teak', habit: 'deciduous', height: 10, canopy: 6, planted: '', notes: '', ...extra });
    const farm = schema.migrate({ width: 100, depth: 100, location: { name: 'Farm', lat: 12.517, lon: 77.683 },
      items: [tree('a', 0, 0, { planted: '2025' }), tree('b', 2, 0), tree('c', 30, 30, { species: 'Mango', habit: 'evergreen' }), tree('d', -30, 10, { species: '' }),
              { id: 'p', type: 'pond', x: 0, z: 30, shape: 'rectangle', w: 10, d: 5 }] });
    const climate = (o = {}) => {
      const n = 99, fill = v => Array(n).fill(v);
      const daily = { dates: fill('2026-11-18'), rain: fill(0), tmax: fill(30), tmin: fill(18), et0: fill(4), gust: fill(15), hum: fill(60) };
      for (const [k, arr] of Object.entries(o)) arr.forEach(([i, v]) => { daily[k][92 + i] = v; });
      return { daily, today: 92, months: [] };
    };

    await test('farm schema v2 files gain an empty to-do list; tasks are cleaned up', () => {
      const f = schema.migrate({ schema: 2, items: [] });
      assert.equal(f.schema, schema.SCHEMA); assert.deepEqual(f.tasks, {});
      const g = schema.migrate({ tasks: { 'ok1': { title: ' Clear drains ', done: true }, bad: { title: '' }, 'x y!': { title: 'Odd id' } } });
      assert.equal(g.tasks.ok1.title, 'Clear drains'); assert.equal(g.tasks.ok1.done, true);
      assert.ok(!g.tasks.bad); assert.ok(g.tasks.xy, 'ids are made safe for the database');
      assert.deepEqual(schema.migrate(g).tasks, g.tasks);
    });

    await test('tree counts, spacing and pond maths', () => {
      const st = ins.treeStats(farm, new Date(2026, 10, 18));
      assert.equal(st.total, 4); assert.equal(st.species[0].name, 'Teak'); assert.equal(st.species[0].count, 2);
      assert.equal(st.missingSpecies, 1); assert.equal(st.young, 1); assert.equal(st.perHa, 4);
      assert.equal(ins.speciesKey('teek'), 'teak');
      const sp = ins.spacingIssues(farm.items);
      assert.equal(sp.length, 1); assert.deepEqual([sp[0].a, sp[0].b], ['a', 'b']);
      assert.equal(Math.round(ins.pondHarvest(farm.items, 10)[0].litres), 500);
    });

    await test('rain summary counts dry days and the water shortfall', () => {
      const r = ins.rainSummary(climate({ rain: [[-15, 12], [2, 30]] }));
      assert.equal(r.daysSinceRain, 15); assert.equal(r.last30, 12); assert.equal(r.next3, 30);
      assert.equal(Math.round(r.deficit30), 4 * 30 - 12);
    });

    await test('weather warnings appear when they should', () => {
      const ids = c => adv.suggestions({ farm, climate: c, date: new Date(2026, 10, 18) }).map(s => s.id);
      const calm = ids(climate({ rain: [[-3, 10]] }));
      assert.ok(!calm.includes('wx-heavy-rain') && !calm.includes('wx-heat') && !calm.includes('wx-dry'));
      assert.ok(ids(climate({ rain: [[1, 55]] })).includes('wx-heavy-rain'));
      assert.ok(ids(climate({ tmax: [[1, 39]] })).includes('wx-heat'));
      assert.ok(ids(climate({ gust: [[0, 60]] })).includes('wx-wind'));
      assert.ok(ids(climate()).includes('wx-dry'), '92 dry days');
    });

    await test('species calendar follows the month, only for species on the farm', () => {
      const ids = (m) => adv.suggestions({ farm, date: new Date(2026, m - 1, 10) }).map(s => s.id);
      assert.ok(ids(11).includes('cal-teak-3') && !ids(11).includes('cal-teak-0'));
      assert.ok(ids(3).includes('cal-teak-0') && ids(3).includes('cal-mango-2'));
      assert.ok(!ids(3).some(id => id.startsWith('cal-coconut')));
      const away = schema.migrate({ ...farm, location: { name: 'X', lat: 51.5, lon: -0.1 } });
      assert.ok(!adv.suggestions({ farm: away, date: new Date(2026, 2, 10) }).some(s => s.id.startsWith('cal-')), 'Indian calendar only for farms there');
    });

    await test('every calendar entry and tip is well-formed', () => {
      for (const rows of Object.values(adv.SPECIES_CALENDAR)) for (const [months, t, b] of rows) {
        assert.ok(months.length && months.every(m => m >= 1 && m <= 12)); assert.ok(t && b);
      }
      for (const [months, t, b] of adv.REGION_CALENDAR) { assert.ok(months.every(m => m >= 1 && m <= 12)); assert.ok(t && b); }
      assert.ok(adv.TIPS.length >= 15);
    });

    await test('daily pick: same all day, changes over days, most urgent first, respects hidden', () => {
      const list = adv.suggestions({ farm, climate: climate({ rain: [[1, 55]] }), date: new Date(2026, 10, 18) });
      const d1 = new Date(2026, 10, 18, 7), d1b = new Date(2026, 10, 18, 22);
      assert.equal(adv.todaysPick(list, d1).today.id, adv.todaysPick(list, d1b).today.id);
      assert.equal(adv.todaysPick(list, d1).today.prio, 3);
      const quiet = adv.suggestions({ farm: schema.migrate({ items: [] }), date: d1 }).filter(s => s.prio === 0);
      const picks = new Set([...Array(14)].map((_, i) => adv.todaysPick(quiet, new Date(2026, 10, 1 + i)).today.id));
      assert.ok(picks.size >= 5, 'tips rotate day to day');
      const first = adv.todaysPick(list, d1).today.id;
      assert.notEqual(adv.todaysPick(list, d1, new Set([first])).today.id, first);
      assert.ok(adv.todaysPick(list, d1).more.length >= 2);
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
