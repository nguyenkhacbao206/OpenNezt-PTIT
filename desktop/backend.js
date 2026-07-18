/**
 * backend.js — bật backend nhúng (uvicorn) và chờ nó sẵn sàng.
 *
 *   - DEV  : spawn `python -m uvicorn app.main:app` từ thư mục ../backend.
 *   - PROD : spawn exe PyInstaller đóng gói trong resources/backend/.
 *
 * Backend chạy offline (STT Whisper + NMT NLLB + TTS Piper), nên desktop app
 * không phụ thuộc internet khi model đã tải sẵn.
 */
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

/** Spawn tiến trình backend, trả về ChildProcess. */
function startBackend({ port = 8000, isDev = false } = {}) {
  let child;
  if (isDev) {
    const backendDir = path.join(__dirname, '..', 'backend');
    const py = process.platform === 'win32' ? 'python' : 'python3';
    console.log('[backend] DEV spawn uvicorn tại', backendDir);
    child = spawn(
      py,
      ['-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', String(port)],
      { cwd: backendDir, env: { ...process.env } },
    );
  } else {
    const exeName = process.platform === 'win32' ? 'opennezt-backend.exe' : 'opennezt-backend';
    const exe = path.join(process.resourcesPath, 'backend', exeName);
    if (fs.existsSync(exe)) {
      // Ưu tiên exe PyInstaller đóng gói kèm (tự chứa, không cần Python).
      console.log('[backend] PROD spawn exe', exe);
      child = spawn(exe, ['--host', '0.0.0.0', '--port', String(port)], { env: { ...process.env } });
    } else {
      // Fallback: chưa đóng gói exe → chạy bằng Python (máy phải có Python + deps).
      // Backend source có thể nằm ở resources/backend-src hoặc trỏ qua env.
      const backendDir =
        process.env.OPENNEZT_BACKEND_DIR || path.join(process.resourcesPath, 'backend-src');
      const py = process.platform === 'win32' ? 'python' : 'python3';
      console.log('[backend] PROD fallback: python -m uvicorn tại', backendDir);
      child = spawn(
        py,
        ['-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', String(port)],
        { cwd: backendDir, env: { ...process.env } },
      );
    }
  }
  child.stdout.on('data', (d) => console.log('[backend]', String(d).trimEnd()));
  child.stderr.on('data', (d) => console.error('[backend]', String(d).trimEnd()));
  child.on('exit', (code) => console.log('[backend] thoát, code =', code));
  child.on('error', (err) => console.error('[backend] lỗi spawn:', err.message));
  return child;
}

/** Poll http://127.0.0.1:port/ tới khi trả 200 (backend health JSON) hoặc hết giờ. */
function waitBackendReady(port, timeoutMs = 40000) {
  const start = Date.now();
  const ping = () =>
    new Promise((resolve) => {
      const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1000 }, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  return new Promise((resolve) => {
    const tick = async () => {
      if (await ping()) return resolve(true);
      if (Date.now() - start > timeoutMs) return resolve(false);
      setTimeout(tick, 500);
    };
    tick();
  });
}

module.exports = { startBackend, waitBackendReady };
