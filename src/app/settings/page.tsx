'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { useI18n } from '@/components/providers/I18nProvider';
import Image from 'next/image';
import AppIcon from '@/components/AppIcon';
import { motion, AnimatePresence } from 'motion/react';
import { compressAvatar } from '@/lib/imageCompression';
import { staggerContainer, staggerItem, fadeSlideUp, spring } from '@/lib/animations';

function getUploadExtensionByMime(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'image/gif': return 'gif';
    case 'image/webp': return 'webp';
    default: return 'bin';
  }
}

// Toggle switch component
function Toggle({
  checked,
  onChange,
  disabled,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
  description?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 0', cursor: disabled ? 'default' : 'pointer' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>{description}</div>}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) onChange(!checked);
        }}
        disabled={disabled}
        style={{
          width: 44,
          height: 24,
          borderRadius: 12,
          background: checked ? 'var(--accent)' : 'var(--bg-tertiary)',
          border: 'none',
          cursor: disabled ? 'default' : 'pointer',
          position: 'relative',
          transition: 'background 0.2s ease',
        }}
      >
      <div style={{
        position: 'absolute',
        top: 2,
        left: checked ? 22 : 2,
        width: 20,
        height: 20,
        borderRadius: '50%',
        background: 'white',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        transition: 'left 0.2s ease',
        zIndex: 2,
      }} />
      </button>
    </div>
  );
}

// Section divider
function Section({ title, icon }: { title: string; icon: any }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '16px 16px 8px',
      borderBottom: '1px solid var(--stroke-soft)',
    }}>
      <AppIcon name={icon as any} size={16} style={{ color: 'var(--accent)' }} />
      <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-secondary)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
        {title}
      </h2>
    </div>
  );
}

// Select dropdown
function Select({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 13, color: 'var(--fg-secondary)', display: 'block', marginBottom: 6 }}>{label}</label>
      <select
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--stroke)', color: 'var(--fg)', fontSize: 14 }}
      >
        {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    </div>
  );
}

// Color picker with preset options
function ColorPicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const presets = ['#3b82f6', '#6366f1', '#8b5cf6', '#06b6d4', '#14b8a6', '#22c55e', '#f97316', '#ef4444'];
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 13, color: 'var(--fg-secondary)', display: 'block', marginBottom: 8 }}>{label}</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {presets.map((color) => (
          <motion.button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            whileTap={{ scale: 0.9 }}
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: color,
              border: value === color ? '2px solid white' : '1px solid var(--stroke)',
              cursor: 'pointer',
              boxShadow: value === color ? '0 0 0 2px var(--bg)' : 'none',
            }}
          />
        ))}
      </div>
    </div>
  );
}

// Time picker (simple HH:MM input)
function TimeInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 13, color: 'var(--fg-secondary)', display: 'block', marginBottom: 6 }}>{label}</label>
      <input
        type="time"
        className="input"
        value={value || '22:00'}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--stroke)', color: 'var(--fg)', fontSize: 14 }}
      />
    </div>
  );
}

const fontSizeOptions = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
];

const bubbleStyleOptions = [
  { value: 'rounded', label: 'Rounded' },
  { value: 'sharp', label: 'Sharp' },
  { value: 'cloud', label: 'Cloud' },
];

const imageQualityOptions = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const lastSeenOptions = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'contacts', label: 'Contacts only' },
  { value: 'none', label: 'Nobody' },
];

const screenLockOptions = [
  { value: 'off', label: 'Off' },
  { value: 'biometric', label: 'Fingerprint/Face ID' },
  { value: 'pin', label: 'PIN code' },
];

