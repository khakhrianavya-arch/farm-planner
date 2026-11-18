// =========================================================
// "Today on the farm": built-in farming suggestions.
// Pure code: takes the farm, the weather and the date, returns suggestions.
// To add advice: add a line to SPECIES_CALENDAR, REGION_CALENDAR or TIPS.
// Months are 1–12. The calendars are written for southern India's
// seasons (cool Jan–Feb, hot Mar–May, south-west monsoon Jun–Sep,
// north-east monsoon Oct–Dec) and are only used for farms there.
// =========================================================
import { treeStats, spacingIssues, rainSummary, plantedYear, speciesKey } from './insights.js';
import { currentSeason } from './seasons.js';

export const NOTE = 'General guidance. Varieties and local conditions differ, so check with your local agriculture office before big decisions.';

export const SPECIES_CALENDAR = {
  mango: [
    [[10, 11], 'Prune mango trees before they flower', 'Remove dead, diseased and crossing branches now, before flowering (usually Dec–Feb). An open canopy lets light and air into the centre and cuts disease.'],
    [[12, 1, 2], 'Mango flowering: go easy on water', 'Heavy watering while mangoes flower can push new leaves instead of flowers. Check the flower stalks for hoppers and for white powdery mildew.'],
    [[3, 4, 5], 'Mango fruits are growing: water steadily', 'Regular watering while fruits swell reduces fruit drop. Fruit-fly traps hung about a month before harvest protect the crop.'],
    [[6, 7], 'Feed mango trees after harvest', 'With the first monsoon rains, spread well-rotted manure and fertiliser in a ring under the edge of the canopy, not against the trunk.'],
  ],
  teak: [
    [[1, 2, 3, 4, 5], 'Dry season: keep fire away from the teak', 'Teak drops its leaves in the dry season and the leaf litter burns easily. Rake a clear strip around the trees and don\'t burn rubbish nearby.'],
    [[6, 7], 'Monsoon is teak planting time', 'Plant new teak and fill gaps at the start of the monsoon so the roots establish while the soil stays wet.'],
    [[7, 8, 9], 'Weed young teak and look for leaf-eating caterpillars', 'Young teak struggles with weeds in the rains, and teak defoliator caterpillars can strip leaves after the monsoon starts.'],
    [[11, 12, 1], 'Prune and thin the teak', 'Remove low side branches on young teak (up to about half the tree\'s height) for a straight trunk, and thin crowded trees so the best ones have room.'],
  ],
  coconut: [
    [[3, 4, 5], 'Summer: water and mulch the coconut palms', 'Water the basins regularly in the hot months and cover them with husks or dry fronds to hold moisture.'],
    [[6, 10], 'Manure the coconut palms while the soil is moist', 'Apply manure and fertiliser in a basin around each palm, roughly 1.5–2 m from the trunk, after the monsoon rains start.'],
    [[8, 9], 'Check the palms for beetle damage', 'V-shaped cuts in new leaves point to rhinoceros beetle; holes oozing brown liquid on the trunk can mean red palm weevil. Clear rotting debris where beetles breed.'],
  ],
  banana: [
    [[3, 4, 5], 'Bananas are thirsty in summer', 'Water deeply and often in the hot months and mulch around the base.'],
    [[5, 6], 'Prop the banana plants before the monsoon winds', 'Support heavy bunches with props and remove extra suckers, keeping one follower per plant.'],
  ],
  'areca nut': [
    [[5, 6], 'Protect areca bunches before the monsoon', 'Fruit rot (koleroga) spreads in heavy rain. Many growers spray the bunches with Bordeaux mixture just before the monsoon and again in long wet spells.'],
    [[3, 4, 5], 'Shade and water young areca palms', 'Young areca palms scorch in strong summer sun. Water them regularly and shade stems facing the afternoon sun.'],
  ],
  guava: [
    [[3, 4], 'Light pruning for the guava trees', 'Guava fruits on new shoots, so a light prune after harvest encourages next season\'s crop.'],
    [[7, 8, 9], 'Watch the guavas for fruit fly', 'Pick up and destroy fallen fruit, and bag or trap where fruit fly is a problem.'],
  ],
  pomegranate: [
    [[5, 6], 'Pomegranate: plan the flowering season', 'Growers time pomegranate flowering by holding back water for a few weeks, then watering and feeding. The monsoon crop (mrig bahar) starts around June. Remove cracked or bored fruits.'],
  ],
  sapota: [
    [[1, 2], 'Sapota: tidy up and mulch before summer', 'Remove dead or crowded branches and mulch the basins before the hot months.'],
  ],
  jackfruit: [
    [[3, 4, 5], 'Jackfruits are developing: water regularly', 'Steady water in the hot months helps the fruit size up. Removing damaged or crowded small fruits lets the rest grow bigger.'],
  ],
  tamarind: [
    [[2, 3, 4], 'Tamarind harvest time', 'Pods are ripe when the shell turns brown and brittle. Store the pulp dry.'],
  ],
  neem: [
    [[6, 7], 'Collect neem seeds for a free pest spray', 'Ripe neem fruits fall around the monsoon. Dried, crushed kernels soaked overnight in water make neem seed kernel extract, a common natural pest spray.'],
  ],
  moringa: [
    [[6, 7], 'Cut back the moringa', 'Pruning moringa back to about a metre keeps it bushy and the pods within reach.'],
  ],
  lemon: [
    [[3, 4, 5], 'Water the citrus steadily', 'Irregular watering in hot weather makes citrus fruits drop or split.'],
    [[6, 7], 'Feed the citrus with the monsoon', 'Apply manure and fertiliser in a ring under the canopy once the rains have wet the soil.'],
  ],
  'silver oak': [
    [[1, 2, 3], 'Lop the silver oak in the dry season', 'If silver oak is grown for shade or as a windbreak, trim the lower branches and lop it in the dry months.'],
  ],
};
SPECIES_CALENDAR.orange = SPECIES_CALENDAR.lime = SPECIES_CALENDAR.mandarin = SPECIES_CALENDAR.lemon;

