package expo.modules.pdftoimage

import android.content.Context
import android.net.Uri
import java.io.*
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder
import java.util.Locale
import java.util.concurrent.Executors
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class LanHttpServer(
    private val context: Context,
    private val defaultPort: Int = 8088
) {
    data class SharedFile(
        val id: String,
        val name: String,
        val uri: String,
        val size: Long,
        val mimeType: String
    )

    private var serverSocket: ServerSocket? = null
    @Volatile private var isRunning = false
    private val threadPool = Executors.newCachedThreadPool()
    private val sharedFiles = mutableListOf<SharedFile>()

    fun setFiles(files: List<SharedFile>) {
        synchronized(sharedFiles) {
            sharedFiles.clear()
            for (f in files) {
                val fObj = getFileFromUri(f.uri)
                if (fObj != null && fObj.exists() && fObj.isDirectory) {
                    addDirectoryFilesRecursively(fObj, f.name)
                } else {
                    sharedFiles.add(f)
                }
            }
        }
    }

    private fun getFileFromUri(uriString: String): File? {
        return try {
            when {
                uriString.startsWith("file://") -> {
                    val rawPath = Uri.parse(uriString).path ?: uriString.substring(7)
                    val decoded = Uri.decode(rawPath)
                    File(decoded).takeIf { it.exists() } ?: File(rawPath)
                }
                !uriString.startsWith("content://") -> {
                    val decoded = Uri.decode(uriString)
                    File(decoded).takeIf { it.exists() } ?: File(uriString)
                }
                else -> null
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun addDirectoryFilesRecursively(dir: File, prefix: String) {
        val children = dir.listFiles() ?: return
        for (child in children) {
            if (child.name.startsWith(".")) continue
            if (child.isDirectory) {
                addDirectoryFilesRecursively(child, "$prefix/${child.name}")
            } else if (child.isFile && child.length() > 0) {
                val ext = child.extension.lowercase(Locale.US)
                val mime = android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "*/*"
                val relName = "$prefix/${child.name}"
                sharedFiles.add(
                    SharedFile(
                        id = child.absolutePath.hashCode().toString(),
                        name = relName,
                        uri = child.absolutePath,
                        size = child.length(),
                        mimeType = mime
                    )
                )
            }
        }
    }


    @Synchronized
    fun start(): Int {
        if (isRunning && serverSocket != null && !serverSocket!!.isClosed) {
            return serverSocket!!.localPort
        }

        val ss = try {
            ServerSocket(defaultPort)
        } catch (_: Exception) {
            // Pick an available port automatically if defaultPort is busy
            ServerSocket(0)
        }

        serverSocket = ss
        isRunning = true
        val actualPort = ss.localPort

        threadPool.execute {
            while (isRunning && !ss.isClosed) {
                try {
                    val clientSocket = ss.accept()
                    threadPool.execute { handleClient(clientSocket) }
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
    }

    fun isServerRunning(): Boolean = isRunning && serverSocket != null && !serverSocket!!.isClosed
    fun getPort(): Int = serverSocket?.localPort ?: defaultPort
    fun getFileCount(): Int = synchronized(sharedFiles) { sharedFiles.size }

    private fun handleClient(socket: Socket) {
        try {
            socket.soTimeout = 15000
            val input = socket.getInputStream()
            val reader = BufferedReader(InputStreamReader(input, "UTF-8"))
            val requestLine = reader.readLine() ?: return
            val parts = requestLine.split(" ")
            if (parts.size < 2) return

            val method = parts[0].uppercase(Locale.US)
            val fullPath = parts[1]

            // Read remaining headers until empty line
            var hLine: String? = null
            while (reader.readLine().also { hLine = it } != null) {
                if (hLine.isNullOrBlank()) break
            }

            val path = if (fullPath.contains("?")) fullPath.substring(0, fullPath.indexOf("?")) else fullPath
            val query = if (fullPath.contains("?")) fullPath.substring(fullPath.indexOf("?") + 1) else ""

            val output = socket.getOutputStream()

            when {
                path == "/" || path == "/index.html" -> {
                    serveHtmlIndex(output)
                }
                path == "/download" || path == "/view" -> {
                    val fileId = extractQueryParam(query, "id")
                    val isView = path == "/view"
                    serveFile(output, fileId, isView)
                }
                path == "/download-zip" -> {
                    serveZip(output)
                }
                else -> {
                    val notFound = "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nContent-Length: 9\r\n\r\nNot Found"
                    output.write(notFound.toByteArray(Charsets.UTF_8))
                    output.flush()
                }
            }
        } catch (_: Exception) {
            // Client disconnect or socket error ignored safely
        } finally {
            try { socket.close() } catch (_: Exception) {}
        }
    }

    private fun extractQueryParam(query: String, key: String): String? {
        if (query.isBlank()) return null
        val pairs = query.split("&")
        for (pair in pairs) {
            val kv = pair.split("=")
            if (kv.size == 2 && kv[0] == key) {
                return try { URLDecoder.decode(kv[1], "UTF-8") } catch (_: Exception) { kv[1] }
            }
        }
        return null
    }

    private fun formatSize(bytes: Long): String {
        if (bytes <= 0) return "0 B"
        val units = arrayOf("B", "KB", "MB", "GB")
        val digitGroups = (Math.log10(bytes.toDouble()) / Math.log10(1024.0)).toInt()
        val clampedGroup = Math.min(units.size - 1, digitGroups)
        return String.format(Locale.US, "%.1f %s", bytes / Math.pow(1024.0, clampedGroup.toDouble()), units[clampedGroup])
    }

    private fun serveHtmlIndex(output: OutputStream) {
        val filesSnapshot = synchronized(sharedFiles) { sharedFiles.toList() }
        val totalBytes = filesSnapshot.sumOf { it.size }

        val rowsHtml = StringBuilder()
        if (filesSnapshot.isEmpty()) {
            rowsHtml.append("""
                <tr>
                    <td colspan="4" style="text-align:center; padding: 32px; color: #94A3B8;">
                        No files currently selected for sharing. Select files in FileLens Pro on your phone.
                    </td>
                </tr>
            """.trimIndent())
        } else {
            for (f in filesSnapshot) {
                val icon = when {
                    f.mimeType.startsWith("image/") -> "🖼️"
                    f.mimeType == "application/pdf" -> "📄"
                    f.mimeType.startsWith("video/") -> "🎬"
                    f.mimeType.startsWith("audio/") -> "🎵"
                    else -> "📁"
                }
                val canPreview = f.mimeType.startsWith("image/") || f.mimeType == "application/pdf"

                rowsHtml.append("""
                    <tr>
                        <td style="font-weight: 600; color: #F1F5F9; word-break: break-all;">
                            <span style="margin-right: 8px;">$icon</span>${escapeHtml(f.name)}
                        </td>
                        <td style="color: #94A3B8; white-space: nowrap;">${formatSize(f.size)}</td>
                        <td style="color: #64748B; font-size: 12px;">${escapeHtml(f.mimeType)}</td>
                        <td style="text-align: right; white-space: nowrap;">
                            ${if (canPreview) """<a class="btn btn-secondary" href="/view?id=${f.id}" target="_blank">View</a>""" else ""}
                            <a class="btn btn-primary" href="/download?id=${f.id}" download="${escapeHtml(f.name)}">Download</a>
                        </td>
                    </tr>
                """.trimIndent())
            }
        }

        val html = """
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>FileLens Pro · WiFi & LAN Share</title>
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
                    body { background: #0F172A; color: #E2E8F0; min-height: 100vh; padding: 24px 16px; }
                    .container { max-width: 860px; margin: 0 auto; }
                    .header { background: linear-gradient(135deg, #1E293B 0%, #0F172A 100%); border: 1px solid #334155; border-radius: 16px; padding: 24px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; }
                    .brand { display: flex; align-items: center; gap: 12px; }
                    .brand-icon { width: 44px; height: 44px; background: #6366F1; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px; }
                    .title { font-size: 20px; font-weight: 700; color: #FFFFFF; }
                    .sub { font-size: 13px; color: #94A3B8; margin-top: 2px; }
                    .badge-active { background: #10B98120; border: 1px solid #10B98150; color: #10B981; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }
                    .badge-active::before { content: ""; width: 8px; height: 8px; background: #10B981; border-radius: 50%; }
                    .card { background: #1E293B; border: 1px solid #334155; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
                    .toolbar { padding: 16px 20px; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; background: #1E293B; flex-wrap: wrap; gap: 12px; }
                    .summary { font-size: 14px; color: #94A3B8; }
                    .summary strong { color: #F8FAFC; }
                    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 14px; }
                    th { padding: 12px 20px; background: #182234; color: #94A3B8; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #334155; }
                    td { padding: 14px 20px; border-bottom: 1px solid #283548; vertical-align: middle; }
                    tr:hover { background: #253347; }
                    .btn { display: inline-flex; align-items: center; justify-content: center; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; text-decoration: none; transition: all 0.15s; }
                    .btn-primary { background: #6366F1; color: #FFFFFF; }
                    .btn-primary:hover { background: #4F46E5; }
                    .btn-secondary { background: #334155; color: #E2E8F0; margin-right: 8px; }
                    .btn-secondary:hover { background: #475569; }
                    .btn-zip { background: #10B981; color: #FFFFFF; padding: 10px 20px; font-size: 14px; }
                    .btn-zip:hover { background: #059669; }
                    .footer { text-align: center; margin-top: 24px; color: #64748B; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="brand">
                            <div class="brand-icon">⚡</div>
                            <div>
                                <div class="title">FileLens Pro · WiFi Share</div>
                                <div class="sub">100% Offline Local Network Transfer · High Speed</div>
                            </div>
                        </div>
                        <div class="badge-active">Online & Connected</div>
                    </div>

                    <div class="card">
                        <div class="toolbar">
                            <div class="summary">
                                Sharing <strong>${filesSnapshot.size}</strong> file(s) · Total size: <strong>${formatSize(totalBytes)}</strong>
                            </div>
                            ${if (filesSnapshot.isNotEmpty()) """<a class="btn btn-zip" href="/download-zip">📦 Download All (ZIP)</a>""" else ""}
                        </div>

                        <table>
                            <thead>
                                <tr>
                                    <th>File Name</th>
                                    <th>Size</th>
                                    <th>Type</th>
                                    <th style="text-align: right;">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                $rowsHtml
                            </tbody>
                        </table>
                    </div>

                    <div class="footer">
                        Shared from FileLens Pro via Local WiFi / LAN · No cloud · No data consumed
                    </div>
                </div>
            </body>
            </html>
        """.trimIndent()

        val bytes = html.toByteArray(Charsets.UTF_8)
        val header = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n"
        output.write(header.toByteArray(Charsets.UTF_8))
        output.write(bytes)
        output.flush()
    }

    private fun escapeHtml(text: String): String {
        return text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;")
            .replace("'", "&#39;")
    }

    private fun serveFile(output: OutputStream, fileId: String?, isView: Boolean) {
        val target = synchronized(sharedFiles) {
            sharedFiles.find { it.id == fileId }
        }

        if (target == null) {
            val notFound = "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nContent-Length: 14\r\n\r\nFile not found"
            output.write(notFound.toByteArray(Charsets.UTF_8))
            output.flush()
            return
        }

        val inStream = openFileInputStream(target.uri)
        if (inStream == null) {
            val err = "HTTP/1.1 500 Internal Error\r\nContent-Type: text/plain\r\nContent-Length: 20\r\n\r\nCannot read file stream"
            output.write(err.toByteArray(Charsets.UTF_8))
            output.flush()
            return
        }

        try {
            val disposition = if (isView) "inline" else "attachment"
            val safeName = target.name.replace("\"", "\\\"")
            val mime = if (target.mimeType.isNotBlank() && target.mimeType != "*/*") target.mimeType else "application/octet-stream"

            val header = StringBuilder()
            header.append("HTTP/1.1 200 OK\r\n")
            header.append("Content-Type: $mime\r\n")
            if (target.size > 0) {
                header.append("Content-Length: ${target.size}\r\n")
            }
            header.append("Content-Disposition: $disposition; filename=\"$safeName\"\r\n")
            header.append("Accept-Ranges: bytes\r\n")
            header.append("Connection: close\r\n\r\n")

            output.write(header.toString().toByteArray(Charsets.UTF_8))

            val buffer = ByteArray(64 * 1024)
            var bytesRead: Int = 0
            while (inStream.read(buffer).also { bytesRead = it } != -1) {
                output.write(buffer, 0, bytesRead)
            }
            output.flush()
        } finally {
            try { inStream.close() } catch (_: Exception) {}
        }
    }

    private fun serveZip(output: OutputStream) {
        val filesSnapshot = synchronized(sharedFiles) { sharedFiles.toList() }

        val zipName = "FileLens_Share_${System.currentTimeMillis()}.zip"
        val header = "HTTP/1.1 200 OK\r\n" +
                "Content-Type: application/zip\r\n" +
                "Content-Disposition: attachment; filename=\"$zipName\"\r\n" +
                "Connection: close\r\n\r\n"

        output.write(header.toByteArray(Charsets.UTF_8))

        val zipOut = ZipOutputStream(BufferedOutputStream(output))
        val buffer = ByteArray(64 * 1024)

        for (f in filesSnapshot) {
            val inStream = openFileInputStream(f.uri) ?: continue
            try {
                val entry = ZipEntry(f.name)
                zipOut.putNextEntry(entry)
                var bytesRead: Int = 0
                while (inStream.read(buffer).also { bytesRead = it } != -1) {
                    zipOut.write(buffer, 0, bytesRead)
                }
                zipOut.closeEntry()
            } catch (_: Exception) {
                // Skip problematic entry safely
            } finally {
                try { inStream.close() } catch (_: Exception) {}
            }
        }

        zipOut.finish()
        zipOut.flush()
    }

    private fun openFileInputStream(uriString: String): InputStream? {
        return try {
            when {
                uriString.startsWith("content://") -> {
                    context.contentResolver.openInputStream(Uri.parse(uriString))
                }
                uriString.startsWith("file://") -> {
                    val rawPath = Uri.parse(uriString).path ?: uriString.substring(7)
                    val decoded = Uri.decode(rawPath)
                    val f = File(decoded).takeIf { it.exists() } ?: File(rawPath)
                    FileInputStream(f)
                }
                else -> {
                    val decoded = Uri.decode(uriString)
                    val f = File(decoded).takeIf { it.exists() } ?: File(uriString)
                    FileInputStream(f)
                }
            }
        } catch (_: Exception) {
            null
        }
    }
}
