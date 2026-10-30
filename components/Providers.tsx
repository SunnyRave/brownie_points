'use client';
import { MotionConfig } from 'motion/react';

/** reducedMotion="user": Framer animations honour prefers-reduced-motion (NFR-03). */
export function Providers({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user" transition={{ ease: [0.2, 0.7, 0.2, 1], duration: 0.45 }}>{children}</MotionConfig>;
}
