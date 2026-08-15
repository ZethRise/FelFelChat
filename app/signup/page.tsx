'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useI18n } from '@/components/providers/I18nProvider';
import Link from 'next/link';
import AppIcon from '@/components/AppIcon';
import { fadeSlideUp, spring } from '@/lib/animations';

export default function SignupPage() {
  const { signup } = useAuth();
  const { t, locale, setLocale, dir } = useI18n();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [checkingSettings, setCheckingSettings] = useState(true);

  useEffect(() => {
    fetch('/api/settings/public')
      .then((r) => r.json())
      .then((data) => {
        if (typeof data.registrationEnabled === 'boolean') {
          setRegistrationEnabled(data.registrationEnabled);
        }
        setCheckingSettings(false);
      })
      .catch(() => {
        setCheckingSettings(false);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (username.length < 3) {
      setError(t('auth.usernameMin'));
      return;
    }
    if (password.length < 6) {
      setError(t('auth.passwordMin'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    setLoading(true);
    const result = await signup(username, password, displayName || undefined);
    if (result.error) {
      setError(t(`auth.${result.error}`) || t('common.error'));
    }
    setLoading(false);
  };

  if (checkingSettings) {
    return (
      <div className="auth-shell">
        <div className="auth-card" style={{ display: 'grid', placeItems: 'center', minHeight: 280 }}>
          <div className="spinner" style={{ width: 42, height: 42 }} />
        </div>
      </div>
    );
  }

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
          <p className="auth-subtitle">{t('auth.signupTitle')}</p>
        </div>

        {!registrationEnabled ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
            <div className="auth-closed">
              <AppIcon name="lock" size={34} />
              <div className="auth-closed-title">{t('auth.registrationDisabledTitle') || 'Registration Closed'}</div>
              <div className="auth-closed-text">
                {t('auth.registrationDisabledMessage') || 'New user registration is currently disabled. Please contact the administrator.'}
              </div>
            </div>
            <Link href="/login" className="btn btn-secondary auth-back-link" style={{ width: '100%', height: 46, textDecoration: 'none' }}>
              <AppIcon name="arrowLeft" size={16} style={{ transform: dir === 'rtl' ? 'scaleX(-1)' : 'none' }} />
              <span>{t('auth.backToLogin') || 'Back to Login'}</span>
            </Link>
          </motion.div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <motion.div className="auth-field" variants={fadeSlideUp} initial="hidden" animate="visible">
              <label className="auth-label" htmlFor="username">
                {t('auth.username')}
              </label>
              <input
                id="username"
                className="input"
                type="text"
                placeholder={t('auth.usernamePlaceholder')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </motion.div>

            <motion.div className="auth-field" variants={fadeSlideUp} initial="hidden" animate="visible" transition={{ delay: 0.04 }}>
              <label className="auth-label" htmlFor="displayName">
                {t('auth.displayName')}
              </label>
              <input
                id="displayName"
                className="input"
                type="text"
                placeholder={t('auth.displayNamePlaceholder') || 'Your display name'}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </motion.div>

            <motion.div className="auth-field" variants={fadeSlideUp} initial="hidden" animate="visible" transition={{ delay: 0.08 }}>
              <label className="auth-label" htmlFor="password">
                {t('auth.password')}
              </label>
              <input
                id="password"
                className="input"
                type="password"
                placeholder={t('auth.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </motion.div>

            <motion.div className="auth-field" variants={fadeSlideUp} initial="hidden" animate="visible" transition={{ delay: 0.12 }}>
              <label className="auth-label" htmlFor="confirmPassword">
                {t('auth.confirmPassword')}
              </label>
              <input
                id="confirmPassword"
                className="input"
                type="password"
                placeholder={t('auth.confirmPasswordPlaceholder') || 'Confirm your password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
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
                    {t('auth.signup')}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>

            <p className="auth-note">
              {t('auth.hasAccount')} <Link href="/login" className="auth-link">{t('auth.login')}</Link>
            </p>
          </form>
        )}
      </motion.div>
    </div>
  );
}