// Whole-farm seasonal jobs for southern India.
export const REGION_CALENDAR = [
  [[4, 5], 'Desilt the ponds before the monsoon', 'Removing silt now lets ponds hold more water when the rains come. Repair bunds and trenches that guide water into them.'],
  [[5, 6], 'Prepare pits for new trees', 'Dig planting pits a few weeks before the monsoon and let them weather in the sun, then refill with topsoil and manure ready for planting.'],
  [[1, 2], 'Mulch before the hot months', 'A thick layer of dry leaves or straw around trees now saves a lot of water through March to May.'],
  [[3, 4, 5], 'Water early in the morning or in the evening', 'Midday watering in summer loses much of the water to evaporation.'],
  [[10, 11], 'Make the most of the north-east monsoon', 'Check that rainwater flows into ponds rather than off the farm, and top up mulch after heavy rain.'],
  [[7, 8, 9], 'Keep weeds down in the monsoon', 'Weeds grow fastest now. Clear them around young trees and use them as mulch.'],
];

const TEMPERATE_SEASON = {
  spring: [['Spring planting window', 'Plant new trees and shrubs while the soil is warming and moist, and mulch them straight away.']],
  summer: [['Summer watering', 'Water deeply but less often, early in the day, so roots grow down rather than staying near the surface.']],
  autumn: [['Autumn: collect leaves for compost', 'Fallen leaves make excellent leaf mould and mulch. Autumn is also a good time to plant trees.']],
  winter: [['Winter pruning', 'Prune apples and pears while they are dormant. Leave plums, cherries and apricots until summer to avoid disease.']],
};

// General tips for quiet days.
export const TIPS = [
  ['Keep a farm diary', 'Note planting dates, flowering, harvests and pests each season. After a year or two it shows you what works on your land.'],
  ['Add planting years to your trees', 'Knowing each tree\'s age helps plan feeding and pruning, and shows which young trees need watering first.'],
  ['Feed the soil, not just the plants', 'Compost and manure improve soil structure and help it hold water. A soil test every few years shows what is actually missing.'],
  ['Start a compost heap', 'Mix green waste (fresh leaves, kitchen scraps) with brown waste (dry leaves, straw), keep it damp and turn it every few weeks.'],
  ['Mulch saves water', 'A 5–10 cm layer of mulch keeps soil cool and moist, feeds soil life and smothers weeds. Keep it a hand\'s width away from trunks.'],
  ['Mix your species', 'A farm with many species is harder for one pest or disease to wipe out, and spreads harvests across the year.'],
  ['Plant nitrogen-fixers', 'Trees and plants like gliricidia, pigeon pea and legumes add nitrogen to the soil and can be cut for mulch.'],
  ['Catch the rain where it falls', 'Small trenches along the slope, and basins around trees, slow rainwater down so it soaks in instead of running off.'],
  ['Walk the farm every week', 'A regular walk spots pests, broken pipes and sick trees early, when they are easy to fix.'],
  ['Use drip irrigation for young trees', 'Drip lines put water at the roots and can use far less water than flooding basins.'],
  ['Encourage birds and beneficial insects', 'Flowering hedges, a little water and fewer chemical sprays bring in predators that eat pests for free.'],
  ['Keep tools clean between trees', 'Wiping pruning tools between trees stops diseases spreading from one tree to the next.'],
  ['Windbreaks protect crops', 'A row of tough trees on the windy side of the farm cuts water loss and protects young plants and fruit.'],
  ['Watch the edges of the canopy', 'Tree roots that take up water spread well beyond the trunk. Water and feed around the drip line, the edge of the canopy.'],
  ['Record what you harvest', 'Weighing or counting harvests each year shows which trees and varieties earn their place.'],
  ['Check the ponds after big rains', 'Look for erosion on the banks and blocked inlets, and fix small problems before the next storm.'],
  ['Plan for the next five years', 'Sketch where new trees will go when today\'s saplings are fully grown, so nothing ends up shaded out or crowded.'],
  ['Keep young trees weed-free', 'Weeds compete hard for water. A clear circle about a metre wide around each young tree makes a big difference.'],
];

