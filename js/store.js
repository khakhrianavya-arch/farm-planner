// =========================================================
// Where the farm is saved.
//  • Offline mode: this browser only (localStorage).
//  • Shared mode: Firebase Firestore, synced live between family members.
// The rest of the app only talks to this module, so the way data is
// stored can change without touching the 3D editor.
// =========================================================
import { firebaseConfig, FARM_ID, LIVE_FARM_ID, IS_BETA } from './config.js';
import { SCHEMA, migrate, normalizeItem, settingsOf, blankFarm } from './schema.js';

const FB_VERSION = '10.12.2';
const LOCAL_KEY = IS_BETA ? 'farmPlanner.beta' : 'farmPlanner.v1';
const LOCAL_SNAPS = LOCAL_KEY + '.snapshots';
const MAX_SNAPSHOTS = 40;

export const cloudAvailable = !!firebaseConfig.apiKey;

// status: 'offline' | 'signed-out' | 'connecting' | 'ready' | 'no-access' | 'error'
export const state = {
  mode: 'local', status: cloudAvailable ? 'signed-out' : 'offline',
  farm: null, user: null, isOwner: false, owner: '', members: [], error: ''
};

const listeners = new Set();
export function onChange(fn){ listeners.add(fn); }
function emit(change){ listeners.forEach(fn => { try{ fn(change); }catch(e){ console.error(e); } }); }

let fb = null;          // Firebase functions + instances once loaded
let unsubs = [];
const email = () => (state.user?.email || '').toLowerCase();
const farmRef = (id = FARM_ID) => fb.doc(fb.db, 'farms', id);

/* ---------------- Local (this browser) ---------------- */
function readJSON(key){ try{ const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; }catch(e){ return null; } }
function writeJSON(key, v){ try{ localStorage.setItem(key, JSON.stringify(v)); return true; }catch(e){ return false; } }
let localTimer = null;
function saveLocal(){ clearTimeout(localTimer); localTimer = setTimeout(() => writeJSON(LOCAL_KEY, exportFarm()), 200); }

export function exportFarm(){
  const f = state.farm;
  return { ...settingsOf(f), items: f.items.map(it => ({ ...it })) };
}

