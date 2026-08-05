'use client';

import { useState, useEffect, useRef } from 'react';
import AppIcon from './AppIcon';
interface VoiceCallProps {
  status: 'ringing' | 'incoming' | 'active';
  callerName?: string;
  calleeName?: string;
  isMuted?: boolean;
  audioPlaybackBlocked?: boolean;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
  onToggleMute?: () => void;
  onResumeAudio?: () => void;
  t: (key: string) => string;
}

export default function VoiceCall({
  status,
  callerName,
  calleeName,
  isMuted = false,
  audioPlaybackBlocked = false,
  onAccept,
  onReject,
  onEnd,
  onToggleMute,
  onResumeAudio,
  t,
}: VoiceCallProps) {
  const [duration, setDuration] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (status === 'active') {
      let elapsed = 0;
      intervalRef.current = setInterval(() => {
        elapsed += 1;
        setDuration(elapsed);
      }, 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [status]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const contactName = callerName || calleeName || '...';

  return (
    <div className="call-overlay">
      <div className="call-pulse" style={{ marginBottom: 32 }}>
        <div style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          background: 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 48,
          fontWeight: 700,
          color: 'white',
        }}>
          {contactName.charAt(0).toUpperCase()}
        </div>
      </div>

      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        {contactName}
      </h2>

      <p style={{ color: 'var(--fg-secondary)', fontSize: 16, marginBottom: 40 }}>
        {status === 'ringing' && t('call.calling')}
        {status === 'incoming' && t('call.incoming')}
        {status === 'active' && formatDuration(duration)}
      </p>
      {status === 'active' && audioPlaybackBlocked && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onResumeAudio}
          style={{ marginBottom: 20 }}
        >
          Enable Audio
        </button>
      )}

      <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
        {status === 'incoming' && (
          <>
            <button
              className="call-btn call-btn-danger"
              onClick={onReject}
              title={t('call.reject')}
            >
              <AppIcon name="close" size={24} />
            </button>
            <button
              className="call-btn call-btn-success"
              onClick={onAccept}
              style={{ width: 72, height: 72 }}
              title={t('call.accept')}
            >
              <AppIcon name="phone" size={26} />
            </button>
          </>
        )}

        {(status === 'active' || status === 'ringing') && (
          <>
            {status === 'active' && (
              <button
                className={`call-btn ${isMuted ? 'call-btn-accent' : 'call-btn-neutral'}`}
                onClick={onToggleMute}
                disabled={!onToggleMute}
                title={isMuted ? t('call.unmute') : t('call.mute')}
              >
                <AppIcon name={isMuted ? 'micOff' : 'micOn'} size={20} />
              </button>
            )}
            <button
              className="call-btn call-btn-danger"
              onClick={onEnd}
              title={t('call.end')}
            >
              <AppIcon name="close" size={24} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
