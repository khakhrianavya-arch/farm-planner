// =========================================================
// The Insights and To-do tabs of the side panel.
// =========================================================
import { treeStats, spacingIssues, rainSummary, pondHarvest } from './insights.js';
import { suggestions, todaysPick, NOTE } from './advice.js';
import * as store from './store.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const mm = v => `${Math.round(v)} mm`;
const uid = () => Math.random().toString(36).slice(2, 10);

export const PALETTE = ['#2f7d3a', '#d9822b', '#3f86c8', '#b5482b', '#8a5cc4', '#c9a23a', '#1f9e9a', '#d45a8c', '#6b8e23', '#7a5c40', '#5f6b70', '#e0b84a'];
export function speciesColours(farm){
  const map = {};
  treeStats(farm).species.forEach((s, i) => { map[s.key] = s.key === 'unnamed' ? '#9aa3a8' : PALETTE[i % PALETTE.length]; });
  return map;
}

/* ---------- Hidden ("not relevant") suggestions, per device ---------- */
const HIDE_KEY = 'farmPlanner.hiddenTips';
function readHidden(){ try{ return JSON.parse(localStorage.getItem(HIDE_KEY) || '{}'); }catch(e){ return {}; } }
export function hiddenSet(){
  const now = Date.now(), map = readHidden();
  return new Set(Object.entries(map).filter(([, until]) => until > now).map(([id]) => id));
}
function hide(s){
  const map = readHidden(), end = new Date(); end.setHours(23, 59, 59, 999);
  map[s.id] = s.cat === 'weather' ? end.getTime() : Date.now() + 60 * 86400000;   // weather: today only; others: 2 months
  try{ localStorage.setItem(HIDE_KEY, JSON.stringify(map)); }catch(e){}
}

export function computeToday(farm, climate, date = new Date()){
  const list = suggestions({ farm, climate, date });
  return todaysPick(list, date, hiddenSet());
}

let cycle = 0;   // "Another idea" position on this screen

function onList(farm, id){ return Object.values(farm.tasks || {}).some(t => t.source === id && !t.done); }
function addTask(s){ store.saveTask({ id: uid(), title: s.title, body: s.body, source: s.id, createdAtMs: Date.now() }); }

