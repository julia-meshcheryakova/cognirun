import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Brand, C, display, Enter, Footnote, Hero, Label, useLayout } from '../design';

export const Question: React.FC = () => {
  const { portrait, margin } = useLayout();
  return <AbsoluteFill style={{ background: C.ink, color: C.paper }}>
    <Hero />
    <Brand section="YOUR TURN" />
    <div style={{ position: 'absolute', left: margin, right: portrait ? margin : 650, top: portrait ? 350 : 235 }}>
      <Enter><Label>THEIR ROUTINE ISN'T YOUR RECIPE.</Label></Enter>
      <Enter delay={7} style={{ ...display, fontSize: portrait ? 172 : 175, marginTop: 45 }}>WHAT WORKS</Enter>
      <Enter delay={15} style={{ ...display, fontSize: portrait ? 172 : 175, color: C.lime }}>FOR YOU?</Enter>
      <Enter delay={30} style={{ fontSize: portrait ? 47 : 45, marginTop: 35, lineHeight: 1.35 }}>Same brain.<br />A different physical state.</Enter>
    </div>
    <Footnote>Find your own thinking ritual.</Footnote>
  </AbsoluteFill>;
};
