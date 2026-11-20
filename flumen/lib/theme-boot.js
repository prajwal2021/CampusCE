export const THEME_KEY = 'flumen_theme';

/** Runs before first paint (see app/layout.js) so the page never flashes the wrong theme. */
export const themeBootScript = `try{var t=localStorage.getItem('${THEME_KEY}');document.documentElement.dataset.theme=t==='dark'?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}`;
