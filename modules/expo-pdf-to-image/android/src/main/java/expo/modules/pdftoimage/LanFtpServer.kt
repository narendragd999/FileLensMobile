package expo.modules.pdftoimage

import android.content.Context
import android.os.Environment
import java.io.*
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.concurrent.Executors

/**
 * LanFtpServer.kt — Complete, lightweight, multi-threaded FTP Server for Android.
 *
 * Implements RFC 959 FTP protocol in passive mode (PASV/EPSV).
 * Compatible with:
 *   - Windows File Explorer (address bar: ftp://192.168.x.x:2121)
 *   - macOS Finder & Cyberduck
 *   - FileZilla, WinSCP, Total Commander, AndFTP
 *   - Direct drag-and-drop file upload, download, rename, and directory browsing
 */
class LanFtpServer(
    private val context: Context,
    private val defaultPort: Int = 2121,
    private var customRootDir: File? = null
) {
    private var serverSocket: ServerSocket? = null
    @Volatile private var isRunning = false
    private val threadPool = Executors.newCachedThreadPool()
    private val clientSessions = mutableListOf<FtpSession>()

    fun setRootDir(dir: File) {
        customRootDir = dir
    }

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
                    val root = customRootDir ?: Environment.getExternalStorageDirectory()
                    val session = FtpSession(clientSocket, root)
                    synchronized(clientSessions) {
                        clientSessions.add(session)
                    }
                    threadPool.execute {
                        try {
                            session.run()
                        } finally {
                            synchronized(clientSessions) {
                                clientSessions.remove(session)
                            }
                        }
                    }
                } catch (e: Exception) {
                    if (!isRunning) break
                }
            }
        }

        return actualPort
    }

    @Synchronized
    fun stop() {
        isRunning = false
        try {
            serverSocket?.close()
        } catch (_: Exception) {}
        serverSocket = null

        synchronized(clientSessions) {
            for (s in clientSessions) {
                s.close()
            }
            clientSessions.clear()
        }
    }

    fun isServerRunning(): Boolean = isRunning && serverSocket != null && !serverSocket!!.isClosed
    fun getPort(): Int = serverSocket?.localPort ?: defaultPort
    fun getActiveConnections(): Int = synchronized(clientSessions) { clientSessions.size }

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

                sendResponse(220, "FileLens Pro FTP Server ready")

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
                // Client disconnect or timeout handled safely
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
                "USER" -> sendResponse(331, "Anonymous user accepted. Send password.")
                "PASS" -> sendResponse(230, "User logged in, proceed.")
                "SYST" -> sendResponse(215, "UNIX Type: L8")
                "FEAT" -> {
                    try {
                        writer?.write("211-Features:\r\n UTF8\r\n SIZE\r\n MDTM\r\n REST STREAM\r\n MLST type*;size*;modify*;\r\n211 End\r\n")
                        writer?.flush()
                    } catch (_: Exception) {}
                }
                "OPTS" -> {
                    if (arg.uppercase(Locale.US).startsWith("UTF8")) {
                        sendResponse(200, "Always in UTF8 mode.")
                    } else {
                        sendResponse(501, "Option not understood.")
                    }
                }
                "PWD" -> {
                    val relPath = getRelativePath(currentDir)
                    sendResponse(257, "\"$relPath\" is current directory.")
                }
                "TYPE" -> sendResponse(200, "Type set to $arg.")
                "NOOP" -> sendResponse(200, "OK")
                "PASV" -> {
                    try {
                        dataServerSocket?.close()
                        val dss = ServerSocket(0)
                        dataServerSocket = dss
                        val p = dss.localPort

                        val addr = controlSocket.localAddress
                        val ipBytes = addr.address
                        val ipStr = "${ipBytes[0].toInt() and 0xFF},${ipBytes[1].toInt() and 0xFF},${ipBytes[2].toInt() and 0xFF},${ipBytes[3].toInt() and 0xFF}"
                        val p1 = (p shr 8) and 0xFF
                        val p2 = p and 0xFF

                        sendResponse(227, "Entering Passive Mode ($ipStr,$p1,$p2)")
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
                        sendResponse(250, "Directory changed to ${getRelativePath(currentDir)}")
                    } else {
                        sendResponse(550, "Failed to change directory.")
                    }
                }
                "CDUP" -> {
                    val parent = currentDir.parentFile
                    if (parent != null && parent.exists() && parent.absolutePath.startsWith(rootDir.absolutePath)) {
                        currentDir = parent
                        sendResponse(200, "Directory changed to ${getRelativePath(currentDir)}")
                    } else {
                        sendResponse(200, "Already at root directory.")
                    }
                }
                "LIST", "NLST", "MLSD" -> {
                    sendResponse(150, "Opening binary mode data connection for file list")
                    val dataSocket = openDataSocket()
                    if (dataSocket == null) {
                        sendResponse(425, "Data connection failed")
                        return
                    }

                    try {
                        val dataOut = BufferedWriter(OutputStreamWriter(dataSocket.getOutputStream(), "UTF-8"))
                        val files = currentDir.listFiles() ?: emptyArray()

                        val dateFormat = SimpleDateFormat("MMM dd HH:mm", Locale.US)
                        for (f in files) {
                            if (f.name.startsWith(".")) continue
                            val isDir = f.isDirectory
                            val perms = if (isDir) "drwxrwxrwx" else "-rw-rw-rw-"
                            val size = if (isDir) 0L else f.length()
                            val dateStr = dateFormat.format(f.lastModified())

                            if (cmd == "NLST") {
                                dataOut.write("${f.name}\r\n")
                            } else {
                                dataOut.write("$perms 1 owner group $size $dateStr ${f.name}\r\n")
                            }
                        }
                        dataOut.flush()
                        sendResponse(226, "Transfer complete.")
                    } catch (_: Exception) {
                        sendResponse(426, "Data transfer aborted.")
                    } finally {
                        try { dataSocket.close() } catch (_: Exception) {}
                    }
                }
                "RETR" -> {
                    val target = resolveTargetFile(arg)
                    if (!target.exists() || target.isDirectory) {
                        sendResponse(550, "File not found or is a directory.")
                        return
                    }

                    sendResponse(150, "Opening binary mode data connection for ${target.name} (${target.length()} bytes)")
                    val dataSocket = openDataSocket()
                    if (dataSocket == null) {
                        sendResponse(425, "Data connection failed")
                        return
                    }

                    try {
                        val inStream = FileInputStream(target)
                        val outStream = dataSocket.getOutputStream()
                        val buf = ByteArray(64 * 1024)
                        var read: Int = 0
                        while (inStream.read(buf).also { read = it } != -1) {
                            outStream.write(buf, 0, read)
                        }
                        outStream.flush()
                        inStream.close()
                        sendResponse(226, "Transfer complete.")
                    } catch (_: Exception) {
                        sendResponse(426, "Data transfer aborted.")
                    } finally {
                        try { dataSocket.close() } catch (_: Exception) {}
                    }
                }
                "STOR" -> {
                    val target = resolveTargetFile(arg)
                    sendResponse(150, "Opening binary mode data connection for upload")
                    val dataSocket = openDataSocket()
                    if (dataSocket == null) {
                        sendResponse(425, "Data connection failed")
                        return
                    }

                    try {
                        target.parentFile?.mkdirs()
                        val outStream = FileOutputStream(target)
                        val inStream = dataSocket.getInputStream()
                        val buf = ByteArray(64 * 1024)
                        var read: Int = 0
                        while (inStream.read(buf).also { read = it } != -1) {
                            outStream.write(buf, 0, read)
                        }
                        outStream.flush()
                        outStream.close()
                        sendResponse(226, "Transfer complete.")
                    } catch (_: Exception) {
                        sendResponse(426, "File upload failed.")
                    } finally {
                        try { dataSocket.close() } catch (_: Exception) {}
                    }
                }
                "DELE" -> {
                    val target = resolveTargetFile(arg)
                    if (target.exists() && !target.isDirectory && target.delete()) {
                        sendResponse(250, "Delete operation successful.")
                    } else {
                        sendResponse(550, "Cannot delete file.")
                    }
                }
                "MKD" -> {
                    val target = resolveTargetFile(arg)
                    if (target.mkdirs()) {
                        sendResponse(257, "\"${getRelativePath(target)}\" created.")
                    } else {
                        sendResponse(550, "Cannot create directory.")
                    }
                }
                "RMD" -> {
                    val target = resolveTargetFile(arg)
                    if (target.exists() && target.isDirectory && target.delete()) {
                        sendResponse(250, "Directory removed.")
                    } else {
                        sendResponse(550, "Cannot remove directory.")
                    }
                }
                "RNFR" -> {
                    val target = resolveTargetFile(arg)
                    if (target.exists()) {
                        renameFrom = target
                        sendResponse(350, "File exists, ready for destination name.")
                    } else {
                        sendResponse(550, "File not found.")
                    }
                }
                "RNTO" -> {
                    val src = renameFrom
                    if (src != null && src.exists()) {
                        val dest = resolveTargetFile(arg)
                        if (src.renameTo(dest)) {
                            sendResponse(250, "Rename successful.")
                        } else {
                            sendResponse(550, "Rename failed.")
                        }
                    } else {
                        sendResponse(503, "Bad sequence of commands (RNFR missing).")
                    }
                    renameFrom = null
                }
                "SIZE" -> {
                    val target = resolveTargetFile(arg)
                    if (target.exists() && !target.isDirectory) {
                        sendResponse(213, "${target.length()}")
                    } else {
                        sendResponse(550, "File not found.")
                    }
                }
                "MDTM" -> {
                    val target = resolveTargetFile(arg)
                    if (target.exists()) {
                        val sdf = SimpleDateFormat("yyyyMMddHHmmss", Locale.US)
                        sendResponse(213, sdf.format(target.lastModified()))
                    } else {
                        sendResponse(550, "File not found.")
                    }
                }
                "QUIT" -> sendResponse(221, "Goodbye from FileLens Pro FTP.")
                else -> sendResponse(502, "Command not implemented: $cmd")
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
            if (filePath.startsWith(rootPath)) {
                val rel = filePath.substring(rootPath.length)
                return if (rel.startsWith("/")) rel else "/$rel"
            }
            return filePath
        }
    }
}
