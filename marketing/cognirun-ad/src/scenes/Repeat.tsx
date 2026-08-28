import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Brand, C, clamp, display, Enter, Footnote, Label, useLayout } from '../design';

export const Repeat: React.FC = () => {
  const { portrait, margin } = useLayout();
  const f = useCurrentFrame();
  const lines = ['M45 240 C180 240 188 184 285 165 S445 79 510 103 S645 296 745 260 S894 111 965 130', 'M45 250 C178 250 190 208 285 181 S445 101 510 110 S641 272 745 244 S894 122 965 145', 'M45 245 C178 245 190 193 285 176 S445 92 510 100 S641 287 745 253 S894 134 965 138'];
  return <AbsoluteFill style={{ background: C.ink, color: C.paper }}>
    <Brand section="TEST THE PATTERN" />
    <div style={{ position: 'absolute', left: margin, right: margin, top: portrait ? 300 : 210 }}>
      <Enter><Label>ONE RUN IS AN EARLY SIGNAL.</Label></Enter>
      <Enter delay={5} style={{ ...display, fontSize: portrait ? 128 : 133, marginTop: 32 }}>REPEAT.</Enter>
      <Enter delay={12} style={{ ...display, fontSize: portrait ? 128 : 133, color: C.lime }}>LOOK FOR A{portrait ? <br /> : ' '}PATTERN.</Enter>
    </div>
    <Enter delay={20} style={{ position: 'absolute', left: margin, right: margin, top: portrait ? 900 : 555 }}>
      <svg viewBox="0 0 1020 385" style={{ width: '100%', height: portrait ? 470 : 350, overflow: 'visible' }}>
        {[100,175,250].map(y => <line key={y} x1="45" x2="965" y1={y} y2={y} stroke="#344047" strokeWidth="1.2" strokeDasharray="5 9" />)}
        {lines.map((d, i) => <path key={i} d={d} fill="none" stroke={[C.lime,C.violet,C.paper][i]} strokeOpacity={[1,.65,.33][i]} strokeWidth={[6,4,3][i]} strokeLinecap="round" strokeDasharray="1300" strokeDashoffset={interpolate(f, [20 + i * 9,78 + i * 9], [1300,0], clamp)} />)}
        {['SIT','STAND','WALK','RUN','RECOVER'].map((label,i) => <text key={label} x={45 + i*230} y="345" fill={i === 2 ? C.lime : C.muted} fontSize="24" fontFamily="Inter" textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}>{label}</text>)}
      </svg>
    </Enter>
    <Footnote>Illustrative patterns—not participant findings.<br />Exploratory comparison, not an IQ test or diagnosis.</Footnote>
  </AbsoluteFill>;
};
