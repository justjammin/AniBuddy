import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// ─── State mapping from Claude Code JSONL tool names ──────────────────────
const TOOL_STATE_MAP: Record<string, { state: string; msg: string }> = {
  write_file:    { state: 'typing',  msg: 'Writing file...' },
  str_replace:   { state: 'typing',  msg: 'Editing file...' },
  read_file:     { state: 'reading', msg: 'Reading file...' },
  bash:          { state: 'running', msg: 'Running command...' },
  web_search:    { state: 'reading', msg: 'Searching web...' },
  web_fetch:     { state: 'reading', msg: 'Fetching URL...' },
  list_files:    { state: 'reading', msg: 'Scanning directory...' },
};

let panel: vscode.WebviewPanel | undefined;
let transcriptWatchers = new Map<string, fs.FSWatcher>();
let lastReadPositions = new Map<string, number>();

const BUILTIN_VRMA_NAMES = new Set([
  'greeting','model_pose','peace_sign','shoot','show_full_body','spin','squat'
]);

function sendVRMAMapping(
  extensionUri: vscode.Uri,
  mapping: Record<string, string>
) {
  if (!panel) return;
  const entries: Array<{ state: string; name: string; url: string }> = [];
  Object.entries(mapping).forEach(([state, value]) => {
    const vrmaPath = BUILTIN_VRMA_NAMES.has(value)
      ? path.join(extensionUri.fsPath, 'vrma', `${value}.vrma`)
      : value;
    if (!fs.existsSync(vrmaPath)) return;
    try {
      const data = fs.readFileSync(vrmaPath);
      entries.push({
        state,
        name: BUILTIN_VRMA_NAMES.has(value) ? value : path.basename(value, '.vrma'),
        url: `data:model/gltf-binary;base64,${data.toString('base64')}`,
      });
    } catch (_) {}
  });
  if (entries.length) {
    panel.webview.postMessage({ type: 'vrma_mapping_update', entries });
  }
}

export function activate(context: vscode.ExtensionContext) {

  // ── Open panel command ──
  context.subscriptions.push(
    vscode.commands.registerCommand('animeAgents.openPanel', () => {
      openOrRevealPanel(context);
    })
  );

  // ── Load VRM command ──
  context.subscriptions.push(
    vscode.commands.registerCommand('animeAgents.loadVRM', async () => {
      const files = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'VRM Model': ['vrm'] },
        title: 'Select VRM Model'
      });
      if (!files || !files.length) return;
      const vrmPath = files[0].fsPath;
      // Persist to VS Code settings (visible + editable in File > Preferences > Settings)
      vscode.workspace.getConfiguration('animeAgents').update(
        'vrmPath', vrmPath, vscode.ConfigurationTarget.Global
      );
      if (panel) {
        const data = fs.readFileSync(vrmPath);
        const base64 = data.toString('base64');
        panel.webview.postMessage({
          type: 'load_vrm',
          url: `data:model/gltf-binary;base64,${base64}`,
          savedPath: vrmPath
        });
      } else {
        vscode.window.showInformationMessage('Open the Anime Agent panel first.');
      }
    })
  );

  // ── Auto-watch Claude Code transcripts on startup ──
  watchClaudeTranscripts(context);

  // ── Watch for new terminals (new agents) ──
  context.subscriptions.push(
    vscode.window.onDidOpenTerminal(_terminal => {
      setTimeout(() => watchClaudeTranscripts(context), 1500);
    })
  );

  // ── Reload VRM / VRMA mapping when user edits settings ──
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (!panel) return;
      const cfg = vscode.workspace.getConfiguration('animeAgents');
      if (e.affectsConfiguration('animeAgents.vrmPath')) {
        const vrmPath = cfg.get<string>('vrmPath');
        if (!vrmPath || !fs.existsSync(vrmPath)) return;
        try {
          const data = fs.readFileSync(vrmPath);
          panel.webview.postMessage({
            type: 'load_vrm',
            url: `data:model/gltf-binary;base64,${data.toString('base64')}`,
            savedPath: vrmPath
          });
        } catch (_) {}
      }
      if (e.affectsConfiguration('animeAgents.vrmaMapping')) {
        const mapping = cfg.get<Record<string, string>>('vrmaMapping') || {};
        sendVRMAMapping(context.extensionUri, mapping);
      }
    })
  );
}