/* ---------------- Start up ---------------- */
export async function init(starter){
  const saved = readJSON(LOCAL_KEY);
  state.farm = saved ? migrate(saved) : migrate(starter ? starter() : blankFarm());
  emit({ type:'all' });
  if(!cloudAvailable) return;
  try{
    const base = `https://www.gstatic.com/firebasejs/${FB_VERSION}/`;
    const [appM, authM, fsM] = await Promise.all([
      import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
    const app = appM.initializeApp(firebaseConfig);
    fb = { ...authM, ...fsM, auth: authM.getAuth(app), db: fsM.getFirestore(app) };
  }catch(e){
    console.error(e);
    setStatus('error', 'Could not load sign-in. Check your internet connection.');
    return;
  }
  fb.onAuthStateChanged(fb.auth, user => {
    state.user = user;
    if(user) connect(); else { disconnect(); backToLocal(); setStatus('signed-out'); }
  });
}

function setStatus(status, error = ''){ state.status = status; state.error = error; emit({ type:'auth' }); }

export async function signIn(){
  if(!fb) return;
  try{ await fb.signInWithPopup(fb.auth, new fb.GoogleAuthProvider()); }
  catch(e){
    if(e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
    setStatus('error', e.code === 'auth/unauthorized-domain'
      ? 'This web address is not yet allowed in Firebase (Authentication → Settings → Authorized domains).'
      : 'Sign-in failed: ' + (e.code || e.message));
  }
}
export async function signOutUser(){ if(fb) await fb.signOut(fb.auth); }

function disconnect(){ unsubs.forEach(u => u()); unsubs = []; }
function backToLocal(){
  state.mode = 'local'; state.isOwner = false; state.owner = ''; state.members = [];
  const saved = readJSON(LOCAL_KEY);
  state.farm = migrate(saved || blankFarm());
  emit({ type:'all' });
}

async function createFarm(id){
  const me = email();
  await fb.setDoc(farmRef(id), { ...settingsOf(blankFarm()), owner: me, members: [me],
    createdAt: fb.serverTimestamp(), updatedBy: me });
}

async function openFarmDoc(id){
  try{
    const s = await fb.getDoc(farmRef(id));
    if(s.exists()) return s;
  }catch(e){
    if(e.code !== 'permission-denied') throw e;
  }
  // Either the farm does not exist yet (only the owner may create it) or this person has no access.
  try{ await createFarm(id); return await fb.getDoc(farmRef(id)); }
  catch(e){ return null; }
}

async function connect(){
  disconnect();
  setStatus('connecting');
  let snap;
  try{ snap = await openFarmDoc(FARM_ID); }
  catch(e){ console.error(e); setStatus('error', 'Could not reach the shared farm: ' + (e.code || e.message)); return; }
  if(!snap){ backToLocal(); setStatus('no-access'); return; }

  const d = snap.data();
  state.mode = 'cloud';
  applyFarmDoc(d);
  state.farm = migrate({ ...d, items: [] });

  unsubs.push(fb.onSnapshot(farmRef(), s => {
    if(!s.exists() || s.metadata.hasPendingWrites) return;
    const dd = s.data();
    applyFarmDoc(dd);
    Object.assign(state.farm, settingsOf(migrate({ ...dd, items: [] })));
    emit({ type:'settings' });
  }, onError));

  let first = true;
  unsubs.push(fb.onSnapshot(fb.collection(farmRef(), 'items'), qs => {
    if(first){
      first = false;
      state.farm.items = qs.docs.map(x => normalizeItem({ ...x.data(), id: x.id })).filter(Boolean);
      state.status = 'ready'; state.error = '';
      emit({ type:'all' }); emit({ type:'auth' });
      autoSnapshot();
      return;
    }
    const changes = [];
    qs.docChanges().forEach(ch => {
      if(ch.doc.metadata.hasPendingWrites) return; // our own edit echoing back
      const id = ch.doc.id;
      const i = state.farm.items.findIndex(x => x.id === id);
      if(ch.type === 'removed'){ if(i >= 0) state.farm.items.splice(i, 1); changes.push({ id, removed:true }); return; }
      const it = normalizeItem({ ...ch.doc.data(), id });
      if(!it) return;
      if(i >= 0){
        const cur = state.farm.items[i];
        Object.keys(cur).forEach(k => { if(!(k in it)) delete cur[k]; });
        Object.assign(cur, it);
      } else state.farm.items.push(it);
      changes.push({ id, removed:false });
    });
    if(changes.length) emit({ type:'items', changes });
  }, onError));
}

function applyFarmDoc(d){
  state.owner = d.owner || '';
  state.members = Array.isArray(d.members) ? d.members : [];
  state.isOwner = state.owner === email();
}

function onError(e){
  console.error(e);
  if(e.code === 'permission-denied'){ disconnect(); backToLocal(); setStatus('no-access'); }
  else setStatus('error', 'Lost connection to the shared farm: ' + (e.code || e.message));
}

/* ---------------- Saving changes ---------------- */
const itemTimers = new Map();
export function saveItem(it){
  if(state.mode !== 'cloud'){ saveLocal(); return; }
  clearTimeout(itemTimers.get(it.id));
  itemTimers.set(it.id, setTimeout(() => {
    itemTimers.delete(it.id);
    const data = { ...it, updatedBy: email(), updatedAt: fb.serverTimestamp() };
    delete data.id;
    fb.setDoc(fb.doc(farmRef(), 'items', it.id), data).catch(onError);
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
    fb.updateDoc(farmRef(), { ...settingsOf(state.farm), updatedBy: email(), updatedAt: fb.serverTimestamp() }).catch(onError);
  }, 300);
}

// Replace the whole farm (import, start blank, restore). A backup is taken first.
export async function replaceAll(data, reason){
  await createSnapshot(reason || 'Before replacing the farm');
  const f = migrate(data);
  const old = state.farm.items.map(i => i.id);
  state.farm = f;
  emit({ type:'all' });
  if(state.mode !== 'cloud'){ saveLocal(); return; }
  const ops = [
    ...old.filter(id => !f.items.some(i => i.id === id)).map(id => b => b.delete(fb.doc(farmRef(), 'items', id))),
    ...f.items.map(it => b => { const d = { ...it, updatedBy: email(), updatedAt: fb.serverTimestamp() }; delete d.id;
      b.set(fb.doc(farmRef(), 'items', it.id), d); }),
    b => b.update(farmRef(), { ...settingsOf(f), updatedBy: email(), updatedAt: fb.serverTimestamp() }),
  ];
  for(let i = 0; i < ops.length; i += 400){
    const batch = fb.writeBatch(fb.db);
    ops.slice(i, i + 400).forEach(op => op(batch));
    await batch.commit();
  }
}

/* ---------------- Family access (owner only) ---------------- */
export async function setMembers(list){
  const clean = [...new Set(list.map(e => e.trim().toLowerCase()).filter(e => /.+@.+\..+/.test(e)))];
  if(!clean.includes(state.owner)) clean.unshift(state.owner);
  await fb.updateDoc(farmRef(), { members: clean });
  state.members = clean; emit({ type:'auth' });
}

/* ---------------- Backups (snapshots) ---------------- */
export async function createSnapshot(reason){
  const farm = exportFarm();
  const entry = { atMs: Date.now(), by: email() || 'this browser', reason, itemCount: farm.items.length, data: JSON.stringify(farm) };
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
    if(state.isOwner){
      const qs = await fb.getDocs(fb.query(fb.collection(farmRef(), 'snapshots'), fb.orderBy('atMs', 'desc')));
      for(const d of qs.docs.slice(MAX_SNAPSHOTS)) await fb.deleteDoc(d.ref);
    }
  }catch(e){ console.warn('Backup skipped', e); }
}

/* ---------------- Test copy helper ---------------- */
// In the /beta/ test version: copy the real farm into the test farm.
export async function copyLiveIntoTest(){
  if(!IS_BETA || state.mode !== 'cloud') throw new Error('Only available in the test version while signed in');
  const live = await fb.getDoc(farmRef(LIVE_FARM_ID));
  const items = await fb.getDocs(fb.collection(farmRef(LIVE_FARM_ID), 'items'));
  await replaceAll({ ...live.data(), items: items.docs.map(d => ({ ...d.data(), id: d.id })) }, 'Before copying the live farm in');
}

export { SCHEMA };
