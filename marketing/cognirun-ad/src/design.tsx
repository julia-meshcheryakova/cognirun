import React, { type CSSProperties } from 'react';
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

export const C = { ink: '#080E12', panel: '#111A21', paper: '#F2F0E7', lime: '#D6FF5E', violet: '#B49AFF', muted: '#A5B2B8', coral: '#FF826F', recovery: '#69DFF8' };
export const display: CSSProperties = { fontFamily: 'Anton', fontWeight: 400, lineHeight: 1.07, letterSpacing: '-0.025em' };
export const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

export function useLayout() {
  const { width, height, fps } = useVideoConfig();
  return { width, height, fps, portrait: height > width, margin: height > width ? 90 : 104 };
}

export const Brand: React.FC<{ dark?: boolean; section?: string }> = ({ dark = false, section }) => {
  const { portrait, margin } = useLayout();
  const color = dark ? C.ink : C.paper;
  return <div style={{ position: 'absolute', top: portrait ? 110 : 60, left: margin, right: margin, display: 'flex', alignItems: 'center', justifyContent: 'space-between', color, zIndex: 5 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <svg width="46" height="42" viewBox="0 0 46 42"><path d="M1 22 H10 L15 8 L23 34 L30 16 L35 22 H45" fill="none" stroke={dark ? C.ink : C.lime} strokeWidth="3.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <div style={{ fontWeight: 800, fontSize: portrait ? 30 : 31, letterSpacing: -1 }}>COGNI<span style={{ color: dark ? C.ink : C.lime }}>RUN</span></div>
    </div>
    <div style={{ fontSize: portrait ? 18 : 21, letterSpacing: 3, fontWeight: 600, opacity: 0.7 }}>{section}</div>
  </div>;
};

export const Footnote: React.FC<{ children: React.ReactNode; dark?: boolean; style?: CSSProperties }> = ({ children, dark = false, style }) => {
  const { portrait, margin } = useLayout();
  return <div style={{ position: 'absolute', left: margin, right: margin, bottom: portrait ? 150 : 54, fontSize: portrait ? 30 : 26, lineHeight: 1.4, color: dark ? '#495254' : C.muted, ...style }}>{children}</div>;
};

export const Label: React.FC<{ children: React.ReactNode; color?: string; style?: CSSProperties }> = ({ children, color = C.lime, style }) => <div style={{ fontSize: 27, fontWeight: 600, letterSpacing: 4, color, ...style }}>{children}</div>;

export const Enter: React.FC<{ children: React.ReactNode; delay?: number; style?: CSSProperties }> = ({ children, delay = 0, style }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame: f - delay, fps, config: { damping: 22, stiffness: 145, mass: 0.8 } });
  return <div style={{ opacity: interpolate(f, [delay, delay + 9], [0, 1], clamp), transform: `translateY(${(1 - rise) * 70}px)`, ...style }}>{children}</div>;
};

export const Track: React.FC<{ dark?: boolean; style?: CSSProperties }> = ({ dark = false, style }) => {
  const f = useCurrentFrame();
  return <svg viewBox="0 0 1000 1000" style={{ position: 'absolute', width: 1050, height: 1050, right: -270, bottom: -350, opacity: dark ? 0.18 : 0.24, ...style }}>
    {[0, 1, 2, 3, 4, 5].map(i => <rect key={i} x={80 + i * 35} y={60 + i * 35} width={840 - i * 70} height={880 - i * 70} rx={330 - i * 29} fill="none" stroke={dark ? C.ink : C.lime} strokeWidth={i === 2 ? 3 : 1.7} strokeDasharray={i === 2 ? '14 16' : undefined} strokeDashoffset={-f * 2} transform="rotate(-22 500 500)" />)}
  </svg>;
};

export const Hero: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => {
  const f = useCurrentFrame();
  const { portrait } = useLayout();
  return <AbsoluteFill style={{ overflow: 'hidden' }}>
    <Img src={staticFile('images/runner-hero.png')} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: portrait ? '84% center' : 'center', opacity, transform: `scale(${interpolate(f, [0, 180], [1.07, 1], clamp)})` }} />
    <AbsoluteFill style={{ background: portrait ? 'linear-gradient(180deg, rgba(8,14,18,.86) 0%, rgba(8,14,18,.3) 60%, rgba(8,14,18,.78) 100%)' : 'linear-gradient(90deg, rgba(8,14,18,.46) 0%, rgba(8,14,18,.1) 70%, transparent 100%)' }} />
  </AbsoluteFill>;
};

export const PulseLine: React.FC<{ color?: string; width?: number; height?: number }> = ({ color = C.lime, width = 620, height = 100 }) => {
  const f = useCurrentFrame();
  return <svg width={width} height={height} viewBox="0 0 620 100" style={{ overflow: 'visible' }}>
    <path d="M0 55 H105 L135 55 L153 30 L173 78 L195 12 L221 88 L242 55 H310 L330 55 L350 44 L372 66 L390 55 H620" fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="900" strokeDashoffset={interpolate(f, [0, 38], [900, 0], clamp)} />
    <circle cx={45 + (f * 4.4) % 530} cy="55" r="5" fill={color} />
  </svg>;
};

export const CutLine: React.FC<{ color?: string }> = ({ color = C.lime }) => {
  const f = useCurrentFrame();
  const { width } = useVideoConfig();
  return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}><div style={{ position: 'absolute', width: 6, height: '100%', background: color, opacity: interpolate(f, [0, 14, 18], [0.8, 0.4, 0], clamp), transform: `translateX(${interpolate(f, [0, 18], [-10, width + 20], { ...clamp, easing: Easing.bezier(.16, 1, .3, 1) })}px)` }} /></div>;
};
