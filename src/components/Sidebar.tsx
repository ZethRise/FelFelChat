'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useRouter } from 'next/navigation';
import { Locale } from '@/lib/i18n';
import Image from 'next/image';
import AppIcon from './AppIcon';
import { staggerContainer, staggerItem, fadeSlideUp, spring } from '@/lib/animations';

interface User {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl?: string | null;
  isSuperAdmin: boolean;
}

interface Room {
  id: string;
  name: string;
  type: string;
  profilePhotoUrl?: string | null;
  members: { user: { id: string; username: string; displayName: string | null; lastSeen: string } }[];
  messages: { text: string | null; user: { username: string }; createdAt: string }[];
  _count: { messages: number; members: number };
}

interface SidebarProps {
  user: User;
  rooms: Room[];
  roomsLoading: boolean;
  unreadByRoom: Record<string, number>;
  activeRoomId: string | null;
  onlineUsers: Set<string>;
  onSelectRoom: (id: string) => void;
  onRoomsChange: () => void;
  onCloseRoom: (roomId: string) => void;
  onLogout: () => void;
  t: (key: string) => string;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  getPrivateRoomName: (room: Room) => string;
}

const avatarColors = [
  '#3b82f6', '#6366f1', '#8b5cf6', '#06b6d4', '#14b8a6',
  '#22c55e', '#f97316', '#ef4444', '#ec4899', '#6d28d9',
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

function getInitials(name: string) {
  return name.charAt(0).toUpperCase();
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export default function Sidebar({
  user,
  rooms,
  roomsLoading,
  unreadByRoom,
  activeRoomId,
  onlineUsers,
  onSelectRoom,
  onRoomsChange,
  onCloseRoom,
  onLogout,
  t,
  locale,
  setLocale,
  getPrivateRoomName,
}: SidebarProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [users, setUsers] = useState<{ id: string; username: string; displayName: string | null }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const brandLogoSrc = '/favicon.ico';
  const filteredRooms = rooms.filter((room) =>
    getPrivateRoomName(room).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const searchUsers = async (query: string) => {
    setLoadingUsers(true);
    try {
      const res = await fetch(`/api/users?search=${encodeURIComponent(query)}`);
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      console.error('Failed to search users');
    }
    setLoadingUsers(false);
  };

  const startPrivateChat = async (targetUserId: string) => {
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'PRIVATE', memberIds: [targetUserId] }),
      });
      const data = await res.json();
      if (data.room) {
        onRoomsChange();
        onSelectRoom(data.room.id);
        setShowNewChat(false);
      }
    } catch {
      console.error('Failed to create private chat');
    }
  };

  return (
    <div className="sidebar-root">
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-brand-row">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Image
              src={brandLogoSrc}
              alt={t('app.name')}
              width={110}
              height={30}
              unoptimized
              style={{ width: 98, height: 'auto', objectFit: 'contain' }}
            />
          </div>
          <div className="lang-toggle">
            <button className={locale === 'fa' ? 'active' : ''} onClick={() => setLocale('fa')}>FA</button>
            <button className={locale === 'en' ? 'active' : ''} onClick={() => setLocale('en')}>EN</button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="sidebar-search-wrap">
        <input
          className="input"
          placeholder={t('chat.searchMessages')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ borderRadius: 'var(--radius-full)', paddingInline: 14 }}
        />
      </div>

      {/* New Chat Button */}
      <div style={{ padding: '0 14px 8px' }}>
        <motion.button
          className="btn btn-primary"
          style={{ width: '100%' }}
          onClick={() => {
            setShowNewChat(!showNewChat);
            if (!showNewChat) searchUsers('');
          }}
          whileTap={{ scale: 0.97 }}
          whileHover={{ scale: 1.01 }}
        >
          <AnimatePresence mode="wait">
            <motion.span
              key={showNewChat ? 'close' : 'new'}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
            >
              {showNewChat ? t('common.close') : t('chat.newChat')}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </div>

      {/* New Chat Modal */}
      <AnimatePresence>
        {showNewChat && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              padding: '0 14px 12px',
              borderBottom: '1px solid var(--stroke-soft)',
            }}>
              <input
                className="input"
                placeholder={t('chat.searchUsers')}
                onChange={(e) => searchUsers(e.target.value)}
                style={{ marginBottom: 8, borderRadius: 'var(--radius-sm)' }}
                autoFocus
              />
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {loadingUsers ? (
                  <div style={{ textAlign: 'center', padding: 12 }}>
                    <div className="spinner" style={{ width: 20, height: 20, margin: '0 auto' }} />
                  </div>
                ) : users.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--fg-muted)', textAlign: 'center', padding: 12 }}>
                    {t('common.noResults')}
                  </p>
                ) : (
                  <motion.div variants={staggerContainer} initial="hidden" animate="visible">
                    {users.map((u) => (
                      <motion.div
                        key={u.id}
                        variants={staggerItem}
                        onClick={() => startPrivateChat(u.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer', transition: 'background 0.15s',
                        }}
                        whileHover={{ backgroundColor: 'var(--bg-hover)' }}
                      >
                        <div
                          className="avatar avatar-sm"
                          style={{ background: getAvatarColor(u.username) }}
                        >
                          {getInitials(u.displayName || u.username)}
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500 }}>{u.displayName || u.username}</div>
                          <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>@{u.username}</div>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Room List */}
      <div className="sidebar-rooms">
        {roomsLoading ? (
          Array.from({ length: 7 }).map((_, index) => (
            <div key={`room-skeleton-${index}`} className="sidebar-room" style={{ pointerEvents: 'none', opacity: 0.5 }}>
              <div className="avatar" style={{ background: 'var(--bg-tertiary)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ height: 11, width: `${62 + ((index * 7) % 20)}%`, borderRadius: 9999, background: 'var(--bg-tertiary)' }} />
                <div style={{ marginTop: 8, height: 9, width: `${45 + ((index * 11) % 30)}%`, borderRadius: 9999, background: 'var(--bg-hover)' }} />
              </div>
            </div>
          ))
        ) : filteredRooms.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--fg-muted)', fontSize: 14 }}>
            {t('chat.noRooms')}
          </div>
        ) : (
          <motion.div variants={staggerContainer} initial="hidden" animate="visible">
            {filteredRooms.map((room) => {
              const roomName = getPrivateRoomName(room);
              const lastMsg = room.messages[0];
              const isActive = room.id === activeRoomId;
              const unreadCount = unreadByRoom[room.id] || 0;
              const isEncryptedPreview = typeof lastMsg?.text === 'string' && lastMsg.text.startsWith('hush:v1:');
              const lastPreviewText = isEncryptedPreview ? 'Encrypted message' : (lastMsg?.text || t('chat.attachFile'));

              const otherMember = room.type === 'PRIVATE'
                ? room.members.find((m) => m.user.id !== user.id)
                : null;
              const isOnline = otherMember ? onlineUsers.has(otherMember.user.id) : false;

              const typeIconName = room.type === 'CHANNEL' ? 'channel' : room.type === 'GROUP' ? 'group' : null;

              return (
                <motion.div
                  key={room.id}
                  variants={staggerItem}
                  onClick={() => onSelectRoom(room.id)}
                  className={`sidebar-room${isActive ? ' active' : ''}`}
                  whileHover={{ backgroundColor: isActive ? undefined : 'var(--bg-hover)' }}
                >
                  <div style={{ position: 'relative' }}>
                    {room.profilePhotoUrl ? (
                      <Image
                        src={room.profilePhotoUrl}
                        alt={roomName}
                        className="avatar"
                        width={48}
                        height={48}
                        unoptimized
                        style={{ objectFit: 'cover' }}
                      />
                    ) : (
                      <div
                        className="avatar"
                        style={{ background: getAvatarColor(roomName) }}
                      >
                        {typeIconName ? <AppIcon name={typeIconName} size={20} /> : getInitials(roomName)}
                      </div>
                    )}
                    {room.type === 'PRIVATE' && (
                      <div style={{
                        position: 'absolute', bottom: 0, insetInlineEnd: 0,
                        width: 12, height: 12, borderRadius: '50%',
                        background: isOnline ? 'var(--online)' : 'var(--offline)',
                        border: '2px solid var(--bg-secondary)',
                      }} />
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span style={{ fontWeight: unreadCount > 0 ? 700 : 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: unreadCount > 0 ? 'var(--fg)' : undefined }}>
                        {roomName}
                      </span>
                      {lastMsg && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
                            {timeAgo(lastMsg.createdAt)}
                          </span>
                          {unreadCount > 0 && (
                            <motion.span
                              className="badge-count"
                              style={{ minWidth: 18, height: 18, fontSize: 10, paddingInline: 5 }}
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={spring}
                            >
                              {unreadCount > 99 ? '99+' : unreadCount}
                            </motion.span>
                          )}
                        </span>
                      )}
                    </div>
                    {lastMsg && (
                      <div style={{
                        fontSize: 13, color: unreadCount > 0 ? 'var(--fg-secondary)' : 'var(--fg-muted)',
                        fontWeight: unreadCount > 0 ? 500 : 400,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        marginTop: 2,
                      }}>
                        {room.type !== 'PRIVATE' && (
                          <span style={{ color: 'var(--fg-secondary)' }}>{lastMsg.user.username}: </span>
                        )}
                        {lastPreviewText}
                      </div>
                    )}
                  </div>
                  {/* Close button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(t('chat.closeRoomConfirm') || 'Close this chat?')) {
                        onCloseRoom(room.id);
                      }
                    }}
                    className="btn btn-ghost btn-icon btn-sm"
                    style={{
                      position: 'absolute',
                      top: 4,
                      insetInlineEnd: 4,
                      width: 24,
                      height: 24,
                      opacity: 0,
                      transition: 'opacity 0.15s',
                      zIndex: 2,
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}
                  >
                    <AppIcon name="close" size={12} />
                  </button>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      {/* User Info Footer */}
      <div className="sidebar-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
          onClick={() => router.push('/profile')}
          title="Profile Settings"
        >
          <motion.div
            className="avatar avatar-sm"
            style={{
              background: user.avatarUrl ? 'transparent' : getAvatarColor(user.username),
            }}
            whileHover={{ scale: 1.1 }}
            transition={spring}
          >
            {user.avatarUrl ? (
              <Image
                src={user.avatarUrl}
                alt="Avatar"
                width={40}
                height={40}
                unoptimized
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              getInitials(user.displayName || user.username)
            )}
          </motion.div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{user.displayName || user.username}</div>
            {user.isSuperAdmin && (
              <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>SUPER ADMIN</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <a href="/settings" className="btn btn-ghost btn-icon btn-sm" title={t('settings.title')}>
            <AppIcon name="paint" size={16} />
          </a>
          {user.isSuperAdmin && (
            <a href="/admin" className="btn btn-ghost btn-icon btn-sm" title={t('admin.panel')}>
              <AppIcon name="settings" size={16} />
            </a>
          )}
          <motion.button className="btn btn-ghost btn-icon btn-sm" onClick={onLogout} title={t('auth.logout')} whileTap={{ scale: 0.9 }}>
            <AppIcon name="logout" size={16} />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
