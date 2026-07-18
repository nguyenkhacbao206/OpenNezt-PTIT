/**
 * main.js — tiến trình chính Electron.
 *
 * Vòng đời:
 *   1. Bật backend nhúng (uvicorn/exe) và chờ health OK.
 *   2. Bật discovery UDP (phát + nghe) → đẩy danh sách thiết bị cùng mạng sang UI.
 *   3. Mở cửa sổ, nạp UI (Expo Web export, hoặc DESKTOP_DEV_URL khi dev).
 *   4. Dọn dẹp (tắt backend + discovery) khi thoát.
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');

const { Discovery } = require('./discovery');
const { startBackend, waitBackendReady } = require('./backend');

const WS_PORT = 8000;
const isDev = !!process.env.DESKTOP_DEV;

let win = null;
let backend = null;
let discovery = null;
let uiServer = null;
let logStream = null;

/**
 * Ghi mọi log (console + stdout/stderr của backend) ra file để chẩn đoán bản
 * đóng gói — app GUI không gắn terminal nên console.log biến mất.
 * File: %APPDATA%/OpenNezt/opennezt.log (Windows), ~/Library/... (mac).
 */
function setupLogging() {
  try {
    const logPath = path.join(app.getPath('userData'), 'opennezt.log');
    logStream = fs.createWriteStream(logPath, { flags: 'a' });
    const stamp = () => new Date().toISOString();
    const tee = (orig) => (...args) => {
      try {
        logStream.write(`[${stamp()}] ${args.join(' ')}\n`);
      } catch {
        /* noop */
      }
      orig(...args);
    };
    console.log = tee(console.log.bind(console));
    console.error = tee(console.error.bind(console));
    console.warn = tee(console.warn.bind(console));
    console.log('[main] === OpenNezt khởi động ===', 'log file =', logPath);
  } catch (e) {
    /* logging là phụ, không được làm sập app */
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

/**
 * Phục vụ web-dist (Expo Web export) qua HTTP nội bộ trên 127.0.0.1.
 * Cần thiết vì Expo dùng đường dẫn tuyệt đối (/_expo/...) — không chạy được qua file://.
 * Trả về Promise<string> là URL gốc (vd http://127.0.0.1:12345).
 */
function startUiServer() {
  const root = path.join(__dirname, 'web-dist');
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
        let filePath = path.join(root, path.normalize(urlPath));
        // Chặn path traversal ra ngoài web-dist
        if (!filePath.startsWith(root)) {
          res.writeHead(403);
          return res.end('Forbidden');
        }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          // SPA fallback → index.html
          filePath = path.join(root, 'index.html');
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      } catch (e) {
        res.writeHead(500);
        res.end('Server error');
      }
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      uiServer = server;
      const { port } = server.address();
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 380,
    backgroundColor: '#0b0f14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.DESKTOP_DEV_URL;
  if (devUrl) {
    win.loadURL(devUrl); // ví dụ http://localhost:8081 (expo start --web)
  } else {
    const baseUrl = await startUiServer();
    win.loadURL(baseUrl);
  }
  if (isDev) win.webContents.openDevTools({ mode: 'detach' });

  // Ghi log nếu renderer nạp lỗi để dễ chẩn đoán màn hình đen
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[main] did-fail-load', code, desc, url);
  });

  win.on('closed', () => {
    win = null;
  });
}

function cleanup() {
  if (discovery) {
    discovery.stop();
    discovery = null;
  }
  if (backend) {
    try {
      backend.kill();
    } catch {
      /* noop */
    }
    backend = null;
  }
  if (uiServer) {
    try {
      uiServer.close();
    } catch {
      /* noop */
    }
    uiServer = null;
  }
}

app.whenReady().then(async () => {
  setupLogging();

  // 1) Backend nhúng
  backend = startBackend({ port: WS_PORT, isDev });
  const ready = await waitBackendReady(WS_PORT);
  console.log('[main] backend ready =', ready);

  // 2) Discovery LAN (đối xứng: vừa phát vừa nghe)
  const id = crypto.randomBytes(4).toString('hex');
  const defaultName = os.hostname() || 'Thiết bị';
  discovery = new Discovery({
    id,
    name: defaultName,
    wsPort: WS_PORT,
    onChange: (list) => {
      if (win && !win.isDestroyed()) win.webContents.send('desktop:devices', list);
    },
  });
  discovery.start();

  // 3) IPC cho renderer
  ipcMain.handle('desktop:self', () => discovery.self());
  ipcMain.handle('desktop:devices', () => discovery.list());
  ipcMain.handle('desktop:setName', (_e, name) => {
    discovery.setName(name);
    return discovery.self();
  });

  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  cleanup();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', cleanup);
