import { init as sceneInit } from './scene.js';
import { init as uiInit, showSpeech, spawnAgent } from './ui.js';
import { init as bridgeInit } from './bridge.js';

// Acquire VS Code API (throws outside VS Code — caught silently)
let vscode = null;
try { vscode = acquireVsCodeApi(); } catch (_) {}
window._vscode = vscode;

// Wire scene callbacks before any VRM loads
sceneInit({ showSpeech });

// Attach all DOM event listeners
uiInit();

// Wire IDE bridge + announce ready
bridgeInit(vscode);

// Boot: spawn first agent (sim off by default)
spawnAgent();