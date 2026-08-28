import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Brand, C, clamp, display, Enter, Footnote, Label, PulseLine, Track, useLayout } from '../design';

export const Product: React.FC = () => {
  const { portrait, margin } = useLayout();
  const f = useCurrentFrame();
  const bpm = 136 + Math.round(Math.sin(f / 24) * 3);
  const waveform = Array.from({ length: 37 }, (_, i) => 10 + Math.abs(Math.sin(i * .81 + f * .14)) * (18 + 35 * Math.sin(i * .15) ** 2));
  return <AbsoluteFill style={{ background: C.ink, color: C.paper }}>
    <Track style={{ opacity: .1 }} />
    <Brand section="PROTOTYPE DEMO" />
    <div style={{ position: 'absolute', left: margin, right: margin, top: portrait ? 245 : 185 }}>
      <Enter><Label>BODY STATE + VOICE RESPONSE</Label></Enter>
      <Enter delay={5} style={{ ...display, fontSize: portrait ? 114 : 116, marginTop: 20 }}>YOU MOVE.<br style={{ display: portrait ? 'block' : 'none' }} /> YOU ANSWER.</Enter>
    </div>
    <Enter delay={12} style={{ position: 'absolute', left: margin, top: portrait ? 615 : 390, width: portrait ? 900 : 645, height: portrait ? 390 : 470, padding: 42, border: '1.5px solid #2D3C32', borderRadius: 32, background: C.panel }}>
      <Label style={{ fontSize: portrait ? 32 : 26 }}>ROXFIT / BODY DATA</Label>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginTop: 18 }}><span style={{ ...display, fontSize: portrait ? 142 : 158 }}>{bpm}</span><span style={{ fontSize: 31, color: C.muted }}>BPM</span></div>
      <div style={{ color: C.lime, fontSize: portrait ? 28 : 27, marginTop: portrait ? -8 : 0 }}>WALKING · SIMULATED</div>
      <div style={{ marginTop: portrait ? 12 : 23 }}><PulseLine width={portrait ? 790 : 550} height={70} /></div>
    </Enter>
    <Enter delay={19} style={{ position: 'absolute', left: portrait ? margin : 788, right: margin, top: portrait ? 1040 : 390, height: portrait ? 565 : 470, padding: portrait ? 42 : 48, border: '1.5px solid #383345', borderRadius: 32, background: C.panel }}>
      <Label color={C.violet} style={{ fontSize: portrait ? 32 : 26 }}>ELEVENLABS / VOICE</Label>
      <div style={{ fontSize: portrait ? 62 : 60, fontWeight: 600, lineHeight: 1.18, marginTop: 32 }}>Name another use<br />for a brick.</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: portrait ? 8 : 9, height: 88, marginTop: 25 }}>
        {waveform.map((v, i) => <div key={i} style={{ width: portrait ? 11 : 13, height: v, borderRadius: 8, background: C.violet, opacity: .55 + .4 * Math.sin(i * .3 + f * .05) ** 2 }} />)}
      </div>
      <div style={{ opacity: interpolate(f, [75,90], [0,1], clamp), fontSize: portrait ? 43 : 38, color: C.lime, marginTop: portrait ? 18 : 8 }}>“A doorstop.”</div>
    </Enter>
    <Footnote style={{ fontSize: portrait ? 30 : 26 }}>Illustrative interaction and data—not a live recording.<br />ROXFIT + ElevenLabs integration-ready prototype.</Footnote>
  </AbsoluteFill>;
};
