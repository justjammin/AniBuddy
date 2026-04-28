import { state, vrmaMap, STATES, AGENT_NAMES, BUILTIN_VRMAS, LOOP_STATES, MOCK_EVENTS, createAgent } from './state.js';
import { loadVRM, playVRMA, stopVRMA, requestBuiltinVRMA, loadVRMAFromUrl, startIdleRotator, stopIdleRotator } from './scene.js';

function driveAnimation(stateName) {
  state.poseAnimator?.setState(stateName);
  if (stateName === 'idle') {
    startIdleRotator();
  } else {
    stopIdleRotator();
    if (vrmaMap[stateName]) playVRMA(stateName);
    else stopVRMA();
  }
}

// ── Speech bubble ─────────────────────────────────────────────────────────
let speechTimeout = null;
export function showSpeech(text, duration) {
  const el = document.getElementById('speech-bubble');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(speechTimeout);
  speechTimeout = setTimeout(() => el.classList.remove('show'), duration);
}

// ── Agent tabs ────────────────────────────────────────────────────────────
export function renderAgentTabs() {
  const strip = document.getElementById('agents');
  strip.querySelectorAll('.agent-tab').forEach(el => el.remove());
  const addBtn = document.getElementById('add-agent-btn');

  state.agents.forEach(agent => {
    const cfg = STATES[agent.state];
    const tab = document.createElement('div');
    tab.className = 'agent-tab' + (agent.id === state.activeAgentId ? ' active' : '');
    tab.dataset.id = agent.id;
    tab.innerHTML = `
      <div class="dot" style="background:${cfg.color};box-shadow:0 0 6px ${cfg.color}"></div>
      <span style="font-size:18px">${cfg.emoji}</span>
      <span class="name">${agent.name}</span>
      <span class="state-badge">${cfg.label}</span>
    `;
    tab.addEventListener('click', () => setActiveAgent(agent.id));
    strip.insertBefore(tab, addBtn);
  });

  document.getElementById('agent-count').textContent =
    `${state.agents.length} AGENT${state.agents.length !== 1 ? 'S' : ''}`;
}

export function setActiveAgent(id) {
  state.activeAgentId = id;
  const agent = state.agents.find(a => a.id === id);
  if (!agent) return;
  const cfg = STATES[agent.state];
  state.currentState = agent.state;

  document.getElementById('hud-name').textContent = agent.name;
  document.getElementById('hud-state').textContent = `${cfg.emoji} ${cfg.label}`;
  document.getElementById('hud-state').style.color = cfg.color;
  document.getElementById('hud-state').style.borderColor = cfg.color + '55';

  driveAnimation(agent.state);
  updateViewportBg(agent);
  renderAgentTabs();
}

export function setAgentState(id, agentState, msg) {
  const agent = state.agents.find(a => a.id === id);
  if (!agent) return;
  const cfg = STATES[agentState];
  agent.state = agentState;
  agent.lastMsg = msg || cfg.label;

  if (id === state.activeAgentId) {
    state.currentState = agentState;
    document.getElementById('hud-state').textContent = `${cfg.emoji} ${cfg.label}`;
    document.getElementById('hud-state').style.color = cfg.color;
    document.getElementById('hud-state').style.borderColor = cfg.color + '55';
    showSpeech(`${cfg.emoji} ${agent.lastMsg}`, 2200);

    driveAnimation(agentState);
  }

  addLog(agent.name, agentState, agent.lastMsg, cfg.color);
  renderAgentTabs();
}

export function addLog(agentName, agentState, msg, color) {
  const entries = document.getElementById('log-entries');
  const t = new Date().toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const row = document.createElement('div');
  row.className = 'log-entry fresh';
  row.innerHTML = `
    <span class="log-time">${t}</span>
    <span class="log-agent">[${agentName}]</span>
    <span style="flex-shrink:0">${STATES[agentState]?.emoji}</span>
    <span class="log-msg">${msg}</span>
  `;
  entries.insertBefore(row, entries.firstChild);
  setTimeout(() => row.classList.remove('fresh'), 600);
  while (entries.children.length > 50) entries.removeChild(entries.lastChild);
}

export function spawnAgent() {
  const name = AGENT_NAMES[state.agents.length % AGENT_NAMES.length];
  const agent = createAgent(name);
  state.agents.push(agent);
  if (!state.activeAgentId) setActiveAgent(agent.id);
  else renderAgentTabs();
  addLog(name, 'idle', 'Agent spawned', STATES.idle.color);
}

