// =========================================================
// 3D models for each kind of object.
// To add a new object type: add it to DEFAULTS/FIELDS/ICON in schema.js,
// then add a branch here.
// =========================================================
import * as THREE from 'three';
import { canopyLook } from './seasons.js';

function mat(color, extra = {}){ return new THREE.MeshLambertMaterial(Object.assign({ color }, extra)); }

function seeded(id){
  let h = 0; for(const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; };
}

export function buildItem(it, season, colourOverride = null){
  const g = new THREE.Group();
  g.userData.id = it.id;
  const n = v => Math.max(0.1, Number(v) || 0.1);

  if(it.type === 'house' || it.type === 'shed'){
    const w = n(it.w), d = n(it.d), h = n(it.h);
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(it.wall));
    walls.position.y = h / 2; g.add(walls);
    const doorH = Math.min(2.1, h * 0.8);
    const door = new THREE.Mesh(new THREE.BoxGeometry(Math.min(1.1, w * 0.25), doorH, 0.1), mat('#5a3d28'));
    door.position.set(0, doorH / 2, d / 2 + 0.05); g.add(door);
    if(it.type === 'house' && w >= 5){
      const winMat = mat('#a9d3ea');
      for(const fx of [-0.3, 0.3]){
        const win = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 0.1), winMat);
        win.position.set(fx * w, h * 0.58, d / 2 + 0.05); g.add(win);
        const win2 = win.clone(); win2.position.z = -d / 2 - 0.05; g.add(win2);
      }
    }
    const W = w + 0.6, Dd = d + 0.6, rm = mat(it.roofColor);
    let roof;
    if(it.roof === 'gable'){
      const rh = Math.min(w, d) * 0.32;
      const s = new THREE.Shape(); s.moveTo(-W / 2, 0); s.lineTo(W / 2, 0); s.lineTo(0, rh); s.closePath();
      const geo = new THREE.ExtrudeGeometry(s, { depth: Dd, bevelEnabled: false }); geo.translate(0, 0, -Dd / 2);
      roof = new THREE.Mesh(geo, rm); roof.position.y = h;
    } else if(it.roof === 'hip'){
      const rh = Math.min(w, d) * 0.3;
      const geo = new THREE.ConeGeometry(1, rh, 4, 1); geo.rotateY(Math.PI / 4);
      geo.scale(W / Math.SQRT2, 1, Dd / Math.SQRT2);
      roof = new THREE.Mesh(geo, rm); roof.position.y = h + rh / 2;
    } else if(it.roof === 'skillion'){
      const rh = Math.max(0.6, w * 0.12);
      const s = new THREE.Shape(); s.moveTo(-W / 2, 0); s.lineTo(W / 2, 0); s.lineTo(W / 2, 0.2); s.lineTo(-W / 2, rh); s.closePath();
      const geo = new THREE.ExtrudeGeometry(s, { depth: Dd, bevelEnabled: false }); geo.translate(0, 0, -Dd / 2);
      roof = new THREE.Mesh(geo, rm); roof.position.y = h;
    } else {
      roof = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.3, Dd - 0.2), rm); roof.position.y = h + 0.15;
    }
    g.add(roof);
  }

  else if(it.type === 'tree'){
    const H = n(it.height), C = n(it.canopy);
    const look = colourOverride ? { color: colourOverride } : canopyLook(it.habit, season);
    const trunkH = it.habit === 'conifer' ? H * 0.18 : H * 0.38;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1 + C * 0.025, 0.18 + C * 0.035, trunkH, 8), mat('#6b4b32'));
    trunk.position.y = trunkH / 2; g.add(trunk);
    const cr = C / 2;
    if(it.habit === 'conifer'){
      const coneH = H - trunkH * 0.6;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(cr, coneH, 12), mat(look.color));
      cone.position.y = trunkH * 0.6 + coneH / 2; g.add(cone);
    } else {
      const vr = Math.max(0.5, (H - trunkH) / 2);
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2),
        mat(look.color, look.bare ? { transparent: true, opacity: 0.18 } : {}));
      crown.scale.set(cr, vr, cr); crown.position.y = trunkH + vr * 0.9;
      crown.userData.noShadow = !!look.bare;
      g.add(crown);
      if(look.bare){
        const rnd = seeded(it.id), bm = mat('#5d4330');
        for(let i = 0; i < 5; i++){
          const len = vr * 1.2;
          const br = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.08, len, 5), bm);
          const a = rnd() * Math.PI * 2;
          br.position.set(Math.cos(a) * cr * 0.3, trunkH + len * 0.4, Math.sin(a) * cr * 0.3);
          br.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
          g.add(br);
        }
      }
      if(look.fruit){
        const rnd = seeded(it.id), fm = mat(look.fruit), fg = new THREE.SphereGeometry(Math.max(0.12, C * 0.04), 8, 6);
        for(let i = 0; i < 14; i++){
          const th = rnd() * Math.PI * 2, ph = Math.acos(1 - rnd() * 1.6);
          const f = new THREE.Mesh(fg, fm);
          f.position.set(Math.sin(ph) * Math.cos(th) * cr * 0.98, trunkH + vr * 0.9 + Math.cos(ph) * vr * 0.98 - vr * 0.2,
            Math.sin(ph) * Math.sin(th) * cr * 0.98);
          g.add(f);
        }
      }
    }
  }

  else if(it.type === 'pond'){
    const w = n(it.w), d = n(it.d);
    const oval = it.shape !== 'rectangle';
    const geo = () => oval ? new THREE.CylinderGeometry(1, 1, 0.12, 48) : new THREE.BoxGeometry(1, 0.12, 1);
    const rim = new THREE.Mesh(geo(), mat('#b8a47c'));
    rim.scale.set(oval ? w / 2 + 0.8 : w + 1.6, 1, oval ? d / 2 + 0.8 : d + 1.6); rim.position.y = 0.04;
    const water = new THREE.Mesh(geo(), new THREE.MeshPhongMaterial({ color: '#3f86a8', shininess: 90, transparent: true, opacity: 0.92 }));
    water.scale.set(oval ? w / 2 : w, 1, oval ? d / 2 : d); water.position.y = 0.08;
    g.add(rim, water);
    const rnd = seeded(it.id), reedMat = mat('#5b7d3a');
    for(let i = 0; i < 9; i++){
      const a = -0.6 + rnd() * 1.2, r = 0.92 + rnd() * 0.1;
      const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.8 + rnd() * 0.8, 4), reedMat);
      reed.position.set(Math.cos(a) * (w / 2) * r, 0.5, Math.sin(a) * (d / 2) * r);
      g.add(reed);
    }
  }

  else if(it.type === 'bed'){
    const w = n(it.w), d = n(it.d);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w, 0.35, d), mat('#8a6a48'));
    frame.position.y = 0.175; g.add(frame);
    const soil = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.1, w - 0.2), 0.05, Math.max(0.1, d - 0.2)), mat('#4a3626'));
    soil.position.y = 0.36; g.add(soil);
    if(season !== 'winter'){
      const rows = Math.max(1, Math.floor(Math.min(w, d) / 0.6));
      const long = w >= d, cm = mat(season === 'autumn' ? '#9a9a3a' : '#5ea84a');
      for(let i = 0; i < rows; i++){
        const off = -((rows - 1) / 2) * 0.6 + i * 0.6;
        const row = new THREE.Mesh(new THREE.BoxGeometry(long ? Math.max(0.1, w - 0.5) : 0.25, 0.25, long ? 0.25 : Math.max(0.1, d - 0.5)), cm);
        row.position.set(long ? 0 : off, 0.5, long ? off : 0);
        g.add(row);
      }
    }
  }

  else if(it.type === 'path'){
    const p = new THREE.Mesh(new THREE.BoxGeometry(n(it.w), 0.06, n(it.d)), mat('#cdb68a'));
    p.position.y = 0.03; p.userData.noShadow = true; g.add(p);
  }

  g.traverse(o => { if(o.isMesh){ o.castShadow = !o.userData.noShadow; o.receiveShadow = true; } });
  g.position.set(it.x, 0, it.z);
  g.rotation.y = THREE.MathUtils.degToRad(-(it.rot || 0));
  return g;
}

export function disposeGroup(g){ g.traverse(o => { if(o.isMesh) o.geometry.dispose(); }); }
