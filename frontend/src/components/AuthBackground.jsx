import React from "react";

/**
 * Animated login backdrop.
 *  - bottom: an MgO crystal lattice (small Mg²⁺ / large O²⁻ sites on a square grid)
 *  - falling: CO₂ molecules (O=C=O) that drift down and are "absorbed" by the surface,
 *    each absorption is marked by a ripple ring on the lattice
 * Pure SVG + CSS (see the ".auth-bg" rules in styles.css). Animation is disabled
 * automatically when the user prefers reduced motion.
 */
const W = 1600;
const H = 900;
const STEP = 52;
const LATTICE_TOP = 700;

// [x, dx, duration(s), delay(s), scale, rotateStart, rotateEnd, endY, staticY]
const MOLECULES = [
  [110, 30, 19, -2, 1.1, -20, 40, 722, 180],
  [250, -24, 24, -9, 0.85, 30, -50, 760, 420],
  [390, 40, 21, -14, 1.35, 0, 70, 716, 90],
  [540, -30, 26, -5, 1.0, 60, 10, 748, 300],
  [680, 28, 18, -11, 0.8, -40, 20, 730, 520],
  [820, -36, 23, -17, 1.25, 15, -60, 712, 150],
  [950, 34, 20, -7, 0.95, -10, 55, 756, 380],
  [1080, -26, 25, -20, 1.4, 45, -25, 724, 240],
  [1210, 38, 17, -3, 0.9, -55, 15, 740, 470],
  [1330, -32, 22, -12, 1.15, 20, 80, 718, 120],
  [1450, 26, 27, -23, 0.8, -30, 35, 752, 330],
  [1530, -20, 19, -8, 1.05, 50, -15, 728, 560],
  [610, 22, 28, -25, 0.7, 10, -45, 764, 600],
  [1010, -18, 24, -16, 0.75, -25, 30, 736, 40],
];

const cols = Math.ceil(W / STEP) + 1;
const rows = Math.ceil((H - LATTICE_TOP) / STEP) + 1;

function buildLattice() {
  const sites = [];
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isMg = (r + c) % 2 === 0;
      const x = c * STEP;
      const y = LATTICE_TOP + 6 + r * STEP;
      const pulse = isMg && n++ % 5 === 0;
      sites.push({ x, y, isMg, pulse, d: `${((n * 0.43) % 3.2).toFixed(2)}s`, key: `${r}-${c}` });
    }
  }
  let d = "";
  for (let r = 0; r < rows; r++) d += `M0 ${LATTICE_TOP + 6 + r * STEP}H${W}`;
  for (let c = 0; c < cols; c++) d += `M${c * STEP} ${LATTICE_TOP + 6}V${H + STEP}`;
  return { sites, d };
}
const LATTICE = buildLattice();

function Co2() {
  return (
    <g>
      <path d="M-26 -3H26M-26 3H26" stroke="#8fb3bd" strokeWidth="2" opacity=".8" />
      <circle r="12" fill="#a9c0c8" />
      <circle r="12" fill="url(#cShade)" />
      <circle cx="-27" r="9.5" fill="#ff6b7d" />
      <circle cx="27" r="9.5" fill="#ff6b7d" />
      <circle cx="-27" r="9.5" fill="url(#oShade)" />
      <circle cx="27" r="9.5" fill="url(#oShade)" />
    </g>
  );
}

export default function AuthBackground() {
  return (
    <svg className="auth-bg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <filter id="orbBlur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="70" />
        </filter>
        <filter id="softGlow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <linearGradient id="latFadeG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.35" stopColor="#fff" stopOpacity="0.75" />
          <stop offset="1" stopColor="#fff" stopOpacity="1" />
        </linearGradient>
        <mask id="latFade" maskUnits="userSpaceOnUse" x="0" y={LATTICE_TOP - 40} width={W} height={H - LATTICE_TOP + 40}>
          <rect x="0" y={LATTICE_TOP - 40} width={W} height={H - LATTICE_TOP + 40} fill="url(#latFadeG)" />
        </mask>
        <radialGradient id="cShade" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" />
          <stop offset="1" stopColor="#1c3a46" stopOpacity=".45" />
        </radialGradient>
        <radialGradient id="oShade" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fff" stopOpacity=".5" />
          <stop offset="1" stopColor="#7a1020" stopOpacity=".4" />
        </radialGradient>
        <radialGradient id="surfaceGlow" cx="50%" cy="100%" r="60%">
          <stop offset="0" stopColor="#2dd4bf" stopOpacity=".28" />
          <stop offset="1" stopColor="#2dd4bf" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ambient glow */}
      <circle className="glow-orb" cx="260" cy="200" r="300" fill="#14b8a6" opacity=".2" filter="url(#orbBlur)" />
      <circle className="glow-orb b" cx="1380" cy="420" r="320" fill="#4cc364" opacity=".13" filter="url(#orbBlur)" />
      <rect x="0" y={LATTICE_TOP - 120} width={W} height={H - LATTICE_TOP + 120} fill="url(#surfaceGlow)" />

      {/* MgO lattice */}
      <g mask="url(#latFade)">
        <path d={LATTICE.d} stroke="#5eead4" strokeOpacity=".16" strokeWidth="1.2" fill="none" />
        {LATTICE.sites.map((s) =>
          s.isMg ? (
            <g key={s.key}>
              {s.pulse && <circle cx={s.x} cy={s.y} r="11" fill="#2dd4bf" opacity=".55" filter="url(#softGlow)" />}
              <circle
                className={"site" + (s.pulse ? " pulse" : "")}
                style={{ "--d": s.d }}
                cx={s.x}
                cy={s.y}
                r="6.5"
                fill="#2dd4bf"
                opacity=".85"
              />
            </g>
          ) : (
            <circle key={s.key} className="site" cx={s.x} cy={s.y} r="10.5" fill="#10445a" stroke="#4fb6c9" strokeOpacity=".55" strokeWidth="1.4" />
          ),
        )}
      </g>

      {/* absorption ripples + falling CO₂ */}
      {MOLECULES.map(([x, dx, dur, delay, scale, r0, r1, endY, ys], i) => (
        <g key={i}>
          <circle
            className="absorb"
            cx={x + dx}
            cy={endY}
            r="14"
            fill="none"
            stroke="#5eead4"
            strokeWidth="2.2"
            style={{ "--dur": `${dur}s`, "--delay": `${delay}s` }}
          />
          <g
            className="mol"
            style={{
              "--x": `${x}px`,
              "--dx": `${dx}px`,
              "--ys": `${ys}px`,
              "--yEnd": `${endY}px`,
              "--r0": `${r0}deg`,
              "--r1": `${r1}deg`,
              "--dur": `${dur}s`,
              "--delay": `${delay}s`,
            }}
          >
            <g transform={`scale(${scale})`}>
              <Co2 />
            </g>
          </g>
        </g>
      ))}
    </svg>
  );
}
