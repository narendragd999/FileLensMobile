const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

let qrcode = null;
try {
  qrcode = require('qrcode-terminal');
} catch (e) {
  // Optional terminal QR code
}

const PORT = parseInt(process.argv[2] || '8080', 10);
const APK_PATH = path.join(__dirname, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');

function getAllIpv4Addresses() {
  const interfaces = os.networkInterfaces();
  const list = [];
  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        list.push({ name, address: iface.address });
      }
    }
  }

  // Sort so Wi-Fi / Wireless / Ethernet interfaces appear first
  list.sort((a, b) => {
    const isWifiA = /wi-?fi|wlan|wireless/i.test(a.name);
    const isWifiB = /wi-?fi|wlan|wireless/i.test(b.name);
    if (isWifiA && !isWifiB) return -1;
    if (!isWifiA && isWifiB) return 1;
    const isEthA = /ethernet/i.test(a.name);
    const isEthB = /ethernet/i.test(b.name);
    if (isEthA && !isEthB) return -1;
    if (!isEthA && isEthB) return 1;
    return 0;
  });

  return list;
}

const ipList = getAllIpv4Addresses();
const primaryIp = ipList.length > 0 ? ipList[0].address : '127.0.0.1';

function getApkFileInfo() {
  const candidates = [
    path.join('C:', 'FL', 'FileLensPro.apk'),
    APK_PATH,
    path.join(__dirname, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'FileLensPro.apk'),
    path.join('C:', 'FL', 'FileLensPro_Release.apk'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const stat = fs.statSync(p);
      const mtime = stat.mtime;
      const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);
      const timeStr = mtime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
      const dateStr = mtime.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      const fullDateTime = `${dateStr} at ${timeStr}`;
      return { path: p, size: stat.size, sizeMB, mtime, timeStr, dateStr, fullDateTime };
    }
  }
  return null;
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];
  const apkInfo = getApkFileInfo();
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url} from ${req.socket.remoteAddress}`);

  // Download endpoint - supports direct download and range requests
  if (urlPath === '/download' || urlPath === '/FileLensPro.apk' || urlPath === '/app-release.apk') {
    if (!apkInfo) {
      console.log(`❌ APK file not found at candidates`);
      res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      res.end('APK file not found on server.');
      return;
    }

    const totalSize = apkInfo.size;
    const range = req.headers.range;

    // Handle HTTP Range requests for Android Download Manager / Chrome resumable downloads
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (isNaN(start) || isNaN(end) || start > end || start >= totalSize) {
        res.writeHead(416, {
          'Content-Range': `bytes */${totalSize}`,
          'Content-Type': 'text/plain',
        });
        res.end('Requested Range Not Satisfiable');
        return;
      }

      const chunkSize = (end - start) + 1;
      console.log(`📦 Partial content: bytes ${start}-${end}/${totalSize} (${(chunkSize / (1024 * 1024)).toFixed(1)} MB)`);

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': 'attachment; filename="FileLensPro.apk"',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      });

      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      fs.createReadStream(apkInfo.path, { start, end }).pipe(res);
      return;
    }

    // Full download request
    console.log(`📦 Sending full APK (${apkInfo.sizeMB} MB | Released: ${apkInfo.fullDateTime}) to mobile...`);
    res.writeHead(200, {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Length': totalSize,
      'Content-Disposition': 'attachment; filename="FileLensPro.apk"',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Access-Control-Allow-Origin': '*',
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    fs.createReadStream(apkInfo.path).pipe(res);
    return;
  }

  // HTML page for instant 1-tap download
  const apkExists = !!apkInfo;
  const apkSizeMB = apkInfo ? apkInfo.sizeMB : '0';
  const releaseTime = apkInfo ? apkInfo.fullDateTime : 'Pending build';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Download FileLensPro APK</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0B0F19;
      color: #F8FAFC;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 16px;
    }
    .card {
      background: #151D30;
      padding: 32px 24px;
      border-radius: 24px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 15px 35px rgba(0,0,0,0.6);
      border: 1px solid #1E293B;
    }
    .icon-badge {
      width: 68px;
      height: 68px;
      border-radius: 20px;
      background: linear-gradient(135deg, #4F46E5, #06B6D4);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 36px;
      box-shadow: 0 8px 20px rgba(79, 70, 229, 0.4);
      margin-bottom: 12px;
    }
    h1 { font-size: 24px; margin: 8px 0; color: #FFFFFF; font-weight: 700; }
    p.subtitle { color: #94A3B8; font-size: 14px; line-height: 1.5; margin: 0 0 18px 0; }
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      background: linear-gradient(135deg, #4F46E5, #6366F1);
      color: white;
      text-decoration: none;
      padding: 18px 24px;
      font-size: 17px;
      font-weight: 700;
      border-radius: 14px;
      margin: 22px auto 0 auto;
      width: 100%;
      box-shadow: 0 6px 20px rgba(79, 70, 229, 0.45);
      transition: transform 0.12s ease;
    }
    .btn:active {
      transform: scale(0.97);
    }
    .badges-row {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      margin-top: 6px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #1E293B;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 13px;
      color: #CBD5E1;
      width: 100%;
      justify-content: center;
    }
    .badge-time {
      background: rgba(16, 185, 129, 0.12);
      color: #34D399;
      border: 1px solid rgba(16, 185, 129, 0.25);
      font-weight: 600;
    }
    .tip {
      background: #0B0F19;
      border: 1px solid #1E293B;
      border-radius: 12px;
      padding: 14px;
      margin-top: 20px;
      font-size: 12.5px;
      color: #94A3B8;
      text-align: left;
      line-height: 1.5;
    }
    .tip b { color: #F1F5F9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-badge">📁</div>
    <h1>FileLens Pro</h1>
    <p class="subtitle">High-Speed LAN APK Installer</p>
    <div class="badges-row">
      <div class="badge">📦 Package Size: <b>${apkSizeMB} MB</b></div>
      <div class="badge badge-time">🕒 Build Date: ${releaseTime}</div>
    </div>
    
    <a href="/FileLensPro.apk?t=${Date.now()}" download="FileLensPro.apk" class="btn">
      <span>📥</span> Download FileLensPro.apk
    </a>

    <div class="tip">
      💡 <b>Installation Tips for Android:</b><br>
      • If Chrome shows <i>"File might be harmful"</i>, tap <b>"Download anyway"</b>.<br>
      • Once downloaded, tap <b>"Open"</b> to install or update the app.<br>
      • If updating from an earlier build, settings and data will remain intact.
    </div>
  </div>
</body>
</html>`;

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(html);
});

const initialInfo = getApkFileInfo();
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🚀 FileLens Pro APK LAN Server Started on Port ${PORT}`);
  console.log(`======================================================`);
  console.log(`📱 Connect your phone to the same Wi-Fi network and open:\n`);

  ipList.forEach((ip, idx) => {
    const isPrimary = idx === 0;
    console.log(`   ${isPrimary ? '👉 [PRIMARY]' : '   [ALT]    '} http://${ip.address}:${PORT} (${ip.name})`);
  });

  const downloadUrl = `http://${primaryIp}:${PORT}`;
  console.log(`\n📲 Direct Download URL: ${downloadUrl}/download`);

  if (qrcode) {
    console.log(`\n📸 Scan this QR Code with your mobile camera to open & download:\n`);
    qrcode.generate(downloadUrl, { small: true }, (qr) => {
      console.log(qr);
    });
  }

  console.log(`📦 Loaded APK: ${initialInfo ? `${initialInfo.path} (${initialInfo.sizeMB} MB | ${initialInfo.fullDateTime})` : '⚠️ No APK found yet'}\n`);
});
