'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import Image from 'next/image';
import AppIcon from './AppIcon';
import { overlayFade, scaleIn } from '@/lib/animations';

interface User {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  lastSeen: string;
  createdAt: string;
}

interface UserProfileModalProps {
  userId: string;
  onClose: () => void;
  onStartChat?: (userId: string, username: string) => void;
}

export default function UserProfileModal({ userId, onClose, onStartChat }: UserProfileModalProps) {
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/users/${userId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.profile) setProfile(data.profile);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [userId]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  const getInitials = (name: string) => {
    return name.charAt(0).toUpperCase();
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
        onClick={(e) => e.stopPropagation()}
        variants={scaleIn}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div className="spinner" />
          </div>
        ) : profile ? (
          <>
            {/* Avatar */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div
                className="avatar"
                style={{
                  width: 100,
                  height: 100,
                  fontSize: 40,
                  background: profile.avatarUrl ? 'transparent' : 'var(--accent)',
                }}
              >
                {profile.avatarUrl ? (
                  <Image
                    src={profile.avatarUrl}
                    alt="Avatar"
                    width={100}
                    height={100}
                    unoptimized
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  getInitials(profile.displayName || profile.username)
                )}
              </div>

              {/* Name */}
              <div style={{ textAlign: 'center' }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
                  {profile.displayName || profile.username}
                </h2>
                {profile.displayName && (
                  <p style={{ fontSize: 14, color: 'var(--fg-muted)' }}>@{profile.username}</p>
                )}
              </div>
            </div>

            {/* Bio */}
            {profile.bio && (
              <div style={{ marginBottom: 20, padding: 12, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
                <p style={{ fontSize: 14, lineHeight: 1.5 }}>{profile.bio}</p>
              </div>
            )}

            {/* Info */}
            <div style={{ marginBottom: 20, fontSize: 13, color: 'var(--fg-secondary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span>Last seen:</span>
                <span>{formatDate(profile.lastSeen)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Member since:</span>
                <span>{formatDate(profile.createdAt)}</span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              {onStartChat && (
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  onClick={() => {
                    onStartChat(profile.id, profile.displayName || profile.username);
                    onClose();
                  }}
                >
                  <AppIcon name="chat" size={16} />
                  <span>Start Chat</span>
                </button>
              )}
              <button className="btn btn-ghost" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--fg-muted)' }}>User not found</div>
        )}
      </motion.div>
    </motion.div>
  );
}