/* ---------- Insights tab ---------- */
export function renderInsights(body, ctx){
  const { farm, climate, climateState } = ctx;
  const pick = computeToday(farm, climate);
  const options = [pick.today, ...pick.more].filter(Boolean);
  const shown = options.length ? options[cycle % options.length] : null;
  const dateLabel = new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' });

  const todayHTML = shown ? `
    <div class="today ${shown.cat === 'weather' && shown.prio >= 3 ? 'urgent' : ''}">
      <div class="today-k">Today on the farm · ${esc(dateLabel)}</div>
      <div class="today-t"><span>${shown.icon}</span> ${esc(shown.title)}</div>
      <p>${esc(shown.body)}</p>
      <div class="row">
        ${onList(farm, shown.id) ? '<span class="muted">✓ On the to-do list</span>' : `<button class="btn primary small" data-ins="add" data-id="${esc(shown.id)}">+ Add to to-do</button>`}
        <button class="btn small" data-ins="hide" data-id="${esc(shown.id)}">Not relevant</button>
        ${options.length > 1 ? `<button class="btn small" data-ins="next" style="margin-left:auto">Another idea ›</button>` : ''}
      </div>
    </div>` : `<div class="note">Nothing to suggest right now.</div>`;

  const others = options.filter(s => s !== shown).slice(0, 4).map(s => `
    <div class="li static"><span>${s.icon}</span><span class="t" title="${esc(s.body)}">${esc(s.title)}</span>
      ${onList(farm, s.id) ? '<span class="s">✓ listed</span>' : `<button class="btn small" data-ins="add" data-id="${esc(s.id)}" title="Add to to-do">+</button>`}</div>`).join('');

  // Trees
  const st = treeStats(farm);
  const colours = ctx.colourBySpecies ? speciesColours(farm) : null;
  const bars = st.species.slice(0, 10).map(s => `
    <div class="bar-row"><span class="bar-name">${colours ? `<i class="sw" style="background:${colours[s.key]}"></i>` : ''}${esc(s.name)}</span>
      <span class="bar"><span style="width:${Math.max(3, s.share * 100).toFixed(1)}%"></span></span><span class="bar-n">${s.count}</span></div>`).join('');
  const habits = Object.entries(st.byHabit).map(([h, n]) => `${n} ${h}`).join(' · ');
  const crowded = spacingIssues(farm.items, 6);
  const crowdedAll = spacingIssues(farm.items, 1000).length;

  // Rain
  let rainHTML;
  if(!farm.location) rainHTML = `<div class="note">Set the farm's location to see rainfall and water advice.</div><button class="btn" data-ins="loc">📍 Set location</button>`;
  else if(climateState === 'loading' || (!climate && climateState !== 'error')) rainHTML = `<div class="empty">Loading rainfall…</div>`;
  else if(!climate) rainHTML = `<div class="note bad">Rainfall data is unavailable right now. Check your internet connection.</div>`;
  else {
    const r = rainSummary(climate);
    const cell = (k, v, sub = '') => `<div class="stat"><span class="k">${k}</span><span class="v">${v}</span>${sub ? `<span class="sub">${sub}</span>` : ''}</div>`;
    const bal = -r.deficit30;
    rainHTML = `<div class="stats">
        ${cell('Last 7 days', mm(r.last7))}${cell('Last 30 days', mm(r.last30))}${cell('Last 90 days', mm(r.last90))}
        ${cell('Next 7 days', mm(r.next7), 'forecast')}${cell('Since real rain', r.daysSinceRain === 0 ? 'Today' : `${r.daysSinceRain} day${r.daysSinceRain === 1 ? '' : 's'}`)}
        ${cell('Water balance', `${bal >= 0 ? '+' : '−'}${Math.abs(Math.round(bal))} mm`, bal >= 0 ? '30 days: wetter' : '30 days: drying')}
      </div>
      <p class="muted">Water balance is rain minus what heat and sun took out of the soil over the last 30 days.</p>
      ${monthChart(climate.months)}`;
    const ponds = pondHarvest(farm.items, r.next7);
    if(ponds.length) rainHTML += `<h4>Ponds: rain falling on them, next 7 days</h4>` + ponds.map(p =>
      `<div class="li static"><span>💧</span><span class="t">${esc(p.name)}</span><span class="s">${Math.round(p.area)} m² · ≈ ${Math.round(p.litres).toLocaleString()} L</span></div>`).join('')
      + `<p class="muted">Rain landing directly on the water. Runoff from the land around adds more.</p>`;
  }

  body.innerHTML = `
    ${todayHTML}
    ${others ? `<h3>Also worth doing</h3><div class="list">${others}</div>` : ''}
    <p class="muted">${esc(NOTE)}</p>

    <h3>Trees</h3>
    <p class="muted" style="margin-top:0">${st.total} trees · ${st.perHa.toFixed(0)} per hectare${st.young ? ` · ${st.young} planted in the last 3 years` : ''}${habits ? `<br>${esc(habits)}` : ''}</p>
    ${bars ? `<div class="bars">${bars}</div>` : '<div class="empty">No trees yet</div>'}
    ${st.total ? `<button class="btn small" data-ins="colour" style="margin-top:8px">${ctx.colourBySpecies ? '✓ Colouring trees by species' : '🎨 Colour trees by species in 3D'}</button>` : ''}

    <h3>Spacing</h3>
    ${crowded.length ? `<p class="muted" style="margin-top:0">${crowdedAll} pair${crowdedAll > 1 ? 's' : ''} of trees closer than their canopies need. Click one to find it.</p>
      <div class="list">${crowded.map(c => `<div class="li" data-sel="${esc(c.a)}"><span class="t">${esc(c.aName)} ↔ ${esc(c.bName)}</span><span class="s">${c.dist.toFixed(1)} m (≈${c.need.toFixed(1)} m)</span></div>`).join('')}</div>`
      : `<div class="note ok">No crowded trees found.</div>`}

    <h3>Rain &amp; water</h3>
    ${rainHTML}
    <p class="muted" style="margin-top:10px">Weather data: Open-Meteo.</p>`;

  const find = id => options.find(s => s.id === id) || suggestions({ farm, climate }).find(s => s.id === id);
  body.querySelectorAll('[data-ins]').forEach(el => el.onclick = () => {
    const a = el.dataset.ins;
    if(a === 'add'){ const s = find(el.dataset.id); if(s) addTask(s); }
    else if(a === 'hide'){ const s = find(el.dataset.id); if(s){ hide(s); cycle = 0; } }
    else if(a === 'next') cycle++;
    else if(a === 'colour') ctx.toggleColour();
    else if(a === 'loc') ctx.openLocation();
    ctx.rerender();
  });
  body.querySelectorAll('[data-sel]').forEach(el => el.onclick = () => ctx.selectItem(el.dataset.sel));
}

