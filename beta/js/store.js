// =========================================================
// Where the farm is saved.
//  • This browser only (localStorage) — when there is no family link.
//  • Shared (Firebase Firestore) — anyone with the family link sees and
//    edits the same farm, live. No accounts or passwords.
// The rest of the app only talks to this module.
// =========================================================
import { firebaseConfig, IS_BETA } from './config.js';
import { SCHEMA, migrate, normalizeItem, settingsOf, blankFarm } from './schema.js';
import { makeCode, parseCode } from './link.js';

const FB_VERSION = '10.12.2';
const LOCAL_KEY = IS_BETA ? 'farmPlanner.beta' : 'farmPlanner.v1';
const LOCAL_SNAPS = LOCAL_KEY + '.snapshots';
const CODE_KEY = 'farmPlanner.familyCode';
const NAME_KEY = 'farmPlanner.editorName';
const KEEP_SNAPSHOTS = 40;

export const cloudAvailable = !!firebaseConfig.apiKey;

// status: 'offline' (no shared storage set up) | 'no-farm' (no family link yet)
//       | 'connecting' | 'ready' | 'not-found' | 'error'
export const state = { mode: 'local', status: cloudAvailable ? 'no-farm' : 'offline', farm: null, code: null, error: '' };

const listeners = new Set();
export function onChange(fn){ listeners.add(fn); }
function emit(change){ listeners.forEach(fn => { try{ fn(change); }catch(e){ console.error(e); } }); }
function setStatus(status, error = ''){ state.status = status; state.error = error; emit({ type:'status' }); }

let fb = null, unsubs = [];
const farmId = () => (IS_BETA ? 'test-' : '') + state.code;
const farmRef = (id = farmId()) => fb.doc(fb.db, 'farms', id);

/* ---------------- Small local helpers ---------------- */
function readJSON(key){ try{ const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; }catch(e){ return null; } }
function writeJSON(key, v){ try{ localStorage.setItem(key, JSON.stringify(v)); return true; }catch(e){ return false; } }
function readStr(key){ try{ return localStorage.getItem(key) || ''; }catch(e){ return ''; } }
function writeStr(key, v){ try{ v ? localStorage.setItem(key, v) : localStorage.removeItem(key); }catch(e){} }
let localTimer = null;
function saveLocal(){ clearTimeout(localTimer); localTimer = setTimeout(() => writeJSON(LOCAL_KEY, exportFarm()), 200); }

export function exportFarm(){ const f = state.farm; return { ...settingsOf(f), items: f.items.map(it => ({ ...it })) }; }
export function editorName(){ return readStr(NAME_KEY); }
export function setEditorName(n){ writeStr(NAME_KEY, String(n || '').trim().slice(0, 40)); }
const by = () => editorName() || 'Someone';
export function shareLink(){ return state.code ? location.origin + location.pathname + '#' + state.code : ''; }

/* ---------------- Start up ---------------- */
export async function init(starter){
  const saved = readJSON(LOCAL_KEY);
  state.farm = migrate(saved || (starter ? starter() : blankFarm()));
  emit({ type:'all' });
  if(!cloudAvailable) return;
  try{
    const base = `https://www.gstatic.com/firebasejs/${FB_VERSION}/`;
    const [appM, fsM] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-firestore.js')]);
    fb = { ...fsM, db: fsM.getFirestore(appM.initializeApp(firebaseConfig)) };
  }catch(e){
    console.error(e); setStatus('error', 'Could not reach the shared storage. Check your internet connection.'); return;
  }
  // A link opened directly wins; otherwise reopen the family farm this device used last.
  const code = parseCode(location.hash) || parseCode(readStr(CODE_KEY));
  if(code) openFarm(code); else setStatus('no-farm');
  window.addEventListener('hashchange', () => {
    const c = parseCode(location.hash);
    if(c && c !== state.code) openFarm(c);
  });
}

function rememberCode(code){
  writeStr(CODE_KEY, code || '');
  const want = code ? '#' + code : '';
  if(location.hash !== want) history.replaceState(null, '', location.pathname + location.search + want);
}

/* ---------------- Family link ---------------- */
// Put the farm currently on screen into shared storage and make a new family link for it.
export async function createFamilyFarm(){
  if(!fb) throw new Error('Shared storage is still loading. Try again in a moment.');
  const code = makeCode();
  const current = exportFarm();
  disconnect();
  state.code = code;
  try{
    await withTimeout(fb.setDoc(farmRef(), { ...settingsOf(current), createdAt: fb.serverTimestamp(), updatedBy: by() }));
    await writeAllItems(current.items, []);
  }catch(e){
    state.code = null;
    throw new Error(e.code === 'timeout' ? 'Could not reach the shared database. Check that the Firestore database exists in Firebase.'
      : e.code === 'permission-denied' ? 'The database refused access. Check the Firestore rules in Firebase.' : 'Could not create the family farm: ' + (e.code || e.message));
  }
  rememberCode(code);
  await openFarm(code);
}

