'use client';

import { useEffect, useState } from 'react';
import { THEME_KEY } from '@/lib/theme-boot';

const EVENT = 'flumen-theme';

const current = () => (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function useTheme() {
  const [theme, set] = useState('light');
  useEffect(() => {
    const sync = () => set(current());
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return [theme, setTheme];
}

/** Colours for charts, which take plain values rather than CSS classes. */
const CHART = {
  light: { primary: '#C2523D', secondary: '#13294B', tertiary: '#E0705A', danger: '#B92D2D', grid: '#DDD2BC', axis: '#5C6C8C', tipBg: '#FFFCF6', tipBorder: '#DDD2BC', tipLabel: '#13294B' },
  dark:  { primary: '#F08A73', secondary: '#A0AABC', tertiary: '#F6A28F', danger: '#F87171', grid: '#263658', axis: '#808DA6', tipBg: '#121E36', tipBorder: '#263658', tipLabel: '#E2E0DA' },
};

export function useChartColors() {
  const [theme] = useTheme();
  return CHART[theme];
}
