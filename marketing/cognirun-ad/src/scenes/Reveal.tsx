import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Brand, C, display, Enter, Label, Track, useLayout } from '../design';

export const Reveal: React.FC = () => {
  const { portrait, margin } = useLayout();
  return <AbsoluteFill style={{ background: C.lime, color: C.ink }}>
    <Track dark style={{ opacity: .11, right: -100, bottom: -180 }} />
    <Brand dark section="A PERSONAL EXPERIMENT" />
    <div style={{ position: 'absolute', left: margin, right: margin, top: portrait ? 550 : 300 }}>
      <Enter><Label color="#3D4B32">MEET</Label></Enter>
      <Enter delay={3} style={{ ...display, fontSize: portrait ? 193 : 273, marginTop: 15 }}>COGNIRUN.</Enter>
      <Enter delay={10} style={{ fontSize: portrait ? 54 : 56, lineHeight: 1.3, marginTop: 35, maxWidth: 1250 }}>Find the pace of your best thinking.</Enter>
    </div>
    <Enter delay={15} style={{ position: 'absolute', left: margin, right: margin, bottom: portrait ? 300 : 115, fontSize: portrait ? 39 : 38, lineHeight: 1.6, fontWeight: 600 }}>SIT → STAND → WALK{portrait ? <br /> : ' → '}RUN → RECOVER</Enter>
  </AbsoluteFill>;
};
