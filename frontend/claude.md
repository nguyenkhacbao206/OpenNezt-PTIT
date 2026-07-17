# claude.md — Quy tắc phát triển & Kiến trúc dự án Frontend

> **Mục đích:** Đây là "hiến pháp" của dự án. Mọi con người hoặc AI (Claude, Copilot…)
> khi viết/sửa code trong `frontend/` **BẮT BUỘC** tuân theo tài liệu này để giữ
> cấu trúc sạch, nhất quán và không phá vỡ kiến trúc phân tầng.
>
> Nếu một yêu cầu mâu thuẫn với tài liệu này, hãy **dừng lại và hỏi lại**, đừng tự ý phá vỡ quy ước.

---

## 1. Tech Stack (không tự ý đổi)

| Hạng mục         | Công nghệ                         |
| ---------------- | --------------------------------- |
| Framework        | ReactJS 18 (function components)  |
| Ngôn ngữ         | TypeScript (strict mode)          |
| Build tool       | Vite                              |
| CSS              | Tailwind CSS (`darkMode: 'class'`)|
| State management | Zustand (slice pattern)           |
| Routing          | React Router DOM v6+              |
| HTTP client      | Axios (instance + interceptors)   |

❌ **Không** thêm thư viện mới (Redux, MUI, styled-components, axios thay thế…) nếu chưa được yêu cầu rõ ràng.

---

## 2. Nguyên tắc TypeScript (BẮT BUỘC)

1. **Cấm tuyệt đối `any`.** Nếu chưa biết kiểu, dùng `unknown` rồi thu hẹp (narrow) bằng type guard.
2. Mọi kiểu dữ liệu domain (User, Auth, response API…) đặt trong `src/types/` và export qua barrel `@/types`.
3. Hàm public/service phải khai báo **kiểu trả về tường minh** (không dựa vào suy luận ngầm).
4. Ưu tiên `interface` cho object/shape, `type` cho union/alias.
5. Đã bật `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` — cẩn thận khi truy cập mảng và optional field.
   - Với optional prop có điều kiện, dùng spread: `{...(x ? { prop: x } : {})}` thay vì truyền `undefined`.
6. Import kiểu bằng `import type { ... }` để tách rõ type khỏi giá trị runtime.

---

## 3. Kiến trúc phân tầng & Luồng dữ liệu

Luồng dữ liệu một chiều, **không được đi tắt**:

```
UI (pages / components)
      │  gọi action
      ▼
store (Zustand slices)  ──► services (gọi API)  ──► config/axios (HTTP + token)
      │                                                     │
      └────────────── nhận dữ liệu đã gõ kiểu ◄─────────────┘
```

**Quy tắc vàng:**

- `pages` & `components` **KHÔNG** gọi `axios`/`httpClient` trực tiếp → phải qua `services` (thường thông qua `store`).
- `services` **KHÔNG** biết gì về UI hay store → chỉ nhận payload, gọi API, trả dữ liệu đã gõ kiểu.
- `store` là nơi điều phối: gọi `services`, cập nhật state, xử lý loading/error.
- Chỉ `config/axios.ts` được phép đọc/ghi token (`tokenStorage`). Không `localStorage.getItem('access_token')` ở nơi khác.

---

## 4. Trách nhiệm từng thư mục

| Thư mục               | Trách nhiệm                                                                 | ĐƯỢC làm                                            | KHÔNG được làm                                    |
| --------------------- | -------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------- |
| `config/`             | Cấu hình hệ thống: axios, env, theme                                       | Interceptor, đọc biến môi trường, quản lý token     | Chứa logic nghiệp vụ, gọi API domain              |
| `types/`              | Định nghĩa interface/type dùng chung                                        | Interface, type alias, enum-like union              | Chứa logic, giá trị runtime                       |
| `services/`           | Tầng gọi API theo domain                                                    | `httpClient.get/post…`, trả dữ liệu gõ kiểu         | Đụng vào store, UI, `useState`                    |
| `store/` + `slices/`  | State toàn cục (Zustand)                                                    | Gọi service, set state, xử lý loading/error         | Render JSX, thao tác DOM                          |
| `routes/`             | Cấu hình routing, bảo vệ route                                             | Khai báo route, `ProtectedRoute`, lazy import       | Chứa UI phức tạp của page                         |
| `pages/`              | Trang lớn (mỗi trang một thư mục)                                          | Ghép component, gọi store/hook, layout của trang    | Gọi `httpClient` trực tiếp, chứa UI nguyên tử tái dùng |
| `components/ui/`      | Component nguyên tử tái dùng                                               | Button, Input, Modal, Table… thuần trình bày        | Gọi API, phụ thuộc business logic cụ thể          |
| `components/layout/`  | Khung bố cục hệ thống                                                       | Navbar, Sidebar, Footer, MainLayout                 | Logic domain                                      |
| `components/hooks/`   | Custom hooks dùng chung                                                     | `useAuth`, `useTheme`, `useDebounce`                | JSX render lớn                                    |
| `components/utils/`   | Hàm tiện ích thuần (pure)                                                   | format, validate, `cn`                              | Side-effect, gọi API, dùng React hook             |
| `assets/`             | Ảnh, font, CSS toàn cục                                                     | Static asset, `global.css`                          | Logic                                             |

