import React from 'react';
import { Composition } from 'remotion';
import { CogniRunAd } from './Ad';
import { CogniRunPitch } from './Pitch';
import './styles.css';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="CogniRun-Landscape" component={CogniRunAd} durationInFrames={1200} fps={30} width={1920} height={1080} />
    <Composition id="CogniRun-Portrait" component={CogniRunAd} durationInFrames={1200} fps={30} width={1080} height={1920} />
    <Composition id="CogniRun-Pitch" component={CogniRunPitch} durationInFrames={1800} fps={30} width={1920} height={1080} />
  </>
);
