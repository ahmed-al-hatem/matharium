import { useStore } from '../store/project';
import { playingCycle } from '../store/animate';
import { baseName, download } from './fileio';

let rec: MediaRecorder | null = null;
let timer: number | undefined;
let startedPlaying = false;

export function recordSupported() {
  return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype;
}

/**
 * Records the graph canvas (2D or 3D) to a .webm file with the browser's own encoder (no network needed).
 * Starts the sliders if none is playing and stops by itself after one full animation cycle.
 */
export function startRecording() {
  const st = useStore.getState();
  if (rec) return;
  const canvas = document.querySelector<HTMLCanvasElement>('.stage .canvas-wrap canvas');
  const mimeType = recordSupported()
    ? ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m))
    : undefined;
  if (!canvas || !mimeType) { st.notify('recordUnsupported'); return; }
  const stream = canvas.captureStream(30);
  const chunks: Blob[] = [];
  const r = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
  rec = r;
  r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  r.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    download(new Blob(chunks, { type: 'video/webm' }), `${baseName()}.webm`);
    useStore.getState().notify('recorded');
  };
  startedPlaying = !st.playing.length && st.objects.some((o) => o.slider);
  if (startedPlaying) st.playAll();
  r.start(250);
  st.setRecording(Date.now());
  const T = playingCycle();
  if (T) timer = window.setTimeout(stopRecording, T * 1000 + 150);
}

export function stopRecording() {
  clearTimeout(timer);
  const r = rec;
  if (!r) return;
  rec = null;
  if (r.state !== 'inactive') { r.requestData(); r.stop(); }
  const st = useStore.getState();
  st.setRecording(null);
  if (startedPlaying) st.stopAll();
  startedPlaying = false;
}
