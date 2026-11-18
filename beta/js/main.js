// =========================================================
// Farm Planner 3D — the editor: scene, tools, side panel.
// Saving goes through store.js; data format lives in schema.js.
// =========================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as store from './store.js';
import { state } from './store.js';
import { DEFAULTS, FIELDS, ICON, SPECIES, SCHEMA, habitFor, settingsOf } from './schema.js';
import { currentSeason, groundColor, seasonLabel } from './seasons.js';
import { buildItem, disposeGroup } from './items3d.js';
import { fetchWeather, searchPlaces } from './weather.js';
import { IS_BETA, APP_VERSION } from './config.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);

let farm = null;                 // always === state.farm
let previewSeason = 'auto';      // season preview is only on this screen
const season = () => currentSeason({ ...farm, season: previewSeason });

$('betaBar').hidden = !IS_BETA;
$('speciesList').innerHTML = SPECIES.map(s => `<option>${esc(s)}</option>`).join('');

/* =========================================================
   Scene
   ========================================================= */
const view = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
view.prepend(renderer.domElement);

const scene = new THREE.Scene();
const SKY = { clear: new THREE.Color('#bcd9ef'), cloudy: new THREE.Color('#c9cfd4'), rain: new THREE.Color('#9fa8ad') };
scene.background = SKY.clear.clone();
scene.fog = new THREE.Fog(scene.background.clone(), 300, 900);

const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 3000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;

scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7a4a, 0.9));
const sun = new THREE.DirectionalLight(0xfff3dd, 1.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun, sun.target);

const groundGroup = new THREE.Group();
const itemsGroup = new THREE.Group();
scene.add(groundGroup, itemsGroup);
let groundMesh = null;
let raining = false, rainPts = null;

function buildGround(){
  groundGroup.clear();
  const W = farm.width, D = farm.depth;
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(W * 6 + 400, D * 6 + 400), new THREE.MeshLambertMaterial({ color: '#93a374' }));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.05; outer.receiveShadow = true;
  groundGroup.add(outer);
  groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ color: groundColor(season()) }));
  groundMesh.rotation.x = -Math.PI / 2; groundMesh.receiveShadow = true;
  groundGroup.add(groundMesh);
  const pts = [];
  for(let x = -W / 2; x <= W / 2 + 0.01; x += 10) pts.push(x, 0.02, -D / 2, x, 0.02, D / 2);
  for(let z = -D / 2; z <= D / 2 + 0.01; z += 10) pts.push(-W / 2, 0.02, z, W / 2, 0.02, z);
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  groundGroup.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.08 })));
  const fence = new THREE.Group();
  const postMat = new THREE.MeshLambertMaterial({ color: '#6b5137' }), railMat = new THREE.MeshLambertMaterial({ color: '#8a6a48' });
  for(const [x1, z1, x2, z2] of [[-W/2,-D/2,W/2,-D/2],[W/2,-D/2,W/2,D/2],[W/2,D/2,-W/2,D/2],[-W/2,D/2,-W/2,-D/2]]){
    const len = Math.hypot(x2 - x1, z2 - z1);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08), railMat);
    rail.position.set((x1 + x2) / 2, 1.0, (z1 + z2) / 2);
    rail.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    fence.add(rail);
    const n = Math.max(1, Math.round(len / 5));
    for(let i = 0; i < n; i++){
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, 0.15), postMat);
      p.position.set(x1 + (x2 - x1) * i / n, 0.6, z1 + (z2 - z1) * i / n);
      fence.add(p);
    }
  }
  groundGroup.add(fence);
  const north = makeLabel('N ↑', '#24402a');
  north.position.set(0, 3, -D / 2 - 8);
  groundGroup.add(north);
  const M = Math.max(W, D);
  sun.position.set(M * 0.4, M * 0.8, M * 0.3);
  Object.assign(sun.shadow.camera, { left: -M * 0.75, right: M * 0.75, top: M * 0.75, bottom: -M * 0.75, near: 1, far: M * 3 });
  sun.shadow.camera.updateProjectionMatrix();
  buildRain();
}

