import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';
import { VRMPoseAnimator } from './VRMPoseAnimator.js';
import { state, vrmaMap, vrmaCache, LOOP_STATES, BUILTIN_VRMAS } from './state.js';

let _cb = {};
export function init(callbacks) { _cb = callbacks; }

// ── Three.js setup ────────────────────────────────────────────────────────
const container = document.getElementById('canvas-container');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
container.appendChild(renderer.domElement);

const scene3d = new THREE.Scene();
scene3d.background = null;

const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
camera.position.set(0, 1.3, 3.2);
camera.lookAt(0, 1.1, 0);

scene3d.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(1, 2, 2);
scene3d.add(dirLight);
const rimLight = new THREE.DirectionalLight(0xa78bfa, 0.5);
rimLight.position.set(-2, 1, -1);
scene3d.add(rimLight);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.minDistance = 1;
controls.maxDistance = 6;
controls.target.set(0, 1.1, 0);
controls.update();

function resize() {
  const w = container.clientWidth, h = container.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(container);
resize();

const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const delta = clock.getDelta();
  if (state.currentVRM) {
    if (state.vrmaActive && state.vrmaMixer) state.vrmaMixer.update(delta);
    state.poseAnimator?.update(delta);
    state.currentVRM.update(delta);
  }
  controls.update();
  renderer.render(scene3d, camera);
});

// ── GLTF/VRM loader ───────────────────────────────────────────────────────
export const loader = new GLTFLoader();
loader.register(parser => new VRMLoaderPlugin(parser));
loader.register(parser => new VRMAnimationLoaderPlugin(parser));

// ── VRM loading ───────────────────────────────────────────────────────────
export function loadVRM(url) {
  document.getElementById('loading-overlay').classList.add('show');
  document.getElementById('no-model').style.display = 'none';

  loader.load(url, gltf => {
    if (state.currentVRM) {
      scene3d.remove(state.currentVRM.scene);
      VRMUtils.deepDispose(state.currentVRM.scene);
    }
    state.currentVRM = gltf.userData.vrm;
    VRMUtils.rotateVRM0(state.currentVRM);
    scene3d.add(state.currentVRM.scene);

    if (state.poseAnimator) {
      state.poseAnimator.reset(state.currentVRM);
    } else {
      state.poseAnimator = new VRMPoseAnimator(state.currentVRM);
    }
    state.poseAnimator.setState(state.currentState);

    const box = new THREE.Box3().setFromObject(state.currentVRM.scene);
    const center = box.getCenter(new THREE.Vector3());
    state.currentVRM.scene.position.sub(center);
    state.currentVRM.scene.position.y += box.getSize(new THREE.Vector3()).y / 2;

    if (state.vrmaMixer) state.vrmaMixer.stopAllAction();
    state.vrmaMixer = new THREE.AnimationMixer(state.currentVRM.scene);
    state.vrmaCurrentAction = null;
    state.vrmaActive = false;

    document.getElementById('loading-overlay').classList.remove('show');

    Object.entries(vrmaMap).forEach(([stateName, entry]) => {
      if (entry.name && !entry.url) requestBuiltinVRMA(stateName, entry.name);
    });

    state.agents.forEach(a => a.vrm = state.currentVRM);
    _cb.showSpeech?.('VRM loaded! 🎉', 2500);
    if (state.currentState === 'idle') startIdleRotator();
  },
  undefined,
  err => {
    console.error('VRM load error', err);
    document.getElementById('loading-overlay').classList.remove('show');
    document.getElementById('no-model').style.display = 'flex';
    alert("Failed to load VRM. Make sure it's a valid VRM1 or VRM0 file.");
  });
}

// ── VRMA helpers ──────────────────────────────────────────────────────────
export function requestBuiltinVRMA(stateName, vrmName) {
  if (window._vscode) {
    window._vscode.postMessage({ type: 'load_vrma_anim', state: stateName, name: vrmName });
  } else {
    loadVRMAFromUrl(`./vrma/${vrmName}.vrma`, stateName);
  }
}

