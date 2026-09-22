import type { Transition, Variants } from 'motion/react';

export const springTransition: Transition = {
  type: 'spring',
  stiffness: 150,
  damping: 25,
};

export const quickTransition: Transition = {
  duration: 0.2,
  ease: [0.23, 1, 0.32, 1],
};

export const surfaceMotion: Variants = {
  hidden: {
    opacity: 0,
    filter: 'blur(4px)',
    transform: 'translateY(8px) scale(0.97)',
  },
  visible: {
    opacity: 1,
    filter: 'blur(0px)',
    transform: 'translateY(0) scale(1)',
  },
  exit: {
    opacity: 0,
    filter: 'blur(4px)',
    transform: 'translateY(-4px) scale(0.98)',
  },
};
