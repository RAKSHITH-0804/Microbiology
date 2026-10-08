import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

const C = 150;
const DISH_R = 104;
const LENS_R = 142;

type Interpretation = 'S' | 'MS' | 'R';

const ZONE_COLOR: Record<Interpretation, string> = {
  S: '52,211,153',
  MS: '251,191,36',
  R: '248,113,113',
};

/** Antibiotic disks on a Kirby-Bauer plate; zone = radius of inhibition (0 when resistant). */
const DISKS: { code: string; x: number; y: number; zone: number; result: Interpretation; delay: string }[] = [
  { code: 'CIP', x: 112, y: 112, zone: 29, result: 'S', delay: '0s' },
  { code: 'GEN', x: 190, y: 116, zone: 23, result: 'S', delay: '0.8s' },
  { code: 'MEM', x: 150, y: 152, zone: 15, result: 'S', delay: '1.6s' },
  { code: 'AMC', x: 116, y: 192, zone: 16, result: 'MS', delay: '2.4s' },
  { code: 'VA', x: 188, y: 190, zone: 0, result: 'R', delay: '1.2s' },
];

/** Deterministic bacterial lawn: dots across the agar, left clear inside each zone of inhibition. */
const LAWN = (() => {
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const dots: { x: number; y: number; r: number; o: number }[] = [];
  while (dots.length < 280) {
    const angle = rand() * Math.PI * 2;
    const dist = Math.sqrt(rand()) * (DISH_R - 6);
    const x = C + Math.cos(angle) * dist;
    const y = C + Math.sin(angle) * dist;
    const inZone = DISKS.some((d) => Math.hypot(x - d.x, y - d.y) < Math.max(d.zone, 9) + 2);
    if (inZone) continue;
    dots.push({ x, y, r: 0.6 + rand() * 1.1, o: 0.25 + rand() * 0.4 });
  }
  return dots;
})();

const TICKS = Array.from({ length: 72 }, (_, i) => {
  const angle = (i * 5 * Math.PI) / 180;
  const major = i % 6 === 0;
  const inner = LENS_R - (major ? 9 : 4);
  return {
    x1: C + Math.cos(angle) * inner,
    y1: C + Math.sin(angle) * inner,
    x2: C + Math.cos(angle) * LENS_R,
    y2: C + Math.sin(angle) * LENS_R,
    major,
  };
});

const SWEEP_ANGLE = (35 * Math.PI) / 180;
const SWEEP_PATH = `M${C},${C} L${C},${C - LENS_R} A${LENS_R},${LENS_R} 0 0,1 ${C + Math.sin(SWEEP_ANGLE) * LENS_R},${
  C - Math.cos(SWEEP_ANGLE) * LENS_R
} Z`;

const ROTATE_ABOUT_CENTER: CSSProperties = { transformOrigin: `${C}px ${C}px` };
const SCALE_IN_PLACE: CSSProperties = { transformBox: 'fill-box', transformOrigin: 'center' };

