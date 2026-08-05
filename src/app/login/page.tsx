'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useI18n } from '@/components/providers/I18nProvider';
import Link from 'next/link';
import AppIcon from '@/components/AppIcon';
import { fadeSlideUp, spring } from '@/lib/animations';

export default function LoginPage() {
  const { t, locale, setLocale, dir } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const parseResponseBody = async (res: Response): Promise<Record<string, unknown>> => {
    const text = await res.text();
    if (!text) {
      return {};
    }
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { error: 'serverError', debug: text };
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!username || !password) {
      setError(t('auth.invalidCredentials'));
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await parseResponseBody(res);

      if (!res.ok) {
        const apiError = typeof data.error === 'string' ? data.error : 'serverError';
        const debug = typeof data.debug === 'string' ? data.debug : '';
        if (debug) {
          console.error('Login API error:', debug);
        } else {
          console.error('Login API error response:', data);
        }
        setError(t(`auth.${apiError}`) || t('common.error'));
        setLoading(false);
        return;
      }

      window.location.href = '/';
    } catch (caught) {
      console.error('Login request failed:', caught);
      setError(t('common.error'));
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <motion.div
        className="auth-card"
        style={{ direction: dir }}
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={spring}
      >
        <div className="auth-topbar">
          <div className="lang-toggle">
            <button
              type="button"
              className={locale === 'fa' ? 'active' : ''}
              onClick={() => setLocale('fa')}
            >
              FA
            </button>
            <button
              type="button"
              className={locale === 'en' ? 'active' : ''}
              onClick={() => setLocale('en')}
            >
              EN
            </button>
          </div>
        </div>

        <div className="auth-brand">
          <motion.div
            className="auth-brand-icon"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ ...spring, delay: 0.1 }}
          >
            <AppIcon name="logo" size={30} />
          </motion.div>
          <h1 className="auth-title">{t('common.appName')}</h1>
          <p className="auth-subtitle">{t('auth.loginSubtitle')}</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <motion.div className="auth-field" variants={fadeSlideUp} initial="hidden" animate="visible">
            <label className="auth-label" htmlFor="username">
              {t('auth.username')}
            </label>
            <input
              id="username"
              name="username"
              className="input"
              type="text"
              placeholder={t('auth.usernamePlaceholder')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </motion.div>

          <motion.div className="auth-field" variants={fadeSlideUp} initial="hidden" animate="visible" transition={{ delay: 0.06 }}>
            <label className="auth-label" htmlFor="password">
              {t('auth.password')}
            </label>
            <input
              id="password"
              name="password"
              className="input"
              type="password"
              placeholder={t('auth.passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </motion.div>

          <AnimatePresence>
            {error && (
              <motion.div
                className="auth-error"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', height: 46 }}
            whileTap={{ scale: 0.98 }}
            whileHover={{ scale: 1.01 }}
          >
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div
                  key="spinner"
                  className="spinner"
                  style={{ width: 18, height: 18, borderTopColor: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                />
              ) : (
                <motion.span
                  key="text"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {t('auth.login')}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>

          <p className="auth-note">
            {t('auth.noAccount')} <Link href="/signup" className="auth-link">{t('auth.signup')}</Link>
          </p>
        </form>
      </motion.div>
    </div>
  );
}
