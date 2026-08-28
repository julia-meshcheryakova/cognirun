# CogniRun evidence and study note

## Defensible premise

CogniRun is an exploratory N-of-1 measurement system. Research does **not** show that exercise universally makes people smarter. The best recent synthesis estimates a small average acute effect, more consistently visible in response time than accuracy, with substantial variation across tasks, intensities, timings, and people.

The product therefore asks a narrower and more useful question:

> On this task, in this session, how did performance change relative to the participant's seated reference as body state changed?

`CogniIndex` is a baseline-relative task index. It is not IQ, a diagnosis, or proof of a stable cognitive threshold after one scan. The app consistently labels a first result as an **early signal** and recommends repetition.

## Evidence map

| Finding relevant to CogniRun | What the evidence supports | What it does not support |
| --- | --- | --- |
| A 2024 synthesis pooled 651 effects from 113 studies and 4,390 healthy adults aged 18–45. It estimated a small overall acute-exercise effect (`g = 0.13 ± 0.04`), with more convincing evidence for reaction time than accuracy. [Garrett et al., 2024](https://www.nature.com/articles/s44271-024-00124-2) | Effects should be measured by domain, timing, and outcome rather than assumed. | A universal boost, an optimal zone for everyone, or a stable personal threshold from one visit. |
| Walking improved divergent alternate-use ideation during and shortly after walking, but did not similarly improve convergent Remote Associates performance. [Oppezzo & Schwartz, 2014](https://pubmed.ncbi.nlm.nih.gov/24749966/) | Walking may support idea generation; CogniRun's divergent task is a sensible consumer demonstration. | “Walking improves all creativity” or a guaranteed percentage improvement. |
| In 30 healthy young adults, accuracy worsened during moderate versus low-intensity running, while post-run reaction time improved with increasing intensity and moved back toward baseline within 20 minutes. [Wohlwend et al., 2017](https://doi.org/10.3389/fpsyg.2017.00406) | Measure both during exercise and at timestamped recovery points; retain accuracy and latency separately. | That harder running is always better or worse. |
| A randomized crossover study of 207 adults found no significant primary cognitive or motor differences roughly 60 minutes after sedentary, 35% VO₂max, and 70% VO₂max conditions. [Larson et al., 2024](https://pubmed.ncbi.nlm.nih.gov/38538194/) | Null responders and short-lived effects must remain first-class outcomes. | A persistent post-run cognitive benefit. |
| Exercising during memory encoding reduced veridical recall relative to exercise before encoding or control in one protocol. [Loprinzi et al., 2022](https://pubmed.ncbi.nlm.nih.gov/35522241/) | Encoding, retention, and retrieval are distinct phases and should be timestamped separately. | A general rule that exercise damages memory. |
| In 22 military participants, concurrent running and word recall reduced both running distance and recall versus performing them separately. [Gattoni et al., 2023](https://doi.org/10.1093/milmed/usad048) | A cognitive task can impose a measurable motor cost, so pace/cadence changes are useful outcomes. | A population-wide motor-cost estimate from this small specialist sample. |
| Percentage heart-rate reserve tracked percentage VO₂ reserve better than percentage VO₂max during incremental cycling in 63 adults. [Swain & Leutholtz, 1997](https://pubmed.ncbi.nlm.nih.gov/9139182/) | Heart-rate reserve is a defensible personalized intensity proxy for a field prototype. | HRR as a direct laboratory threshold, especially when maximum HR is age-estimated. |

PMID `39242965`, used by the in-app evidence note, is valid: Garrett et al. (2024), DOI `10.1038/s44271-024-00124-2`. It is a systematic review and meta-analysis, not a primary experiment.

## What Explore v1 measures

The hackathon discovery scan compares:

1. Seated
2. Standing
3. Walking
4. Personalized Zone 2 (60–70% heart-rate reserve)
5. Personalized Zone 3 (70–80% heart-rate reserve)
6. Immediate recovery
7. Five-minute recovery

It records per-field telemetry provenance, prompt timing, response timing method, transcript confidence when available, accuracy or auditable task score, pace during the task, and the exact number of seconds since exercise cessation for recovery trials.

The `+5` recall is anchored to 300 protocol seconds after the exercise-stop event. Demo acceleration advances protocol and simulated telemetry time, but it never divides a participant's real response latency.

The current divergent-thinking metric is deliberately called **idea fluency**. It counts distinct responses and flags them for review. Research-grade creativity scoring would additionally assess appropriateness, flexibility, and originality.

## Current prototype limitations

- The fixed ascending order confounds intensity with practice, fatigue, and time. It is appropriate for a safe consumer discovery demo, not causal inference.
- Most condition/domain cells contain a single question. A wrong answer is informative for the demo but too sparse to establish a reliable curve.
- Memory is encoded while seated and retrieved after exercise. That measures retention through the session, not whether encoding itself is better while walking or running.
- Breathlessness, wind, and speech-recognition failure can resemble cognitive decline. Accuracy, speech onset, transcript confidence, and missing responses must remain separate.
- Pace change should be compared with a matched no-task interval inside the same physical condition before it is treated as a research-grade motor cost.
- An age-estimated maximum heart rate produces an estimated zone, not a measured physiological threshold.

## Research-mode upgrade

A credible larger study should:

1. Select one primary cognitive domain per protocol and use multiple difficulty-matched parallel trials per condition.
2. Counterbalance condition order across participants, or run conditions on separate days.
3. Add matched no-task movement windows and record route, grade, weather, sleep, caffeine, training status, and perceived exertion.
4. Cross memory encoding and retrieval conditions in separate protocols.
5. Pre-register primary outcomes and exclusion rules before collecting an opt-in cohort.
6. Repeat each participant's protocol before issuing a stable recommendation.
7. Model within-person change and heterogeneous responder profiles instead of relying only on one group average.

## Judge-safe wording

> Most fitness apps map the body. CogniRun maps the interaction between body state and task performance. ROXFIT supplies timestamped movement and heart-rate state; ElevenLabs makes the experiment hands-free; CogniRun turns both into a repeatable N-of-1 protocol. We are not claiming that running makes everyone smarter. One scan is an early signal; repeat scans test whether a person's idea fluency, reasoning, working memory, recall, or response speed changes at different intensities and recovery times.

Avoid claims such as “31% smarter,” “walking IQ,” “Zone 2 is optimal,” or “ElevenLabs improves cognition.” Prefer:

> On this task, in this session, performance changed relative to the seated reference.
