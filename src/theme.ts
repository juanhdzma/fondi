import { useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';

const KEY = 'fondi-theme';
const THEME_COLORS: Record<Theme, string> = { dark: '#12181c', light: '#e7edea' };

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: Theme) {
  if (theme === 'light') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
  try {
    localStorage.setItem(KEY, theme);
  } catch {}
  window.dispatchEvent(new Event(KEY));
}

const subscribe = (callback: () => void) => {
  window.addEventListener(KEY, callback);
  return () => window.removeEventListener(KEY, callback);
};

export function useTheme() {
  return useSyncExternalStore(subscribe, currentTheme);
}

export function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function withAlpha(color: string, alpha: number) {
  const hex = color.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return color;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
