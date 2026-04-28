import { STATE_META } from './VRMPoseAnimator.js';

export const STATES = STATE_META;

export const AGENT_NAMES = ['Aiko','Riku','Sora','Hana','Kaito','Yuki','Ren','Mio'];

export const BUILTIN_VRMAS = [
  'greeting','model_pose','peace_sign','shoot','show_full_body','spin','squat',
  'Bling-Bang-Bang-Born','dancedance','happysynth','notadevil','catchit',
];

export const LOOP_STATES = new Set(['idle','typing','reading','running','waiting','error']);

export const MOCK_EVENTS = [
  { state:'typing',  msg:'Writing src/api/routes.py' },
  { state:'reading', msg:'Reading package.json' },
  { state:'running', msg:'npm run build' },
  { state:'reading', msg:'Searching docs...' },
  { state:'waiting', msg:'Awaiting user input...' },
  { state:'typing',  msg:'Writing tests/test_api.py' },
  { state:'done',    msg:'Task complete ✓' },
  { state:'error',   msg:'Exit code 1 — retrying' },
  { state:'typing',  msg:'Patching auth.ts' },
  { state:'idle',    msg:'Waiting for next task...' },
  { state:'alert',   msg:'Needs your attention!' },
];

// Default VRMA mapping — all states covered
export const vrmaMap = {
  idle:    { name: 'model_pose',           url: null, loop: true },
  typing:  { name: 'notadevil',            url: null, loop: true },
  reading: { name: 'happysynth',           url: null, loop: true },
  running: { name: 'spin',                 url: null, loop: true },
  waiting: { name: 'squat',                url: null, loop: true },
  error:   { name: 'greeting',             url: null, loop: true },
  done:    { name: 'peace_sign',           url: null, loop: true },
  alert:   { name: 'Bling-Bang-Bang-Born', url: null, loop: true },
};

export const vrmaCache = {};

// Single mutable state object — all modules mutate this directly
export const state = {
  agents: [],
  activeAgentId: null,
  simActive: false,
  simInterval: null,
  currentState: 'idle',
  currentVRM: null,
  poseAnimator: null,
  vrmaMixer: null,
  vrmaCurrentAction: null,
  vrmaActive: false,
  pendingVRMAUploadState: null,
};

export function createAgent(name) {
  return {
    id: Date.now() + Math.random(),
    name,
    state: 'idle',
    lastMsg: 'Waiting for task...',
    vrm: null,
    backgrounds: [],
    bgIndex: 0,
  };
}