import React from 'react';
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame, Video } from 'remotion';
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
    <Enter delay={19} style={{ position: 'absolute', left: portrait ? margin : 788, right: margin, top: portrait ? 1040 : 390, height: portrait ? 565 : 470, padding: portrait ? 28 : 34, border: '1.5px solid #383345', borderRadius: 32, background: C.panel, overflow: 'hidden' }}>
      <Label color={C.violet} style={{ fontSize: portrait ? 32 : 26, position: 'relative', zIndex: 2 }}>BROWSER VOICE · GARMIN CLIP</Label>
      <Video src={staticFile('video/runner-garmin.mov')} muted startFrom={0} style={{ position: 'absolute', inset: portrait ? '88px 28px 28px' : '78px 34px 34px', width: portrait ? '844px' : 'auto', height: portrait ? '430px' : '358px', objectFit: 'cover', objectPosition: 'center', borderRadius: 20, opacity: .82 }} />
      <div style={{ position: 'absolute', left: portrait ? 52 : 58, bottom: portrait ? 52 : 56, zIndex: 2, fontSize: portrait ? 45 : 34, fontWeight: 600, lineHeight: 1.1, textShadow: '0 2px 14px rgba(0,0,0,.65)' }}>You move.<br />You answer.</div>
      <div style={{ position: 'absolute', right: portrait ? 50 : 58, bottom: portrait ? 58 : 62, zIndex: 2, color: C.lime, fontSize: portrait ? 27 : 22, letterSpacing: 1.5, textAlign: 'right' }}>NATIVE SPEECH<br />+ TYPED FALLBACK</div>
      {/* Keep the waveform as a deterministic UI accent over the real clip. */}
      <div style={{ position: 'absolute', left: portrait ? 52 : 58, right: portrait ? 52 : 58, top: portrait ? 132 : 116, display: 'flex', alignItems: 'center', gap: portrait ? 8 : 9, height: 52, zIndex: 2, opacity: .72 }}>
        {waveform.map((v, i) => <div key={i} style={{ width: portrait ? 11 : 13, height: v, borderRadius: 8, background: C.violet, opacity: .55 + .4 * Math.sin(i * .3 + f * .05) ** 2 }} />)}
      </div>
    </Enter>
    <Footnote style={{ fontSize: portrait ? 30 : 26 }}>Real runner clip supplied by the team; telemetry and answer UI are illustrative.<br />Browser-native voice with typed fallback · no provider required.</Footnote>
  </AbsoluteFill>;
};
