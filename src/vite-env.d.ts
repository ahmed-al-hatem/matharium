/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
declare module 'katex' {
  const katex: { renderToString(tex: string, opts?: Record<string, unknown>): string };
  export default katex;
}
