import { state, vrmaMap, LOOP_STATES, createAgent } from './state.js';
import { loadVRM, loadVRMAFromUrl } from './scene.js';
import { setAgentState, setActiveAgent, renderAgentTabs, buildVRMARows, updateViewportBg } from './ui.js';

export function init(vscode) {
  window.addEventListener('message', event => {
    const msg = event.data;
    if (!msg?.type) return;

    if (msg.type === 'agent_update') {
      let agent = state.agents.find(a => a.name === msg.agentName);
      if (!agent) {
        agent = createAgent(msg.agentName);
        state.agents.push(agent);
        if (!state.activeAgentId) setActiveAgent(agent.id);
      }
      setAgentState(agent.id, msg.state, msg.message);
    }

    if (msg.type === 'load_vrm') {
      loadVRM(msg.url);
    }

    if (msg.type === 'vrma_data') {
      if (!vrmaMap[msg.state]) vrmaMap[msg.state] = { name: msg.name, loop: LOOP_STATES.has(msg.state) };
      loadVRMAFromUrl(msg.url, msg.state);
    }

    if (msg.type === 'vrma_mapping_update') {
      msg.entries.forEach(e => {
        vrmaMap[e.state] = { name: e.name, url: null, loop: LOOP_STATES.has(e.state), isCustom: false };
        loadVRMAFromUrl(e.url, e.state);
      });
      buildVRMARows();
    }

    if (msg.type === 'restore_agents') {
      msg.agents.forEach(ca => {
        if (!state.agents.find(a => a.name === ca.name)) {
          state.agents.push(createAgent(ca.name));
        }
      });
      if (!state.activeAgentId && state.agents.length) setActiveAgent(state.agents[0].id);
      else renderAgentTabs();
    }
  });

  window.agentBridge = {
    updateAgent: (agentName, agentState, message) => {
      let agent = state.agents.find(a => a.name === agentName);
      if (!agent) {
        agent = createAgent(agentName);
        state.agents.push(agent);
        if (!state.activeAgentId) setActiveAgent(agent.id);
      }
      setAgentState(agent.id, agentState, message);
    },
    loadVRM: (url) => loadVRM(url),
    spawnAgent: (name) => {
      const agent = createAgent(name || state.agents[state.agents.length - 1]?.name);
      state.agents.push(agent);
      if (!state.activeAgentId) setActiveAgent(agent.id);
      else renderAgentTabs();
    },
    renameActiveAgent: (newName) => {
      const agent = state.agents.find(a => a.id === state.activeAgentId);
      if (!agent) return;
      agent.name = newName;
      renderAgentTabs();
      document.getElementById('hud-name').textContent = newName;
    },
    setBackground: (dataUrl) => {
      const agent = state.agents.find(a => a.id === state.activeAgentId);
      if (!agent) return;
      agent.backgrounds.push(dataUrl);
      agent.bgIndex = agent.backgrounds.length - 1;
      updateViewportBg(agent);
    },
  };

  if (vscode) vscode.postMessage({ type: 'ready' });
}