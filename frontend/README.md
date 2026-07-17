# Frontend — Base Web

Bộ khung Web sạch: **ReactJS + TypeScript (strict) + Vite + Tailwind CSS**, cấu hình Axios chuyên nghiệp, routing rõ ràng và sẵn sàng mở rộng.

## 🚀 Bắt đầu

```bash
# 1. Cài dependency
npm install

# 2. Tạo file .env từ mẫu và điền giá trị
cp .env.example .env

# 3. Chạy dev server (http://localhost:3000)
npm run dev
```

## 📦 Scripts

| Lệnh                 | Mô tả                                      |
| -------------------- | ------------------------------------------ |
| `npm run dev`        | Chạy môi trường phát triển (HMR)           |
| `npm run build`      | Type-check + build production vào `dist/`  |
| `npm run preview`    | Xem thử bản build production               |
| `npm run lint`       | Kiểm tra lint                              |
| `npm run type-check` | Kiểm tra kiểu TypeScript (không xuất file) |

## 🗂️ Cấu trúc thư mục

```
frontend/
├── public/              # Tệp tĩnh (favicon, manifest)
├── index.html           # Entry HTML của Vite (đặt ở root theo chuẩn Vite)
└── src/
    ├── assets/          # Ảnh, font, CSS toàn cục
    ├── components/
    │   ├── ui/          # Component nguyên tử: Button, Input, Modal, Table
    │   ├── layout/      # Navbar, Sidebar, Footer, MainLayout
    │   ├── hooks/       # useAuth, useTheme, useDebounce
    │   └── utils/       # formatDate, formatCurrency, validate, cn
    ├── pages/           # Mỗi trang một thư mục: Home, About, Dashboard, Login
    ├── store/           # Zustand store (slice pattern)
    │   └── slices/      # authSlice, userSlice
    ├── routes/          # publicRoutes, privateRoutes, ProtectedRoute, index
    ├── services/        # authService, userService (gọi API)
    ├── config/          # axios (interceptors), env, theme
    ├── types/           # Interfaces: user, auth, common
    ├── App.tsx          # Router + Providers
    └── main.tsx         # Render DOM
```

## 🔑 Quy ước quan trọng

- **TypeScript strict**: cấm `any`. Định nghĩa type trong `src/types/`.
- **Path alias**: dùng `@/...` thay vì đường dẫn tương đối dài dòng.
- **Luồng dữ liệu**: `pages` → `store/hooks` → `services` → `config/axios`.
- **Token**: chỉ đọc/ghi trong `config/axios.ts` (`tokenStorage`).

> 📖 Xem `claude.md` để biết bộ quy tắc phát triển đầy đủ dành cho cả người và AI.
