import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Brand, C, CutLine, display, Enter, Label, Track, useLayout } from '../design';

export const Intro: React.FC = () => {
  const { portrait, margin } = useLayout();
  const f = useCurrentFrame();
  return <AbsoluteFill style={{ background: C.paper, color: C.ink }}>
    <Track dark style={{ right: portrait ? -370 : -130, bottom: portrait ? -80 : -400, opacity: .12, transform: `rotate(${f * .1}deg)` }} />
    <Brand dark section="THE EXPERIMENT" />
    <div style={{ position: 'absolute', left: margin, right: margin, top: portrait ? 450 : 240 }}>
      <Enter><Label color="#4D5858">YOUR NEXT GREAT IDEA</Label></Enter>
      <Enter delay={4} style={{ ...display, fontSize: portrait ? 152 : 180, marginTop: 30 }}>GREAT MINDS.</Enter>
      <Enter delay={9} style={{ ...display, fontSize: portrait ? 152 : 180 }}>DIFFERENT</Enter>
      <Enter delay={14} style={{ ...display, fontSize: portrait ? 152 : 180, color: C.ink, display: 'inline-block', background: C.lime, padding: '0 15px 15px', marginLeft: -15 }}>RITUALS.</Enter>
    </div>
    <div style={{ position: 'absolute', right: margin, bottom: portrait ? 190 : 82, fontSize: 24, letterSpacing: 4, transform: `translateX(${interpolate(f,[0,60],[24,0])}px)` }}>BRAIN × BODY</div>
    <CutLine color={C.ink} />
  </AbsoluteFill>;
};
