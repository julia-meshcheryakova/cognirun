import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { Brand, C, display, Enter, Footnote, Label, Track, useLayout } from '../design';

export const Closing: React.FC = () => {
  const { portrait, margin } = useLayout();
  return <AbsoluteFill style={{ background: C.paper, color: C.ink }}>
    <Track dark style={{ opacity: .1, right: portrait ? -510 : -350, bottom: portrait ? -100 : -300 }} />
    <Brand dark section="JOIN THE EXPERIMENT" />
    <div style={{ position: 'absolute', left: margin, right: portrait ? margin : 560, top: portrait ? 300 : 245 }}>
      <Enter><Label color="#4C5654" style={{ fontSize: portrait ? 31 : 30 }}>DON'T COPY THEIR RITUAL.</Label></Enter>
      <Enter delay={6} style={{ ...display, fontSize: portrait ? 191 : 195, marginTop: 35 }}>DISCOVER</Enter>
      <Enter delay={14} style={{ ...display, fontSize: portrait ? 191 : 195, display: 'inline-block', background: C.lime, padding: '0 14px 12px', marginLeft: -14 }}>YOUR OWN.</Enter>
      <Enter delay={24} style={{ marginTop: 35, fontSize: portrait ? 46 : 46, lineHeight: 1.3 }}>CogniRun.<br />Find the pace of your best thinking.</Enter>
    </div>
    <Enter delay={25} style={{ position: 'absolute', right: portrait ? 370 : 120, top: portrait ? 1240 : 355, width: portrait ? 340 : 365, textAlign: 'center' }}>
      <Img src={staticFile('join-qr.png')} style={{ width: '100%', imageRendering: 'pixelated', borderRadius: 8 }} />
      <div style={{ fontSize: portrait ? 28 : 26, fontWeight: 800, letterSpacing: 2, marginTop: 16 }}>TRY THE PROTOTYPE</div>
    </Enter>
    <Footnote dark style={{ fontSize: portrait ? 30 : 26 }}>
      Built around ROXFIT × ElevenLabs<br />Hackathon prototype · Repeat sessions to test your pattern.
    </Footnote>
  </AbsoluteFill>;
};
