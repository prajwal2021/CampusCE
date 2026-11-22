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
    series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
    primary: '#2a78d6', secondary: '#13294B', tertiary: '#eb6834', danger: '#B92D2D',
    grid: '#E6EAF0', axis: '#68758C', text: '#0F1E38', muted: '#68758C',
    tipBg: '#FFFFFF', tipBorder: '#E1E6EE', tipLabel: '#0F1E38', surface: '#FFFFFF',
  },
  dark: {
    series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767'],
    primary: '#3987e5', secondary: '#A0AABC', tertiary: '#d95926', danger: '#F87171',
    grid: '#223152', axis: '#808DA6', text: '#F1F4FA', muted: '#A0AABC',
    tipBg: '#121E36', tipBorder: '#263658', tipLabel: '#E2E0DA', surface: '#121E36',
  },
};

export function useChartColors() {
  const [theme] = useTheme();
  return CHART[theme];
}