/** Agar plate with antibiotic disks and inhibition zones, framed by a microscope focus reticle. */
export function PetriDishLens({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 300" className={className} role="presentation">
      <defs>
        <radialGradient id="agar" cx="45%" cy="40%" r="65%">
          <stop offset="0%" stopColor="rgb(251,191,36)" stopOpacity="0.22" />
          <stop offset="70%" stopColor="rgb(217,119,6)" stopOpacity="0.12" />
          <stop offset="100%" stopColor="rgb(180,83,9)" stopOpacity="0.2" />
        </radialGradient>
        <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgb(96,165,250)" stopOpacity="0" />
          <stop offset="100%" stopColor="rgb(96,165,250)" stopOpacity="0.35" />
        </linearGradient>
        <clipPath id="lens">
          <circle cx={C} cy={C} r={LENS_R - 10} />
        </clipPath>
      </defs>

      {/* Microscope lens: graduated reticle + slowly turning focus ring */}
      <circle cx={C} cy={C} r={LENS_R} fill="none" stroke="rgba(148,163,184,0.35)" strokeWidth="1" />
      {TICKS.map((t, i) => (
        <line
          key={i}
          x1={t.x1}
          y1={t.y1}
          x2={t.x2}
          y2={t.y2}
          stroke={t.major ? 'rgba(147,197,253,0.7)' : 'rgba(148,163,184,0.35)'}
          strokeWidth={t.major ? 1.2 : 0.8}
        />
      ))}
      <g className="motion-safe:animate-sweep-reverse" style={ROTATE_ABOUT_CENTER}>
        <circle
          cx={C}
          cy={C}
          r={LENS_R - 16}
          fill="none"
          stroke="rgba(96,165,250,0.45)"
          strokeWidth="1.2"
          strokeDasharray="2 6 14 6"
        />
      </g>

      {/* Petri dish: lid rim, agar, bacterial lawn */}
      <circle cx={C} cy={C} r={DISH_R + 7} fill="rgba(15,23,42,0.55)" stroke="rgba(191,219,254,0.45)" strokeWidth="1.5" />
      <circle cx={C} cy={C} r={DISH_R} fill="url(#agar)" stroke="rgba(191,219,254,0.25)" strokeWidth="1" />
      {LAWN.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="rgb(253,230,138)" opacity={d.o} />
      ))}

      {/* Antibiotic disks with pulsing zones of inhibition */}
      {DISKS.map((d) => {
        const rgb = ZONE_COLOR[d.result];
        const ring = d.zone || 10;
        return (
          <g key={d.code}>
            {d.zone > 0 && <circle cx={d.x} cy={d.y} r={d.zone} fill="rgba(15,23,42,0.35)" />}
            <circle
              cx={d.x}
              cy={d.y}
              r={ring}
              fill="none"
              stroke={`rgba(${rgb},0.9)`}
              strokeWidth="1.2"
              className="drop-shadow-[0_0_4px_rgba(255,255,255,0.35)] motion-safe:animate-zone"
              style={{ animationDelay: d.delay }}
            />
            <circle
              cx={d.x}
              cy={d.y}
              r={ring}
              fill="none"
              stroke={`rgba(${rgb},0.6)`}
              strokeWidth="1"
              opacity="0"
              className="motion-safe:animate-ripple"
              style={{ ...SCALE_IN_PLACE, animationDelay: d.delay }}
            />
            <circle cx={d.x} cy={d.y} r="7" fill="rgb(248,250,252)" stroke="rgba(148,163,184,0.8)" strokeWidth="0.6" />
            <text
              x={d.x}
              y={d.y + 1.8}
              textAnchor="middle"
              fontSize="5"
              fontWeight="700"
              fill="rgb(30,41,59)"
              fontFamily="Inter, sans-serif"
            >
              {d.code}
            </text>
          </g>
        );
      })}

      {/* Reticle sweep across the field of view */}
      <g clipPath="url(#lens)">
        <g className="motion-safe:animate-sweep" style={ROTATE_ABOUT_CENTER}>
          <path d={SWEEP_PATH} fill="url(#sweep)" />
          <line
            x1={C}
            y1={C}
            x2={C + Math.sin(SWEEP_ANGLE) * LENS_R}
            y2={C - Math.cos(SWEEP_ANGLE) * LENS_R}
            stroke="rgba(147,197,253,0.8)"
            strokeWidth="1"
          />
        </g>
      </g>
      <g stroke="rgba(147,197,253,0.4)" strokeWidth="0.8">
        <line x1={C} y1={C - LENS_R + 12} x2={C} y2={C - DISH_R - 10} />
        <line x1={C} y1={C + DISH_R + 10} x2={C} y2={C + LENS_R - 12} />
        <line x1={C - LENS_R + 12} y1={C} x2={C - DISH_R - 10} y2={C} />
        <line x1={C + DISH_R + 10} y1={C} x2={C + LENS_R - 12} y2={C} />
      </g>
    </svg>
  );
}

