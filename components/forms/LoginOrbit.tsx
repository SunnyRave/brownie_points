export function LoginOrbit() {
  return (
    <svg viewBox="0 0 300 300" className="h-[260px] w-[260px]" aria-hidden>
      <circle cx="150" cy="150" r="110" fill="none" stroke="var(--border-2)" strokeDasharray="3 8" className="spin-slow" />
      <circle cx="150" cy="150" r="70" fill="none" stroke="var(--border-2)" strokeDasharray="2 6" className="spin-rev" />
      <circle cx="150" cy="150" r="40" fill="none" stroke="var(--teal)" strokeOpacity=".5" className="ripple" />
      <g className="spin-slow">
        <circle cx="150" cy="40" r="12" fill="var(--teal)" />
        <circle cx="245" cy="205" r="12" fill="var(--violet)" />
        <circle cx="55" cy="205" r="12" fill="var(--amber)" />
      </g>
      <g className="pulse-core">
        <circle cx="150" cy="150" r="30" fill="var(--surface)" stroke="var(--teal)" strokeWidth="2" />
        <rect x="139" y="148" width="22" height="16" rx="3" fill="var(--teal)" />
        <path d="M143 148 v-6 a7 7 0 0 1 14 0 v6" fill="none" stroke="var(--teal)" strokeWidth="3" />
      </g>
    </svg>
  );
}
