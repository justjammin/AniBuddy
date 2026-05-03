# AniBuddy Desktop Widget Pivot

Pivot from JetBrains IDE plugin to a standalone desktop widget — a transparent, always-on-top Electron app with a 3D VRM character and thought-bubble emotes, inspired by [peon-pet](https://github.com/PeonPing/peon-pet).

---

## What Stays

| Asset | Location | Notes |
|-------|----------|-------|
| Three.js + VRM renderer | `src/main/resources/webview/js/scene.js` | No changes needed |
| State machine + constants | `src/main/resources/webview/js/state.js` | No changes needed |
| Pose tweening | `src/main/resources/webview/js/VRMPoseAnimator.js` | No changes needed |
| UI logic | `src/main/resources/webview/js/ui.js` | Minor edits (remove IDE chrome) |
| 12 VRMA animation files | `src/main/resources/webview/vrma/` | All portable |
| Dark theme CSS | `src/main/resources/webview/css/main.css` | Add transparent bg, remove panel chrome |

---

## What Gets Replaced

### Kotlin + JCEF → Electron main process

The entire JetBrains plugin shell (`AniBuddy.kt`) is replaced by an Electron main process.

**`electron/main.js`** (~150 lines)
- `BrowserWindow` with `transparent: true`, `frame: false`, `alwaysOnTop: true`
- 50ms cursor-poll drag loop via `screen.getCursorScreenPoint()`
- `setIgnoreMouseEvents` toggled on hover (click-through when idle)
- System tray with Show / Hide / Quit
- Spawns child windows for multi-agent (up to 5, matching peon-pet pattern)
- Loads `preload.js` and `index.html`

**`electron/preload.js`** (~30 lines)
- `contextBridge.exposeInMainWorld('electronAPI', {...})`
- Exposes `onAgentUpdate`, `onConfig`, `sendEvent` to renderer
- Replaces `JBCefJSQuery` and `window.cefQuery` bridge

### Kotlin transcript watcher → Node.js

**`electron/transcript-watcher.js`** (~80 lines)
- Scans `~/.claude/projects/` for active `.jsonl` sessions on startup
- `fs.watch` per file + incremental line reading (tracks byte offset)
- Same tool-name → state mapping as current Kotlin logic:

  | Tool name | State |
  |-----------|-------|
  | `write_file`, `str_replace` | `typing` |
  | `read_file`, `list_files` | `reading` |
  | `bash` | `running` |
  | `web_search`, `web_fetch` | `searching` |
  | result with error | `error` |
  | last result in turn | `done` |
  | idle > 30s | `waiting` |

- Emits state changes via IPC to main process → forwarded to renderer

### bridge.js → Electron IPC

Swap `window.cefQuery({request: ...})` calls for `window.electronAPI.sendEvent(...)`.
Swap incoming `window.aniBuddyBridge.*` calls for `window.electronAPI.onAgentUpdate(cb)`.

---

## What's New: Thought Bubbles

The main creative addition. A thought bubble overlays above the character and shows an emote icon matching the agent's current state.

### Bubble UI

**`src/thought-bubble.js`** (~100 lines)
- `show(state)` — positions bubble above character head, injects emote icon, triggers CSS pop-in
- `hide()` — CSS fade-out, removes after transition
- Auto-hides after 4s unless state changes
- Stacks correctly when multiple agents are visible

**`src/thought-bubble.css`** (~60 lines)
- Bubble shape via `border-radius` + `::before`/`::after` pseudo-elements for dots
- `@keyframes bubble-pop` — scale 0→1.1→1 over 200ms
- `@keyframes bubble-fade` — opacity 1→0 over 300ms
- Positioned absolute, pointer-events none

### Emote Icons

**`assets/emotes/`** — one SVG per state, monochrome, ~24×24px

| State | Icon concept |
|-------|-------------|
| `thinking` | Three dots / spinning gear |
| `reading` | Open book / scroll |
| `typing` | Keyboard / pencil |
| `running` | Terminal `>_` / lightning bolt |
| `searching` | Magnifying glass |
| `waiting` | Hourglass / `zzz` |
| `error` | Red exclamation `!` |
| `done` | Sparkle / checkmark |
| `alert` | Bell |

### Thinking Pose

New VRMA or VRMPoseAnimator pose for the `thinking` state:
- Slight head tilt right (~15°)
- Right hand raised to chin (IK or bone rotation)
- Plays while thought bubble is visible, returns to idle on dismiss

---

## New File Tree

```
AniBuddy/
├── electron/
│   ├── main.js                  # Electron main process
│   ├── preload.js               # contextBridge IPC glue
│   └── transcript-watcher.js   # Node.js JSONL file watcher
├── src/
│   ├── thought-bubble.js        # Bubble show/hide + emote logic
│   └── thought-bubble.css       # Bubble shape + animations
├── assets/
│   └── emotes/
│       ├── thinking.svg
│       ├── reading.svg
│       ├── typing.svg
│       ├── running.svg
│       ├── searching.svg
│       ├── waiting.svg
│       ├── error.svg
│       ├── done.svg
│       └── alert.svg
├── index.html                   # Entry point (replaces webview/index.html)
├── package.json                 # Electron + electron-builder deps
└── electron-builder.yml         # Packaging config (win/mac/linux)
```

---

## package.json Shape

```json
{
  "name": "anibuddy",
  "version": "0.2.0",
  "main": "electron/main.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder"
  },
  "dependencies": {
    "electron": "^30.0.0"
  },
  "devDependencies": {
    "electron-builder": "^24.0.0"
  }
}
```

Three.js and `@pixiv/three-vrm` stay as CDN or local ESM bundles (no bundler needed).

---

## Work Breakdown

| Task | Est. |
|------|------|
| Electron main process (window, drag, tray, child windows) | 1 day |
| Port transcript watcher to Node.js | 2 hrs |
| Rewire bridge.js to Electron IPC + preload | 1 hr |
| Update index.html + CSS for standalone (no IDE chrome) | 1 hr |
| Thought bubble HTML/CSS component | 1 day |
| Emote SVG icons (9 states) | 4 hrs |
| Thinking head-tilt pose | 4 hrs |
| electron-builder packaging (win/mac/linux) | 2 hrs |
| **Total** | **~3–4 days** |

---

## Open Questions

- **VRM loading UX** — file picker dialog via `dialog.showOpenDialog` (Electron built-in), or drag-and-drop onto the window?
- **Config persistence** — `electron-store` (simple JSON) vs keeping `.idea/` XML format?
- **Multi-monitor** — should the widget remember which screen it was on per-session?
- **Thought bubble duration** — fixed 4s, or persist while state is active?
- **Bundler** — ship Three.js / three-vrm as local files in `vendor/` or keep CDN links?