function monthChart(months){
  if(!months || !months.length) return '';
  const W = 270, H = 120, top = 14, base = H - 18, bw = W / months.length;
  const max = Math.max(10, ...months.map(m => m.rain));
  const names = ['J','F','M','A','M','J','J','A','S','O','N','D'];
  const bars = months.map((m, i) => {
    const h = (m.rain / max) * (base - top), x = i * bw + 3, mon = Number(m.month.slice(5, 7));
    const label = new Date(m.month + '-15').toLocaleDateString([], { month: 'long', year: 'numeric' });
    return `<g><title>${label}: ${Math.round(m.rain)} mm${i === months.length - 1 ? ' (so far)' : ''}</title>
      <rect x="${x}" y="${base - h}" width="${bw - 6}" height="${Math.max(1, h)}" rx="2" fill="${i === months.length - 1 ? '#9cc3df' : '#3f86c8'}"></rect>
      <text x="${x + (bw - 6) / 2}" y="${H - 4}" text-anchor="middle">${names[mon - 1]}</text></g>`;
  }).join('');
  return `<h4>Rain each month, past year</h4>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly rainfall">
      <text x="0" y="10" class="ax">${Math.round(max)} mm</text>
      <line x1="0" x2="${W}" y1="${base}" y2="${base}" stroke="#e3ddd0"></line>${bars}</svg>`;
}

/* ---------- To-do tab ---------- */
export function renderTodo(body, ctx){
  const tasks = Object.values(ctx.farm.tasks || {});
  const open = tasks.filter(t => !t.done).sort((a, b) => b.createdAtMs - a.createdAtMs);
  const done = tasks.filter(t => t.done).sort((a, b) => b.doneAtMs - a.doneAtMs);
  const when = ms => new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short' });
  const row = t => `
    <div class="task ${t.done ? 'done' : ''}">
      <input type="checkbox" data-task="toggle" data-id="${esc(t.id)}" ${t.done ? 'checked' : ''} aria-label="Done">
      <div class="task-b"><div class="task-t">${esc(t.title)}</div>
        ${t.body && !t.done ? `<div class="task-d">${esc(t.body)}</div>` : ''}
        <div class="task-m">${t.done ? `Done ${when(t.doneAtMs)}${t.doneBy ? ' by ' + esc(t.doneBy) : ''}` : `Added ${when(t.createdAtMs)}${t.createdBy ? ' by ' + esc(t.createdBy) : ''}`}</div></div>
      <button class="btn small" data-task="del" data-id="${esc(t.id)}" title="Remove">✕</button>
    </div>`;
  body.innerHTML = `
    <h2>✅ Farm to-do list</h2>
    <p class="muted" style="margin-top:0">Shared with everyone on the family link. Add your own jobs, or add ideas from Insights.</p>
    <div class="inline"><input id="newTask" placeholder="e.g. Fix the pond inlet"><button class="btn primary" data-task="new">Add</button></div>
    <h3>To do (${open.length})</h3>
    ${open.length ? open.map(row).join('') : '<div class="empty">Nothing on the list. Nice!</div>'}
    ${done.length ? `<details style="margin-top:14px"><summary class="muted">Done (${done.length})</summary>${done.slice(0, 30).map(row).join('')}</details>` : ''}`;

  const addNew = () => {
    const v = body.querySelector('#newTask').value.trim(); if(!v) return;
    store.saveTask({ id: uid(), title: v, createdAtMs: Date.now() }); ctx.rerender();
    setTimeout(() => ctx.panel.querySelector('#newTask')?.focus(), 0);
  };
  body.querySelector('#newTask').addEventListener('keydown', e => { if(e.key === 'Enter') addNew(); });
  body.querySelectorAll('[data-task]').forEach(el => el.onclick = () => {
    const a = el.dataset.task, t = ctx.farm.tasks?.[el.dataset.id];
    if(a === 'new') return addNew();
    if(!t) return;
    if(a === 'toggle') store.saveTask({ ...t, done: !t.done, doneAtMs: Date.now(), doneBy: '' });
    if(a === 'del'){
      if(!el.dataset.confirm){ el.dataset.confirm = '1'; el.textContent = 'Remove?'; return; }
      store.removeTask(t.id);
    }
    ctx.rerender();
  });
}
