/**
 * preload.js — cầu nối an toàn giữa main (Node) và renderer (UI web).
 *
 * Expose `window.desktop` cho app RN-web dùng:
 *   - getSelf()      : thông tin máy mình { id, name, ip, ws }
 *   - onDevices(cb)  : nhận danh sách thiết bị cùng mạng (gọi ngay + mỗi khi đổi);
 *                      trả về hàm huỷ đăng ký.
 *   - setName(name)  : đổi tên hiển thị của mình trong mạng.
 *
 * Có `window.desktop` = đang chạy trong Electron → app bật màn "thiết bị cùng
 * mạng"; không có → app chạy như web thường (nhập WS URL tay).
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  getSelf: () => ipcRenderer.invoke('desktop:self'),
  onDevices: (cb) => {
    const handler = (_event, list) => cb(list);
    ipcRenderer.on('desktop:devices', handler);
    // đẩy snapshot hiện tại ngay khi đăng ký
    ipcRenderer.invoke('desktop:devices').then((list) => cb(list || []));
    return () => ipcRenderer.removeListener('desktop:devices', handler);
  },
  setName: (name) => ipcRenderer.invoke('desktop:setName', name),
});
