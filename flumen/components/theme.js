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

/**
 * Colours for charts, which take plain values rather than CSS classes. `series` is a validated
 * categorical order (colour-blind safe on adjacent pairs); assign it in order, never cycled.
 * The older keys (primary, secondary...) stay for the admin pages.
 */
const CHART = {
  light: {
    series: ['#cc0000', '#2a78d6', '#1baf7a', '#eda100', '#6250d6', '#e87ba4', '#008300'],
    primary: '#cc0000', secondary: '#111111', tertiary: '#2a78d6', danger: '#B91C1C',
    grid: '#ECECEE', axis: '#6B6B72', text: '#111111', muted: '#6B6B72',
    tipBg: '#FFFFFF', tipBorder: '#E4E4E7', tipLabel: '#111111', surface: '#FFFFFF',
  },
  dark: {
    series: ['#e5484d', '#3987e5', '#199e70', '#c98500', '#9085e9', '#d55181', '#0ca30c'],
    primary: '#e5484d', secondary: '#C8C8CC', tertiary: '#3987e5', danger: '#F87171',
    grid: '#2A2A2E', axis: '#9A9AA0', text: '#F5F5F6', muted: '#A4A4AA',
    tipBg: '#1A1A1C', tipBorder: '#343438', tipLabel: '#F5F5F6', surface: '#1A1A1C',
  },
};

/** Fixed colours for enrollment states, so a state keeps its colour on every chart. */
export const statusColors = c => ({ Active: c.series[1], Completed: c.series[2], Dropped: c.series[0], Invited: c.series[3] });

export function useChartColors() {
  const [theme] = useTheme();
  return CHART[theme];
}
