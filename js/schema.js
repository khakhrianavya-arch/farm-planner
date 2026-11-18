// =========================================================
// Farm data format — pure code, no 3D or network.
// Every saved farm carries `schema`. When a new feature adds
// or changes fields, bump SCHEMA and teach migrate() how to
// upgrade older data, so nothing already saved ever breaks.
// =========================================================

export const SCHEMA = 3;

export const DEFAULTS = {
  house:{ name:'House', w:14, d:10, h:3, roof:'gable', wall:'#e8dcc8', roofColor:'#8a3b2e' },
  shed: { name:'Shed',  w:8,  d:6,  h:3.5, roof:'skillion', wall:'#9aa3a8', roofColor:'#5f6b70' },
  tree: { name:'Tree',  species:'', habit:'evergreen', height:7, canopy:5, planted:'', notes:'' },
  pond: { name:'Pond',  shape:'oval', w:14, d:9, notes:'' },
  bed:  { name:'Garden bed', w:6, d:2, crop:'' },
  path: { name:'Path',  w:2.5, d:20 },
};
export const TYPES = Object.keys(DEFAULTS);

export const ICON = { house:'🏠', shed:'🛖', tree:'🌳', pond:'💧', bed:'🌱', path:'🟫' };

// Property editors per type: [key, label, kind, options]
export const FIELDS = {
  house:[['w','Width (m)','num'],['d','Depth (m)','num'],['h','Wall height','num'],
         ['roof','Roof','sel',['gable','hip','skillion','flat']],['wall','Wall colour','color'],['roofColor','Roof colour','color']],
  shed: [['w','Width (m)','num'],['d','Depth (m)','num'],['h','Wall height','num'],
         ['roof','Roof','sel',['gable','hip','skillion','flat']],['wall','Wall colour','color'],['roofColor','Roof colour','color']],
  tree: [['species','Species','species'],['habit','Type','sel',['evergreen','deciduous','fruit','conifer']],
         ['height','Height (m)','num'],['canopy','Canopy (m)','num'],['planted','Planted','text'],['notes','Notes','area']],
  pond: [['shape','Shape','sel',['oval','rectangle']],['w','Width (m)','num'],['d','Length (m)','num'],['notes','Notes','area']],
  bed:  [['w','Width (m)','num'],['d','Length (m)','num'],['crop','Growing','text']],
  path: [['w','Width (m)','num'],['d','Length (m)','num']],
};

// Species → tree type (drives the seasonal look). Add more any time.
export const SPECIES_HABIT = {
  apple:'fruit', pear:'fruit', peach:'fruit', plum:'fruit', apricot:'fruit', cherry:'fruit', fig:'fruit',
  persimmon:'fruit', pomegranate:'fruit', walnut:'deciduous', pecan:'deciduous',
  orange:'evergreen', lemon:'evergreen', lime:'evergreen', mandarin:'evergreen', avocado:'evergreen',
  olive:'evergreen', mango:'evergreen', macadamia:'evergreen', banana:'evergreen', coconut:'evergreen',
  'areca nut':'evergreen', jackfruit:'evergreen', guava:'evergreen', sapota:'evergreen', chikoo:'evergreen',
  tamarind:'evergreen', neem:'evergreen', sandalwood:'evergreen', 'silver oak':'evergreen', moringa:'deciduous',
  teak:'deciduous', teek:'deciduous', rosewood:'deciduous', eucalyptus:'evergreen', wattle:'evergreen',
  bamboo:'evergreen', oak:'deciduous', maple:'deciduous', elm:'deciduous', jacaranda:'deciduous',
  pine:'conifer', cypress:'conifer', sheoak:'conifer',
};
export const SPECIES = ['Teak','Mango','Coconut','Areca nut','Jackfruit','Banana','Guava','Sapota','Pomegranate',
  'Tamarind','Neem','Sandalwood','Silver oak','Rosewood','Moringa','Bamboo','Lemon','Orange','Avocado','Olive',
  'Apple','Pear','Peach','Plum','Fig','Macadamia','Eucalyptus','Wattle','Oak','Maple','Jacaranda','Pine','Cypress'];

export function habitFor(species){ return SPECIES_HABIT[String(species||'').trim().toLowerCase()] || null; }

export function blankFarm(){
  return { schema:SCHEMA, name:'My Farm', width:200, depth:150, location:null, season:'auto', items:[], tasks:{} };
}

const num = (v, fallback) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };

// Fill in any missing fields and fix types for one item. Returns null for unknown types.
export function normalizeItem(raw){
  if(!raw || !TYPES.includes(raw.type)) return null;
  const def = DEFAULTS[raw.type];
  const it = Object.assign(structuredClone(def), raw);
  it.id = String(raw.id || Math.random().toString(36).slice(2,9));
  it.x = num(raw.x, 0); it.z = num(raw.z, 0); it.rot = num(raw.rot, 0);
  for(const [k, , kind, opts] of FIELDS[raw.type]){
    if(kind === 'num') it[k] = num(it[k], def[k]);
    else if(kind === 'sel' && !opts.includes(it[k])) it[k] = def[k];
    else if(kind !== 'num' && it[k] == null) it[k] = def[k];
  }
  if(typeof it.name !== 'string' || !it.name) it.name = def.name;
  delete it.updatedAt; delete it.updatedBy;
  return it;
}

// One entry on the shared to-do list.
export function normalizeTask(raw, id){
  if(!raw || typeof raw !== 'object') return null;
  const title = String(raw.title || '').trim().slice(0, 200);
  if(!title) return null;
  return {
    id: String(id || raw.id || Math.random().toString(36).slice(2, 10)).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'task',
    title, body: String(raw.body || '').slice(0, 1000), source: String(raw.source || ''),
    createdAtMs: num(raw.createdAtMs, Date.now()), createdBy: String(raw.createdBy || ''),
    done: !!raw.done, doneAtMs: raw.done ? num(raw.doneAtMs, Date.now()) : null, doneBy: raw.done ? String(raw.doneBy || '') : '',
  };
}
export function normalizeTasks(raw){
  const out = {};
  const entries = Array.isArray(raw) ? raw.map(t => [t && t.id, t]) : Object.entries(raw && typeof raw === 'object' ? raw : {});
  for(const [id, t] of entries){ const n = normalizeTask(t, id); if(n) out[n.id] = n; }
  return out;
}

// Upgrade any older farm (a v1 export, an old browser save) to the current format.
export function migrate(data){
  const src = (data && typeof data === 'object') ? data : {};
  const f = blankFarm();
  f.name = typeof src.name === 'string' && src.name ? src.name : f.name;
  f.width = Math.max(10, num(src.width, f.width));
  f.depth = Math.max(10, num(src.depth, f.depth));
  const loc = src.location;
  f.location = (loc && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lon)))
    ? { name: String(loc.name || ''), lat:Number(loc.lat), lon:Number(loc.lon) } : null;
  f.season = ['auto','spring','summer','autumn','winter'].includes(src.season) ? src.season : 'auto';
  f.items = (Array.isArray(src.items) ? src.items : []).map(normalizeItem).filter(Boolean);
  // v1 → v2: nothing renamed; older saves simply lacked `schema`.
  // v2 → v3: the shared to-do list (`tasks`) was added; older farms start with an empty list.
  f.tasks = normalizeTasks(src.tasks);
  f.schema = SCHEMA;
  return f;
}

// The farm-wide settings (everything except items).
export function settingsOf(f){
  return { schema:SCHEMA, name:f.name, width:f.width, depth:f.depth, location:f.location ?? null, season:f.season };
}
