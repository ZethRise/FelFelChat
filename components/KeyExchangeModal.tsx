'use client';

import { motion } from 'motion/react';
import AppIcon from './AppIcon';
import { overlayFade, scaleIn } from '@/lib/animations';

interface KeyExchangeModalProps {
  isOpen: boolean;
  status: 'IDLE' | 'PENDING' | 'INCOMING';
  otherUserName: string;
  onRequestKey: () => void;
  onAcceptKey: () => void;
  loading?: boolean;
  t: (key: string) => string;
  dir: 'rtl' | 'ltr';
}

export default function KeyExchangeModal({
  isOpen,
  status,
  otherUserName,
  onRequestKey,
  onAcceptKey,
  loading = false,
  t,
  dir,
}: KeyExchangeModalProps) {
  if (!isOpen) return null;

  return (
    <motion.div
      className="modal-overlay"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      variants={overlayFade}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <motion.div
        className="modal"
        style={{
          maxWidth: 440,
          width: '90%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          direction: dir,
          padding: '28px 24px',
          gap: 16,
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
        variants={scaleIn}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'rgba(59, 130, 246, 0.12)',
            color: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppIcon name="lock" size={28} />
        </div>

        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>
            {t('keyExchange.title')}
          </h2>
          <p style={{ fontSize: 14, color: 'var(--fg-secondary)', margin: 0, lineHeight: 1.5 }}>
            {status === 'INCOMING'
              ? t('keyExchange.incomingDesc').replace('{name}', otherUserName)
              : status === 'PENDING'
              ? t('keyExchange.pendingDesc').replace('{name}', otherUserName)
              : t('keyExchange.idleDesc').replace('{name}', otherUserName)}
          </p>
        </div>

        <div style={{ width: '100%', marginTop: 8 }}>
          {status === 'INCOMING' && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onAcceptKey}
              disabled={loading}
              style={{ width: '100%', height: 44 }}
            >
              {loading ? <div className="spinner" style={{ width: 18, height: 18 }} /> : t('keyExchange.acceptBtn')}
            </button>
          )}

          {status === 'PENDING' && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled
              style={{ width: '100%', height: 44, gap: 8 }}
            >
              <div className="spinner" style={{ width: 16, height: 16 }} />
              <span>{t('keyExchange.waitingBtn')}</span>
            </button>
          )}

          {status === 'IDLE' && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onRequestKey}
              disabled={loading}
              style={{ width: '100%', height: 44 }}
            >
              {loading ? <div className="spinner" style={{ width: 18, height: 18 }} /> : t('keyExchange.requestBtn')}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
