'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
interface EmojiStickerPickerProps {
  onEmojiSelect: (emoji: string) => void;
 onStickerSelect: (stickerId: string, stickerUrl: string) => void;
  onGifSelect: (gifId: string, gifUrl: string, format: string) => void;
  onClose: () => void;
  dir: 'rtl' | 'ltr';
  t: (key: string) => string;
}

interface Sticker {
  id: string;
  fileUrl: string;
  fileName: string;
}

interface Gif {
  id: string;
  fileUrl: string;
  fileName: string;
  format: string;
}

type Tab = 'emoji' | 'stickers' | 'gifs';

// Comprehensive emoji list organized by categories
const COMMON_EMOJIS = [
  // Faces & Emotions
  '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂',
  '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩',
  '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪',
  '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨',
  '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥',
  '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕',
  '🤢', '🤮', '🤧', '🥵', '🥶', '😎', '🤓', '🧐',
  '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳',
  '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭',
  '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱',
  '😤', '😡', '😠', '🤬', '💀', '☠️', '💩', '🤡',
  
  // Gestures & People
  '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤏', '✌️',
  '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇',
  '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏',
  '🙌', '👐', '🤲', '🤝', '🙏', '💪', '🦾', '🦿',
  
  // Animals & Nature
  '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼',
  '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔',
  '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺',
  '🌸', '🌺', '🌻', '🌹', '🌷', '🌼', '🌱', '🌿',
  '🍀', '🌾', '🌵', '🌴', '🌳', '🌲', '⭐', '🌟',
  '✨', '💫', '☀️', '🌙', '⛅', '🌈', '🔥', '💧',
  
  // Food & Drink
  '🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍑',
  '🍒', '🍍', '🥝', '🥥', '🍅', '🍆', '🥑', '🥦',
  '🥬', '🥒', '🌶️', '🌽', '🥕', '🍞', '🥐', '🥖',
  '🥨', '🥯', '🧀', '🍖', '🍗', '🥩', '🥓', '🍔',
  '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🥙', '🧆',
  '🍿', '🧂', '🥗', '🍜', '🍝', '🍛', '🍣', '🍱',
  '🥟', '🍦', '🍧', '🍰', '🎂', '🧁', '🍮', '🍭',
  '🍬', '🍫', '🍩', '🍪', '☕', '🍵', '🧃', '🥤',
  '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧊',
  
  // Activities & Objects
  '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉',
  '🥏', '🎱', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏',
  '🎮', '🕹️', '🎲', '🎯', '🎳', '🎨', '🎭', '🎪',
  '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🎷', '🎺',
  '🎸', '🎻', '🏆', '🥇', '🥈', '🥉', '🏅',
  '🎖️', '🎗️', '🏵️', '🎫', '🎟️',
  
  // Travel & Places  
  '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑',
  '🚒', '🚐', '🚚', '🚛', '🚜', '🛴', '🚲', '🛵',
  '🏍️', '✈️', '🚁', '🚂', '🚊', '🚝', '🚄', '🚅',
  '🚆', '🚇', '🚈', '🚉', '🚞', '🚋', '🚃', '🚟',
  '🚠', '🚡', '🛰️', '🚀', '🛸', '🚢', '⛵', '🛥️',
  '⛴️', '🏠', '🏡', '🏘️', '🏚️', '🏗️', '🏭', '🏢',
  '🏬', '🏣', '🏤', '🏥', '🏦', '🏨', '🏪', '🏫',
  
  // Symbols
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
  '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖',
  '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️',
  '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈',
  '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐',
  '♑', '♒', '♓', '🆔', '⚛️', '🈵', '✅', '☑️',
  '✔️', '✖️', '❌', '❎', '➕', '➖', '➗', '➰',
  '➿', '〽️', '✳️', '✴️', '❇️', '‼️', '⁉️', '❓',
  '❔', '❕', '❗', '〰️', '©️', '®️', '™️', '💯',
  '🔠', '🔡', '🔢', '🔣', '🔤', '🅰️', '🆎', '🅱️',
];

