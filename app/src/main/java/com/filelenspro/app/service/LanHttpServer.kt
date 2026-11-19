package com.filelenspro.app.service

import android.content.Context
import android.net.Uri
import android.net.wifi.WifiManager
import android.webkit.MimeTypeMap
import java.io.BufferedOutputStream
import java.io.BufferedReader
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.io.InputStreamReader
import java.io.OutputStream
import java.net.Inet4Address
import java.net.NetworkInterface
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
                val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "*/*"
                sharedFiles.add(
                    SharedFile(
                        id = child.absolutePath.hashCode().toString(),
                        name = "$prefix/${child.name}",
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
    }

    fun isServerRunning(): Boolean = isRunning && serverSocket != null && !serverSocket!!.isClosed
    fun getPort(): Int = serverSocket?.localPort ?: defaultPort

    private fun handleClient(socket: Socket) {
        try {
            socket.soTimeout = 15000
            val reader = BufferedReader(InputStreamReader(socket.getInputStream(), "UTF-8"))
            val requestLine = reader.readLine() ?: return
            val parts = requestLine.split(" ")
            if (parts.size < 2) return
            val fullPath = parts[1]
            var hLine: String?
            while (reader.readLine().also { hLine = it } != null) {
                if (hLine.isNullOrBlank()) break
            }
            val path = fullPath.substringBefore("?")
            val query = fullPath.substringAfter("?", "")
            val output = socket.getOutputStream()

            when (path) {
                "/", "/index.html" -> serveHtmlIndex(output)
                "/download", "/view" -> serveFile(output, extractQueryParam(query, "id"), path == "/view")
                "/download-zip" -> serveZip(output)
                else -> {
                    val notFound = "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nContent-Length: 9\r\n\r\nNot Found"
                    output.write(notFound.toByteArray(Charsets.UTF_8))
                    output.flush()
                }
            }
        } catch (_: Exception) {
        } finally {
            try { socket.close() } catch (_: Exception) {}
        }
    }

    private fun extractQueryParam(query: String, key: String): String? {
        if (query.isBlank()) return null
        for (pair in query.split("&")) {
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
        val digitGroups = (Math.log10(bytes.toDouble()) / Math.log10(1024.0)).toInt().coerceAtMost(3)
        return String.format(Locale.US, "%.1f %s", bytes / Math.pow(1024.0, digitGroups.toDouble()), units[digitGroups])
    }

    private fun serveHtmlIndex(output: OutputStream) {
        val filesSnapshot = synchronized(sharedFiles) { sharedFiles.toList() }
        val totalBytes = filesSnapshot.sumOf { it.size }
        val rowsHtml = StringBuilder()
        if (filesSnapshot.isEmpty()) {
            rowsHtml.append("<tr><td colspan=\"4\" style=\"text-align:center;padding:32px;color:#94A3B8;\">No files selected for sharing.</td></tr>")
        } else {
            for (f in filesSnapshot) {
                val canPreview = f.mimeType.startsWith("image/") || f.mimeType == "application/pdf"
                rowsHtml.append(
                    """
                    <tr>
                        <td style="font-weight:600;color:#F1F5F9;word-break:break-all;">${escapeHtml(f.name)}</td>
                        <td style="color:#94A3B8;white-space:nowrap;">${formatSize(f.size)}</td>
                        <td style="color:#64748B;font-size:12px;">${escapeHtml(f.mimeType)}</td>
                        <td style="text-align:right;white-space:nowrap;">
                            ${if (canPreview) """<a class="btn btn-secondary" href="/view?id=${f.id}" target="_blank">View</a>""" else ""}
                            <a class="btn btn-primary" href="/download?id=${f.id}" download="${escapeHtml(f.name)}">Download</a>
                        </td>
                    </tr>
                    """.trimIndent()
                )
            }
        }

        val html = """
            <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
            <title>FileSearchPro · WiFi Share</title>
            <style>
            body{background:#0D0F12;color:#E2E8F0;font-family:sans-serif;padding:24px;}
            .container{max-width:860px;margin:0 auto;}
            .header{background:#16191E;border:1px solid #2A303C;border-radius:16px;padding:20px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;}
            .card{background:#16191E;border:1px solid #2A303C;border-radius:16px;overflow:hidden;}
            .toolbar{padding:16px 20px;border-bottom:1px solid #2A303C;display:flex;justify-content:space-between;align-items:center;}
            table{width:100%;border-collapse:collapse;text-align:left;font-size:14px;}
            th,td{padding:12px 16px;border-bottom:1px solid #222730;}
            .btn{padding:8px 14px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;}
            .btn-primary{background:#2563EB;color:#fff;}
            .btn-secondary{background:#222730;color:#E2E8F0;margin-right:8px;}
            .btn-zip{background:#10B981;color:#fff;}
            </style></head><body><div class="container">
            <div class="header"><div><h2>FileSearchPro · PC Explorer</h2><p style="color:#94A3B8;font-size:13px;">100% Offline Local Wi-Fi Transfer</p></div>
            <span style="color:#10B981;font-weight:700;">Online</span></div>
            <div class="card"><div class="toolbar"><span>Sharing <strong>${filesSnapshot.size}</strong> file(s) (${formatSize(totalBytes)})</span>
            ${if (filesSnapshot.isNotEmpty()) """<a class="btn btn-zip" href="/download-zip">Download All (ZIP)</a>""" else ""}</div>
            <table><thead><tr><th>File</th><th>Size</th><th>Type</th><th style="text-align:right;">Action</th></tr></thead>
            <tbody>$rowsHtml</tbody></table></div></div></body></html>
        """.trimIndent()

        val bytes = html.toByteArray(Charsets.UTF_8)
        val header = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n"
        output.write(header.toByteArray(Charsets.UTF_8))
        output.write(bytes)
        output.flush()
    }

    private fun escapeHtml(text: String): String =
        text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")

    private fun serveFile(output: OutputStream, fileId: String?, isView: Boolean) {
        val target = synchronized(sharedFiles) { sharedFiles.find { it.id == fileId } }
        if (target == null) {
            output.write("HTTP/1.1 404 Not Found\r\nContent-Length: 9\r\n\r\nNot Found".toByteArray())
            output.flush()
            return
        }
        val inStream = openFileInputStream(target.uri) ?: return
        try {
            val disposition = if (isView) "inline" else "attachment"
            val mime = target.mimeType.takeIf { it.isNotBlank() && it != "*/*" } ?: "application/octet-stream"
            val header = buildString {
                append("HTTP/1.1 200 OK\r\n")
                append("Content-Type: $mime\r\n")
                if (target.size > 0) append("Content-Length: ${target.size}\r\n")
                append("Content-Disposition: $disposition; filename=\"${target.name.replace("\"", "\\\"")}\"\r\n")
                append("Connection: close\r\n\r\n")
            }
            output.write(header.toByteArray(Charsets.UTF_8))
            val buffer = ByteArray(64 * 1024)
            var read: Int
            while (inStream.read(buffer).also { read = it } != -1) {
                output.write(buffer, 0, read)
            }
            output.flush()
        } finally {
            try { inStream.close() } catch (_: Exception) {}
        }
    }

    private fun serveZip(output: OutputStream) {
        val filesSnapshot = synchronized(sharedFiles) { sharedFiles.toList() }
        val zipName = "FileLens_Share_${System.currentTimeMillis()}.zip"
        val header = "HTTP/1.1 200 OK\r\nContent-Type: application/zip\r\nContent-Disposition: attachment; filename=\"$zipName\"\r\nConnection: close\r\n\r\n"
        output.write(header.toByteArray(Charsets.UTF_8))
        val zipOut = ZipOutputStream(BufferedOutputStream(output))
        val buffer = ByteArray(64 * 1024)
        for (f in filesSnapshot) {
            val inStream = openFileInputStream(f.uri) ?: continue
            try {
                zipOut.putNextEntry(ZipEntry(f.name))
                var read: Int
                while (inStream.read(buffer).also { read = it } != -1) {
                    zipOut.write(buffer, 0, read)
                }
                zipOut.closeEntry()
            } catch (_: Exception) {
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
                uriString.startsWith("content://") -> context.contentResolver.openInputStream(Uri.parse(uriString))
                uriString.startsWith("file://") -> {
                    val rawPath = Uri.parse(uriString).path ?: uriString.substring(7)
                    val f = File(Uri.decode(rawPath)).takeIf { it.exists() } ?: File(rawPath)
                    FileInputStream(f)
                }
                else -> {
                    val f = File(Uri.decode(uriString)).takeIf { it.exists() } ?: File(uriString)
                    FileInputStream(f)
                }
            }
        } catch (_: Exception) {
            null
        }
    }

    companion object {
        fun getLocalWifiIp(context: Context): String? {
            try {
                val wm = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
                if (wm != null && wm.isWifiEnabled) {
                    @Suppress("DEPRECATION")
                    val ipInt = wm.connectionInfo?.ipAddress ?: 0
                    if (ipInt != 0) {
                        return String.format(
                            Locale.US,
                            "%d.%d.%d.%d",
                            ipInt and 0xff,
                            (ipInt shr 8) and 0xff,
                            (ipInt shr 16) and 0xff,
                            (ipInt shr 24) and 0xff
                        )
                    }
                }
            } catch (_: Exception) {}

            try {
                val interfaces = NetworkInterface.getNetworkInterfaces()
                while (interfaces.hasMoreElements()) {
                    val nif = interfaces.nextElement()
                    val addrs = nif.inetAddresses
                    while (addrs.hasMoreElements()) {
                        val addr = addrs.nextElement()
                        if (!addr.isLoopbackAddress && addr is Inet4Address) {
                            val host = addr.hostAddress
                            if (host != null && (host.startsWith("192.168.") || host.startsWith("10.") || host.startsWith("172."))) {
                                return host
                            }
                        }
                    }
                }
            } catch (_: Exception) {}
            return null
        }
    }
}
