/**
 * discovery.js — khám phá thiết bị cùng LAN kiểu "Open to LAN" (Minecraft/AirDrop).
 *
 * Mỗi app vừa PHÁT (broadcast UDP) sự hiện diện của mình mỗi ~1.5s, vừa NGHE gói
 * của máy khác. Không cần server trung tâm, không cần gõ IP: mở app là tự thấy
 * nhau. Node có sẵn `dgram` nên không cần native module (ưu điểm của desktop).
 *
 * Gói tin: JSON { t:'opennezt', id, name, ip, ws }. Peer nào không nghe thấy quá
 * TTL_MS thì bị loại khỏi danh sách.
 */
const dgram = require('dgram');
const os = require('os');

const PORT = 45678; // cổng UDP dùng cho quảng bá
const BROADCAST = '255.255.255.255';
const ANNOUNCE_MS = 1500; // nhịp phát
const TTL_MS = 5000; // quá lâu không nghe thấy → coi như offline

// Tên card mạng ẢO cần tránh (VMware/VirtualBox/Hyper-V/WSL/Docker/Bluetooth…).
// Broadcast qua các card này thường KHÔNG tới WiFi/LAN thật.
const _VIRTUAL_RE = /(vethernet|vmware|virtualbox|vbox|hyper-v|loopback|bluetooth|wsl|docker|tailscale|zerotier|tap|tun)/i;
const _PRIVATE_RE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/** Địa chỉ broadcast của subnet từ IP + netmask (vd 192.168.1.10/255.255.255.0 → 192.168.1.255). */
function _broadcastOf(address, netmask) {
  try {
    const a = address.split('.').map(Number);
    const m = netmask.split('.').map(Number);
    if (a.length !== 4 || m.length !== 4) return null;
    return a.map((oct, i) => (oct & m[i]) | (~m[i] & 0xff)).join('.');
  } catch {
    return null;
  }
}

/** Liệt kê IPv4 LAN ứng viên {address, broadcast}, ưu tiên card vật lý (bỏ card ảo). */
function _candidates() {
  const ifaces = os.networkInterfaces();
  const physical = [];
  const virtual = [];
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name] || []) {
      if (net.family !== 'IPv4' || net.internal || !_PRIVATE_RE.test(net.address)) continue;
      const entry = { address: net.address, broadcast: _broadcastOf(net.address, net.netmask) };
      (_VIRTUAL_RE.test(name) ? virtual : physical).push(entry);
    }
  }
  return physical.length ? physical : virtual; // ưu tiên vật lý; chỉ dùng ảo khi không còn gì
}

/** Tìm IPv4 LAN của máy — ưu tiên card vật lý (WiFi/Ethernet), tránh card ảo. */
function lanIPv4() {
  const cands = _candidates();
  return cands[0] ? cands[0].address : '127.0.0.1';
}

/** Các địa chỉ broadcast nên phát tới (directed broadcast từng subnet + global fallback). */
function _broadcastTargets() {
  const targets = new Set([BROADCAST]);
  for (const c of _candidates()) {
    if (c.broadcast) targets.add(c.broadcast);
  }
  return Array.from(targets);
}

class Discovery {
  constructor({ id, name, wsPort = 8000, onChange } = {}) {
    this.id = id;
    this.name = name;
    this.wsPort = wsPort;
    this.onChange = onChange || (() => {});
    this.ip = lanIPv4();
    this.peers = new Map(); // id -> { id, name, ip, ws, lastSeen }
    this.sock = null;
    this._announceTimer = null;
    this._pruneTimer = null;
  }

  /** Thông tin của chính máy này. */
  self() {
    return {
      id: this.id,
      name: this.name,
      ip: this.ip,
      ws: `ws://${this.ip}:${this.wsPort}/ws`,
    };
  }

  start() {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.sock = sock;
    sock.on('message', (buf, rinfo) => this._onMessage(buf, rinfo));
    sock.on('error', (err) => console.error('[discovery] socket error:', err.message));
    sock.bind(PORT, () => {
      try {
        sock.setBroadcast(true);
      } catch (err) {
        console.error('[discovery] setBroadcast failed:', err.message);
      }
      this._announce();
      this._announceTimer = setInterval(() => this._announce(), ANNOUNCE_MS);
      this._pruneTimer = setInterval(() => this._prune(), 1000);
      console.log(
        `[discovery] started on ${this.ip}:${PORT} as "${this.name}" (${this.id}); ` +
          `broadcast targets = ${_broadcastTargets().join(', ')}`,
      );
    });
  }

  _announce() {
    if (!this.sock) return;
    this.ip = lanIPv4(); // IP có thể đổi khi chuyển mạng
    const msg = Buffer.from(JSON.stringify({ t: 'opennezt', ...this.self() }));
    // Phát tới broadcast của từng subnet vật lý (+ 255.255.255.255) để không bị
    // egress sai card khi máy có nhiều interface.
    for (const target of _broadcastTargets()) {
      this.sock.send(msg, PORT, target, (err) => {
        if (err) console.error(`[discovery] send error -> ${target}:`, err.message);
      });
    }
  }

  _onMessage(buf, rinfo) {
    let d;
    try {
      d = JSON.parse(buf.toString());
    } catch {
      return;
    }
    if (!d || d.t !== 'opennezt' || !d.id) return;
    if (d.id === this.id) return; // bỏ qua chính mình
    const ip = d.ip || rinfo.address;
    const prev = this.peers.get(d.id);
    this.peers.set(d.id, {
      id: d.id,
      name: d.name || 'Thiết bị',
      ip,
      ws: d.ws || `ws://${ip}:${this.wsPort}/ws`,
      lastSeen: Date.now(),
    });
    if (!prev) this.onChange(this.list()); // chỉ báo khi có thiết bị MỚI
  }

  _prune() {
    const now = Date.now();
    let changed = false;
    for (const [id, p] of this.peers) {
      if (now - p.lastSeen > TTL_MS) {
        this.peers.delete(id);
        changed = true;
      }
    }
    if (changed) this.onChange(this.list());
  }

  /** Danh sách peer (bỏ trường nội bộ lastSeen). */
  list() {
    return Array.from(this.peers.values()).map(({ lastSeen, ...p }) => p);
  }

  setName(name) {
    this.name = String(name || '').trim() || this.name;
  }

  stop() {
    if (this._announceTimer) clearInterval(this._announceTimer);
    if (this._pruneTimer) clearInterval(this._pruneTimer);
    if (this.sock) {
      try {
        this.sock.close();
      } catch {
        /* noop */
      }
    }
    this.sock = null;
  }
}

module.exports = { Discovery, lanIPv4 };