export default function EmojiStickerPicker({
  onEmojiSelect,
  onStickerSelect,
  onGifSelect,
  onClose,
  dir,
  t,
}: EmojiStickerPickerProps) {
  const [activeTab, setActiveTab] = useState<Tab>('emoji');
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [loadingStickers, setLoadingStickers] = useState(false);
  const [loadingGifs, setLoadingGifs] = useState(false);

  const fetchStickers = async () => {
    setLoadingStickers(true);
    try {
      const res = await fetch('/api/stickers');
      const data = await res.json();
      if (data.stickers) {
        setStickers(data.stickers);
      }
    } catch (error) {
      console.error('Failed to fetch stickers:', error);
    }
    setLoadingStickers(false);
  };

  const fetchGifs = async () => {
    setLoadingGifs(true);
    try {
      const res = await fetch('/api/gifs');
      const data = await res.json();
      if (data.gifs) {
        setGifs(data.gifs);
      }
    } catch (error) {
      console.error('Failed to fetch gifs:', error);
    }
    setLoadingGifs(false);
  };

  // Lazy load stickers when tab is clicked
  useEffect(() => {
    if (activeTab === 'stickers' && stickers.length === 0) {
      const timer = setTimeout(() => {
        void fetchStickers();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [activeTab, stickers.length]);

  // Lazy load gifs when tab is clicked
  useEffect(() => {
    if (activeTab === 'gifs' && gifs.length === 0) {
      const timer = setTimeout(() => {
        void fetchGifs();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [activeTab, gifs.length]);

  return (
    <div
      className="picker-panel"
      style={{
        position: 'absolute',
        bottom: '100%',
        [dir === 'rtl' ? 'right' : 'left']: 0,
        marginBottom: 8,
        width: 360,
        maxWidth: 'calc(100vw - 40px)',
        height: 400,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100,
      }}
    >
      {/* Tabs */}
      <div className="picker-tabs">
        {(['emoji', 'stickers', 'gifs'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`picker-tab${activeTab === tab ? ' active' : ''}`}
          >
            {t(`picker.${tab}`)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {activeTab === 'emoji' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(8, 1fr)',
              gap: 8,
            }}
          >
            {COMMON_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  onEmojiSelect(emoji);
                  onClose();
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 24,
                  cursor: 'pointer',
                  padding: 8,
                  transition: 'background 0.15s ease',
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'stickers' && (
          <>
            {loadingStickers ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                <div className="spinner" style={{ width: 30, height: 30 }} />
              </div>
            ) : stickers.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--fg-muted)', padding: 40 }}>
                {t('picker.noStickers')}
              </p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 8,
                }}
              >
                {stickers.map((sticker) => (
                  <button
                    key={sticker.id}
                    className="picker-item"
                    onClick={() => {
                      onStickerSelect(sticker.id, sticker.fileUrl);
                      onClose();
                    }}
                  >
                    <Image
                      src={sticker.fileUrl}
                      alt={sticker.fileName}
                      width={80}
                      height={80}
                      unoptimized
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                      }}
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'gifs' && (
          <>
            {loadingGifs ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                <div className="spinner" style={{ width: 30, height: 30 }} />
              </div>
            ) : gifs.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--fg-muted)', padding: 40 }}>
                {t('picker.noGifs')}
              </p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 8,
                }}
              >
                {gifs.map((gif) => (
                  <button
                    key={gif.id}
                    className="picker-item"
                    onClick={() => {
                      onGifSelect(gif.id, gif.fileUrl, gif.format);
                      onClose();
                    }}
                  >
                    {gif.format === 'mp4' ? (
                      <video
                        src={gif.fileUrl}
                        autoPlay
                        loop
                        muted
                        playsInline
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                        }}
                      />
                    ) : (
                      <Image
                        src={gif.fileUrl}
                        alt={gif.fileName}
                        width={80}
                        height={80}
                        unoptimized
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                        }}
                        loading="lazy"
                      />
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
