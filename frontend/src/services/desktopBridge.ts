/**
 * desktopBridge — truy cập `window.desktop` do Electron preload cấp.
 *
 * Khi app chạy trong vỏ Electron (desktop), preload expose `window.desktop` để
 * đọc DANH SÁCH THIẾT BỊ CÙNG MẠNG (discovery UDP kiểu Open-to-LAN) và thông tin
 * máy mình. Khi chạy web/mobile thường thì không có → các hàm trả rỗng/no-op và
 * UI fallback về nhập WS URL tay.
 *
 * Service này KHÔNG biết gì về store/UI (đúng tầng services).
 */

/** Một thiết bị OpenNezt khác đang mở trong cùng LAN. */
export interface DesktopDevice {
  id: string;
  name: string;
  ip: string;
  /** WS URL tới backend nhúng của thiết bị đó, vd ws://10.61.36.214:8000/ws */
  ws: string;
}

/** Thông tin của chính máy này. */
export interface DesktopSelf {
  id: string;
  name: string;
  ip: string;
  ws: string;
}

interface DesktopAPI {
  isDesktop: boolean;
  getSelf: () => Promise<DesktopSelf>;
  onDevices: (cb: (list: DesktopDevice[]) => void) => () => void;
  setName: (name: string) => Promise<DesktopSelf>;
}

function api(): DesktopAPI | null {
  const g = globalThis as unknown as { desktop?: DesktopAPI };
  return g.desktop && g.desktop.isDesktop ? g.desktop : null;
}

/** true nếu đang chạy trong vỏ Electron desktop (có discovery LAN). */
export function isDesktop(): boolean {
  return api() !== null;
}

/** Thông tin máy mình (id/tên/ip/ws), hoặc null nếu không phải desktop. */
export async function getSelf(): Promise<DesktopSelf | null> {
  const a = api();
  return a ? a.getSelf() : null;
}

/**
 * Đăng ký nhận danh sách thiết bị cùng mạng (gọi ngay + mỗi khi thay đổi).
 * Trả về hàm huỷ đăng ký. No-op khi không phải desktop.
 */
export function onDevices(cb: (list: DesktopDevice[]) => void): () => void {
  const a = api();
  if (!a) return () => undefined;
  return a.onDevices(cb);
}

/** Đổi tên hiển thị của máy mình trong mạng. No-op khi không phải desktop. */
export async function setDesktopName(name: string): Promise<void> {
  const a = api();
  if (a) await a.setName(name);
}