// Open a family link (whole link or just the code).
export async function joinFamilyFarm(text){
  const code = parseCode(text);
  if(!code) throw new Error('That doesn\'t look like a family link. Copy the whole link and paste it again.');
  await openFarm(code);
}

// Stop using the family farm on this device (the shared farm itself is untouched).
export function leaveFamilyFarm(){
  disconnect(); state.code = null; rememberCode(null); backToLocal(); setStatus('no-farm');
}

function disconnect(){ unsubs.forEach(u => u()); unsubs = []; }
function backToLocal(){
  state.mode = 'local';
  state.farm = migrate(readJSON(LOCAL_KEY) || blankFarm());
  emit({ type:'all' });
}

// Firestore waits forever if the database is missing or unreachable; give up after 15 s with a clear message.
function withTimeout(promise, ms = 15000){
  return Promise.race([promise, new Promise((_, no) => setTimeout(() => no(Object.assign(new Error('timeout'), { code: 'timeout' })), ms))]);
}

async function openFarm(code){
  disconnect();
  state.code = code;
  setStatus('connecting');
  let snap;
  try{
    snap = await withTimeout(fb.getDoc(farmRef()));
    if(!snap.exists() && IS_BETA){
      // First visit to the test version: start the test farm empty.
      await fb.setDoc(farmRef(), { ...settingsOf(blankFarm()), createdAt: fb.serverTimestamp(), updatedBy: by() });
      snap = await fb.getDoc(farmRef());
    }
  }catch(e){
    console.error(e); state.code = null;
    setStatus('error', e.code === 'timeout'
      ? 'Could not reach the shared database. Check your internet connection, and that the Firestore database exists in Firebase.'
      : e.code === 'permission-denied'
        ? 'The database refused access. Check the Firestore rules in Firebase.'
        : 'Could not open the family farm: ' + (e.code || e.message));
    return;
  }
  if(!snap.exists()){
    state.code = null; backToLocal();
    setStatus('not-found', 'No farm was found at that link. Check that the whole link was copied.');
    return;
  }
  rememberCode(code);
  state.mode = 'cloud';
  state.farm = migrate({ ...snap.data(), items: [] });

  unsubs.push(fb.onSnapshot(farmRef(), s => {
    if(!s.exists() || s.metadata.hasPendingWrites) return;
    Object.assign(state.farm, settingsOf(migrate({ ...s.data(), items: [] })));
    emit({ type:'settings' });
  }, onError));

  let first = true;
  unsubs.push(fb.onSnapshot(fb.collection(farmRef(), 'items'), qs => {
    if(first){
      first = false;
      state.farm.items = qs.docs.map(x => normalizeItem({ ...x.data(), id: x.id })).filter(Boolean);
      emit({ type:'all' }); setStatus('ready');
      autoSnapshot();
      return;
    }
    const changes = [];
    qs.docChanges().forEach(ch => {
      if(ch.doc.metadata.hasPendingWrites) return;           // our own edit echoing back
      const id = ch.doc.id, i = state.farm.items.findIndex(x => x.id === id);
      if(ch.type === 'removed'){ if(i >= 0) state.farm.items.splice(i, 1); changes.push({ id, removed:true }); return; }
      const it = normalizeItem({ ...ch.doc.data(), id }); if(!it) return;
      if(i >= 0){ const cur = state.farm.items[i]; Object.keys(cur).forEach(k => { if(!(k in it)) delete cur[k]; }); Object.assign(cur, it); }
      else state.farm.items.push(it);
      changes.push({ id, removed:false });
    });
    if(changes.length) emit({ type:'items', changes });
  }, onError));
}

function onError(e){ console.error(e); setStatus('error', 'Lost connection to the family farm: ' + (e.code || e.message)); }

