// =========================================================
// Farm numbers: tree distribution, spacing, rain and water.
// Pure code (no 3D, no network) so it can be checked automatically.
// =========================================================

export const SPECIES_ALIASES = { teek: 'teak', chikoo: 'sapota', chiku: 'sapota', drumstick: 'moringa', areca: 'areca nut', arecanut: 'areca nut', coconut: 'coconut' };
export function speciesKey(s){
  const k = String(s || '').trim().toLowerCase();
  return SPECIES_ALIASES[k] || k;
}
const title = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Unnamed';

export function plantedYear(v){
  const m = String(v || '').match(/(19|20)\d\d/);
  return m ? Number(m[0]) : null;
}

export function treeStats(farm, now = new Date()){
  const trees = farm.items.filter(i => i.type === 'tree');
  const areaHa = (farm.width * farm.depth) / 10000;
  const bySpecies = {}, byHabit = {};
  let withYear = 0, young = 0;
  for(const t of trees){
    const k = speciesKey(t.species) || 'unnamed';
    bySpecies[k] = (bySpecies[k] || 0) + 1;
    byHabit[t.habit] = (byHabit[t.habit] || 0) + 1;
    const y = plantedYear(t.planted);
    if(y){ withYear++; if(now.getFullYear() - y <= 3) young++; }
  }
  const species = Object.entries(bySpecies).sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, name: key === 'unnamed' ? 'Unnamed' : title(key), count, share: trees.length ? count / trees.length : 0 }));
  return { total: trees.length, areaHa, perHa: areaHa ? trees.length / areaHa : 0, species, byHabit, withYear, young,
    missingSpecies: bySpecies.unnamed || 0 };
}

// Pairs of trees whose canopies overlap a lot (closer than 75 % of their combined canopy radii).
export function spacingIssues(items, limit = 50){
  const trees = items.filter(i => i.type === 'tree');
  const out = [];
  for(let i = 0; i < trees.length; i++){
    for(let j = i + 1; j < trees.length; j++){
      const a = trees[i], b = trees[j];
      const dist = Math.hypot(a.x - b.x, a.z - b.z);
      const need = ((Number(a.canopy) || 0) + (Number(b.canopy) || 0)) / 2 * 0.75;
      if(dist < need) out.push({ a: a.id, b: b.id, aName: a.name, bName: b.name, dist, need, ratio: dist / need });
    }
  }
  return out.sort((p, q) => p.ratio - q.ratio).slice(0, limit);
}

const sum = arr => arr.reduce((s, v) => s + (Number(v) || 0), 0);

// climate.daily: { dates[], rain[], tmax[], tmin[], et0[], gust[], hum[] } with `today` = index of today.
export function rainSummary(climate){
  const d = climate.daily, t = climate.today;
  const past = (n) => d.rain.slice(Math.max(0, t - n), t);
  let daysSinceRain = null;
  for(let i = t - 1, n = 1; i >= 0; i--, n++){ if((d.rain[i] || 0) >= 2){ daysSinceRain = n; break; } }
  if(daysSinceRain === null) daysSinceRain = t; // no real rain in the whole record
  if((d.rain[t] || 0) >= 2) daysSinceRain = 0;
  const next = (arr, n) => arr.slice(t, t + n);
  const deficit30 = sum(d.et0.slice(Math.max(0, t - 30), t)) - sum(past(30));
  return {
    last7: sum(past(7)), last30: sum(past(30)), last90: sum(past(90)),
    today: d.rain[t] || 0, next3: sum(next(d.rain, 3)), next7: sum(next(d.rain, 7)),
    maxRainNext3: Math.max(0, ...next(d.rain, 3).map(v => v || 0)),
    maxTempNext3: Math.max(-99, ...next(d.tmax, 3).map(v => v ?? -99)),
    minTempNext3: Math.min(99, ...next(d.tmin, 3).map(v => v ?? 99)),
    maxGustNext3: Math.max(0, ...next(d.gust, 3).map(v => v || 0)),
    humidity3: next(d.hum, 3).filter(v => v != null),
    daysSinceRain, deficit30,
  };
}

// Water falling directly on each pond (1 mm on 1 m² = 1 litre).
export function pondArea(p){ const w = Number(p.w) || 0, d = Number(p.d) || 0; return p.shape === 'rectangle' ? w * d : Math.PI * w * d / 4; }
export function pondHarvest(items, mm){
  return items.filter(i => i.type === 'pond').map(p => ({ id: p.id, name: p.name, area: pondArea(p), litres: pondArea(p) * mm }));
}
