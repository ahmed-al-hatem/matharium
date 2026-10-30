import type { ReactNode, SVGProps } from 'react';

const I = ({ children, ...p }: SVGProps<SVGSVGElement> & { children: ReactNode }) => (
  <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    {children}
  </svg>
);

export const Icon = {
  menu: () => <I><path d="M4 7h16M4 12h16M4 17h16" /></I>,
  algebra: () => <I><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M8 18h2M12 18h2M16 15v3" /></I>,
  tools: () => <I><path d="M4 19 10 6l6 13z" /><circle cx="15" cy="9" r="5" /></I>,
  table: () => <I><rect x="4" y="5" width="16" height="14" rx="1.5" /><path d="M4 10h16M9.5 5v14M14.5 5v14" /></I>,
  sheet: () => <I><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="M4 9h16M4 14h16M9 4v16" /></I>,
  plus: () => <I><path d="M12 5v14M5 12h14" /></I>,
  dots: () => <I><circle cx="12" cy="5.5" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="18.5" r="1.2" fill="currentColor" /></I>,
  close: () => <I><path d="M6 6l12 12M18 6 6 18" /></I>,
  home: () => <I><path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z" fill="currentColor" stroke="none" /></I>,
  zoomIn: () => <I><circle cx="10.5" cy="10.5" r="6" /><path d="M20 20l-5-5M10.5 7.5v6M7.5 10.5h6" /></I>,
  zoomOut: () => <I><circle cx="10.5" cy="10.5" r="6" /><path d="M20 20l-5-5M7.5 10.5h6" /></I>,
  fullscreen: () => <I><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></I>,
  gear: () => <I><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></I>,
  undo: () => <I><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></I>,
  redo: () => <I><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></I>,
  share: () => <I><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" /></I>,
  keyboard: () => <I><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6" /></I>,
  save: () => <I><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></I>,
  folder: () => <I><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></I>,
  file: () => <I><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></I>,
  image: () => <I><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m21 16-5-5-9 8" /></I>,
  download: () => <I><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></I>,
  upload: () => <I><path d="M12 20V9M7 14l5-5 5 5M5 4h14" /></I>,
  play: () => <I><path d="M8 5v14l11-7z" fill="currentColor" stroke="none" /></I>,
  pause: () => <I><path d="M8 5v14M16 5v14" strokeWidth={3} /></I>,
  chevron: () => <I><path d="m6 9 6 6 6-6" /></I>,
  help: () => <I><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.3M12 17h.01" /></I>,
  trash: () => <I><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></I>,
  copy: () => <I><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></I>,
  globe: () => <I><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></I>,
  grid: () => <I><path d="M4 4h16v16H4zM4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16" /></I>,
  graph: () => <I><path d="M3 20c4-14 7-14 9-8s5 6 9-8" /></I>,
  geometry: () => <I><path d="M4 19 12 5l8 14z" /><circle cx="12" cy="5" r="1.5" fill="currentColor" /></I>,
  cube: () => <I><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></I>,
  label: () => <I><path d="M4 7h16M4 12h10M4 17h7" /></I>,
  stop: () => <I><rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none" /></I>,
  video: () => <I><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3z" /></I>,
  trace: () => <I><path d="M4 18c3-1 4-6 7-7s4 3 7 1" strokeDasharray="2 3" /><circle cx="19" cy="11" r="2" fill="currentColor" /></I>,
  eraser: () => <I><path d="m14 5 5 5-8 8H7l-3-3z" /><path d="M10 9l5 5M11 18h9" /></I>,
};