/* ---------------- Saving changes ---------------- */
const itemDoc = (it) => { const d = { ...it, updatedBy: by(), updatedAt: fb.serverTimestamp() }; delete d.id; return d; };
const itemTimers = new Map();
export function saveItem(it){
  if(state.mode !== 'cloud'){ saveLocal(); return; }
  clearTimeout(itemTimers.get(it.id));
  it.updatedBy = by();
  itemTimers.set(it.id, setTimeout(() => {
    itemTimers.delete(it.id);
    fb.setDoc(fb.doc(farmRef(), 'items', it.id), itemDoc(it)).catch(onError);
  }, 250));
}
export function deleteItem(id){
  if(state.mode !== 'cloud'){ saveLocal(); return; }
  clearTimeout(itemTimers.get(id)); itemTimers.delete(id);
  fb.deleteDoc(fb.doc(farmRef(), 'items', id)).catch(onError);
}
let settingsTimer = null;
export function saveSettings(){
  if(state.mode !== 'cloud'){ saveLocal(); return; }
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => {
    fb.updateDoc(farmRef(), { ...settingsOf(state.farm), updatedBy: by(), updatedAt: fb.serverTimestamp() }).catch(onError);
  }, 300);
}

async function writeAllItems(items, removeIds, settings){
  const ops = [
    ...removeIds.map(id => b => b.delete(fb.doc(farmRef(), 'items', id))),
    ...items.map(it => b => b.set(fb.doc(farmRef(), 'items', it.id), itemDoc(it))),
  ];
  if(settings) ops.push(b => b.update(farmRef(), { ...settings, updatedBy: by(), updatedAt: fb.serverTimestamp() }));
  for(let i = 0; i < ops.length; i += 400){
    const batch = fb.writeBatch(fb.db);
    ops.slice(i, i + 400).forEach(op => op(batch));
    await batch.commit();
  }
}

// Replace the whole farm (import, start blank, restore). A backup is taken first.
export async function replaceAll(data, reason){
  await createSnapshot(reason || 'Before replacing the farm');
  const f = migrate(data);
  const old = state.farm.items.map(i => i.id);
  state.farm = f;
  emit({ type:'all' });
  if(state.mode !== 'cloud'){ saveLocal(); return; }
  await writeAllItems(f.items, old.filter(id => !f.items.some(i => i.id === id)), settingsOf(f));
}

/* ---------------- Backups (snapshots) ---------------- */
export async function createSnapshot(reason){
  const farm = exportFarm();
  const entry = { atMs: Date.now(), by: by(), reason, itemCount: farm.items.length, data: JSON.stringify(farm) };
  if(state.mode !== 'cloud'){
    const list = readJSON(LOCAL_SNAPS) || [];
    list.unshift({ id: String(entry.atMs), ...entry });
    writeJSON(LOCAL_SNAPS, list.slice(0, 15));
    return;
  }
  await fb.addDoc(fb.collection(farmRef(), 'snapshots'), { ...entry, at: fb.serverTimestamp() });
}

export async function listSnapshots(max = 15){
  if(state.mode !== 'cloud') return (readJSON(LOCAL_SNAPS) || []).slice(0, max).map(({ data, ...rest }) => rest);
  const qs = await fb.getDocs(fb.query(fb.collection(farmRef(), 'snapshots'), fb.orderBy('atMs', 'desc'), fb.limit(max)));
  return qs.docs.map(d => { const { data, at, ...rest } = d.data(); return { id: d.id, ...rest }; });
}

export async function restoreSnapshot(id){
  let data;
  if(state.mode !== 'cloud') data = (readJSON(LOCAL_SNAPS) || []).find(s => s.id === id)?.data;
  else data = (await fb.getDoc(fb.doc(farmRef(), 'snapshots', id))).data()?.data;
  if(!data) throw new Error('Backup not found');
  await replaceAll(JSON.parse(data), 'Before restoring a backup');
}

async function autoSnapshot(){
  try{
    const latest = await listSnapshots(1);
    if(!latest.length || Date.now() - latest[0].atMs > 20 * 3600 * 1000) await createSnapshot('Daily automatic backup');
    // Tidy up: beyond the newest 40, remove backups older than 30 days (the database rules allow nothing newer to be deleted).
    const month = Date.now() - 30 * 86400000;
    const qs = await fb.getDocs(fb.query(fb.collection(farmRef(), 'snapshots'), fb.orderBy('atMs', 'desc')));
    for(const d of qs.docs.slice(KEEP_SNAPSHOTS)) if(d.data().atMs < month) await fb.deleteDoc(d.ref);
  }catch(e){ console.warn('Backup skipped', e); }
}

/* ---------------- Test version helper ---------------- */
export async function copyLiveIntoTest(){
  if(!IS_BETA || state.mode !== 'cloud') throw new Error('Only available in the test version on a family farm');
  const liveRef = fb.doc(fb.db, 'farms', state.code);
  const live = await fb.getDoc(liveRef);
  const items = await fb.getDocs(fb.collection(liveRef, 'items'));
  await replaceAll({ ...live.data(), items: items.docs.map(d => ({ ...d.data(), id: d.id })) }, 'Before copying the real farm in');
}

export { SCHEMA };