export default function SettingsPage() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const { t, dir, locale } = useI18n();

  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState('notifications');

  // Profile section state
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setBio(user.bio || '');
      setAvatarUrl(user.avatarUrl || '');
    }
  }, [user]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.settings) {
        setSettings(data.settings);
      } else {
        // Defaults
        setSettings({
          notifications: true,
          sound: true,
          preview: true,
          quietHoursEnabled: false,
          quietHoursStart: '22:00',
          quietHoursEnd: '08:00',
          theme: 'dark',
          accentColor: '#3b82f6',
          fontSize: 'medium',
          bubbleStyle: 'rounded',
          readReceipts: true,
          lastSeen: 'everyone',
          screenLock: 'off',
          autoDownload: true,
          autoDownloadWiFi: true,
          imageQuality: 'medium',
          enterToSend: false,
          chatBackup: false,
        });
      }
    } catch (e) {
      console.error('Failed to load settings:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const updateSetting = (key: string, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
    } catch (e) {
      console.error('Save error:', e);
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async () => {
    try {
      await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, bio, avatarUrl }),
      });
      await refreshUser();
    } catch (e) {
      console.error('Profile save error:', e);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    setUploading(true);
    try {
      const compressed = await compressAvatar(file);
      const formData = new FormData();
      const ext = getUploadExtensionByMime(compressed.type || file.type);
      const uploadName = `avatar-${Date.now()}.${ext}`;
      formData.append('file', compressed, uploadName);

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.fileUrl) {
        setAvatarUrl(data.fileUrl);
        await saveProfile();
      }
    } catch (e) {
      console.error('Upload error:', e);
    } finally {
      setUploading(false);
    }
  };

  if (!user || loading) return null;

  const sections: { id: string; label: string; icon: string }[] = [
    { id: 'profile', label: t('settings.profile'), icon: 'user' },
    { id: 'notifications', label: t('settings.notifications'), icon: 'bell' },
    { id: 'appearance', label: t('settings.appearance'), icon: 'paint' },
    { id: 'privacy', label: t('settings.privacy'), icon: 'shield' },
    { id: 'chat', label: t('settings.chat'), icon: 'chat' },
    { id: 'data', label: t('settings.dataStorage'), icon: 'storage' },
    { id: 'devices', label: t('settings.devices'), icon: 'device' },
    { id: 'about', label: t('settings.about'), icon: 'info' },
  ];

  const renderSectionContent = () => {
    switch (activeSection) {
      case 'notifications':
        return (
          <AnimatePresence>
            <motion.div
              key="notifications"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              <motion.div variants={staggerItem}>
                <Toggle
                  checked={settings.notifications}
                  onChange={(v) => updateSetting('notifications', v)}
                  label={t('settings.notificationsEnabled') || 'Enable notifications'}
                />
              </motion.div>
              <motion.div variants={staggerItem}>
                <Toggle
                  checked={settings.sound}
                  onChange={(v) => updateSetting('sound', v)}
                  label={t('settings.notificationSound') || 'Notification sound'}
                />
              </motion.div>
              <motion.div variants={staggerItem}>
                <Toggle
                  checked={settings.preview}
                  onChange={(v) => updateSetting('preview', v)}
                  label={t('settings.showMessagePreview') || 'Show message preview'}
                />
              </motion.div>
              <motion.div variants={staggerItem}>
                <Toggle
                  checked={settings.quietHoursEnabled}
                  onChange={(v) => updateSetting('quietHoursEnabled', v)}
                  label={t('settings.quietHours') || 'Quiet hours'}
                  description={t('settings.quietHoursDesc') || "Don't disturb during selected hours"}
                />
              </motion.div>
              {settings.quietHoursEnabled && (
                <>
                  <motion.div variants={staggerItem}>
                    <TimeInput
                      value={settings.quietHoursStart}
                      onChange={(v) => updateSetting('quietHoursStart', v)}
                      label={t('settings.startTime') || 'Start time'}
                    />
                  </motion.div>
                  <motion.div variants={staggerItem}>
                    <TimeInput
                      value={settings.quietHoursEnd}
                      onChange={(v) => updateSetting('quietHoursEnd', v)}
                      label={t('settings.endTime') || 'End time'}
                    />
                  </motion.div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        );

      case 'appearance':
        return (
          <AnimatePresence>
            <motion.div
              key="appearance"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              <motion.div variants={staggerItem}>
                <Select
                  value={settings.theme || 'dark'}
                  onChange={(v) => updateSetting('theme', v)}
                  options={[
                    { value: 'dark', label: t('settings.darkTheme') || 'Dark' },
                    { value: 'light', label: t('settings.lightTheme') || 'Light' },
                    { value: 'auto', label: t('settings.autoTheme') || 'Auto' },
                  ]}
                  label={t('settings.appearance') || 'Theme'}
                />
              </motion.div>
              <motion.div variants={staggerItem}>
                <ColorPicker
                  value={settings.accentColor || '#3b82f6'}
                  onChange={(v) => updateSetting('accentColor', v)}
                  label={t('settings.accentColor') || 'Accent color'}
                />
              </motion.div>
              <motion.div variants={staggerItem}>
                <Select
                  value={settings.fontSize || 'medium'}
                  onChange={(v) => updateSetting('fontSize', v)}
                  options={fontSizeOptions}
                  label={t('settings.fontSize') || 'Font size'}
                />
              </motion.div>
              <motion.div variants={staggerItem}>
                <Select
                  value={settings.bubbleStyle || 'rounded'}
                  onChange={(v) => updateSetting('bubbleStyle', v)}
                  options={bubbleStyleOptions}
                  label={t('settings.bubbleStyle') || 'Bubble style'}
                />
              </motion.div>
            </motion.div>
          </AnimatePresence>
        );

      case 'privacy':
        return (
          <AnimatePresence>
            <motion.div
              key="privacy"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              <motion.div variants={staggerItem}>
                <Toggle
                  checked={settings.readReceipts}
                  onChange={(v) => updateSetting('readReceipts', v)}
                  label={t('settings.readReceipts') || 'Read receipts'}
                  description={t('settings.readReceiptsDesc') || 'See when your messages are read'}
                />
              </motion.div>
              <motion.div variants={staggerItem}>
                <Select
                  value={settings.lastSeen || 'everyone'}
                  onChange={(v) => updateSetting('lastSeen', v)}
                  options={lastSeenOptions}
                  label={t('settings.lastSeen') || 'Last seen'}
                />
              </motion.div>
              <motion.div variants={staggerItem}>
                <Select
                  value={settings.screenLock || 'off'}
                  onChange={(v) => updateSetting('screenLock', v)}
                  options={screenLockOptions}
                  label={t('settings.screenLock') || 'Screen lock'}
                />
              </motion.div>
            </motion.div>
          </AnimatePresence>
        );

      case 'chat':
        return (
          <AnimatePresence>
            <motion.div
              key="chat"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              <motion.div variants={staggerItem}>
                <Toggle
                  checked={settings.enterToSend}
                  onChange={(v) => updateSetting('enterToSend', v)}
                  label={t('settings.enterToSend') || 'Enter to send'}
                />
              </motion.div>
              <motion.div variants={staggerItem}>
                <Select
                  value={settings.imageQuality || 'medium'}
                  onChange={(v) => updateSetting('imageQuality', v)}
                  options={imageQualityOptions}
                  label={t('settings.imageQuality') || 'Image quality'}
                />
              </motion.div>
            </motion.div>
          </AnimatePresence>
        );

      case 'data':
        return (
          <AnimatePresence>
            <motion.div
              key="data"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              <motion.div variants={staggerItem}>
                <Toggle
                  checked={settings.autoDownload}
                  onChange={(v) => updateSetting('autoDownload', v)}
                  label={t('settings.autoDownload') || 'Auto-download media'}
                />
              </motion.div>
              {settings.autoDownload && (
                <motion.div variants={staggerItem}>
                  <Toggle
                    checked={settings.autoDownloadWiFi}
                    onChange={(v) => updateSetting('autoDownloadWiFi', v)}
                    label={t('settings.autoDownloadWiFi') || 'On WiFi'}
                  />
                </motion.div>
              )}
              <motion.div variants={staggerItem}>
                <Toggle
                  checked={settings.chatBackup}
                  onChange={(v) => updateSetting('chatBackup', v)}
                  label={t('settings.chatBackup') || 'Chat backup'}
                  description={t('settings.chatBackupDesc') || 'Automatically save messages and media'}
                />
              </motion.div>
              <motion.div variants={staggerItem}>
                <Toggle
                  checked={false}
                  onChange={() => {}}
                  label={t('settings.clearCache') || 'Clear cache'}
                  description={t('settings.clearCacheDesc') || 'Clear locally stored data on this device'}
                />
              </motion.div>
            </motion.div>
          </AnimatePresence>
        );

      case 'devices':
        return (
          <AnimatePresence>
            <motion.div
              key="devices"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              <motion.div
                variants={staggerItem}
                style={{ padding: '16px 0', borderBottom: '1px solid var(--stroke-soft)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--bg-tertiary)', display: 'grid', placeItems: 'center' }}>
                    <AppIcon name="device" size={20} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>Windows PC</div>
                    <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Active now</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger, #ef4444)' }}>
                    <AppIcon name="logout" size={14} />
                  </button>
                </div>
              </motion.div>
            </motion.div>
          </AnimatePresence>
        );

      case 'about':
        return (
          <AnimatePresence>
            <motion.div
              key="about"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              <motion.div
                variants={staggerItem}
                style={{ textAlign: 'center', padding: '24px 0' }}
              >
                <div className="avatar" style={{ width: 80, height: 80, fontSize: 32, margin: '0 auto 16px', background: 'var(--accent)' }}>
                  🌶️
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{t('settings.appName') || 'FelFel Chat'}</h3>
                <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginBottom: 16 }}>{t('settings.aboutDesc') || 'A secure and lightweight messaging app'}</p>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap', fontSize: 12, color: 'var(--fg-muted)' }}>
                  <span>v1.1.1</span>
                  <span>•</span>
                  <span>Made with ❤️ by ZethRise</span>
                </div>
              </motion.div>
              <motion.a
                variants={staggerItem}
                href="https://git.diastom.xyz/ZethRise/FelFelChat"
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', color: 'var(--fg)', borderBottom: '1px solid var(--stroke-soft)' }}
              >
                <AppIcon name="info" size={18} />
                <span>Source Code</span>
              </motion.a>
              <motion.a
                variants={staggerItem}
                href="https://www.npmjs.com/package/@zethrise/felfelchat"
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', color: 'var(--fg)', borderBottom: '1px solid var(--stroke-soft)' }}
              >
                <AppIcon name="download" size={18} />
                <span>npm: @zethrise/felfelchat</span>
              </motion.a>
              <motion.a
                variants={staggerItem}
                href="https://git.diastom.xyz/ZethRise/FelFelChat/-/issues"
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', color: 'var(--fg)', borderBottom: '1px solid var(--stroke-soft)' }}
              >
                <AppIcon name="help" size={18} />
                <span>{t('settings.rateApp') || 'Report Issue'}</span>
              </motion.a>
              <motion.a
                variants={staggerItem}
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', color: 'var(--fg)' }}
              >
                <AppIcon name="privacy" size={18} />
                <span>{t('settings.privacyPolicy') || 'Privacy Policy'}</span>
              </motion.a>
            </motion.div>
          </AnimatePresence>
        );

      default:
        return null;
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', direction: dir, fontFamily: 'var(--font-estedad)' }}>
      {/* Header */}
      <motion.div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--stroke-soft)',
          background: 'var(--bg-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
      >
        <button className="btn btn-ghost btn-sm" onClick={() => router.push('/')}>
          <AppIcon name="arrowLeft" size={14} />
          <span>{t('common.back')}</span>
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>{t('settings.title')}</h1>
      </motion.div>

      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
        {/* Mobile section tabs — horizontal scroll */}
        <div className="settings-mobile-tabs">
          {sections.map((section) => (
            <button
              key={section.id}
              className={`settings-mobile-tab${activeSection === section.id ? ' active' : ''}`}
              onClick={() => setActiveSection(section.id as any)}
            >
              <AppIcon name={section.icon as any} size={16} />
              <span>{section.label}</span>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar nav - hidden on mobile */}
        <motion.div
          className="settings-sidebar-nav"
          style={{
            width: 260,
            borderInlineEnd: '1px solid var(--stroke-soft)',
            background: 'var(--bg-secondary)',
            padding: '12px 0',
            overflowY: 'auto',
          }}
          initial={{ opacity: 0, x: dir === 'rtl' ? 20 : -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={spring}
        >
          {sections.map((section) => (
            <motion.button
              key={section.id}
              className="btn btn-ghost"
              style={{
                width: '100%',
                justifyContent: 'flex-start',
                gap: 12,
                padding: '12px 16px',
                borderRadius: 0,
                fontWeight: activeSection === section.id ? 600 : 500,
                color: activeSection === section.id ? 'var(--accent)' : 'var(--fg)',
                background: activeSection === section.id ? 'rgba(59,130,246,0.1)' : 'transparent',
                borderLeft: activeSection === section.id ? '2px solid var(--accent)' : '2px solid transparent',
              }}
              onClick={() => setActiveSection(section.id as any)}
              whileTap={{ backgroundColor: 'var(--bg-hover)' }}
            >
              <AppIcon name={section.icon as any} size={18} />
              <span>{section.label}</span>
            </motion.button>
          ))}
        </motion.div>

        {/* Main content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, maxWidth: 600, margin: '0 auto' }}>
          {activeSection === 'profile' && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Avatar */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <motion.div
                  className="avatar"
                  style={{
                    width: 120,
                    height: 120,
                    fontSize: 48,
                    background: avatarUrl ? 'transparent' : 'var(--accent)',
                  }}
                  whileHover={{ scale: 1.05 }}
                  transition={spring}
                >
                  {avatarUrl ? (
                    <Image
                      src={avatarUrl}
                      alt="Avatar"
                      width={120}
                      height={120}
                      unoptimized
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                    />
                  ) : (
                    (displayName || user.username).charAt(0).toUpperCase()
                  )}
                </motion.div>
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleAvatarUpload(file);
                    e.target.value = '';
                  }}
                />
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => document.querySelector<HTMLInputElement>('input[type=file]')?.click()}
                  disabled={uploading}
                >
                  {uploading ? 'Uploading...' : (<><AppIcon name="camera" size={15} /> <span>Change Avatar</span></>)}
                </button>
              </div>

              <div>
                <label style={{ fontSize: 13, color: 'var(--fg-secondary)', display: 'block', marginBottom: 4 }}>{t('auth.displayName')}</label>
                <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t('auth.displayNamePlaceholder')} />
              </div>

              <div>
                <label style={{ fontSize: 13, color: 'var(--fg-secondary)', display: 'block', marginBottom: 4 }}>{t('profile.bio')}</label>
                <textarea
                  className="input"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell us about yourself..."
                  rows={3}
                  style={{ fontFamily: 'inherit' }}
                />
              </div>

              <button className="btn btn-primary" onClick={saveProfile}>
                <AppIcon name="save" size={16} />
                <span>{t('common.save')}</span>
              </button>
            </div>
          )}

          {activeSection !== 'profile' && (
            <>
              {renderSectionContent()}
              <motion.div
                style={{ padding: '16px 0', borderTop: '1px solid var(--stroke-soft)', marginTop: 8 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                <button
                  className="btn btn-primary"
                  onClick={saveSettings}
                  disabled={saving}
                  style={{ width: '100%' }}
                >
                  {saving ? 'Saving...' : (<><AppIcon name="save" size={16} /> <span>{t('common.save')}</span></>)}
                </button>
              </motion.div>
            </>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