function openOrRevealPanel(context: vscode.ExtensionContext) {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Two);
    return;
  }

  panel = vscode.window.createWebviewPanel(
    'animeAgentMonitor',
    '🎌 Anime Agents',
    vscode.ViewColumn.Two,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [context.extensionUri]
    }
  );

  // Load webview HTML (index.html at extension root)
  const htmlPath = vscode.Uri.joinPath(context.extensionUri, 'index.html');
  panel.webview.html = fs.readFileSync(htmlPath.fsPath, 'utf-8');

  // Handle messages from webview → extension
  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.type === 'ready') {
      const cfg = vscode.workspace.getConfiguration('animeAgents');
      // Restore VRM
      const vrmPath = cfg.get<string>('vrmPath');
      if (vrmPath && fs.existsSync(vrmPath)) {
        try {
          const data = fs.readFileSync(vrmPath);
          panel!.webview.postMessage({
            type: 'load_vrm',
            url: `data:model/gltf-binary;base64,${data.toString('base64')}`,
            savedPath: vrmPath
          });
        } catch (_) {}
      }
      // Send VRMA mapping
      const vrmaMapping = cfg.get<Record<string, string>>('vrmaMapping') || {};
      sendVRMAMapping(context.extensionUri, vrmaMapping);
      // Restore custom agent transcript paths
      const customAgents = context.globalState.get<Array<{name: string; path: string}>>('customAgents') || [];
      const valid = customAgents.filter(ca => fs.existsSync(ca.path));
      valid.forEach(ca => {
        if (!transcriptWatchers.has(ca.path)) watchTranscript(ca.path, ca.name);
      });
      if (valid.length) {
        panel!.webview.postMessage({ type: 'restore_agents', agents: valid });
      }
    }

    if (msg.type === 'save_vrm_path' && msg.path) {
      vscode.workspace.getConfiguration('animeAgents').update(
        'vrmPath', msg.path, vscode.ConfigurationTarget.Global
      );
    }

    if (msg.type === 'add_custom_agent' && msg.name && msg.path) {
      const customAgents = context.globalState.get<Array<{name: string; path: string}>>('customAgents') || [];
      if (!customAgents.find(a => a.path === msg.path)) {
        customAgents.push({ name: msg.name, path: msg.path });
        context.globalState.update('customAgents', customAgents);
      }
      if (fs.existsSync(msg.path) && !transcriptWatchers.has(msg.path)) {
        watchTranscript(msg.path, msg.name);
      }
    }

    if (msg.type === 'save_vrma_mapping' && msg.mapping) {
      vscode.workspace.getConfiguration('animeAgents').update(
        'vrmaMapping', msg.mapping, vscode.ConfigurationTarget.Global
      );
    }

    if (msg.type === 'load_vrma_anim' && msg.name) {
      const vrmaPath = path.join(context.extensionUri.fsPath, 'vrma', `${msg.name}.vrma`);
      if (fs.existsSync(vrmaPath)) {
        try {
          const data = fs.readFileSync(vrmaPath);
          panel!.webview.postMessage({
            type: 'vrma_data',
            state: msg.state,
            name: msg.name,
            url: `data:model/gltf-binary;base64,${data.toString('base64')}`,
          });
        } catch (_) {}
      }
    }

    if (msg.type === 'remove_custom_agent' && msg.name) {
      let customAgents = context.globalState.get<Array<{name: string; path: string}>>('customAgents') || [];
      const ca = customAgents.find(a => a.name === msg.name);
      if (ca) {
        customAgents = customAgents.filter(a => a.name !== msg.name);
        context.globalState.update('customAgents', customAgents);
        const watcher = transcriptWatchers.get(ca.path);
        if (watcher) { watcher.close(); transcriptWatchers.delete(ca.path); }
      }
    }
  });

  panel.onDidDispose(() => { panel = undefined; });
}

