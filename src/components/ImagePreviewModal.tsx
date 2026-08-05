'use client';

import { motion } from 'motion/react';
import Image from 'next/image';
import AppIcon from './AppIcon';
import { overlayFade, scaleIn } from '@/lib/animations';

interface ImagePreviewModalProps {
  imageUrl: string;
  onClose: () => void;
}

export default function ImagePreviewModal({ imageUrl, onClose }: ImagePreviewModalProps) {
  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = imageUrl.split('/').pop() || 'image.png';
    a.click();
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
        onClick={(e) => e.stopPropagation()}
        variants={scaleIn}
        initial="hidden"
        animate="visible"
        exit="exit"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          maxWidth: '95vw',
          maxHeight: '95vh',
        }}
      >
        <Image
          src={imageUrl}
          alt="Preview"
          width={1200}
          height={900}
          unoptimized
          style={{
            maxWidth: '90vw',
            maxHeight: '80vh',
            objectFit: 'contain',
            borderRadius: 'var(--radius)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
        />
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-primary" onClick={handleDownload}>
            <AppIcon name="download" size={16} />
            <span>Download</span>
          </button>
          <button className="btn btn-ghost" onClick={onClose}>
            <AppIcon name="close" size={16} />
            <span>Close</span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
