const CURSOR_PATHS = {
  DEFAULT_BLACK: '/cursors/01_default_black.svg',
  DEFAULT_WHITE: '/cursors/01_default_white.svg',
  SUBTRACT_BLACK: '/cursors/02_subtract_black.svg',
  SUBTRACT_WHITE: '/cursors/02_subtract_white.svg',
  DISABLED: '/cursors/cursor-disabled-02-stroke-rounded.svg'
} as const;

const HOTSPOTS = {
  ARROW: '4 4'
} as const;

export const CURSORS = {
  DEFAULT: (theme: 'dark' | 'light') => 
    `url(${theme === 'dark' ? CURSOR_PATHS.DEFAULT_WHITE : CURSOR_PATHS.DEFAULT_BLACK}) ${HOTSPOTS.ARROW}, default`,
  
  SELECT_SUBTRACT: (theme: 'dark' | 'light') => 
    `url(${theme === 'dark' ? CURSOR_PATHS.SUBTRACT_WHITE : CURSOR_PATHS.SUBTRACT_BLACK}) ${HOTSPOTS.ARROW}, not-allowed`,
  
  // 🎯 Built-in cursors
  CROSSHAIR: 'crosshair',
  PAN: 'grab',
  PANNING: 'grabbing',
  DISABLED: `url(${CURSOR_PATHS.DISABLED}) ${HOTSPOTS.ARROW}, not-allowed`
} as const;