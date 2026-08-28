import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Brand, C, clamp, CutLine, display, Enter, Footnote, Label, useLayout } from '../design';

export const Science: React.FC = () => {
  const { portrait, margin } = useLayout();
  const f = useCurrentFrame();
  return <AbsoluteFill style={{ background: C.paper, color: C.ink }}>
    <Brand dark section="THE RESEARCH" />
    <div style={{ position: 'absolute', width: portrait ? 600 : 780, height: portrait ? 600 : 780, borderRadius: '50%', background: C.lime, left: portrait ? 200 : 96, top: portrait ? 430 : 210, transform: `scale(${interpolate(f, [0,45], [.8,1], clamp)})` }} />
    <Enter style={{ position: 'absolute', left: margin, top: portrait ? 290 : 190 }}><Label color="#4D5858" style={{ fontSize: portrait ? 31 : 30 }}>ONE STANFORD EXPERIMENT</Label></Enter>
    <Enter delay={6} style={{ position: 'absolute', left: portrait ? 95 : 104, top: portrait ? 440 : 280, ...display, fontSize: portrait ? 365 : 410, letterSpacing: '-.04em' }}><span style={{ fontSize: portrait ? 130 : 140, verticalAlign: 'middle', marginRight: 8 }}>≈</span>60<span style={{ fontSize: portrait ? 195 : 230 }}>%</span></Enter>
    <div style={{ position: 'absolute', left: portrait ? margin : 1030, right: margin, top: portrait ? 1080 : 300 }}>
      <Enter delay={15} style={{ ...display, fontSize: portrait ? 110 : 102 }}>MORE<br />CREATIVE IDEAS</Enter>
      <Enter delay={25} style={{ fontSize: portrait ? 50 : 49, marginTop: 30 }}>while walking.</Enter>
    </div>
    <Footnote dark style={{ fontSize: portrait ? 32 : 27, bottom: portrait ? 150 : 70 }}>
      Oppezzo & Schwartz (2014), Experiment 1 · 48 students<br />Divergent-thinking task. Not IQ or a personal guarantee.
    </Footnote>
    <CutLine color={C.ink} />
  </AbsoluteFill>;
};
