/**
 * App — component gốc: bao bọc Router và các Provider toàn cục.
 *
 * (Nếu sau này thêm React Query / ThemeProvider / ErrorBoundary,
 *  hãy bọc quanh <AppRoutes /> tại đây.)
 */
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from '@/routes';

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
