/**
 * main.tsx — điểm khởi chạy ứng dụng (render vào DOM).
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initTheme } from '@/config/theme';
import '@/assets/styles/global.css';

// Áp dụng theme (dark/light) trước khi render để tránh nhấp nháy.
initTheme();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Không tìm thấy phần tử #root trong index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
