// ─────────────────────────────────────────────────────────────────────────
// AniBuddy.kt  — all plugin classes in one file
// ─────────────────────────────────────────────────────────────────────────
package com.justjammin.anibuddy

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.*
import com.intellij.openapi.fileChooser.FileChooserDescriptor
import com.intellij.openapi.fileChooser.FileChooserFactory
import com.intellij.openapi.options.Configurable
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefJSQuery
import com.sun.net.httpserver.HttpServer
import kotlinx.coroutines.*
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.handler.CefLoadHandlerAdapter
import java.awt.*
import java.io.File
import java.io.RandomAccessFile
import java.net.InetSocketAddress
import java.nio.file.Files
import java.util.Base64
import javax.swing.*
import javax.swing.table.DefaultTableModel


// ─────────────────────────────────────────────────────────────────────────
// AniBuddySettings — persisted state (VRM path + custom agent list)
// ─────────────────────────────────────────────────────────────────────────
@State(
    name     = "AniBuddySettings",
    storages = [Storage("aniBuddySettings.xml")]
)
@Service(Service.Level.PROJECT)
class AniBuddySettings : PersistentStateComponent<AniBuddySettings.State> {

    class AgentConfig {
        @JvmField var name: String = ""
        @JvmField var transcriptPath: String = ""
    }

    class State {
        @JvmField var vrmPath: String = ""
        @JvmField var agents: MutableList<AgentConfig> = mutableListOf()
    }

    private var myState = State()

    var vrmPath: String
        get() = myState.vrmPath
        set(v) { myState.vrmPath = v }

    val agents: MutableList<AgentConfig>
        get() = myState.agents

    override fun getState(): State = myState
    override fun loadState(state: State) { myState = state }

    companion object {
        fun getInstance(project: Project): AniBuddySettings = project.service()
    }
}


// ─────────────────────────────────────────────────────────────────────────
// AniBuddySettingsPanel — Swing UI shown inside the Configurable
// ─────────────────────────────────────────────────────────────────────────
class AniBuddySettingsPanel(private val project: Project) {

    val root: JPanel = JPanel(GridBagLayout())
    private val vrmField = JTextField(40)
    private val tableModel = DefaultTableModel(arrayOf("Agent Name", "Transcript Path (.jsonl)"), 0)
    private val table = JTable(tableModel)

    init {
        table.preferredScrollableViewportSize = Dimension(520, 160)
        table.fillsViewportHeight = true
        table.columnModel.getColumn(0).preferredWidth = 120
        table.columnModel.getColumn(1).preferredWidth = 400

        fun gbc(x: Int, y: Int, block: GridBagConstraints.() -> Unit = {}) =
            GridBagConstraints().apply {
                gridx = x; gridy = y
                anchor = GridBagConstraints.WEST
                insets = Insets(4, 8, 4, 8)
                block()
            }

        root.add(JLabel("VRM Model Path:"), gbc(0, 0))
        root.add(vrmField, gbc(1, 0) { fill = GridBagConstraints.HORIZONTAL; weightx = 1.0 })
        root.add(JButton("Browse…").apply {
            addActionListener {
                val desc = FileChooserDescriptor(true, false, false, false, false, false)
                    .withTitle("Select VRM Model")
                    .withFileFilter { it.extension?.lowercase() == "vrm" }
                FileChooserFactory.getInstance()
                    .createFileChooser(desc, project, null)
                    .choose(project)
                    .firstOrNull()?.path?.let { vrmField.text = it }
            }
        }, gbc(2, 0))

        root.add(
            JLabel("<html><small>Path is saved and the model reloads automatically on Apply.</small></html>"),
            gbc(1, 1) { gridwidth = 2; fill = GridBagConstraints.HORIZONTAL }
        )

        root.add(JLabel("Custom Agent Transcript Paths:"), gbc(0, 2) { gridwidth = 3; insets = Insets(14, 8, 2, 8) })
        root.add(JScrollPane(table), gbc(0, 3) {
            gridwidth = 3; fill = GridBagConstraints.BOTH
            weightx = 1.0; weighty = 1.0; insets = Insets(0, 8, 0, 8)
        })
        root.add(
            JLabel("<html><small>Paths may use ~ for home. Leave path blank to show the agent name without transcript tailing.</small></html>"),
            gbc(0, 4) { gridwidth = 3; fill = GridBagConstraints.HORIZONTAL }
        )

        val btnRow = JPanel(FlowLayout(FlowLayout.LEFT, 4, 0)).apply {
            add(JButton("＋ Add Agent").apply {
                addActionListener {
                    tableModel.addRow(arrayOf("Agent", ""))
                    val r = tableModel.rowCount - 1
                    table.setRowSelectionInterval(r, r)
                    table.requestFocus()
                    table.editCellAt(r, 0)
                }
            })
            add(JButton("Remove Selected").apply {
                addActionListener {
                    val r = table.selectedRow
                    if (r >= 0) {
                        if (table.isEditing) table.cellEditor?.stopCellEditing()
                        tableModel.removeRow(r)
                    }
                }
            })
        }
        root.add(btnRow, gbc(0, 5) { gridwidth = 3; fill = GridBagConstraints.HORIZONTAL; insets = Insets(4, 4, 8, 8) })

        reset()
    }

