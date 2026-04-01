export function AppLogo() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="app-logo-icon"
      aria-label="FFmpeg Wrapper Logo"
    >
      <defs>
        <linearGradient
          id="logoGrad"
          x1="0"
          y1="0"
          x2="32"
          y2="32"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#818cf8" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
      </defs>

      {/* Rounded square background */}
      <rect width="32" height="32" rx="8" fill="url(#logoGrad)" />

      {/* Top arrow → pointing right (input) */}
      <path
        d="M6 12H20M17 9L20 12L17 15"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Bottom arrow ← pointing left (output) */}
      <path
        d="M26 20H12M15 17L12 20L15 23"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
