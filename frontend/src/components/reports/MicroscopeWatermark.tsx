/** Centered microscope mark behind verified (final) printed reports. Vector, so it stays crisp at any print DPI. */
export function MicroscopeWatermark() {
  return (
    // position: fixed repeats the mark on every printed page. Inline SVG, not a CSS background,
    // because the print stylesheet strips backgrounds.
    <div aria-hidden className="report-watermark pointer-events-none fixed inset-0 z-0 flex items-center justify-center">
      <svg viewBox="0 0 200 240" className="h-[120mm] w-auto" fill="#000" xmlns="http://www.w3.org/2000/svg">
        <path d="M44 214h112c8 0 14 6 14 14v6H30v-6c0-8 6-14 14-14z" />
        <rect x="116" y="176" width="22" height="40" rx="3" />
        <path d="M127 184C166 160 166 102 98 80" fill="none" stroke="#000" strokeWidth="18" strokeLinecap="round" />
        <circle cx="141" cy="152" r="14" />
        <circle cx="141" cy="152" r="7" fill="#fff" />
        <circle cx="141" cy="152" r="3" />
        <rect x="40" y="146" width="104" height="9" rx="2" />
        <rect x="58" y="142" width="48" height="3" rx="1" />
        <rect x="50" y="139" width="16" height="4" rx="1" />
        <rect x="98" y="139" width="16" height="4" rx="1" />
        <path d="M70 155h24l-3 14H73z" />
        <rect x="78" y="169" width="8" height="12" />
        <rect x="66" y="181" width="32" height="33" rx="5" />
        <circle cx="82" cy="196" r="8" fill="#fff" />
        <circle cx="82" cy="196" r="4" />
        <rect x="72" y="62" width="20" height="50" rx="2" />
        <path d="M62 112h40l-6 10H68z" />
        <rect x="77" y="122" width="10" height="13" rx="1.5" />
        <rect x="79" y="135" width="6" height="3" rx="1" />
        <rect x="64" y="120" width="8" height="11" rx="1.5" transform="rotate(22 68 120)" />
        <rect x="92" y="120" width="8" height="11" rx="1.5" transform="rotate(-22 96 120)" />
        <rect x="64" y="48" width="36" height="16" rx="4" />
        <g transform="rotate(-32 78 52)">
          <rect x="71" y="12" width="14" height="40" rx="2" />
          <rect x="68" y="6" width="20" height="8" rx="2" />
        </g>
      </svg>
    </div>
  );
}