type MicrobeKind = 'staphylococci' | 'streptococci' | 'diplococci' | 'bacillus' | 'spirillum';

function MicrobeShape({ kind }: { kind: MicrobeKind }) {
  const fill = 'rgba(147,197,253,0.18)';
  const stroke = 'rgba(147,197,253,0.65)';
  switch (kind) {
    case 'staphylococci':
      return (
        <svg viewBox="0 0 48 48" className="h-full w-full">
          {[
            [18, 18],
            [30, 16],
            [24, 27],
            [13, 30],
            [35, 28],
            [26, 38],
          ].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="6" fill={fill} stroke={stroke} strokeWidth="1.2" />
          ))}
        </svg>
      );
    case 'streptococci':
      return (
        <svg viewBox="0 0 64 24" className="h-full w-full">
          {[8, 20, 32, 44, 56].map((cx, i) => (
            <circle key={cx} cx={cx} cy={i % 2 ? 10 : 14} r="5.2" fill={fill} stroke={stroke} strokeWidth="1.2" />
          ))}
        </svg>
      );
    case 'diplococci':
      return (
        <svg viewBox="0 0 40 24" className="h-full w-full">
          <ellipse cx="13" cy="12" rx="8" ry="9" fill={fill} stroke={stroke} strokeWidth="1.2" />
          <ellipse cx="27" cy="12" rx="8" ry="9" fill={fill} stroke={stroke} strokeWidth="1.2" />
        </svg>
      );
    case 'bacillus':
      return (
        <svg viewBox="0 0 72 28" className="h-full w-full">
          <path d="M8,14 C3,8 2,20 -2,14" fill="none" stroke={stroke} strokeWidth="1" />
          <path d="M64,14 C69,8 70,20 74,14" fill="none" stroke={stroke} strokeWidth="1" />
          <rect x="8" y="5" width="56" height="18" rx="9" fill={fill} stroke={stroke} strokeWidth="1.2" />
          <rect x="22" y="11" width="28" height="6" rx="3" fill="rgba(147,197,253,0.25)" />
        </svg>
      );
    case 'spirillum':
      return (
        <svg viewBox="0 0 72 24" className="h-full w-full">
          <path
            d="M4,12 C10,2 16,2 22,12 S34,22 40,12 S52,2 58,12 S66,20 70,14"
            fill="none"
            stroke={stroke}
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

const MICROBES: { kind: MicrobeKind; className: string; duration: string; delay: string; pulse?: boolean }[] = [
  { kind: 'staphylococci', className: 'right-8 top-6 h-12 w-12', duration: '9s', delay: '0s' },
  { kind: 'diplococci', className: 'left-[52%] top-10 h-6 w-10', duration: '7s', delay: '1.5s', pulse: true },
  { kind: 'bacillus', className: 'left-6 top-[54%] h-6 w-16', duration: '11s', delay: '0.8s' },
  { kind: 'spirillum', className: 'right-8 bottom-32 h-6 w-16', duration: '10s', delay: '2.2s' },
  { kind: 'streptococci', className: 'left-[38%] top-[60%] h-5 w-16', duration: '12s', delay: '3s', pulse: true },
  { kind: 'bacillus', className: 'left-[18%] top-[70%] h-4 w-11 rotate-45', duration: '8s', delay: '4s' },
];

/** Cocci, bacilli and spirilla drifting across the showcase background. */
export function FloatingMicrobes() {
  return (
    <>
      {MICROBES.map(({ kind, className, duration, delay, pulse }, i) => (
        <div key={i} className={cn('pointer-events-none absolute', className)}>
          <div
            className="h-full w-full motion-safe:animate-microbe"
            style={{ animationDuration: duration, animationDelay: delay }}
          >
            <div className={cn('h-full w-full', pulse && 'motion-safe:animate-pulse')}>
              <MicrobeShape kind={kind} />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
