import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary';
import './index.css';

if (import.meta.env.DEV && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => {
      regs.forEach((reg) => {
        void reg.unregister();
      });
    })
    .catch(() => {
      // ignore
    });
} else {
  try {
    registerSW({immediate: true});
  } catch (err) {
    console.warn('[Hatly PWA] Service worker registration skipped:', err);
  }
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <ErrorBoundary fallbackTitle="حدث خطأ أثناء تحميل التطبيق">
      <App />
    </ErrorBoundary>
  );
}