    fun isModified(): Boolean {
        val s = AniBuddySettings.getInstance(project)
        if (vrmField.text.trim() != s.vrmPath) return true
        if (tableModel.rowCount != s.agents.size) return true
        s.agents.forEachIndexed { i, a ->
            if ((tableModel.getValueAt(i, 0) as? String ?: "") != a.name) return true
            if ((tableModel.getValueAt(i, 1) as? String ?: "") != a.transcriptPath) return true
        }
        return false
    }

    fun apply() {
        if (table.isEditing) table.cellEditor?.stopCellEditing()
        val s = AniBuddySettings.getInstance(project)
        s.vrmPath = vrmField.text.trim()
        s.agents.clear()
        for (i in 0 until tableModel.rowCount) {
            val name = (tableModel.getValueAt(i, 0) as? String ?: "").trim()
            val path = (tableModel.getValueAt(i, 1) as? String ?: "").trim()
            if (name.isNotBlank()) s.agents.add(AniBuddySettings.AgentConfig().apply {
                this.name = name
                this.transcriptPath = path
            })
        }
    }

    fun reset() {
        if (table.isEditing) table.cellEditor?.stopCellEditing()
        val s = AniBuddySettings.getInstance(project)
        vrmField.text = s.vrmPath
        tableModel.rowCount = 0
        s.agents.forEach { tableModel.addRow(arrayOf(it.name, it.transcriptPath)) }
    }
}


// ─────────────────────────────────────────────────────────────────────────
// AniBuddyConfigurable — registers the settings page under Tools
// ─────────────────────────────────────────────────────────────────────────
class AniBuddyConfigurable(private val project: Project) : Configurable {

    private var ui: AniBuddySettingsPanel? = null

    override fun getDisplayName(): String = "AniBuddy"

    override fun createComponent(): JComponent {
        ui = AniBuddySettingsPanel(project)
        return ui!!.root
    }

    override fun isModified(): Boolean = ui?.isModified() == true

    override fun apply() {
        ui?.apply()
        TranscriptWatcherService.getInstance(project).applySettings()
    }

    override fun reset() { ui?.reset() }

    override fun disposeUIResources() { ui = null }
}


// ─────────────────────────────────────────────────────────────────────────
// AnimeAgentToolWindowFactory
// ─────────────────────────────────────────────────────────────────────────
class AnimeAgentToolWindowFactory : ToolWindowFactory {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val panel   = AnimeAgentPanel(project)
        val content = ContentFactory.getInstance().createContent(panel.component, "", false)
        toolWindow.contentManager.addContent(content)
        TranscriptWatcherService.getInstance(project).attachPanel(panel)
    }
}


// ─────────────────────────────────────────────────────────────────────────
// AnimeAgentPanel — JCEF browser host
// ─────────────────────────────────────────────────────────────────────────
class AnimeAgentPanel(private val project: Project) {

    val component: JPanel = JPanel(BorderLayout())

    private var browser: JBCefBrowser? = null
    private var jsQuery: JBCefJSQuery? = null
    private var isReady = false
    private val pendingMessages = mutableListOf<String>()
    private var localServer: HttpServer? = null

    init {
        if (!JBCefApp.isSupported()) {
            component.add(
                JLabel("<html><center>JCEF not available.<br/>Enable via: Help → Find Action → Registry → ide.browser.jcef.enabled</center></html>"),
                BorderLayout.CENTER
            )
        } else {
            initBrowser()
        }
    }

