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
  isMobile?: boolean;
  onOpenNav?: () => void;
  activeFolder?: 'all' | 'private' | 'group';
  onFolderChange?: (folder: 'all' | 'private' | 'group') => void;
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
  isMobile,
  onOpenNav,
  activeFolder,
  onFolderChange,
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
          {isMobile && onOpenNav && (
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={onOpenNav}
              aria-label="Open menu"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
          )}
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

      {/* Folder Tabs (mobile only) */}
      {isMobile && onFolderChange && (
        <div className="mobile-folder-tabs">
          <button
            className={`mobile-folder-tab${activeFolder === 'all' ? ' active' : ''}`}
            onClick={() => onFolderChange('all')}
          >
            {t('chat.allChats') || 'All Chats'}
          </button>
          <button
            className={`mobile-folder-tab${activeFolder === 'private' ? ' active' : ''}`}
            onClick={() => onFolderChange('private')}
          >
            {t('chat.private') || 'Personal'}
          </button>
          <button
            className={`mobile-folder-tab${activeFolder === 'group' ? ' active' : ''}`}
            onClick={() => onFolderChange('group')}
          >
            {t('chat.groups') || 'Groups'}
          </button>
        </div>
      )}

      {/* Search + New Chat (compact on mobile, row on desktop) */}
      <div style={{ padding: isMobile ? '0 12px 16px' : '0 14px 8px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <input
              className="input"
              placeholder={t('chat.searchMessages')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ borderRadius: 'var(--radius-full)', paddingInline: 14 }}
            />
          </div>
          <motion.button
            type="button"
            className="btn btn-primary btn-icon"
            style={{ width: isMobile ? 44 : 'auto', height: 44 }}
            onClick={() => {
              setShowNewChat(!showNewChat);
              if (!showNewChat) searchUsers('');
            }}
            whileTap={{ scale: 0.93 }}
            whileHover={isMobile ? undefined : { scale: 1.01 }}
            title={t('chat.newChat')}
          >
            <AppIcon name={showNewChat ? 'close' : 'newchat'} size={isMobile ? 20 : 16} />
          </motion.button>
        </div>
      </div>

      {/* New Chat Modal */}

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
            <div key={`room-skeleton-${index}`} className="sidebar-room" style={{ pointerEvents: 'none', opacity: 0.5, padding: isMobile ? '12px 16px' : '10px 12px', gap: isMobile ? 12 : 10 }}>
              <div className="avatar" style={{ width: isMobile ? 48 : 40, height: isMobile ? 48 : 40, background: 'var(--bg-tertiary)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ height: 12, width: `${62 + ((index * 7) % 20)}%`, borderRadius: 9999, background: 'var(--bg-tertiary)' }} />
                <div style={{ marginTop: 6, height: 10, width: `${45 + ((index * 11) % 30)}%`, borderRadius: 9999, background: 'var(--bg-hover)' }} />
              </div>
            </div>
          ))
        ) : filteredRooms.length === 0 ? (
          <div style={{ textAlign: 'center', padding: isMobile ? '40px 16px' : '40px 16px', color: 'var(--fg-muted)', fontSize: isMobile ? 14 : 13 }}>
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
              const avatarSize = isMobile ? 48 : 40;

              return (
                <motion.div
                  key={room.id}
                  layout
                  layoutId={room.id}
                  variants={staggerItem}
                  onClick={() => onSelectRoom(room.id)}
                  className={`sidebar-room${isActive ? ' active' : ''}`}
                  style={{
                    padding: isMobile ? '12px 16px' : '10px 12px',
                    gap: isMobile ? 12 : 10,
                  }}
                >
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    {room.profilePhotoUrl ? (
                      <Image
                        src={room.profilePhotoUrl}
                        alt={roomName}
                        unoptimized
                        style={{
                          width: avatarSize, height: avatarSize,
                          borderRadius: '50%', objectFit: 'cover',
                        }}
                      />
                    ) : (
                      <div
                        className="avatar"
                        style={{
                          width: avatarSize, height: avatarSize,
                          background: getAvatarColor(roomName),
                          fontSize: isMobile ? 18 : 15,
                        }}
                      >
                        {typeIconName ? <AppIcon name={typeIconName} size={isMobile ? 22 : 20} /> : getInitials(roomName)}
                      </div>
                    )}
                    {room.type === 'PRIVATE' && (
                      <div style={{
                        position: 'absolute', bottom: 0, insetInlineEnd: 0,
                        width: isMobile ? 14 : 12, height: isMobile ? 14 : 12, borderRadius: '50%',
                        background: isOnline ? 'var(--online)' : 'var(--offline)',
                        border: `${isMobile ? 2 : 2}px solid var(--bg-secondary)`,
                      }} />
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span style={{
                        fontWeight: unreadCount > 0 ? 700 : 600,
                        fontSize: isMobile ? 15 : 14,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        color: unreadCount > 0 ? 'var(--fg)' : 'var(--fg-secondary)',
                        maxWidth: 'calc(100% - 60px)',
                      }}>
                        {roomName}
                      </span>
                      {lastMsg && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <span style={{ fontSize: isMobile ? 12 : 11, color: 'var(--fg-muted)' }}>
                            {timeAgo(lastMsg.createdAt)}
                          </span>
                          {unreadCount > 0 && (
                            <motion.span
                              className="badge-count"
                              style={{
                                minWidth: isMobile ? 20 : 18, height: isMobile ? 20 : 18,
                                fontSize: isMobile ? 11 : 10, paddingInline: isMobile ? 6 : 5,
                              }}
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
                        fontSize: isMobile ? 13 : 12,
                        color: unreadCount > 0 ? 'var(--fg-secondary)' : 'var(--fg-muted)',
                        fontWeight: unreadCount > 0 ? 500 : 400,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        marginTop: 2,
                        maxWidth: 'calc(100% - 40px)',
                      }}>
                        {room.type !== 'PRIVATE' && (
                          <span style={{ color: 'var(--fg-muted)' }}>{lastMsg.user.username}: </span>
                        )}
                        {lastPreviewText}
                      </div>
                    )}
                  </div>
                  {/* Close button — desktop only */}
                  {!isMobile && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseRoom(room.id);
                      }}
                      className="btn btn-ghost btn-icon btn-sm"
                      style={{
                        width: 28, height: 28, flexShrink: 0,
                        opacity: 0.4,
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                      onMouseLeave={(e) => e.currentTarget.style.opacity = '0.4'}
                    >
                      <AppIcon name="close" size={14} />
                    </button>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      {/* User Info Footer — desktop only */}
      {!isMobile && (
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
      )}
    </div>
  );
}