// ─── JSONL transcript watcher ─────────────────────────────────────────────
function watchClaudeTranscripts(context: vscode.ExtensionContext) {
  const claudeDir = path.join(
    process.env.HOME || process.env.USERPROFILE || '~',
    '.claude', 'projects'
  );

  if (!fs.existsSync(claudeDir)) return;

  // Scan all project dirs for conversation.jsonl files
  try {
    const projectDirs = fs.readdirSync(claudeDir);
    projectDirs.forEach((projectDir, index) => {
      const jsonlPath = path.join(claudeDir, projectDir, 'conversation.jsonl');
      if (!fs.existsSync(jsonlPath)) return;
      if (transcriptWatchers.has(jsonlPath)) return; // already watching

      const agentName = getAgentNameForIndex(index);
      watchTranscript(jsonlPath, agentName);
    });
  } catch (_) {
    // Claude dir not accessible
  }
}

function watchTranscript(jsonlPath: string, agentName: string) {
  // Initialize read position to end of file (don't replay history)
  const stats = fs.statSync(jsonlPath);
  lastReadPositions.set(jsonlPath, stats.size);

  const watcher = fs.watch(jsonlPath, { persistent: false }, () => {
    readNewLines(jsonlPath, agentName);
  });

  transcriptWatchers.set(jsonlPath, watcher);

  // Announce agent
  sendAgentUpdate(agentName, 'idle', 'Agent online');
}

function readNewLines(jsonlPath: string, agentName: string) {
  const lastPos = lastReadPositions.get(jsonlPath) || 0;
  const stats = fs.statSync(jsonlPath);
  if (stats.size <= lastPos) return;

  const stream = fs.createReadStream(jsonlPath, {
    start: lastPos,
    end: stats.size
  });

  const rl = readline.createInterface({ input: stream });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    try {
      const record = JSON.parse(line);
      processJSONLRecord(record, agentName);
    } catch (_) {}
  });

  lastReadPositions.set(jsonlPath, stats.size);
}

function processJSONLRecord(record: any, agentName: string) {
  // Claude Code JSONL schema:
  // { type: "assistant", message: { content: [...] } }
  // { type: "tool_use", name: "write_file", input: { path: "..." } }
  // { type: "tool_result", ... }

  if (record.type === 'tool_use') {
    const toolName = record.name || '';
    const mapped = TOOL_STATE_MAP[toolName];
    if (mapped) {
      // Try to get file path from input for a better message
      const filePath = record.input?.path || record.input?.command || '';
      const msg = filePath
        ? `${mapped.msg.replace('...', '')} ${path.basename(filePath)}`
        : mapped.msg;
      sendAgentUpdate(agentName, mapped.state, msg);
    }
  } else if (record.type === 'tool_result') {
    const isError = record.is_error === true;
    sendAgentUpdate(agentName, isError ? 'error' : 'done',
      isError ? 'Tool returned error' : 'Tool completed ✓');
  } else if (record.type === 'assistant') {
    // Claude is thinking/responding
    sendAgentUpdate(agentName, 'waiting', 'Thinking...');
  }
}

function sendAgentUpdate(agentName: string, state: string, message: string) {
  if (!panel) return;
  panel.webview.postMessage({ type: 'agent_update', agentName, state, message });
}

const AGENT_NAMES = ['Aiko','Riku','Sora','Hana','Kaito','Yuki','Ren','Mio'];
function getAgentNameForIndex(i: number) {
  return AGENT_NAMES[i % AGENT_NAMES.length];
}

export function deactivate() {
  transcriptWatchers.forEach(w => w.close());
  transcriptWatchers.clear();
}
