/**
 * Shared animation presets for the app.
 * All powered by Motion (framer-motion successor).
 */
import type { Variants, Transition } from "motion/react";

/** Spring transition used across most UI elements */
export const spring: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 30,
};

/** Gentle spring for modals / overlays */
export const gentleSpring: Transition = {
  type: "spring",
  stiffness: 200,
  damping: 25,
};

/** Quick tween for micro-interactions */
export const quickTween: Transition = {
  type: "tween",
  duration: 0.2,
  ease: "easeOut",
};

/** Fade + slide up —通用 entrance */
export const fadeSlideUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: spring },
  exit: { opacity: 0, y: -8, transition: quickTween },
};

/** Scale-in from center — modals */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: gentleSpring },
  exit: { opacity: 0, scale: 0.97, transition: quickTween },
};

/** Overlay backdrop */
export const overlayFade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.12 } },
};

/** Stagger container — children animate in sequence */
export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02,
    },
  },
};

/** Child item for stagger — fades + slides from side */
export const staggerItem: Variants = {
  hidden: { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0, transition: spring },
};