---

## 5. Quy ước đặt tên (Naming Conventions)

| Đối tượng                     | Quy ước            | Ví dụ                                  |
| ----------------------------- | ------------------ | -------------------------------------- |
| Thư mục page                  | PascalCase         | `Dashboard/`, `Login/`                 |
| Component + file component     | PascalCase         | `Button.tsx`, `MainLayout.tsx`         |
| Hook + file hook              | camelCase, `use…`  | `useAuth.ts`                           |
| Service + file service        | camelCase, `…Service` | `authService.ts`                    |
| Slice                         | camelCase, `…Slice`   | `authSlice.ts`                      |
| Util / file util              | camelCase          | `formatDate.ts`                        |
| Type / Interface              | PascalCase         | `interface User`, `type UserRole`      |
| Hằng số                       | UPPER_SNAKE_CASE   | `ROUTE_PATHS`, `ACCESS_TOKEN_KEY`      |
| Biến / hàm                    | camelCase          | `fetchUsers`, `isValidEmail`           |

- Mỗi thư mục có `index.ts` làm **barrel export** để import gọn.
- Component page export cả **named** (`DashboardPage`) và **default** (phục vụ `lazy`).

---

## 6. Import & Path Alias

Dùng alias thay vì đường dẫn tương đối sâu:

```ts
// ✅ Đúng
import { Button } from '@/components/ui';
import type { User } from '@/types';
import { httpClient } from '@/config/axios';

// ❌ Sai
import { Button } from '../../../components/ui/Button';
```

Alias đã cấu hình đồng bộ ở `tsconfig.json` và `vite.config.ts`:
`@/*`, `@components/*`, `@pages/*`, `@store/*`, `@routes/*`, `@services/*`, `@config/*`, `@types/*`, `@assets/*`.

---

## 7. Cách thêm mới (Checklist)

### ➕ Thêm một Page
1. Tạo thư mục `src/pages/<TênPage>/index.tsx`, export named + default.
2. Khai báo route trong `publicRoutes.ts` hoặc `privateRoutes.ts` (dùng `lazy`).
3. Thêm path vào `routes/paths.ts` (`ROUTE_PATHS`).
4. Nếu cần dữ liệu: gọi qua **store action** → **service**, KHÔNG gọi axios trực tiếp.

### ➕ Thêm một API domain mới
1. Định nghĩa type request/response trong `src/types/`.
2. Tạo `src/services/<domain>Service.ts` dùng `httpClient`.
3. Nếu cần state toàn cục → tạo slice trong `src/store/slices/` và gộp vào `store/index.ts`.

### ➕ Thêm một State slice (Zustand)
1. Tạo `src/store/slices/<name>Slice.ts` với `StateCreator<AppStore, [], [], XxxSlice>`.
2. Export interface slice + hàm `createXxxSlice`.
3. Gộp vào `store/index.ts`: `...createXxxSlice(...args)` và thêm type vào `AppStore`.

### ➕ Thêm biến môi trường
1. Thêm vào `.env` và `.env.example` với tiền tố `VITE_`.
2. Khai báo kiểu trong `src/vite-env.d.ts` (`ImportMetaEnv`).
3. Đọc & validate qua `src/config/env.ts` — KHÔNG dùng `import.meta.env` rải rác.

---

## 8. Store (Zustand) — quy tắc dùng

```ts
// ✅ Luôn dùng selector để tránh re-render thừa
const users = useAppStore((s) => s.users);
const fetchUsers = useAppStore((s) => s.fetchUsers);

// ❌ Không lấy cả store
const store = useAppStore();
```

- Mỗi slice tự quản `status` (`idle|loading|success|error`) và `error` riêng.
- Action bất đồng bộ: set `loading` → try gọi service → set `success`/`error`.

---

## 9. Styling (Tailwind)

- Ưu tiên **utility class** ngay trong JSX. Hạn chế CSS rời.
- Gộp class có điều kiện bằng helper `cn()` trong `components/utils`.
- Hỗ trợ dark mode: luôn kèm biến thể `dark:` khi đặt màu nền/chữ.
- Màu thương hiệu dùng token trong `tailwind.config.js` (`primary`, `secondary`, `danger`), không hard-code mã hex trong component.

---

## 10. Xử lý lỗi & Bảo mật

- Lỗi API đã được chuẩn hoá thành `NormalizedError` tại `config/axios.ts` — UI chỉ cần đọc `error.message`.
- 401 được tự động refresh token 1 lần; thất bại thì xoá token và về `/login`.
- Không log token/thông tin nhạy cảm ra console ở môi trường production.
- Không commit `.env` thật (đã ignore); chỉ commit `.env.example`.

---

## 11. Definition of Done (trước khi kết thúc một task)

- [ ] `npm run type-check` không lỗi (không có `any`, không unused).
- [ ] `npm run lint` sạch.
- [ ] Không gọi `httpClient`/`axios` trực tiếp trong `pages`/`components`.
- [ ] Token chỉ được truy cập qua `tokenStorage`.
- [ ] Type mới đặt đúng chỗ trong `src/types/` và export qua barrel.
- [ ] Đặt tên đúng quy ước ở mục 5, import dùng alias ở mục 6.
- [ ] Component tái dùng đặt trong `components/ui`, không nhét vào `pages`.
