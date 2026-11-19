package com.filelenspro.app.service

import android.content.Context
import java.io.BufferedReader
import java.io.BufferedWriter
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.ServerSocket
import java.net.Socket
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.concurrent.Executors

class LanFtpServer(
    private val context: Context,
    private val defaultPort: Int = 2121,
    private var customRootDir: File? = null
) {
    private var serverSocket: ServerSocket? = null
    @Volatile private var isRunning = false
    private val threadPool = Executors.newCachedThreadPool()
    private val clientSessions = mutableListOf<FtpSession>()

    @Synchronized
    fun start(): Int {
        if (isRunning && serverSocket != null && !serverSocket!!.isClosed) {
            return serverSocket!!.localPort
        }
        val ss = try {
            ServerSocket(defaultPort)
        } catch (_: Exception) {
            ServerSocket(0)
        }
        serverSocket = ss
        isRunning = true
        val actualPort = ss.localPort
        threadPool.execute {
            while (isRunning && !ss.isClosed) {
                try {
                    val clientSocket = ss.accept()
                    val root = customRootDir ?: context.filesDir
                    val session = FtpSession(clientSocket, root)
                    synchronized(clientSessions) { clientSessions.add(session) }
                    threadPool.execute {
                        try {
                            session.run()
                        } finally {
                            synchronized(clientSessions) { clientSessions.remove(session) }
                        }
                    }
                } catch (_: Exception) {
                    if (!isRunning) break
                }
            }
        }
        return actualPort
    }

    @Synchronized
    fun stop() {
        isRunning = false
        try { serverSocket?.close() } catch (_: Exception) {}
        serverSocket = null
        synchronized(clientSessions) {
            clientSessions.forEach { it.close() }
            clientSessions.clear()
        }
    }

    fun isServerRunning(): Boolean = isRunning && serverSocket != null && !serverSocket!!.isClosed
    fun getPort(): Int = serverSocket?.localPort ?: defaultPort

    private class FtpSession(
        private val controlSocket: Socket,
        private val rootDir: File
    ) {
        private var currentDir: File = rootDir
        private var dataServerSocket: ServerSocket? = null
        private var renameFrom: File? = null
        private var reader: BufferedReader? = null
        private var writer: BufferedWriter? = null
        @Volatile private var isClosed = false

        fun close() {
            isClosed = true
            try { dataServerSocket?.close() } catch (_: Exception) {}
            try { controlSocket.close() } catch (_: Exception) {}
        }

        fun run() {
            try {
                controlSocket.soTimeout = 60000
                reader = BufferedReader(InputStreamReader(controlSocket.getInputStream(), "UTF-8"))
                writer = BufferedWriter(OutputStreamWriter(controlSocket.getOutputStream(), "UTF-8"))
                sendResponse(220, "FileSearchPro FTP Server ready")
                var line: String? = null
                while (!isClosed && reader?.readLine().also { line = it } != null) {
                    val cmdLine = line?.trim() ?: break
                    if (cmdLine.isEmpty()) continue
                    val spaceIdx = cmdLine.indexOf(' ')
                    val cmd = (if (spaceIdx != -1) cmdLine.substring(0, spaceIdx) else cmdLine).uppercase(Locale.US)
                    val arg = if (spaceIdx != -1) cmdLine.substring(spaceIdx + 1).trim() else ""
                    handleCommand(cmd, arg)
                    if (cmd == "QUIT") break
                }
            } catch (_: Exception) {
            } finally {
                close()
            }
        }

        private fun sendResponse(code: Int, text: String) {
            try {
                writer?.write("$code $text\r\n")
                writer?.flush()
            } catch (_: Exception) {}
        }

        private fun openDataSocket(): Socket? {
            val dss = dataServerSocket ?: return null
            return try {
                dss.soTimeout = 15000
                dss.accept()
            } catch (_: Exception) {
                null
            } finally {
                try { dss.close() } catch (_: Exception) {}
                dataServerSocket = null
            }
        }

        private fun handleCommand(cmd: String, arg: String) {
            when (cmd) {
                "USER" -> sendResponse(331, "Anonymous user accepted.")
                "PASS" -> sendResponse(230, "Logged in.")
                "SYST" -> sendResponse(215, "UNIX Type: L8")
                "FEAT" -> {
                    writer?.write("211-Features:\r\n UTF8\r\n SIZE\r\n MDTM\r\n211 End\r\n")
                    writer?.flush()
                }
                "OPTS" -> sendResponse(200, "UTF8 enabled.")
                "PWD" -> sendResponse(257, "\"${getRelativePath(currentDir)}\" is current directory.")
                "TYPE" -> sendResponse(200, "Type set to $arg.")
                "NOOP" -> sendResponse(200, "OK")
                "PASV" -> {
                    try {
                        dataServerSocket?.close()
                        val dss = ServerSocket(0)
                        dataServerSocket = dss
                        val p = dss.localPort
                        val ip = controlSocket.localAddress.address
                        val ipStr = "${ip[0].toInt() and 0xFF},${ip[1].toInt() and 0xFF},${ip[2].toInt() and 0xFF},${ip[3].toInt() and 0xFF}"
                        sendResponse(227, "Entering Passive Mode ($ipStr,${(p shr 8) and 0xFF},${p and 0xFF})")
                    } catch (_: Exception) {
                        sendResponse(425, "Cannot open passive connection.")
                    }
                }
                "EPSV" -> {
                    try {
                        dataServerSocket?.close()
                        val dss = ServerSocket(0)
                        dataServerSocket = dss
                        sendResponse(229, "Entering Extended Passive Mode (|||${dss.localPort}|)")
                    } catch (_: Exception) {
                        sendResponse(425, "Cannot open passive connection.")
                    }
                }
                "CWD" -> {
                    val target = resolveTargetFile(arg)
                    if (target.exists() && target.isDirectory) {
                        currentDir = target
                        sendResponse(250, "Directory changed.")
                    } else sendResponse(550, "Failed to change directory.")
                }
                "CDUP" -> {
                    val parent = currentDir.parentFile
                    if (parent != null && parent.exists() && parent.absolutePath.startsWith(rootDir.absolutePath)) {
                        currentDir = parent
                    }
                    sendResponse(200, "OK")
                }
                "LIST", "NLST", "MLSD" -> {
                    sendResponse(150, "Opening data connection")
                    val ds = openDataSocket() ?: run { sendResponse(425, "Data failed"); return }
                    try {
                        val out = BufferedWriter(OutputStreamWriter(ds.getOutputStream(), "UTF-8"))
                        val sdf = SimpleDateFormat("MMM dd HH:mm", Locale.US)
                        for (f in currentDir.listFiles() ?: emptyArray()) {
                            if (f.name.startsWith(".")) continue
                            val perms = if (f.isDirectory) "drwxrwxrwx" else "-rw-rw-rw-"
                            val sz = if (f.isDirectory) 0L else f.length()
                            if (cmd == "NLST") out.write("${f.name}\r\n")
                            else out.write("$perms 1 owner group $sz ${sdf.format(f.lastModified())} ${f.name}\r\n")
                        }
                        out.flush()
                        sendResponse(226, "Transfer complete.")
                    } catch (_: Exception) {
                        sendResponse(426, "Aborted.")
                    } finally {
                        try { ds.close() } catch (_: Exception) {}
                    }
                }
                "RETR" -> {
                    val target = resolveTargetFile(arg)
                    if (!target.exists() || target.isDirectory) { sendResponse(550, "Not found"); return }
                    sendResponse(150, "Opening binary connection")
                    val ds = openDataSocket() ?: run { sendResponse(425, "Data failed"); return }
                    try {
                        FileInputStream(target).use { ins -> ins.copyTo(ds.getOutputStream()) }
                        sendResponse(226, "Transfer complete.")
                    } catch (_: Exception) {
                        sendResponse(426, "Aborted.")
                    } finally {
                        try { ds.close() } catch (_: Exception) {}
                    }
                }
                "STOR" -> {
                    val target = resolveTargetFile(arg)
                    sendResponse(150, "Opening binary connection for upload")
                    val ds = openDataSocket() ?: run { sendResponse(425, "Data failed"); return }
                    try {
                        target.parentFile?.mkdirs()
                        FileOutputStream(target).use { outs -> ds.getInputStream().copyTo(outs) }
                        sendResponse(226, "Transfer complete.")
                    } catch (_: Exception) {
                        sendResponse(426, "Upload failed.")
                    } finally {
                        try { ds.close() } catch (_: Exception) {}
                    }
                }
                "DELE" -> {
                    val t = resolveTargetFile(arg)
                    if (t.exists() && !t.isDirectory && t.delete()) sendResponse(250, "Deleted.") else sendResponse(550, "Failed.")
                }
                "MKD" -> {
                    val t = resolveTargetFile(arg)
                    if (t.mkdirs()) sendResponse(257, "Created.") else sendResponse(550, "Failed.")
                }
                "RNFR" -> {
                    val t = resolveTargetFile(arg)
                    if (t.exists()) { renameFrom = t; sendResponse(350, "Ready.") } else sendResponse(550, "Not found.")
                }
                "RNTO" -> {
                    val src = renameFrom
                    if (src != null && src.renameTo(resolveTargetFile(arg))) sendResponse(250, "Renamed.") else sendResponse(550, "Failed.")
                    renameFrom = null
                }
                "SIZE" -> {
                    val t = resolveTargetFile(arg)
                    if (t.exists() && !t.isDirectory) sendResponse(213, "${t.length()}") else sendResponse(550, "Not found.")
                }
                "QUIT" -> sendResponse(221, "Goodbye.")
                else -> sendResponse(502, "Not implemented.")
            }
        }

        private fun resolveTargetFile(path: String): File {
            val clean = path.trim()
            return when {
                clean.startsWith("/") -> File(rootDir, clean.substring(1))
                clean == "~" -> rootDir
                else -> File(currentDir, clean)
            }
        }

        private fun getRelativePath(file: File): String {
            val rootPath = rootDir.absolutePath
            val filePath = file.absolutePath
            if (filePath == rootPath) return "/"
            return if (filePath.startsWith(rootPath)) "/" + filePath.substring(rootPath.length).trimStart('/') else filePath
        }
    }
}
