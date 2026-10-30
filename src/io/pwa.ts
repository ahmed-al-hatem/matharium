import { registerSW } from 'virtual:pwa-register';
import { useStore } from '../store/project';
import { loadFile } from './fileio';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
let updateSW: ((reload?: boolean) => Promise<void>) | null = null;

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

/** iOS has no install prompt: users add the app from the Share menu. */
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function initPwa() {
  const set = (p: Parameters<ReturnType<typeof useStore.getState>['setPwa']>[0]) => useStore.getState().setPwa(p);
  set({ installed: isStandalone(), ios: isIos() && !isStandalone() });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    set({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    set({ canInstall: false, installed: true });
  });

  // the installed app is registered as a handler for .mth files (manifest file_handlers)
  const lq = (window as { launchQueue?: { setConsumer(cb: (p: { files?: FileSystemFileHandle[] }) => void): void } }).launchQueue;
  lq?.setConsumer(async ({ files }) => {
    for (const h of files ?? []) await loadFile(await h.getFile(), h);
  });

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    updateSW = registerSW({
      onNeedRefresh: () => set({ updateReady: true }),
      onOfflineReady: () => useStore.getState().notify('offlineReady'),
    });
  }
}

export async function install() {
  if (!deferred) {
    if (useStore.getState().pwa.ios) useStore.getState().notify('installIos');
    return;
  }
  await deferred.prompt();
  await deferred.userChoice;
  deferred = null;
  useStore.getState().setPwa({ canInstall: false });
}

export function applyUpdate() {
  updateSW?.(true);
}
