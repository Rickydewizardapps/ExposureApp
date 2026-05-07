// Tokyo Night theme for blessed UI
export const ANSI = {
  brand: '\x1b[38;5;111m',      // blue — headings
  brandBold: '\x1b[1;38;5;111m', // bold blue
  text: '\x1b[38;5;252m',       // white smoke — body
  dim: '\x1b[38;5;59m',         // gray — descriptions
  success: '\x1b[38;5;150m',    // green — 2xx, online
  warning: '\x1b[38;5;223m',    // yellow — 4xx, connecting
  error: '\x1b[38;5;203m',      // red — 5xx, failures
  reset: '\x1b[0m',
};

export const C = ANSI;

export const BLESSED = {
  brand: '#7aa2f7',      // blue
  brandBold: '#7aa2f7',
  text: '#a9b1d6',       // light gray
  dim: '#565f89',        // muted gray
  success: '#9ece6a',    // green
  warning: '#e0af68',    // yellow/orange
  error: '#f7768e',      // red/pink
};