function makeLabel(text, color){
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,253,248,.9)'; g.beginPath();
  if(g.roundRect) g.roundRect(4, 4, 120, 56, 14); else g.rect(4, 4, 120, 56);
  g.fill();
  g.fillStyle = color; g.font = 'bold 32px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 34);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  s.scale.set(8, 4, 1);
  return s;
}

function buildRain(){
  if(rainPts){ scene.remove(rainPts); rainPts.geometry.dispose(); }
  const N = 6000, W = farm.width, D = farm.depth, pos = new Float32Array(N * 3);
  for(let i = 0; i < N; i++){ pos[i*3] = (Math.random() - 0.5) * W; pos[i*3+1] = Math.random() * 60; pos[i*3+2] = (Math.random() - 0.5) * D; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  rainPts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xdfe9f2, size: 0.25, transparent: true, opacity: 0.7 }));
  rainPts.visible = raining; scene.add(rainPts);
}
function setSky(kind, rain){
  scene.background.copy(SKY[kind]); scene.fog.color.copy(SKY[kind]);
  sun.intensity = kind === 'clear' ? 1.6 : kind === 'cloudy' ? 0.9 : 0.6;
  raining = rain; if(rainPts) rainPts.visible = rain;
}

/* =========================================================
   Items in the scene
   ========================================================= */
const meshes = new Map();
function rebuildItem(it){
  const old = meshes.get(it.id);
  if(old){ itemsGroup.remove(old); disposeGroup(old); }
  const g = buildItem(it, season());
  meshes.set(it.id, g); itemsGroup.add(g);
  if(selectedId === it.id) updateSelBox();
}
function removeMesh(id){
  const g = meshes.get(id);
  if(g){ itemsGroup.remove(g); disposeGroup(g); meshes.delete(id); }
}
function rebuildAll(){
  for(const id of [...meshes.keys()]) removeMesh(id);
  farm.items.forEach(rebuildItem);
}
const findItem = id => farm.items.find(i => i.id === id);

/* =========================================================
   Selection, placing, dragging
   ========================================================= */
let tool = 'select', selectedId = null, snap = true;
const selBox = new THREE.BoxHelper(undefined, 0xffb000);
selBox.visible = false; scene.add(selBox);