// ── Background ────────────────────────────────────────────────────────────
export function updateViewportBg(agent) {
  const vp = document.getElementById('viewport');
  vp.style.backgroundImage = agent?.backgrounds?.length
    ? `url('${agent.backgrounds[agent.bgIndex]}')`
    : 'none';
  renderBgThumbnails(agent);
}

export function renderBgThumbnails(agent) {
  const cont = document.getElementById('bg-thumbnails');
  cont.innerHTML = '';
  if (!agent?.backgrounds?.length) return;
  agent.backgrounds.forEach((url, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'bg-wrap';
    const img = document.createElement('img');
    img.src = url;
    img.className = 'bg-thumb' + (i === agent.bgIndex ? ' active' : '');
    img.addEventListener('click', () => { agent.bgIndex = i; updateViewportBg(agent); });
    const del = document.createElement('button');
    del.className = 'bg-del'; del.textContent = '×';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      URL.revokeObjectURL(agent.backgrounds[i]);
      agent.backgrounds.splice(i, 1);
      if (agent.bgIndex >= agent.backgrounds.length) agent.bgIndex = Math.max(0, agent.backgrounds.length - 1);
      updateViewportBg(agent);
    });
    wrap.appendChild(img); wrap.appendChild(del);
    cont.appendChild(wrap);
  });
}

// ── Settings drawer ───────────────────────────────────────────────────────
export function openSettings() {
  buildVRMARows();
  renderBgThumbnails(state.agents.find(a => a.id === state.activeAgentId));
  document.getElementById('settings-drawer').classList.add('open');
  document.getElementById('settings-backdrop').classList.add('show');
}

export function closeSettings() {
  document.getElementById('settings-drawer').classList.remove('open');
  document.getElementById('settings-backdrop').classList.remove('show');
}

export function buildVRMARows() {
  const cont = document.getElementById('vrma-rows');
  cont.innerHTML = '';
  const stateList = ['idle','typing','reading','running','waiting','error','done','alert'];
  stateList.forEach(stateName => {
    const cfg = STATES[stateName] || {};
    const entry = vrmaMap[stateName] || {};
    const row = document.createElement('div');
    row.className = 'vrma-row';

    const currentVal = entry.isCustom ? '__custom_loaded' : (entry.name || '');
    const builtinOptions = BUILTIN_VRMAS.map(n =>
      `<option value="${n}" ${currentVal === n ? 'selected' : ''}>${n.replace(/_/g,' ')}</option>`
    ).join('');
    const customOpt = entry.isCustom
      ? `<option value="__custom_loaded" selected>📎 ${entry.customName || 'custom'}</option>` : '';

    row.innerHTML = `
      <div class="vrma-lbl">
        <span>${cfg.emoji || ''}</span>
        <span>${stateName}</span>
      </div>
      <select class="vrma-select" data-state="${stateName}">
        <option value="" ${!currentVal ? 'selected' : ''}>Procedural</option>
        ${builtinOptions}
        ${customOpt}
        <option value="__upload">Upload…</option>
      </select>
      <input type="checkbox" class="loop-chk" data-state="${stateName}" title="Loop"
        ${entry.loop !== false ? 'checked' : ''}>
    `;
    cont.appendChild(row);

    row.querySelector('.vrma-select').addEventListener('change', e => {
      const val = e.target.value;
      if (val === '__upload') {
        e.target.value = currentVal;
        state.pendingVRMAUploadState = stateName;
        document.getElementById('vrma-input').click();
      } else if (val === '') {
        delete vrmaMap[stateName];
        if (stateName === state.currentState) { stopVRMA(); state.poseAnimator?.setState(stateName); }
        saveMappingToExtension();
      } else {
        vrmaMap[stateName] = { name: val, url: null, loop: LOOP_STATES.has(stateName), isCustom: false };
        requestBuiltinVRMA(stateName, val);
        saveMappingToExtension();
      }
    });

    row.querySelector('.loop-chk').addEventListener('change', e => {
      if (!vrmaMap[stateName]) vrmaMap[stateName] = {};
      vrmaMap[stateName].loop = e.target.checked;
      saveMappingToExtension();
    });
  });
}

export function saveMappingToExtension() {
  if (!window._vscode) return;
  const mapping = {};
  Object.entries(vrmaMap).forEach(([s, entry]) => {
    if (entry?.name && !entry.isCustom) mapping[s] = entry.name;
  });
  window._vscode.postMessage({ type: 'save_vrma_mapping', mapping });
}

