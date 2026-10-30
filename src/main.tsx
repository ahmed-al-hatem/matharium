import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { startAutosave } from './io/fileio';
import { initPwa } from './io/pwa';
import { useStore } from './store/project';
import { startAnimator } from './store/animate';
import './styles/fonts.css';
import './styles/app.css';

startAutosave();
initPwa();
startAnimator();
// exposes the store to the Playwright suite (dev server only)
if (import.meta.env.DEV) (window as unknown as { __matharium: typeof useStore }).__matharium = useStore;
if (window.innerWidth > 860) useStore.getState().setKeyboard(true);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