    private fun startLocalServer(): Int {
        val mime = mapOf("html" to "text/html", "css" to "text/css", "js" to "application/javascript")
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/") { ex ->
            val path = ex.requestURI.path.trimStart('/').ifEmpty { "index.html" }
            val stream = AnimeAgentPanel::class.java.getResourceAsStream("/webview/$path")
            if (stream == null) {
                val body = "Not found".toByteArray()
                ex.sendResponseHeaders(404, body.size.toLong())
                ex.responseBody.use { it.write(body) }
            } else {
                val body = stream.use { it.readBytes() }
                val ext = path.substringAfterLast('.', "")
                ex.responseHeaders.add("Content-Type", mime[ext] ?: "application/octet-stream")
                ex.sendResponseHeaders(200, body.size.toLong())
                ex.responseBody.use { it.write(body) }
            }
        }
        server.executor = null
        server.start()
        localServer = server
        return server.address.port
    }

    private fun initBrowser() {
        val port = try { startLocalServer() } catch (e: Exception) {
            component.add(JLabel("Failed to start webview server: ${e.message}"), BorderLayout.CENTER)
            return
        }

        val b = JBCefBrowser()
        browser = b
        component.add(b.component, BorderLayout.CENTER)

        jsQuery = JBCefJSQuery.create(b)
        jsQuery?.addHandler { msg ->
            when (msg) {
                "open_settings" -> ApplicationManager.getApplication().invokeLater {
                    ShowSettingsUtil.getInstance()
                        .showSettingsDialog(project, AniBuddyConfigurable::class.java)
                }
            }
            null
        }

        b.jbCefClient.addLoadHandler(object : CefLoadHandlerAdapter() {
            override fun onLoadEnd(browser: CefBrowser?, frame: CefFrame?, httpStatusCode: Int) {
                if (frame?.isMain != true) return
                isReady = true
                val openCall = jsQuery?.inject("'open_settings'") ?: ""
                executeJS("window.__jbBridge = { openSettings: function() { $openCall } };")
                pendingMessages.forEach { executeJS(it) }
                pendingMessages.clear()
                onPageReady()
            }
        }, b.cefBrowser)

        b.loadURL("http://127.0.0.1:$port/")
    }

    private fun onPageReady() {
        val settings = AniBuddySettings.getInstance(project)
        if (settings.vrmPath.isNotBlank()) loadVRMFromPath(settings.vrmPath)
        settings.agents.forEach { agent ->
            if (agent.name.isNotBlank()) {
                val safe = agent.name.replace("'", "\\'")
                executeJS("window.agentBridge?.spawnAgent('$safe')")
            }
        }
    }

    fun updateAgent(agentName: String, state: String, message: String) {
        val safeMsg = message.replace("'", "\\'").replace("\n", " ")
        sendJS("window.agentBridge?.updateAgent('$agentName','$state','$safeMsg')")
    }

    fun loadVRMFromPath(path: String) {
        val file = File(path)
        if (!file.exists()) return
        val base64 = Base64.getEncoder().encodeToString(Files.readAllBytes(file.toPath()))
        sendJS("window.agentBridge?.loadVRM('data:model/gltf-binary;base64,$base64')")
    }

    fun setBackground(path: String) {
        val file = File(path)
        if (!file.exists()) return
        val bytes = Files.readAllBytes(file.toPath())
        val mime = when (file.extension.lowercase()) {
            "jpg", "jpeg" -> "image/jpeg"
            "png"         -> "image/png"
            "gif"         -> "image/gif"
            "webp"        -> "image/webp"
            else          -> "image/*"
        }
        val base64 = Base64.getEncoder().encodeToString(bytes)
        sendJS("window.agentBridge?.setBackground('data:$mime;base64,$base64')")
    }

    fun renameAgent(newName: String) {
        val safe = newName.replace("'", "\\'")
        sendJS("window.agentBridge?.renameActiveAgent('$safe')")
    }

    fun sendJS(js: String) {
        if (isReady) executeJS(js) else pendingMessages.add(js)
    }

    private fun executeJS(js: String) {
        browser?.cefBrowser?.executeJavaScript(js, "", 0)
    }

    fun dispose() {
        jsQuery?.dispose()
        browser?.dispose()
        localServer?.stop(0)
    }
}