// ── Simulation ────────────────────────────────────────────────────────────
export function startSim() {
  stopSim();
  state.simInterval = setInterval(() => {
    if (!state.agents.length) return;
    const agent = state.agents[Math.floor(Math.random() * state.agents.length)];
    const evt   = MOCK_EVENTS[Math.floor(Math.random() * MOCK_EVENTS.length)];
    setAgentState(agent.id, evt.state, evt.msg);
  }, 2500);
}

export function stopSim() {
  clearInterval(state.simInterval);
  state.simInterval = null;
}

// ── Event listener wiring ─────────────────────────────────────────────────
export function init() {
  // VRM file loading
  document.getElementById('load-btn').addEventListener('click', () =>
    document.getElementById('file-input').click());

  document.getElementById('file-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    loadVRM(URL.createObjectURL(file));
  });

  // Drag-and-drop
  document.getElementById('viewport').addEventListener('dragover', e => e.preventDefault());
  document.getElementById('viewport').addEventListener('drop', e => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith('.vrm')) loadVRM(URL.createObjectURL(file));
  });

  // Add agent
  document.getElementById('add-agent-btn').addEventListener('click', () => {
    if (state.agents.length >= 8) return;
    spawnAgent();
  });

  // Manual state buttons
  ['idle','typing','reading','running','waiting','error','done','alert'].forEach(s => {
    document.getElementById(`btn-${s}`).addEventListener('click', () => {
      if (!state.activeAgentId) return;
      const evt = MOCK_EVENTS.find(e => e.state === s);
      setAgentState(state.activeAgentId, s, evt?.msg);
      document.querySelectorAll('.ctrl-btn').forEach(b => b.classList.remove('active'));
      document.getElementById(`btn-${s}`).classList.add('active');
    });
  });

  // Settings drawer
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('settings-close').addEventListener('click', closeSettings);
  document.getElementById('settings-backdrop').addEventListener('click', closeSettings);

  // Background images
  document.getElementById('btn-bg-add').addEventListener('click', () =>
    document.getElementById('bg-input').click());

  document.getElementById('bg-input').addEventListener('change', e => {
    const agent = state.agents.find(a => a.id === state.activeAgentId);
    if (!agent) return;
    Array.from(e.target.files).forEach(file => {
      if (agent.backgrounds.length >= 8) return;
      agent.backgrounds.push(URL.createObjectURL(file));
    });
    agent.bgIndex = agent.backgrounds.length - 1;
    updateViewportBg(agent);
    e.target.value = '';
  });

  document.getElementById('btn-bg-prev').addEventListener('click', () => {
    const agent = state.agents.find(a => a.id === state.activeAgentId);
    if (!agent?.backgrounds?.length) return;
    agent.bgIndex = (agent.bgIndex - 1 + agent.backgrounds.length) % agent.backgrounds.length;
    updateViewportBg(agent);
  });

  document.getElementById('btn-bg-next').addEventListener('click', () => {
    const agent = state.agents.find(a => a.id === state.activeAgentId);
    if (!agent?.backgrounds?.length) return;
    agent.bgIndex = (agent.bgIndex + 1) % agent.backgrounds.length;
    updateViewportBg(agent);
  });

  document.getElementById('btn-bg-clear').addEventListener('click', () => {
    const agent = state.agents.find(a => a.id === state.activeAgentId);
    if (!agent) return;
    agent.backgrounds.forEach(url => URL.revokeObjectURL(url));
    agent.backgrounds = []; agent.bgIndex = 0;
    updateViewportBg(agent);
  });

  // VRMA upload
  document.getElementById('vrma-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file || !state.pendingVRMAUploadState) return;
    const url = URL.createObjectURL(file);
    const s = state.pendingVRMAUploadState;
    state.pendingVRMAUploadState = null;
    vrmaMap[s] = { name: null, url: null, loop: LOOP_STATES.has(s), isCustom: true, customName: file.name };
    loadVRMAFromUrl(url, s);
    buildVRMARows();
    e.target.value = '';
  });

  // Sim toggle
  document.getElementById('sim-toggle').addEventListener('click', () => {
    state.simActive = !state.simActive;
    document.getElementById('toggle-track').classList.toggle('on', state.simActive);
    if (state.simActive) startSim(); else stopSim();
  });
}