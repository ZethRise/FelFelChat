'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import AppIcon from './AppIcon';
import { overlayFade, scaleIn } from '@/lib/animations';

interface EncryptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveKey: (key: string) => void;
  currentKey?: string;
  t: (key: string) => string;
  dir: 'rtl' | 'ltr';
}

export default function EncryptionModal({
  isOpen,
  onClose,
  onSaveKey,
  currentKey = '',
  t,
  dir,
}: EncryptionModalProps) {
  const [keyInput, setKeyInput] = useState(currentKey);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keyInput.trim();
    if (trimmed.length < 6) {
      setError(t('e2ee.minCharsError'));
      return;
    }
    setError(null);
    onSaveKey(trimmed);
  };

  return (
    <motion.div
      className="modal-overlay"
      onClick={onClose}
      variants={overlayFade}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <motion.div
        className="modal"
        style={{
          maxWidth: 420,
          width: '90%',
          display: 'flex',
          flexDirection: 'column',
          direction: dir,
          padding: 24,
          gap: 16,
        }}
        onClick={(e) => e.stopPropagation()}
        variants={scaleIn}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.12)',
                color: 'var(--danger)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppIcon name="lock" size={20} />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
              {t('e2ee.title')}
            </h2>
          </div>
          {currentKey ? (
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>
              <AppIcon name="close" size={18} />
            </button>
          ) : null}
        </div>

        <p style={{ fontSize: 14, color: 'var(--fg-secondary)', margin: 0, lineHeight: 1.5 }}>
          {t('e2ee.requiredNotice')}
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <input
              type="password"
              className="input"
              value={keyInput}
              onChange={(e) => {
                setKeyInput(e.target.value);
                if (error) setError(null);
              }}
              placeholder={t('e2ee.passphrasePlaceholder')}
              autoFocus
              style={{ width: '100%' }}
            />
            {error && (
              <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6, marginBottom: 0 }}>
                {error}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
              {t('e2ee.setKeyBtn')}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
