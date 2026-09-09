import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const UNIT = 50;
let capturedScene = null;
let capturedCamera = null;
let capturedControls = null;
let userTouched3D = false;
let syncGeneration = 0;

const originalRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function(scene, camera) {
  const host = document.getElementById('threeHost');
  if (host && !host.hidden) {
    capturedScene = scene;
    capturedCamera = camera;
    scene.background = null;
  }
  return originalRender.call(this, scene, camera);
};

const originalControlsUpdate = OrbitControls.prototype.update;
OrbitControls.prototype.update = function(...args) {
  capturedControls = this;
  capturedCamera = this.object;
  return originalControlsUpdate.apply(this, args);
};

function readProject() {
  for (const key of ['colorize-design-web-v04','colorize-design-web-v03','colorize-design-web-v02','colorize-design-web-v01']) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch {}
  }
  return null;
}

function activeArtboard(project) {
  return project?.artboards?.find(a => a.id === project.activeArtboardId) || project?.artboards?.[0] || null;
}

function add2DOverlays(project, artboard) {
  if (!capturedScene) return;
  const root = capturedScene.children.find(c => c.type === 'Group');
  if (!root) return;

  [...root.children].filter(c => c.userData?.colorize2DOverlay).forEach(c => {
    root.remove(c);
    c.geometry?.dispose?.();
    if (c.material?.map) c.material.map.dispose?.();
    c.material?.dispose?.();
  });

  for (const o of artboard.objects || []) {
    if (o.type !== 'rect' && o.type !== 'image') continue;
    const w = Math.max(.02, Number(o.w || 1) / UNIT);
    const h = Math.max(.02, Number(o.h || 1) / UNIT);
    const x = (Number(o.x || 0) + Number(o.w || 0) / 2 - artboard.w / 2) / UNIT;
    const y = (artboard.h / 2 - (Number(o.y || 0) + Number(o.h || 0) / 2)) / UNIT;
    const geometry = new THREE.PlaneGeometry(w, h);
    let material;

    if (o.type === 'rect') {
      material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(o.fill || '#0a84ff'),
        transparent: (o.opacity ?? 1) < 1,
        opacity: o.opacity ?? 1,
        side: THREE.DoubleSide
      });
    } else {
      material = new THREE.MeshBasicMaterial({transparent:true, opacity:o.opacity ?? 1, side:THREE.DoubleSide});
      if (o.src) {
        new THREE.TextureLoader().load(o.src, tex => {
          tex.colorSpace = THREE.SRGBColorSpace;
          material.map = tex;
          material.needsUpdate = true;
        }, undefined, () => {});
      }
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.colorize2DOverlay = true;
    mesh.position.set(x, y, .018);
    mesh.rotation.z = THREE.MathUtils.degToRad(-(Number(o.rotation) || 0));
    mesh.renderOrder = 5;
    root.add(mesh);
  }
}

function syncTo2DFrame({dispatchEnd=true} = {}) {
  const host = document.getElementById('threeHost');
  if (!host || host.hidden || !capturedCamera || !capturedControls) return false;
  const project = readProject();
  const artboard = activeArtboard(project);
  if (!project || !artboard) return false;

  const w = Math.max(1, host.clientWidth);
  const h = Math.max(1, host.clientHeight);
  const zoom = Math.max(.001, Number(project.view?.zoom) || 1);
  const viewX = Number(project.view?.x) || 0;
  const viewY = Number(project.view?.y) || 0;
  const pixelsPerWorldUnit = UNIT * zoom;

  // Narrower FOV keeps the front view almost pixel-identical to 2D,
  // while OrbitControls still reveals true perspective when rotated.
  capturedCamera.fov = 24;
  capturedCamera.aspect = w / h;
  const fov = THREE.MathUtils.degToRad(capturedCamera.fov);
  const distance = h / (2 * pixelsPerWorldUnit * Math.tan(fov / 2));

  const desiredCenterX = viewX + (Number(artboard.x || 0) + Number(artboard.w || 0) / 2) * zoom;
  const desiredCenterY = viewY + (Number(artboard.y || 0) + Number(artboard.h || 0) / 2) * zoom;
  const cameraX = (w / 2 - desiredCenterX) / pixelsPerWorldUnit;
  const cameraY = (desiredCenterY - h / 2) / pixelsPerWorldUnit;

  capturedCamera.position.set(cameraX, cameraY, distance);
  capturedControls.target.set(cameraX, cameraY, 0);
  capturedCamera.near = Math.max(.01, distance / 5000);
  capturedCamera.far = Math.max(100, distance * 20);
  capturedCamera.updateProjectionMatrix();
  capturedControls.update();
  add2DOverlays(project, artboard);

  // Let v0.4's own state saver remember this corrected camera,
  // so Render ON/OFF rebuilds no longer jump to another framing.
  if (dispatchEnd) capturedControls.dispatchEvent({type:'end'});
  return true;
}

function scheduleSync() {
  const generation = ++syncGeneration;
  userTouched3D = false;
  let attempts = 0;
  const tick = () => {
    if (generation !== syncGeneration || userTouched3D) return;
    attempts++;
    const loading = document.getElementById('threeLoading');
    if (capturedScene && capturedCamera && capturedControls && loading?.hidden) {
      syncTo2DFrame();
      return;
    }
    if (attempts < 80) setTimeout(tick, 50);
  };
  setTimeout(tick, 0);
}

window.addEventListener('DOMContentLoaded', () => {
  const host = document.getElementById('threeHost');
  host?.addEventListener('pointerdown', () => { userTouched3D = true; }, {capture:true});

  document.addEventListener('click', e => {
    const mode = e.target.closest?.('.mode');
    if (mode?.dataset.mode === 'view3d') scheduleSync();

    if (e.target.closest?.('#reset3dBtn')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      userTouched3D = false;
      setTimeout(() => syncTo2DFrame(), 0);
    }
  }, true);

  window.addEventListener('resize', () => {
    const hostNow = document.getElementById('threeHost');
    if (!userTouched3D && hostNow && !hostNow.hidden) setTimeout(() => syncTo2DFrame({dispatchEnd:false}), 60);
  });
});