// ---------------------------------------------------------
const inMonths = (months, m) => months.includes(m);
export function dayKey(date = new Date()){
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function hash(s){ let h = 2166136261; for(const c of s){ h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }
export function region(farm){
  const l = farm.location; if(!l) return null;
  if(l.lat >= 5 && l.lat <= 25 && l.lon >= 65 && l.lon <= 95) return 'south-india';
  return Math.abs(l.lat) < 23.5 ? 'tropics' : 'temperate';
}

export function suggestions({ farm, climate = null, date = new Date() }){
  const out = [];
  const add = (id, cat, prio, icon, title, body) => out.push({ id, cat, prio, icon, title, body });
  const month = date.getMonth() + 1;
  const stats = treeStats(farm, date);
  const reg = region(farm);
  const isWeather = !!climate;

  // ---- Weather (most urgent first) ----
  if(isWeather){
    const r = rainSummary(climate);
    if(r.maxRainNext3 >= 40) add('wx-heavy-rain', 'weather', 3, '⛈️', `Heavy rain expected: up to ${Math.round(r.maxRainNext3)} mm in a day`,
      'Clear drains and pond inlets, stake young trees, and hold off on fertiliser until after the rain so it isn\'t washed away.');
    if(r.maxTempNext3 >= 38) add('wx-heat', 'weather', 3, '🌡️', `Very hot days ahead: up to ${Math.round(r.maxTempNext3)}°C`,
      'Water young trees early in the morning, top up mulch, and give new saplings some shade in the afternoon.');
    if(r.minTempNext3 <= 2) add('wx-frost', 'weather', 3, '❄️', `Frost risk: down to ${Math.round(r.minTempNext3)}°C`,
      'Cover tender plants overnight and water the soil during the day, since moist soil holds more warmth.');
    if(r.maxGustNext3 >= 55) add('wx-wind', 'weather', 3, '💨', `Strong winds ahead: gusts up to ${Math.round(r.maxGustNext3)} km/h`,
      'Prop bananas and heavy fruit bunches, stake young trees, and tie down loose sheeting.');
    if(r.daysSinceRain >= 10 && r.next3 < 5) add('wx-dry', 'weather', r.daysSinceRain >= 20 ? 3 : 2, '☀️', `${r.daysSinceRain} days without real rain`,
      stats.young ? `Water the ${stats.young} young tree${stats.young > 1 ? 's' : ''} (planted in the last 3 years) first, deeply and early in the day. Mulch keeps the water in.`
                  : 'Young trees and new plantings need water first. Water deeply and early, and mulch to keep the moisture in.');
    if(r.deficit30 >= 60 && r.daysSinceRain < 10) add('wx-deficit', 'weather', 2, '💧', `Soil is drying: ${Math.round(r.deficit30)} mm short this month`,
      'Over the last 30 days, sun and heat took more water out of the soil than the rain put back. Young trees will likely need watering.');
    if(r.next3 >= 15 && r.maxRainNext3 < 40) add('wx-good-rain', 'weather', 2, '🌦️', `Good rain on the way: about ${Math.round(r.next3)} mm in 3 days`,
      'A good moment to plant, sow or spread manure just before the rain, so the water carries it into the soil.');
    const humid = r.humidity3.length && r.humidity3.every(h => h >= 85);
    if(humid && r.last7 >= 20) add('wx-fungus', 'weather', 2, '🍄', 'Warm, wet and humid: watch for fungus',
      'Leaf spots, mildew and fruit rot spread fast in this weather. Remove infected leaves and fallen fruit, and keep air moving through canopies.');
  }

  // ---- Season and species ----
  if(reg === 'south-india'){
    const have = new Set(stats.species.map(s => s.key));
    for(const [sp, rows] of Object.entries(SPECIES_CALENDAR)){
      if(!have.has(sp)) continue;
      const count = stats.species.find(s => s.key === sp)?.count || 0;
      rows.forEach(([months, t, body], i) => {
        if(inMonths(months, month)) add(`cal-${sp.replace(/\s/g, '-')}-${i}`, 'season', 2, '🗓️', t, body + ` (You have ${count}.)`);
      });
    }
    REGION_CALENDAR.forEach(([months, t, body], i) => { if(inMonths(months, month)) add(`region-${i}`, 'season', 2, '🗓️', t, body); });
  } else if(reg === 'temperate'){
    const s = currentSeason(farm);
    (TEMPERATE_SEASON[s] || []).forEach(([t, body], i) => add(`temperate-${s}-${i}`, 'season', 2, '🗓️', t, body));
  }

  // ---- The farm's own data ----
  if(!farm.location) add('farm-location', 'farm', 2, '📍', 'Set the farm\'s location', 'With the location set, the planner can show live weather, track rainfall and give advice for your seasons.');
  if(stats.missingSpecies) add('farm-species', 'farm', 2, '🌳', `${stats.missingSpecies} tree${stats.missingSpecies > 1 ? 's have' : ' has'} no species`, 'Click each tree and pick its species, so the advice and the tree counts can include it.');
  if(stats.total && stats.withYear < stats.total) add('farm-planted', 'farm', 1, '📅', `${stats.total - stats.withYear} tree${stats.total - stats.withYear > 1 ? 's have' : ' has'} no planting year`,
    'Add the year each tree was planted (even roughly) so the planner can tell which young trees need watering first.');
  const crowded = spacingIssues(farm.items, 200);
  if(crowded.length) add('farm-spacing', 'farm', 2, '↔️', `${crowded.length} pair${crowded.length > 1 ? 's' : ''} of trees may be too close`,
    `For example ${crowded[0].aName} and ${crowded[0].bName} are ${crowded[0].dist.toFixed(1)} m apart. As they grow, crowded trees compete for light and water. See Insights → Spacing.`);
  const top = stats.species[0];
  if(stats.total >= 10 && top && top.share >= 0.7 && top.key !== 'unnamed') add('farm-diversity', 'farm', 1, '🌱', `${Math.round(top.share * 100)}% of your trees are ${top.name}`,
    'Relying on one species means a single pest, disease or bad price year hits the whole farm. Consider mixing in fruit, timber or nitrogen-fixing trees.');
  if(!farm.items.some(i => i.type === 'pond')) add('farm-pond', 'farm', 1, '💧', 'Consider a farm pond', 'A pond in the lowest part of the farm catches monsoon runoff for the dry months and recharges groundwater.');
  if(!farm.items.some(i => i.type === 'bed')) add('farm-garden', 'farm', 1, '🥬', 'Start a kitchen garden', 'A few raised beds near the house give vegetables and herbs year-round and are easy to water.');

  // ---- General tips ----
  TIPS.forEach(([t, body], i) => add(`tip-${i}`, 'tip', 0, '💡', t, body));
  return out;
}

// The same pick for everyone on the same day; changes each morning.
export function todaysPick(list, date = new Date(), hidden = new Set()){
  const shown = list.filter(s => !hidden.has(s.id));
  if(!shown.length) return { today: null, more: [] };
  const best = Math.max(...shown.map(s => s.prio));
  const day = dayKey(date);
  const group = shown.filter(s => s.prio === best).sort((a, b) => hash(day + a.id) - hash(day + b.id));
  const today = group[0];
  const more = shown.filter(s => s !== today && s.prio > 0).sort((a, b) => b.prio - a.prio || hash(day + a.id) - hash(day + b.id)).slice(0, 4);
  if(more.length < 2){
    const tips = shown.filter(s => s.prio === 0 && s !== today).sort((a, b) => hash(day + a.id) - hash(day + b.id));
    more.push(...tips.slice(0, 2 - more.length));
  }
  return { today, more };
}

export { plantedYear, speciesKey };