// ─────────────────────────────────────────────────────────────────────────
// TranscriptWatcherService — polls JSONL files, drives avatar state
// ─────────────────────────────────────────────────────────────────────────
@Service(Service.Level.PROJECT)
class TranscriptWatcherService(private val project: Project) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    var panel: AnimeAgentPanel? = null
        private set

    private val filePositions = mutableMapOf<String, Long>()

    // Auto-discovered Claude Code projects
    private data class DiscoveredProject(
        val projectDir: String,
        val agentName: String,
        var jsonlPath: String,
        var filePos: Long
    )
    private val discovered = mutableMapOf<String, DiscoveredProject>()
    private val spawnedNames = mutableSetOf<String>()
    // First slot starts as placeholder — first real session claims it instead of spawning new
    private var firstSlotClaimed = false

    private val toolStateMap = mapOf(
        "write_file"  to Pair("typing",  "Writing file..."),
        "str_replace" to Pair("typing",  "Editing file..."),
        "read_file"   to Pair("reading", "Reading file..."),
        "Read"        to Pair("reading", "Reading file..."),
        "bash"        to Pair("running", "Running command..."),
        "Bash"        to Pair("running", "Running command..."),
        "web_search"  to Pair("reading", "Searching..."),
        "WebSearch"   to Pair("reading", "Searching..."),
        "web_fetch"   to Pair("reading", "Fetching URL..."),
        "WebFetch"    to Pair("reading", "Fetching URL..."),
        "Glob"        to Pair("reading", "Scanning files..."),
        "list_files"  to Pair("reading", "Scanning directory..."),
        "Write"       to Pair("typing",  "Writing file..."),
        "Edit"        to Pair("typing",  "Editing file..."),
    )

    fun attachPanel(p: AnimeAgentPanel) {
        panel = p
        startWatching()
    }

    fun applySettings() {
        val settings = AniBuddySettings.getInstance(project)
        if (settings.vrmPath.isNotBlank()) panel?.loadVRMFromPath(settings.vrmPath)
        settings.agents.forEach { agent ->
            if (agent.name.isNotBlank()) {
                firstSlotClaimed = true  // manual agents occupy the first slot
                val safe = agent.name.replace("'", "\\'")
                panel?.sendJS("window.agentBridge?.spawnAgent('$safe')")
            }
        }
    }

    private fun startWatching() {
        scope.launch {
            while (isActive) {
                scanTranscripts()
                scanClaudeProjects()
                delay(1000)
            }
        }
    }

    private fun scanClaudeProjects() {
        val claudeHome = File(System.getProperty("user.home")).resolve(".claude/projects")
        if (!claudeHome.isDirectory) return
        val activeThreshold = System.currentTimeMillis() - 30 * 60 * 1000L // 30 min

        claudeHome.listFiles { f -> f.isDirectory }?.forEach { projectDir ->
            val latest = projectDir.listFiles { f -> f.extension == "jsonl" }
                ?.maxByOrNull { it.lastModified() } ?: return@forEach

            // Only track sessions active in the last 30 minutes
            // (already-tracked projects stay tracked once discovered)
            val alreadyTracked = discovered.containsKey(projectDir.path)
            if (!alreadyTracked && latest.lastModified() < activeThreshold) return@forEach

            val existing = discovered[projectDir.path]
            if (existing == null) {
                val name = decodeProjectName(projectDir.name)
                val dp = DiscoveredProject(
                    projectDir = projectDir.path,
                    agentName  = name,
                    jsonlPath  = latest.path,
                    filePos    = latest.length()
                )
                discovered[projectDir.path] = dp
                if (spawnedNames.add(name)) {
                    val safe = name.replace("'", "\\'")
                    if (!firstSlotClaimed) {
                        // Take over the placeholder first slot instead of spawning a second
                        firstSlotClaimed = true
                        panel?.sendJS("window.agentBridge?.renameActiveAgent('$safe')")
                    } else {
                        panel?.sendJS("window.agentBridge?.spawnAgent('$safe')")
                    }
                    panel?.updateAgent(name, "idle", "Watching...")
                }
            } else if (existing.jsonlPath != latest.path) {
                // New session started for this project
                existing.jsonlPath = latest.path
                existing.filePos   = latest.length()
                panel?.updateAgent(existing.agentName, "idle", "New session")
            } else {
                readDiscoveredLines(existing)
            }
        }
    }

    private fun readDiscoveredLines(dp: DiscoveredProject) {
        val file = File(dp.jsonlPath)
        if (!file.exists()) return
        val curSize = file.length()
        if (curSize <= dp.filePos) return
        try {
            RandomAccessFile(file, "r").use { raf ->
                raf.seek(dp.filePos)
                var line: String?
                while (raf.readLine().also { line = it } != null) {
                    line?.trim()?.takeIf { it.isNotEmpty() }?.let { processLine(it, dp.agentName) }
                }
            }
        } catch (_: Exception) {}
        dp.filePos = curSize
    }

    private fun decodeProjectName(encoded: String): String {
        // "-Users-jammin-Documents-GitHub-AniBuddy" → "AniBuddy"
        return encoded.trimStart('-').split('-').lastOrNull { it.isNotBlank() } ?: "Agent"
    }

    private fun scanTranscripts() {
        AniBuddySettings.getInstance(project).agents.forEach { agent ->
            val raw = agent.transcriptPath.trim()
            if (raw.isBlank()) return@forEach
            val f = File(raw.replace("~", System.getProperty("user.home")))
            if (!f.exists()) return@forEach
            if (!filePositions.containsKey(f.path)) {
                filePositions[f.path] = f.length()
                panel?.updateAgent(agent.name, "idle", "Agent online")
                return@forEach
            }
            readNewLines(f, agent.name)
        }
    }

    private fun readNewLines(file: File, agentName: String) {
        val lastPos = filePositions[file.path] ?: 0
        val curSize = file.length()
        if (curSize <= lastPos) return
        try {
            RandomAccessFile(file, "r").use { raf ->
                raf.seek(lastPos)
                var line: String?
                while (raf.readLine().also { line = it } != null) {
                    line?.trim()?.takeIf { it.isNotEmpty() }?.let { processLine(it, agentName) }
                }
            }
        } catch (_: Exception) {}
        filePositions[file.path] = curSize
    }

    private fun processLine(line: String, agentName: String) {
        val type = extractField(line, "type") ?: return
        when (type) {
            "tool_use" -> {
                val toolName = extractField(line, "name") ?: return
                val mapped   = toolStateMap[toolName] ?: return
                val filePath = extractField(line, "path") ?: extractField(line, "command")
                val msg = if (filePath != null) "${mapped.second.trimEnd('.')} ${File(filePath).name}" else mapped.second
                panel?.updateAgent(agentName, mapped.first, msg)
            }
            "tool_result" -> {
                val err = line.contains("\"is_error\":true")
                panel?.updateAgent(agentName, if (err) "error" else "done", if (err) "Tool returned error" else "Tool completed ✓")
            }
            "assistant" -> panel?.updateAgent(agentName, "waiting", "Thinking...")
        }
    }

    private fun extractField(json: String, key: String): String? =
        Regex("\"$key\"\\s*:\\s*\"([^\"\\\\]*(?:\\\\.[^\"\\\\]*)*)\"").find(json)?.groupValues?.get(1)

    fun dispose() {
        scope.cancel()
        panel?.dispose()
    }

    companion object {
        fun getInstance(project: Project): TranscriptWatcherService = project.service()
    }
}


