import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Brand, C, CutLine, display, Enter, Footnote, Label, Track, useLayout } from '../design';

export const Ritual: React.FC<{ person: string; action: string; detail: string; number: string; mode: 'paper' | 'dark' | 'lime' }> = ({ person, action, detail, number, mode }) => {
  const { portrait, margin } = useLayout();
  const f = useCurrentFrame();
  const darkText = mode !== 'dark';
  const bg = mode === 'paper' ? C.paper : mode === 'lime' ? C.lime : C.ink;
  const fg = darkText ? C.ink : C.paper;
  return <AbsoluteFill style={{ background: bg, color: fg }}>
    <Track dark={darkText} style={{ width: portrait ? 1000 : 1300, height: portrait ? 1000 : 1300, bottom: portrait ? -40 : -530, right: portrait ? -480 : -220, opacity: .16 }} />
    {mode === 'dark' && <div style={{ position: 'absolute', width: 2, height: '70%', background: C.violet, opacity: .35, right: portrait ? 240 : 390, top: 160, transform: `translateY(${f * .5}px)` }} />}
    <Brand dark={darkText} section={`${number} / 03`} />
    <div style={{ position: 'absolute', left: margin, right: margin, top: portrait ? 530 : 285 }}>
      <Enter><Label color={darkText ? '#4B5654' : C.violet} style={{ fontSize: portrait ? 36 : 39 }}>{person}</Label></Enter>
      <Enter delay={3} style={{ ...display, fontSize: portrait ? (action === 'WALKED.' ? 248 : 280) : 305, marginTop: 24, color: mode === 'dark' ? C.violet : fg }}>{action}</Enter>
      <Enter delay={8} style={{ marginTop: portrait ? 42 : 30, maxWidth: portrait ? 880 : 1100, fontSize: portrait ? 44 : 44, lineHeight: 1.25 }}>{detail}</Enter>
    </div>
    <Footnote dark={darkText} style={{ color: darkText ? '#344333' : C.muted }}>Documented routines—not proof of cognitive benefit or endorsement.</Footnote>
    <CutLine color={mode === 'dark' ? C.violet : C.ink} />
  </AbsoluteFill>;
};
