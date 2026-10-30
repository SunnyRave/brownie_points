'use client';
import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

/** Section rises in once as it enters the viewport (transform/opacity only — no layout shift). */
export function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, delay }}>
      {children}
    </motion.div>
  );
}

/** Words rise in one by one (translateY 28px + blur 6px → 0), 100 ms stagger. */
export function StaggerWords({ text, className, wordClassName }: { text: string; className?: string; wordClassName?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.span className={className} initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: reduce ? 0 : 0.1 } } }} aria-label={text}>
      {text.split(' ').map((w, i) => (
        <motion.span
          key={i}
          aria-hidden
          className={`inline-block ${wordClassName ?? ''}`}
          variants={{ hidden: { opacity: 0, y: 28, filter: 'blur(6px)' }, show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.6 } } }}
        >
          {w}&nbsp;
        </motion.span>
      ))}
    </motion.span>
  );
}

/** Count up with ease-out cubic over 1.4 s when visible; static final value under reduced motion. */
export function CountUp({ to, suffix = '', prefix = '' }: { to: number; suffix?: string; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => `${prefix}${Math.round(v)}${suffix}`);
  const [text, setText] = useState(`${prefix}${reduce ? to : 0}${suffix}`);
  useEffect(() => rounded.on('change', setText), [rounded]);
  useEffect(() => {
    if (!inView) return;
    if (reduce) return void setText(`${prefix}${to}${suffix}`);
    const c = animate(mv, to, { duration: 1.4, ease: [0.33, 1, 0.68, 1] });
    return () => c.stop();
  }, [inView, reduce, to, mv, prefix, suffix]);
  return <span ref={ref}>{text}</span>;
}

/** Magnetic primary CTA (desktop, fine pointers only). */
export function Magnetic({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const reduce = useReducedMotion();
  return (
    <motion.div
      ref={ref}
      style={{ x, y, display: 'inline-block' }}
      onPointerMove={(e) => {
        if (reduce || e.pointerType !== 'mouse' || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        x.set((e.clientX - r.left - r.width / 2) * 0.18);
        y.set((e.clientY - r.top - r.height / 2) * 0.25);
      }}
      onPointerLeave={() => {
        animate(x, 0, { type: 'spring', stiffness: 300, damping: 20 });
        animate(y, 0, { type: 'spring', stiffness: 300, damping: 20 });
      }}
    >
      {children}
    </motion.div>
  );
}
