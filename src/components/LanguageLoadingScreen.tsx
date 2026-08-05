'use client';

import { motion, AnimatePresence } from 'motion/react';

interface LanguageLoadingScreenProps {
  isVisible: boolean;
  targetLocale: 'fa' | 'en';
}

const messages = {
  fa: 'صب کن دارم عوضش میکنم...',
  en: "hang on tight! we're almost there...",
};

export default function LanguageLoadingScreen({ isVisible, targetLocale }: LanguageLoadingScreenProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 32,
            background: '#09090b',
          }}
        >
          {/* Animated SVG Spinner */}
          <div style={{ position: 'relative', width: 120, height: 120 }}>
            {/* Outer ring */}
            <motion.svg
              width="120"
              height="120"
              viewBox="0 0 120 120"
              style={{ position: 'absolute', top: 0, left: 0 }}
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            >
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="#1e1e22"
                strokeWidth="4"
              />
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="url(#grad1)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray="80 250"
              />
              <defs>
                <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#60a5fa" />
                </linearGradient>
              </defs>
            </motion.svg>

            {/* Inner ring — counter-rotate */}
            <motion.svg
              width="120"
              height="120"
              viewBox="0 0 120 120"
              style={{ position: 'absolute', top: 0, left: 0 }}
              animate={{ rotate: -360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            >
              <circle
                cx="60"
                cy="60"
                r="36"
                fill="none"
                stroke="#1e1e22"
                strokeWidth="3"
              />
              <circle
                cx="60"
                cy="60"
                r="36"
                fill="none"
                stroke="#3b82f6"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray="50 180"
                opacity="0.7"
              />
            </motion.svg>

            {/* Center pulsing dot */}
            <motion.div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: '#3b82f6',
              }}
              animate={{
                scale: [1, 1.4, 1],
                opacity: [0.7, 1, 0.7],
              }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>

          {/* Message text */}
          <motion.p
            key={targetLocale}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            style={{
              fontFamily: targetLocale === 'fa'
                ? 'var(--font-vazirmatn), var(--font-estedad), sans-serif'
                : 'var(--font-estedad), var(--font-sora), sans-serif',
              fontSize: 18,
              color: '#a1a1aa',
              direction: targetLocale === 'fa' ? 'rtl' : 'ltr',
              textAlign: 'center',
              paddingInline: 24,
            }}
          >
            {messages[targetLocale]}
          </motion.p>

          {/* Progress dots */}
          <div style={{ display: 'flex', gap: 8 }}>
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#3b82f6',
                }}
                animate={{
                  opacity: [0.3, 1, 0.3],
                  scale: [0.8, 1.2, 0.8],
                }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  delay: i * 0.2,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
