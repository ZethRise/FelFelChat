'use client';

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import Image from 'next/image';
import AppIcon from './AppIcon';
import { overlayFade, scaleIn, staggerContainer, staggerItem } from '@/lib/animations';

interface Member {
  id: string;
  userId: string;
  joinedAt: string;
  user: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    bio: string | null;
  };
}

interface GroupMembersModalProps {
  roomId: string;
  roomName: string;
  isOpen: boolean;
  onClose: () => void;
  onMemberClick?: (userId: string) => void;
  t: (key: string) => string;
  dir: 'rtl' | 'ltr';
}

export default function GroupMembersModal({
  roomId,
  roomName,
  isOpen,
  onClose,
  onMemberClick,
  t,
  dir,
}: GroupMembersModalProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !roomId) return;

    const fetchMembers = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/rooms/${roomId}/members`);
        const data = await res.json();
        if (data.members) {
          setMembers(data.members);
        }
      } catch (error) {
        console.error('Failed to fetch members:', error);
      }
      setLoading(false);
    };

    fetchMembers();
  }, [isOpen, roomId]);

  if (!isOpen) return null;

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
          maxWidth: 500,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          direction: dir,
          padding: 0,
        }}
        onClick={(e) => e.stopPropagation()}
        variants={scaleIn}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--stroke-soft)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
              {roomName}
            </h2>
            <p style={{ fontSize: 14, color: 'var(--fg-muted)' }}>
              {t('room.memberCount').replace('{count}', String(members.length))}
            </p>
          </div>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={onClose}
          >
            <AppIcon name="close" size={20} />
          </button>
        </div>

        {/* Members List */}
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <div className="spinner" style={{ width: 32, height: 32 }} />
            </div>
          ) : members.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--fg-muted)', padding: 40 }}>
              {t('room.members')}: 0
            </p>
          ) : (
            <motion.div variants={staggerContainer} initial="hidden" animate="visible">
              {members.map((member) => (
                <motion.div
                  key={member.id}
                  variants={staggerItem}
                  style={{
                    padding: '12px 24px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    cursor: onMemberClick ? 'pointer' : 'default',
                  }}
                  onClick={() => onMemberClick?.(member.userId)}
                  whileHover={{ backgroundColor: 'var(--bg-hover)' }}
                >
                  {/* Avatar */}
                  {member.user.avatarUrl ? (
                    <Image
                      src={member.user.avatarUrl}
                      alt={member.user.displayName || member.user.username}
                      width={48}
                      height={48}
                      unoptimized
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: '50%',
                        objectFit: 'cover',
                        flex: 'none',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: '50%',
                        background: 'var(--accent)',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 20,
                        fontWeight: 600,
                        flex: 'none',
                      }}
                    >
                      {(member.user.displayName || member.user.username).charAt(0).toUpperCase()}
                    </div>
                  )}

                  {/* User Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>
                      {member.user.displayName || member.user.username}
                    </div>
                    {member.user.bio && (
                      <div
                        style={{
                          fontSize: 14,
                          color: 'var(--fg-muted)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {member.user.bio}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
                      @{member.user.username}
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
