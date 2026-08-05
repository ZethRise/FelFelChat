'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Locale, defaultLocale, t as translate, getDirection } from '@/lib/i18n';
import LanguageLoadingScreen from '@/components/LanguageLoadingScreen';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  dir: 'rtl' | 'ltr';
  switching: boolean;
  switchTarget: Locale | null;
}

const I18nContext = createContext<I18nContextValue>({
  locale: defaultLocale,
  setLocale: () => {},
  t: (key) => key,
  dir: 'rtl',
  switching: false,
  switchTarget: null,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  const [switching, setSwitching] = useState(false);
  const [switchTarget, setSwitchTarget] = useState<Locale | null>(null);

  const setLocale = useCallback((newLocale: Locale) => {
    if (newLocale === locale || switching) return;

    setSwitchTarget(newLocale);
    setSwitching(true);

    setTimeout(() => {
      setLocaleState(newLocale);
      localStorage.setItem('felfel-locale', newLocale);
      document.documentElement.dir = getDirection(newLocale);
      document.documentElement.lang = newLocale;
      setSwitching(false);
      setSwitchTarget(null);
    }, 5000);
  }, [locale, switching]);

  const t = useCallback(
    (key: string) => translate(key, locale),
    [locale]
  );

  const dir = getDirection(locale);

  useEffect(() => {
    const saved = localStorage.getItem('felfel-locale');
    if (saved === 'fa' || saved === 'en') {
      setLocaleState(saved);
    }
  }, []);

  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = locale;
  }, [dir, locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, dir, switching, switchTarget }}>
      <LanguageLoadingScreen isVisible={switching} targetLocale={switchTarget || locale} />
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