// ─────────────────────────────────────────────────────────────────────────
// TranscriptWatcherStartup
// ─────────────────────────────────────────────────────────────────────────
class TranscriptWatcherStartup : ProjectActivity {
    override suspend fun execute(project: Project) {}
}


// ─────────────────────────────────────────────────────────────────────────
// Tools menu actions
// ─────────────────────────────────────────────────────────────────────────
class LoadVRMAction : AnAction("Load VRM Model...") {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val desc = FileChooserDescriptor(true, false, false, false, false, false)
            .withTitle("Select VRM Model")
            .withDescription("Choose a .vrm file exported from VRoid Studio")
            .withFileFilter { it.extension?.lowercase() == "vrm" }
        val path = FileChooserFactory.getInstance()
            .createFileChooser(desc, project, null)
            .choose(project)
            .firstOrNull()?.path ?: return
        AniBuddySettings.getInstance(project).vrmPath = path
        TranscriptWatcherService.getInstance(project).panel?.loadVRMFromPath(path)
    }
}

class SetBackgroundAction : AnAction("Set Agent Background Image...") {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val desc = FileChooserDescriptor(true, false, false, false, false, false)
            .withTitle("Select Background Image")
            .withDescription("Choose an image for the active agent's background")
            .withFileFilter { it.extension?.lowercase() in listOf("jpg", "jpeg", "png", "gif", "webp") }
        val path = FileChooserFactory.getInstance()
            .createFileChooser(desc, project, null)
            .choose(project)
            .firstOrNull()?.path ?: return
        TranscriptWatcherService.getInstance(project).panel?.setBackground(path)
    }
}

class RenameAgentAction : AnAction("Rename Active Agent...") {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val newName = Messages.showInputDialog(
            project,
            "Enter a new name for the currently selected agent:",
            "Rename Agent",
            Messages.getQuestionIcon()
        ) ?: return
        if (newName.isNotBlank()) {
            TranscriptWatcherService.getInstance(project).panel?.renameAgent(newName.trim())
        }
    }
}
