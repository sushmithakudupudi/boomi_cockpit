import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const KEY = 'boomiops.theme';

const systemTheme = (): Theme =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';

const readSaved = (): Theme | null => {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
};

/** Light/dark theme. Follows the OS setting until the user picks one, then remembers it. */
export const useTheme = () => {
  const [theme, setThemeState] = useState<Theme>(() => readSaved() ?? systemTheme());

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  // Track OS changes only while the user hasn't chosen explicitly.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: light)');
    if (!mq) return;
    const onChange = () => !readSaved() && setThemeState(mq.matches ? 'light' : 'dark');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* storage unavailable */
    }
  }, []);

  return { theme, setTheme, toggle: () => setTheme(theme === 'light' ? 'dark' : 'light') };
};