function updateSelBox(){
  const g = meshes.get(selectedId);
  if(g){ selBox.setFromObject(g); selBox.visible = true; } else selBox.visible = false;
}
function select(id){ selectedId = id; updateSelBox(); renderPanel(); }
function setTool(t){
  tool = t;
  document.querySelectorAll('.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  $('hint').textContent = t === 'select'
    ? 'Click an object to edit it · drag to move · R to rotate · Delete to remove'
    : `Click the ground to place a ${DEFAULTS[t].name.toLowerCase()} · Esc to stop`;
  renderer.domElement.style.cursor = t === 'select' ? 'default' : 'crosshair';
}
document.querySelectorAll('.tool').forEach(b => b.onclick = () => setTool(b.dataset.tool));

const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function setRay(e){
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}
function groundPoint(e){ setRay(e); const p = new THREE.Vector3(); return raycaster.ray.intersectPlane(groundPlane, p) ? p : null; }
function pickItem(e){
  setRay(e);
  const hit = raycaster.intersectObjects(itemsGroup.children, true)[0];
  if(!hit) return null;
  let o = hit.object; while(o && !o.userData.id) o = o.parent;
  return o ? o.userData.id : null;
}
const clampX = x => Math.max(-farm.width / 2, Math.min(farm.width / 2, x));
const clampZ = z => Math.max(-farm.depth / 2, Math.min(farm.depth / 2, z));
const snapV = v => snap ? Math.round(v) : Math.round(v * 10) / 10;

let down = null, drag = null;
renderer.domElement.addEventListener('pointerdown', e => {
  if(e.button !== 0) return;
  down = { x: e.clientX, y: e.clientY };
  if(tool !== 'select') return;
  const id = pickItem(e); if(!id) return;
  const it = findItem(id), p = groundPoint(e);
  if(it && p){ drag = { id, ox: it.x - p.x, oz: it.z - p.z, moved: false }; controls.enabled = false; }
  if(id !== selectedId) select(id);
});
window.addEventListener('pointermove', e => {
  if(!drag) return;
  const p = groundPoint(e), it = findItem(drag.id); if(!p || !it) return;
  it.x = snapV(clampX(p.x + drag.ox)); it.z = snapV(clampZ(p.z + drag.oz));
  meshes.get(it.id)?.position.set(it.x, 0, it.z);
  drag.moved = true; updateSelBox();
});
window.addEventListener('pointerup', e => {
  if(drag){
    controls.enabled = true;
    const it = findItem(drag.id);
    if(drag.moved && it){ store.saveItem(it); renderPanel(); }
    drag = null; down = null; return;
  }
  if(!down || e.target !== renderer.domElement){ down = null; return; }
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5;
  down = null;
  if(moved) return;
  if(tool === 'select'){ if(!pickItem(e)) select(null); return; }
  const p = groundPoint(e); if(!p) return;
  if(Math.abs(p.x) > farm.width / 2 || Math.abs(p.z) > farm.depth / 2) return;
  const it = Object.assign({ id: uid(), type: tool, x: snapV(p.x), z: snapV(p.z), rot: 0 }, structuredClone(DEFAULTS[tool]));
  if(tool !== 'house') it.name = `${DEFAULTS[tool].name} ${farm.items.filter(i => i.type === tool).length + 1}`;
  farm.items.push(it); rebuildItem(it); select(it.id); store.saveItem(it);
});

window.addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if(e.key === 'Escape'){ setTool('select'); select(null); closeDlg(); return; }
  if(typing || !selectedId) return;
  if(e.key === 'Delete' || e.key === 'Backspace'){ removeItem(selectedId); e.preventDefault(); }
  if(e.key === 'r' || e.key === 'R'){
    const it = findItem(selectedId); if(!it) return;
    it.rot = ((it.rot || 0) + (e.shiftKey ? -15 : 15) + 360) % 360;
    rebuildItem(it); renderPanel(); store.saveItem(it);
  }
});

function removeItem(id){
  farm.items = farm.items.filter(i => i.id !== id);
  removeMesh(id);
  if(selectedId === id) select(null); else renderPanel();
  store.deleteItem(id);
}
function duplicateItem(id){
  const src = findItem(id); if(!src) return;
  const it = structuredClone(src); it.id = uid();
  it.x = snapV(clampX(it.x + 4)); it.z = snapV(clampZ(it.z + 4));
  farm.items.push(it); rebuildItem(it); select(it.id); store.saveItem(it);
}

/* =========================================================
   Side panel
   ========================================================= */
const panel = $('panel');
const panelBusy = () => panel.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);

function renderPanel(){
  const it = findItem(selectedId);
  if(it) renderItemPanel(it); else renderFarmPanel();
}