export function loadVRMAFromUrl(url, stateName) {
  if (!url) return;
  if (vrmaCache[url]) {
    if (vrmaMap[stateName]) vrmaMap[stateName].url = url;
    if (stateName === state.currentState) playVRMA(stateName);
    return;
  }
  loader.load(url, gltf => {
    const vrmAnim = gltf.userData.vrmAnimations?.[0];
    if (!vrmAnim || !state.currentVRM) return;
    const clip = createVRMAnimationClip(vrmAnim, state.currentVRM);
    vrmaCache[url] = clip;
    if (vrmaMap[stateName]) vrmaMap[stateName].url = url;
    if (stateName === state.currentState) playVRMA(stateName);
  }, undefined, err => console.warn(`VRMA load failed (${stateName}):`, err));
}

export function playVRMA(stateName) {
  if (!state.vrmaMixer || !state.currentVRM) return;
  const entry = vrmaMap[stateName];
  if (!entry) return;
  if (!entry.url) {
    if (entry.name && !entry.isCustom) requestBuiltinVRMA(stateName, entry.name);
    stopVRMA();
    state.poseAnimator?.setState(stateName);
    return;
  }
  const clip = vrmaCache[entry.url];
  if (!clip) return;

  if (state.vrmaCurrentAction) state.vrmaCurrentAction.fadeOut(0.25);
  state.vrmaCurrentAction = state.vrmaMixer.clipAction(clip);
  state.vrmaCurrentAction.reset();
  state.vrmaCurrentAction.setLoop(entry.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
  state.vrmaCurrentAction.clampWhenFinished = !entry.loop;
  state.vrmaCurrentAction.fadeIn(0.25).play();
  state.vrmaActive = true;

  if (!entry.loop) {
    const onFinish = (e) => {
      if (e.action !== state.vrmaCurrentAction) return;
      state.vrmaMixer.removeEventListener('finished', onFinish);
      state.vrmaActive = false;
      state.poseAnimator?.setState(state.currentState);
    };
    state.vrmaMixer.addEventListener('finished', onFinish);
  }
}

export function stopVRMA() {
  if (state.vrmaCurrentAction) { state.vrmaCurrentAction.fadeOut(0.25); state.vrmaCurrentAction = null; }
  state.vrmaActive = false;
}

// ── Idle rotator — cycles all default animations randomly ─────────────────
let idleTimer = null;

export function startIdleRotator() {
  stopIdleRotator();
  pickIdleAnim();
}

export function stopIdleRotator() {
  clearTimeout(idleTimer);
  idleTimer = null;
}

function pickIdleAnim() {
  if (state.currentState !== 'idle') return;

  // All loaded clips from every mapped state
  const available = Object.values(vrmaMap).filter(e => e.url && vrmaCache[e.url]);

  if (!available.length || !state.vrmaMixer || !state.currentVRM) {
    idleTimer = setTimeout(pickIdleAnim, 1000);
    return;
  }

  const entry = available[Math.floor(Math.random() * available.length)];
  const clip  = vrmaCache[entry.url];

  if (state.vrmaCurrentAction) state.vrmaCurrentAction.fadeOut(0.25);
  state.vrmaCurrentAction = state.vrmaMixer.clipAction(clip);
  state.vrmaCurrentAction.reset();
  state.vrmaCurrentAction.setLoop(THREE.LoopOnce, 1);
  state.vrmaCurrentAction.clampWhenFinished = true;
  state.vrmaCurrentAction.fadeIn(0.25).play();
  state.vrmaActive = true;

  const captured = state.vrmaCurrentAction;
  const onFinish = (e) => {
    if (e.action !== captured) return;
    state.vrmaMixer.removeEventListener('finished', onFinish);
    state.vrmaActive = false;
    state.poseAnimator?.setState('idle');
    if (state.currentState === 'idle') idleTimer = setTimeout(pickIdleAnim, 2000);
  };
  state.vrmaMixer.addEventListener('finished', onFinish);
}