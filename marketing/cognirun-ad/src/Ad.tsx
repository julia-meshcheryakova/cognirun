import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Audio } from '@remotion/media';
import { TransitionSeries } from '@remotion/transitions';
import { staticFile } from 'remotion';
import './fonts';
import { C, clamp } from './design';
import { Intro } from './scenes/Intro';
import { Darwin } from './scenes/Darwin';
import { Hemingway } from './scenes/Hemingway';
import { Murakami } from './scenes/Murakami';
import { Question } from './scenes/Question';
import { Science } from './scenes/Science';
import { Nuance } from './scenes/Nuance';
import { Reveal } from './scenes/Reveal';
import { Product } from './scenes/Product';
import { Repeat } from './scenes/Repeat';
import { Closing } from './scenes/Closing';

export const CogniRunAd: React.FC = () => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ backgroundColor: C.ink, fontFamily: 'Inter', overflow: 'hidden' }}>
    <Audio src={staticFile('audio/cognirun-original-score.wav')} volume={1} />
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={60} name="Great minds, different rituals"><Intro /></TransitionSeries.Sequence>
      <TransitionSeries.Sequence durationInFrames={60} name="Darwin walked"><Darwin /></TransitionSeries.Sequence>
      <TransitionSeries.Sequence durationInFrames={60} name="Hemingway stood"><Hemingway /></TransitionSeries.Sequence>
      <TransitionSeries.Sequence durationInFrames={60} name="Murakami ran"><Murakami /></TransitionSeries.Sequence>
      <TransitionSeries.Sequence durationInFrames={120} name="What works for you?"><Question /></TransitionSeries.Sequence>
      <TransitionSeries.Sequence durationInFrames={180} name="One experiment, not IQ"><Science /></TransitionSeries.Sequence>
      <TransitionSeries.Sequence durationInFrames={120} name="Task and person matter"><Nuance /></TransitionSeries.Sequence>
      <TransitionSeries.Sequence durationInFrames={60} name="Meet CogniRun"><Reveal /></TransitionSeries.Sequence>
      <TransitionSeries.Sequence durationInFrames={180} name="Body data and voice demo"><Product /></TransitionSeries.Sequence>
      <TransitionSeries.Sequence durationInFrames={120} name="Repeat to test patterns"><Repeat /></TransitionSeries.Sequence>
      <TransitionSeries.Sequence durationInFrames={180} name="Discover your own"><Closing /></TransitionSeries.Sequence>
    </TransitionSeries>
    <AbsoluteFill style={{ background: C.ink, opacity: interpolate(frame, [1186,1199], [0,1], clamp), pointerEvents: 'none' }} />
  </AbsoluteFill>;
};
