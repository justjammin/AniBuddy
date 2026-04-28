# AniBuddy

Watch anime avatars react to your Claude Code agents in real time inside any JetBrains IDE.

Each avatar maps to one Claude Code agent session. As the agent reads, writes, runs commands, or errors — the avatar plays a matching animation and expression.

---

## Requirements

| Requirement | Version |
|---|---|
| JDK | 17 or higher |
| IntelliJ IDEA (or any JetBrains IDE) | 2024.3+ |
| JCEF (Chromium browser) | Must be enabled — see below |
| Internet | CDN-loaded Three.js on first render |

### Enable JCEF

JCEF is disabled by default in some IDE builds.

1. `Help` → `Find Action` → type **Registry**
2. Search `ide.browser.jcef.enabled` → check the box
3. Restart the IDE

---

## Build & Install

```bash
# Clone
git clone https://github.com/justjammin/AniBuddy.git
cd AniBuddy

# Build the plugin zip (JDK 17+ required on PATH)
./gradlew buildPlugin

# Output
build/distributions/Anibuddy-0.1.0.zip
```

Install in any JetBrains IDE:

```
Settings → Plugins → ⚙ → Install Plugin from Disk → select the .zip
```

Restart when prompted. The **AniBuddy** tool window appears in the right sidebar.

---

## Get a VRM Avatar

1. Download **VRoid Studio** (free) from [vroid.com/studio](https://vroid.com/studio)
2. Create your character
3. Export → **VRM format** → save the `.vrm` file
4. In the IDE: `Tools` → `AniBuddy` → **Load VRM Model…** → select your `.vrm`

The avatar loads instantly. Built-in animations start playing automatically.

---

## Catching Claude Code Agents

AniBuddy reads Claude Code's JSONL transcript files and drives the avatar from tool calls in real time.

### Step 1 — Find your transcript file

Claude Code writes one JSONL file per session:

```
~/.claude/projects/<encoded-project-path>/<session-id>.jsonl
```

Find the most recent one:

```bash
ls -lt ~/.claude/projects/**/*.jsonl | head -5
```

Copy the full path, e.g.:

```
/Users/you/.claude/projects/-Users-you-code-myproject/abc123def456.jsonl
```

> The session ID changes each time Claude Code starts a new session. Re-point the path when it does, or use a symlink (see tip below).

**Symlink tip** — point a fixed path at the latest session automatically:

```bash
# Add to your shell profile or run before each Claude Code session
PROJ="$HOME/.claude/projects/-Users-$(whoami)-code-myproject"
ln -sf "$(ls -t $PROJ/*.jsonl | head -1)" "$PROJ/live.jsonl"
```

Then configure AniBuddy to watch `~/.claude/projects/-Users-you-code-myproject/live.jsonl`.

---

### Step 2 — Configure AniBuddy

```
Settings → Tools → AniBuddy
```

| Field | What to enter |
|---|---|
| **VRM Model Path** | Path to your `.vrm` file (or use Load VRM from Tools menu) |
| **Agent Name** | Any display name, e.g. `Aiko` |
| **Transcript Path** | Full path to the `.jsonl` file from Step 1 |

Add one row per agent / session you want to watch. Click **Apply**.

The avatar for that agent will immediately show as online and start reacting.

---

## Tools Menu

`Tools` → `AniBuddy` exposes three actions:

| Action | What it does |
|---|---|
| **Load VRM Model…** | Pick a `.vrm` file — loads into the active agent |
| **Set Agent Background Image…** | Set a background image for the active agent panel |
| **Rename Active Agent…** | Rename the currently selected agent tab |

---

## Avatar States

| State | Trigger |
|---|---|
| `idle` | No activity — cycles through all built-in animations randomly |
| `typing` | Agent used `Write`, `Edit`, `str_replace`, `write_file` |
| `reading` | Agent used `Read`, `Glob`, `WebSearch`, `WebFetch`, `list_files` |
| `running` | Agent used `Bash` / `bash` |
| `waiting` | Agent is thinking (`assistant` message) |
| `error` | Tool returned `is_error: true` |
| `done` | Tool completed successfully |
| `alert` | Attention required |

---

## Development

```bash
# Run a sandbox IntelliJ instance with the plugin loaded (no install needed)
./gradlew runIde
```

The sandbox IDE opens with AniBuddy already active. Use it to test without reinstalling.

Webview source lives in `src/main/resources/webview/` — edit HTML/CSS/JS there, then rebuild.

VRMA animation files for the built-in states are in `src/main/resources/webview/vrma/`.
