import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Brand, C, clamp, display, Enter, Footnote, Label, Track, useLayout } from '../design';

export const Nuance: React.FC = () => {
  const { portrait, margin } = useLayout();
  const f = useCurrentFrame();
  return <AbsoluteFill style={{ background: C.ink, color: C.paper }}>
    <Track style={{ opacity: .13, right: portrait ? -600 : -150 }} />
    <Brand section="THE IMPORTANT PART" />
    <div style={{ position: 'absolute', left: margin, right: margin, top: portrait ? 440 : 255 }}>
      <Enter><Label>THERE IS NO UNIVERSAL RECIPE.</Label></Enter>
      <Enter delay={7} style={{ ...display, fontSize: portrait ? 137 : 155, marginTop: 35 }}>NOT EVERY TASK.</Enter>
      <Enter delay={23} style={{ ...display, fontSize: portrait ? 124 : 155, color: C.coral }}>NOT EVERY PERSON.</Enter>
      <div style={{ width: `${interpolate(f, [32,75], [0,100], clamp)}%`, maxWidth: 1050, height: 6, background: C.coral, marginTop: 32 }} />
      <Enter delay={45} style={{ fontSize: portrait ? 44 : 42, maxWidth: 1120, marginTop: 38, lineHeight: 1.4 }}>In that experiment, a one-answer thinking task became harder while walking.</Enter>
    </div>
    <Footnote>Convergent-task accuracy decreased in Experiment 1. Individual results can differ.</Footnote>
  </AbsoluteFill>;
};