function field(key, label, kind, val, opts){
  let input;
  if(kind === 'num') input = `<input type="number" step="0.5" data-k="${key}" value="${esc(val)}">`;
  else if(kind === 'color') input = `<input type="color" data-k="${key}" value="${esc(val)}">`;
  else if(kind === 'sel') input = `<select data-k="${key}">${opts.map(o => `<option ${o === val ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
  else if(kind === 'area') input = `<textarea data-k="${key}">${esc(val)}</textarea>`;
  else if(kind === 'species') input = `<input list="speciesList" data-k="${key}" value="${esc(val)}" placeholder="e.g. Teak">`;
  else input = `<input type="text" data-k="${key}" value="${esc(val)}">`;
  return `<div class="f"><label>${label}</label>${input}</div>`;
}

function renderItemPanel(it){
  panel.innerHTML = `
    <h2>${ICON[it.type]} <span id="itTitle">${esc(it.name)}</span></h2>
    ${field('name', 'Name', 'text', it.name)}
    <h3>Position</h3>
    ${field('x', 'East–West (m)', 'num', it.x)}
    ${field('z', 'North–South (m)', 'num', it.z)}
    ${field('rot', 'Rotation (°)', 'num', it.rot || 0)}
    <h3>Details</h3>
    ${FIELDS[it.type].map(([k, l, kind, opts]) => field(k, l, kind, it[k], opts)).join('')}
    ${it.updatedBy ? `<p class="muted">Last changed by ${esc(it.updatedBy)}</p>` : ''}
    <div class="row" style="margin-top:14px">
      <button class="btn" id="dupBtn">Duplicate</button>
      <button class="btn danger" id="delBtn">Delete</button>
      <button class="btn" id="doneBtn" style="margin-left:auto">Done</button>
    </div>
    <p class="muted" style="margin-top:14px">Tip: drag it in the scene to move it. Press R to rotate by 15°.</p>`;
  panel.querySelectorAll('[data-k]').forEach(el => el.addEventListener('input', () => {
    const k = el.dataset.k;
    let v = el.value;
    if(el.type === 'number'){ v = Number(v); if(!Number.isFinite(v)) return; }
    if(k === 'x') v = clampX(v);
    if(k === 'z') v = clampZ(v);
    it[k] = v;
    if(k === 'species'){
      const hab = habitFor(v);
      if(hab){ it.habit = hab; const hs = panel.querySelector('[data-k="habit"]'); if(hs) hs.value = hab; }
      if(!it.name || /^Tree( \d+)?$/.test(it.name)){ it.name = v || 'Tree'; panel.querySelector('[data-k="name"]').value = it.name; }
    }
    $('itTitle').textContent = it.name;
    rebuildItem(it); store.saveItem(it);
  }));
  $('dupBtn').onclick = () => duplicateItem(it.id);
  $('delBtn').onclick = () => removeItem(it.id);
  $('doneBtn').onclick = () => select(null);
}

function sharingHTML(){
  const joinBox = `<div class="inline" style="margin-top:8px"><input id="joinLink" placeholder="Paste a family link">
      <button class="btn" data-act="join">Open</button></div>`;
  switch(state.status){
    case 'offline':
      return `<div class="note">Shared storage isn't set up for this copy yet, so changes are saved in this browser only.</div>`;
    case 'no-farm':
      return `<div class="note">This farm is only on this device. Create a family link to share it: anyone you send the link to can see and edit it, live. No accounts needed.</div>
        <button class="btn primary" data-act="create">Create family link</button>
        <p class="muted" style="margin:10px 0 0">Already have a family link?</p>${joinBox}
        <p class="muted" id="shareMsg"></p>`;
    case 'connecting':
      return `<div class="note">Opening the family farm…</div>`;
    case 'not-found':
    case 'error':
      return `<div class="note bad">${esc(state.error)}</div>
        ${state.status === 'not-found' ? '<button class="btn" data-act="create">Create a new family link instead</button>' : ''}
        ${joinBox}<p class="muted" id="shareMsg"></p>`;
    case 'ready':
      return `<div class="note ok">✓ Family farm · changes sync live for everyone with the link.</div>
        <div class="inline"><input id="famLink" readonly value="${esc(store.shareLink())}">
          <button class="btn primary" data-act="copylink">Copy</button></div>
        <p class="muted" style="margin:6px 0 10px">Send this link to family. Anyone with it can edit, so share it only with people you trust. Backups below can undo any change.</p>
        <div class="f"><label>Your name</label><input id="editorName" placeholder="shown on what you change" value="${esc(store.editorName())}"></div>
        ${IS_BETA ? `<button class="btn" data-act="copylive">Copy the real farm into this test copy</button>` : ''}
        <div class="row" style="margin-top:8px"><button class="btn small" data-act="leave">Stop using this link on this device</button></div>
        <p class="muted" id="shareMsg"></p>`;
  }
  return '';
}

function renderFarmPanel(){
  const counts = {};
  farm.items.filter(i => i.type === 'tree').forEach(t => {
    const s = (t.species || '').trim() || 'Unnamed'; counts[s] = (counts[s] || 0) + 1;
  });
  const speciesRows = Object.entries(counts).sort((a, b) => b[1] - a[1])
    .map(([s, c]) => `<div class="li static"><span class="t">🌳 ${esc(s)}</span><span class="s">${c}</span></div>`).join('');
  const itemRows = farm.items.map(i => `
    <div class="li" data-id="${esc(i.id)}"><span>${ICON[i.type]}</span><span class="t">${esc(i.name)}</span>
    <span class="s">${i.type === 'tree' ? esc(i.species || '') : ''}</span></div>`).join('');

  panel.innerHTML = `
    <h2>🌾 Farm</h2>
    ${field('name', 'Farm name', 'text', farm.name)}
    ${field('width', 'Width E–W (m)', 'num', farm.width)}
    ${field('depth', 'Depth N–S (m)', 'num', farm.depth)}
    <p class="muted">${(farm.width * farm.depth / 10000).toFixed(2)} ha · grid squares are 10 m</p>

    <h3>Sharing</h3>
    ${sharingHTML()}

    <h3>Trees by species</h3>
    <div class="list">${speciesRows || '<div class="empty">No trees yet</div>'}</div>

    <h3>Everything on the farm (${farm.items.length})</h3>
    <div class="list" id="itemList">${itemRows || '<div class="empty">Nothing placed yet</div>'}</div>

    <h3>Backups</h3>
    <p class="muted" style="margin:0 0 8px">A backup is saved automatically every day and before any import, restore or clear.</p>
    <div class="row" style="margin-bottom:8px"><button class="btn" data-act="backup">Save a backup now</button></div>
    <div class="list" id="snapList"><div class="empty">Loading…</div></div>

    <h3>Files</h3>
    <div class="row">
      <button class="btn" data-act="export">Export file</button>
      <button class="btn" data-act="import">Import file</button>
      <button class="btn danger" data-act="clear">Start blank</button>
    </div>
    <input type="file" id="impFile" accept=".json,application/json" hidden>
    <p class="muted" id="fileMsg"></p>
    <p class="muted" style="margin-top:18px">Farm Planner ${APP_VERSION}${IS_BETA ? ' (test)' : ''} · data format v${SCHEMA}</p>`;

  panel.querySelectorAll('[data-k]').forEach(el => el.addEventListener('change', () => {
    const k = el.dataset.k;
    if(k === 'name'){ farm.name = el.value || 'My Farm'; $('farmTitle').textContent = farm.name; }
    else { farm[k] = Math.max(10, Number(el.value) || farm[k]); buildGround(); frameCamera(); renderPanel(); }
    store.saveSettings();
  }));
  panel.querySelectorAll('#itemList .li').forEach(el => el.onclick = () => { select(el.dataset.id); focusOn(el.dataset.id); });
  panel.querySelectorAll('[data-act]').forEach(el => el.onclick = () => panelAction(el.dataset.act, el));
  $('impFile').onchange = importFile;
  $('joinLink')?.addEventListener('keydown', e => { if(e.key === 'Enter') panelAction('join'); });
  $('editorName')?.addEventListener('change', e => store.setEditorName(e.target.value));
  loadSnapshots();
}

async function panelAction(act, el){
  const msg = t => { const m = $('fileMsg'); if(m) m.textContent = t; };
  try{
    const shareMsg = t => { const m = $('shareMsg'); if(m) m.textContent = t; };
    if(act === 'create'){
      if(el) el.textContent = 'Creating…';
      try{ await store.createFamilyFarm(); }catch(e){ shareMsg(e.message); if(el) el.textContent = 'Create family link'; }
      return;
    }
    if(act === 'join'){
      try{ await store.joinFamilyFarm($('joinLink')?.value); }catch(e){ shareMsg(e.message); }
      return;
    }
    if(act === 'copylink'){
      const inp = $('famLink'); inp.select();
      try{ await navigator.clipboard.writeText(inp.value); el.textContent = 'Copied ✓'; }
      catch(e){ document.execCommand?.('copy'); el.textContent = 'Copied ✓'; }
      setTimeout(() => { if(el.isConnected) el.textContent = 'Copy'; }, 2000);
      return;
    }
    if(act === 'leave'){
      if(!el.dataset.confirm){ el.dataset.confirm = '1'; el.textContent = 'Click again (the shared farm itself stays as it is)'; return; }
      store.leaveFamilyFarm(); return;
    }
    if(act === 'copylive'){
      if(!el.dataset.confirm){ el.dataset.confirm = '1'; el.textContent = 'Click again to replace this test farm'; return; }
      el.textContent = 'Copying…'; await store.copyLiveIntoTest();
    }
    else if(act === 'backup'){ el.textContent = 'Saving…'; await store.createSnapshot('Saved by hand'); renderPanel(); }
    else if(act === 'export'){
      const blob = new Blob([JSON.stringify(store.exportFarm(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = (farm.name || 'farm').replace(/[^\w-]+/g, '_') + '.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    else if(act === 'import') $('impFile').click();
    else if(act === 'clear'){
      if(!el.dataset.confirm){ el.dataset.confirm = '1'; el.textContent = 'Click again to clear everything'; return; }
      await store.replaceAll({ ...settingsOf(farm), items: [] }, 'Before starting blank');
    }
    else if(act === 'restore'){
      if(!el.dataset.confirm){ el.dataset.confirm = '1'; el.textContent = 'Click again to restore'; return; }
      el.textContent = 'Restoring…'; await store.restoreSnapshot(el.dataset.id);
    }
  }catch(e){ console.error(e); msg('Something went wrong: ' + (e.code || e.message)); }
}

async function importFile(){
  const file = $('impFile').files[0]; if(!file) return;
  try{
    const f = JSON.parse(await file.text());
    if(!Array.isArray(f.items)) throw new Error('not a farm file');
    await store.replaceAll(f, 'Before importing ' + file.name);
  }catch(e){ const m = $('fileMsg'); if(m) m.textContent = 'That file could not be read as a farm.'; }
}

async function loadSnapshots(){
  const box = $('snapList'); if(!box) return;
  try{
    const list = await store.listSnapshots(10);
    if(!$('snapList')) return;
    box.innerHTML = list.length ? list.map(s => `
      <div class="li static"><span class="t" title="${esc(s.reason)}">${new Date(s.atMs).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
        <br><span class="s">${esc(s.reason)} · ${s.itemCount} objects</span></span>
        <button class="btn small" data-act="restore" data-id="${esc(s.id)}">Restore</button></div>`).join('')
      : '<div class="empty">No backups yet</div>';
    box.querySelectorAll('[data-act]').forEach(el => el.onclick = () => panelAction(el.dataset.act, el));
  }catch(e){ box.innerHTML = '<div class="empty">Backups unavailable right now</div>'; }
}

function focusOn(id){
  const it = findItem(id); if(!it) return;
  const off = camera.position.clone().sub(controls.target);
  controls.target.set(it.x, 0, it.z);
  camera.position.copy(controls.target).add(off.setLength(Math.min(off.length(), 60)));
}

/* =========================================================
   Header: sign-in status, season, weather
   ========================================================= */
function renderAuth(){
  const box = $('authBox'), s = state.status;
  if(s === 'ready') box.innerHTML = `<span class="dot ok"></span> Family farm · synced`;
  else if(s === 'connecting') box.innerHTML = `<span class="dot"></span> Connecting…`;
  else if(s === 'error' || s === 'not-found') box.innerHTML = `<span class="dot bad"></span> Not synced`;
  else box.innerHTML = `<span class="dot"></span> This device only`;
}

function updateSeasonUI(){
  $('seasonLabel').textContent = seasonLabel({ ...farm, season: previewSeason });
  $('seasonSel').value = previewSeason;
}
$('seasonSel').onchange = e => {
  previewSeason = e.target.value;
  updateSeasonUI(); groundMesh.material.color.set(groundColor(season())); rebuildAll();
};

let wxTimer = null, wxKey = '';
async function loadWeather(){
  const chips = $('wxchips'), msg = $('wxmsg'), loc = farm.location;
  $('locName').textContent = loc ? loc.name : 'Set farm location';
  if(!loc){ chips.innerHTML = ''; msg.textContent = 'Set your farm location to see live weather'; setSky('clear', false); return; }
  msg.textContent = 'Loading weather…';
  try{
    const w = await fetchWeather(loc);
    chips.innerHTML = w.chips.map(([k, v, big]) => `<div class="chip${big ? ' big' : ''}"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('');
    msg.textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    setSky(w.sky, w.raining);
  }catch(e){
    chips.innerHTML = '';
    msg.textContent = 'Weather unavailable right now. Check your internet connection.';
  }
}
function scheduleWeather(force){
  const key = JSON.stringify(farm.location);
  if(!force && key === wxKey) return;
  wxKey = key;
  clearInterval(wxTimer); loadWeather(); wxTimer = setInterval(loadWeather, 15 * 60 * 1000);
}

/* ---------- Location dialog ---------- */
const dlg = $('dlg'), geomsg = $('geomsg');
function openDlg(){
  dlg.classList.add('open'); geomsg.textContent = ''; $('georesults').innerHTML = '';
  if(farm.location){ $('geolat').value = farm.location.lat; $('geolon').value = farm.location.lon; }
  setTimeout(() => $('geoq').focus(), 50);
}
function closeDlg(){ dlg.classList.remove('open'); }
function setLocation(loc){
  farm.location = loc; store.saveSettings(); closeDlg();
  updateSeasonUI(); groundMesh.material.color.set(groundColor(season())); rebuildAll(); scheduleWeather();
}
$('locBtn').onclick = openDlg;
$('geoCancel').onclick = closeDlg;
dlg.addEventListener('click', e => { if(e.target === dlg) closeDlg(); });
async function geoSearch(){
  const q = $('geoq').value.trim(); if(!q) return;
  const out = $('georesults');
  out.innerHTML = '<div class="empty">Searching…</div>';
  try{
    const results = await searchPlaces(q);
    if(!results.length){ out.innerHTML = '<div class="empty">No places found. Try a nearby town name.</div>'; return; }
    out.innerHTML = '<div class="list">' + results.map((p, i) =>
      `<div class="li" data-i="${i}"><span class="t">${esc(p.short)}</span><span class="s">${esc(p.detail)}</span></div>`).join('') + '</div>';
    out.querySelectorAll('.li').forEach(el => el.onclick = () => {
      const p = results[+el.dataset.i]; setLocation({ name: p.name, lat: p.lat, lon: p.lon });
    });
  }catch(e){ out.innerHTML = '<div class="empty">Search failed. Check your internet connection, or type coordinates below.</div>'; }
}
$('geoGo').onclick = geoSearch;
$('geoq').addEventListener('keydown', e => { if(e.key === 'Enter') geoSearch(); });
$('geoSave').onclick = () => {
  const lat = parseFloat($('geolat').value), lon = parseFloat($('geolon').value);
  if(isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180){ geomsg.textContent = 'Enter a valid latitude and longitude.'; return; }
  setLocation({ name: `${lat.toFixed(3)}, ${lon.toFixed(3)}`, lat, lon });
};
$('geoMe').onclick = () => {
  if(!navigator.geolocation){ geomsg.textContent = 'Your browser can’t share location here. Search or type coordinates instead.'; return; }
  geomsg.textContent = 'Asking your browser for location…';
  navigator.geolocation.getCurrentPosition(
    p => setLocation({ name: 'My location', lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4) }),
    () => geomsg.textContent = 'Location was blocked. Search or type coordinates instead.',
    { timeout: 10000 });
};

/* =========================================================
   Camera
   ========================================================= */
let topView = false;
function frameCamera(){
  const M = Math.max(farm.width, farm.depth);
  controls.target.set(0, 0, 0);
  if(topView) camera.position.set(0, M * 1.25, 0.01);
  else camera.position.set(M * 0.45, M * 0.55, M * 0.75);
  controls.update();
}
const b3d = $('btn3d'), btop = $('btnTop'), bsnap = $('btnSnap');
b3d.onclick = () => { topView = false; b3d.classList.add('on'); btop.classList.remove('on'); controls.enableRotate = true; frameCamera(); };
btop.onclick = () => { topView = true; btop.classList.add('on'); b3d.classList.remove('on'); controls.enableRotate = false; frameCamera(); };
bsnap.onclick = () => { snap = !snap; bsnap.classList.toggle('on', snap); };

/* =========================================================
   Reacting to the store (own saves, family members' edits)
   ========================================================= */
let lastSize = '';
function applyFarm(){
  farm = state.farm;
  $('farmTitle').textContent = farm.name;
  selectedId = null; selBox.visible = false;
  buildGround(); rebuildAll();
  const size = farm.width + 'x' + farm.depth;
  if(size !== lastSize){ frameCamera(); lastSize = size; }
  updateSeasonUI(); renderPanel(); scheduleWeather(true);
}
function applySettings(){
  $('farmTitle').textContent = farm.name;
  const size = farm.width + 'x' + farm.depth;
  if(size !== lastSize){ lastSize = size; buildGround(); frameCamera(); }
  updateSeasonUI(); groundMesh.material.color.set(groundColor(season()));
  rebuildAll(); scheduleWeather();
  if(!panelBusy()) renderPanel();
}

store.onChange(ch => {
  if(ch.type === 'all') applyFarm();
  else if(ch.type === 'settings') applySettings();
  else if(ch.type === 'items'){
    for(const c of ch.changes){
      if(c.removed){ removeMesh(c.id); if(selectedId === c.id){ selectedId = null; selBox.visible = false; } }
      else { const it = findItem(c.id); if(it) rebuildItem(it); }
    }
    if(!panelBusy() && !drag) renderPanel();
  }
  else if(ch.type === 'status'){ renderAuth(); if(!findItem(selectedId) && !panelBusy()) renderPanel(); }
});

/* =========================================================
   Start up
   ========================================================= */
function starterFarm(){
  const f = { name: 'My Farm', width: 200, depth: 150, location: null, season: 'auto', items: [] };
  const add = (type, x, z, extra = {}) => f.items.push(Object.assign({ id: uid(), type, x, z, rot: 0 }, structuredClone(DEFAULTS[type]), extra));
  add('house', 0, 0); add('shed', 20, -6); add('pond', -30, 22); add('path', 0, 22, { d: 24 });
  add('bed', 18, 14); add('bed', 18, 18);
  ['Mango', 'Guava', 'Sapota', 'Pomegranate'].forEach((s, i) => { for(let r = 0; r < 3; r++) add('tree', 40 + i * 7, -20 + r * 8, { name: s, species: s, habit: habitFor(s), height: 4.5, canopy: 4 }); });
  add('tree', -22, -18, { name: 'Teak', species: 'Teak', habit: 'deciduous', height: 18, canopy: 8 });
  add('tree', -40, -10, { name: 'Neem', species: 'Neem', habit: 'evergreen', height: 12, canopy: 9 });
  return f;
}

function resize(){
  const w = view.clientWidth, h = view.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);

renderer.setAnimationLoop(() => {
  controls.update();
  if(raining && rainPts){
    const a = rainPts.geometry.attributes.position;
    for(let i = 1; i < a.array.length; i += 3){ a.array[i] -= 0.9; if(a.array[i] < 0) a.array[i] = 60; }
    a.needsUpdate = true;
  }
  renderer.render(scene, camera);
});

setTool('select');
renderAuth();
resize();
window.__farmReady = true;
store.init(starterFarm);
