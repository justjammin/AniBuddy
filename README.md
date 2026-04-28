# AniBuddy

Watch anime avatars react to your Claude Code agents in real time inside any JetBrains IDE.

Each avatar maps to one Claude Code agent session. As the agent reads, writes, runs commands, or encounters errors — the avatar plays matching animations and expressions.

---

## Install

**Requirements:**
- JetBrains IDE (IntelliJ IDEA, PyCharm, WebStorm, etc.) 2024.3+
- JDK 17+
- JCEF enabled (Chromium browser) — see below

### Build the plugin

```bash
git clone https://github.com/justjammin/AniBuddy.git
cd AniBuddy
./gradlew buildPlugin
```

Plugin zip: `build/distributions/Anibuddy-0.1.0.zip`

### Install in IDE

**Settings → Plugins → ⚙ (gear icon) → Install Plugin from Disk**

Select the `.zip` file. Restart when prompted. The **AniBuddy** tool window appears on the right sidebar.

### Enable JCEF

If the tool window shows "JCEF not available," enable it:

1. **Help → Find Action** → type `Registry`
2. Search `ide.browser.jcef.enabled` → check the box
3. Restart the IDE

---

## Get a VRM Avatar

1. Download **VRoid Studio** (free) from [vroid.com/studio](https://vroid.com/studio)
2. Create your character
3. **Export → VRM format** → save the `.vrm` file
4. In IDE: **Tools → AniBuddy → Load VRM Model…** → select your `.vrm`

Avatar loads instantly. Built-in animations start playing.

---

## Auto-Discovery (Zero Config)

AniBuddy automatically watches `~/.claude/projects/` and spawns avatars for every Claude Code session it finds.

**No configuration needed.** When you start Claude Code in any project, the plugin detects the session automatically and creates an avatar tab.

---

## Manual Agent Config (Optional)

For custom control or multiple agents, configure at:

**Settings → Tools → AniBuddy**

| Field | What to enter |
| --- | --- |
| **VRM Model Path** | Path to your `.vrm` file |
| **Agent Name** | Display name (e.g., `Aiko`, `Assistant`) |
| **Transcript Path** | Full path to the `.jsonl` file (leave blank to show name only) |

**Paths support `~`** for home directory.

Click **Apply** to activate. Avatar spawns immediately and starts watching the transcript.

---

## Tools Menu

**Tools → AniBuddy** provides three quick actions:

| Action | What it does |
| --- | --- |
| **Load VRM Model…** | Load a `.vrm` file into the active agent tab |
| **Set Agent Background Image…** | Set a background image for the active agent panel |
| **Rename Active Agent…** | Rename the currently selected agent tab |

---

## Avatar States

Avatar reacts with animation and expression based on agent activity:

| State | When it happens |
| --- | --- |
| `idle` | No activity — cycles all built-in animations randomly |
| `typing` | Agent writing/editing files |
| `reading` | Agent reading files or fetching from web |
| `running` | Agent executing bash commands |
| `waiting` | Agent thinking (processing input) |
| `error` | Tool returned an error |
| `done` | Tool completed successfully |
| `alert` | Attention required |

---

## Transcript Path Reference

Claude Code writes one JSONL file per session:

```
~/.claude/projects/<encoded-project-path>/<session-id>.jsonl
```

Find the most recent:

```bash
ls -lt ~/.claude/projects/**/*.jsonl | head -5
```

Session ID changes when Claude Code starts a new session. If you manually configure a transcript path, update it when a new session begins, or use a symlink:

```bash
PROJ="$HOME/.claude/projects/-Users-$(whoami)-code-myproject"
ln -sf "$(ls -t $PROJ/*.jsonl | head -1)" "$PROJ/live.jsonl"
```

Then point AniBuddy to `~/.claude/projects/-Users-you-code-myproject/live.jsonl`.
