'use client';
import { useEffect, useRef } from 'react';

const C = { x: 300, y: 300 };
const CLIENTS = [
  { x: 110, y: 150, label: 'Org A' },
  { x: 95, y: 420, label: 'Org B' },
  { x: 300, y: 540, label: 'Org C' },
];
const OUT = [
  { x: 500, y: 190, label: 'Idea', color: 'var(--amber)' },
  { x: 520, y: 420, label: 'Release', color: 'var(--teal)' },
];

/**
 * SVG living-intelligence network: client nodes send packets into a pulsing "Shared insight" core,
 * which emits ripples and sends packets on to Idea → Release. Pure SVG/CSS (no WebGL) so it renders
 * instantly (LCP-safe); packets and loops are removed under prefers-reduced-motion.
 */
export function HeroNetwork() {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    // Pause SMIL packets when the hero is off-screen or the tab is hidden.
    const io = new IntersectionObserver(([e]) => (e.isIntersecting && !document.hidden ? svg.unpauseAnimations() : svg.pauseAnimations()));
    io.observe(svg);
    const onVis = () => (document.hidden ? svg.pauseAnimations() : svg.unpauseAnimations());
    document.addEventListener('visibilitychange', onVis);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
  const edge = (a: { x: number; y: number }, b: { x: number; y: number }) => `M${a.x},${a.y} Q${(a.x + b.x) / 2 + 30},${(a.y + b.y) / 2 - 40} ${b.x},${b.y}`;
  return (
    <svg ref={ref} viewBox="0 0 620 620" className="h-auto w-full max-w-[560px]" role="img" aria-label="Diagram: three client organisations share reviewed observations into a shared insight core, which informs improvement ideas and releases.">
      <defs>
        <radialGradient id="core" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#16E0BD" stopOpacity="1" />
          <stop offset="0.6" stopColor="#16E0BD" stopOpacity="0.25" />
          <stop offset="1" stopColor="#16E0BD" stopOpacity="0" />
        </radialGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="4" /></filter>
      </defs>
      <g fill="none" strokeDasharray="3 9" stroke="var(--border-2)">
        <circle cx={C.x} cy={C.y} r="150" className="spin-slow" />
        <circle cx={C.x} cy={C.y} r="235" className="spin-rev" />
      </g>
      {[...CLIENTS.map((n) => ({ d: edge(n, C), color: 'var(--violet)' })), ...OUT.map((n) => ({ d: edge(C, n), color: n.color }))].map((e, i) => (
        <g key={i}>
          <path id={`e${i}`} d={e.d} fill="none" stroke={e.color} strokeOpacity=".35" strokeWidth="1.5" />
          <circle r="4.5" fill={e.color} className="packet" filter="url(#glow)">
            <animateMotion dur={`${2.6 + i * 0.45}s`} begin={`${i * 0.5}s`} repeatCount="indefinite"><mpath href={`#e${i}`} /></animateMotion>
          </circle>
          <circle r="2.5" fill="#fff" className="packet">
            <animateMotion dur={`${2.6 + i * 0.45}s`} begin={`${i * 0.5}s`} repeatCount="indefinite"><mpath href={`#e${i}`} /></animateMotion>
          </circle>
        </g>
      ))}
      <circle cx={C.x} cy={C.y} r="60" fill="none" stroke="var(--teal)" strokeOpacity=".5" className="ripple" />
      <circle cx={C.x} cy={C.y} r="60" fill="none" stroke="var(--teal)" strokeOpacity=".5" className="ripple" style={{ animationDelay: '1.8s' }} />
      <circle cx={C.x} cy={C.y} r="90" fill="url(#core)" className="pulse-core" />
      <circle cx={C.x} cy={C.y} r="34" fill="var(--surface)" stroke="var(--teal)" strokeWidth="2" />
      <text x={C.x} y={C.y - 2} textAnchor="middle" fill="var(--text)" fontSize="11" fontFamily="var(--font-jetbrains)">SHARED</text>
      <text x={C.x} y={C.y + 12} textAnchor="middle" fill="var(--text)" fontSize="11" fontFamily="var(--font-jetbrains)">INSIGHT</text>
      {CLIENTS.map((n) => (
        <g key={n.label}>
          <circle cx={n.x} cy={n.y} r="26" fill="var(--surface)" stroke="var(--violet)" strokeWidth="2" />
          <circle cx={n.x} cy={n.y} r="6" fill="var(--violet)" />
          <text x={n.x} y={n.y + 44} textAnchor="middle" fill="var(--text-2)" fontSize="12" fontFamily="var(--font-jetbrains)">{n.label}</text>
        </g>
      ))}
      {OUT.map((n) => (
        <g key={n.label}>
          <rect x={n.x - 38} y={n.y - 18} width="76" height="36" rx="18" fill="var(--surface)" stroke={n.color} strokeWidth="2" />
          <text x={n.x} y={n.y + 5} textAnchor="middle" fill="var(--text)" fontSize="13" fontFamily="var(--font-space-grotesk)">{n.label}</text>
        </g>
      ))}
      {[...Array(14)].map((_, i) => (
        <circle key={i} cx={(i * 97) % 600 + 10} cy={(i * 53) % 600 + 10} r="1.2" fill="#fff" className="twinkle" style={{ animationDelay: `${(i % 5) * 0.7}s` }} />
      ))}
    </svg>
  );
}

/** Soft radial glow following the cursor inside the hero (CSS variables only). */
export function Spotlight({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className={`spotlight ${className ?? ''}`}
      onPointerMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        ref.current!.style.setProperty('--mx', `${e.clientX - r.left}px`);
        ref.current!.style.setProperty('--my', `${e.clientY - r.top}px`);
      }}
    >
      {children}
    </div>
  );
}
