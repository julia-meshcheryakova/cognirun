# CogniRun — PRODUCT build phases (voice-dictated, fastest path to what we have now)

_The order to dictate prompts to reach the current CogniRun (v0.6) from zero. Each phase = a few one-breath prompts and ends in a DEMO-ABLE state (critical: every handoff should have something to show for build × distance). Browser-first — no APK until the very end._

**Anchor idea:** the app is a single-page HTML+JS "run simulator" with a quiz. Build it in this order — each phase is independently show-able, so if you run out of time you still have a working demo.

---

## PHASE A — Skeleton that RUNS (a moving number on screen)
**Goal:** press Run → distance + time tick up. Nothing else. This alone is demo-able.

> "Create a single-page app, plain HTML and JS, no build step, no frameworks. A phone-sized dark screen with a Run button. When I press Run, a distance in km and a timer start counting up at a 6 min/km pace. Show it in the browser, one-sentence status."

> "Add a demo speed selector — x1, x6, x20, x60 — that multiplies how fast the run advances. Browser test, one-sentence status."

✅ **Demo checkpoint:** press Run, watch km/time climb, change speed. That's a product.

---

## PHASE B — The quiz appears at each kilometre
**Goal:** every 1 km a question pops up. This is the core idea (run + think).

> "Every kilometre, show a question card with the question text and answer options. Hold a small list of easy questions in the code. Keep the run going underneath. Browser test, one-sentence status."

> "Make the first question an easy multiple-choice one. Support both multiple-choice and typed-answer questions. One-sentence status."

✅ **Demo checkpoint:** run advances, question appears at 1 km, you can pick an answer.

---

## PHASE C — Scoring (Kahoot-style) + lock after submit
**Goal:** answering gives points based on speed; once submitted it locks.

> "When a question appears, start a 90-second timer. A correct answer scores 100 points if instant, dropping linearly to 50 at 90 seconds — formula (1 minus elapsed over 90 over 2) times 100. Wrong answer is zero. One-sentence status."

> "After I submit an answer, lock the card — no more editing, show correct or wrong, and keep a running total score. Browser test, one-sentence status."

✅ **Demo checkpoint:** answer fast = more points, slow = fewer, locked after submit, total climbs.

---

## PHASE D — Finish + results screen
**Goal:** run ends correctly and shows a results summary.

> "The run finishes only when BOTH the target distance is covered AND the last question is answered. If distance is done but a question is still open, keep it on screen until I submit. One-sentence status."

> "On finish, show a results screen: distance, time, correct out of total, total points, and a per-kilometre breakdown. One-sentence status."

✅ **Demo checkpoint:** full playthrough at x60 → clean results screen. **This is a complete, judge-able product.** Everything after is polish/hardware.

---

## PHASE E — Alerts (beep + vibrate on new question)
**Goal:** the runner is told to look at the phone.

> "When a new question appears, play a short beep and vibrate. Also beep once a second for the last 5 seconds before the 90-second window closes, unless already answered. Use the simulated clock, not real time, so it stays in sync at high speed. One-sentence status."

✅ **Demo checkpoint:** audible cue at each question + countdown warning.

---

## PHASE F — Heart rate (real hardware — do LAST, needs the APK)
**Goal:** live BPM from the Garmin fēnix. This is the only part that needs native + a real phone.

> "Add a heart-rate display at the top with a live chart. In the browser use a fake BPM generator. When running as a native app, connect over Bluetooth to a heart-rate device and show the real BPM. Auto-detect which environment. One-sentence status."

> "Remember the paired watch and auto-connect next time, with a small 'forget' link. Hide the connect and GPS buttons once both are set up, leaving only the status badges. One-sentence status."

**Then, and only then, package to APK:**
> "Wrap this as a Capacitor Android app and build a debug APK. Report the path and size."

✅ **Demo checkpoint:** real 75 BPM on the S25 during a live run. THE money shot for the pitch.

---

## Why this order (the logic to keep in your head)

- **A→D is the whole product in the browser** — no hardware, no APK, all fast-iterating. If the day goes sideways you still demo A→D.
- **E is a 1-prompt nice-to-have.**
- **F (heart rate + APK) is LAST** because it's the only slow, hardware-bound, error-prone part. Today it ate 5 rebuild cycles. Don't let it block the core.
- **Every phase is demo-able** → on any handoff you have a working thing → build score never sits at zero.

## The 30-second recall version (memorise THIS)
1. **Run ticks** (button → km/time + speed)
2. **Question each km** (MC + typed)
3. **Score + lock** (Kahoot 90s, total)
4. **Finish + results** (both conditions, summary)  ← *complete product here*
5. **Beep/vibrate**
6. **Heart rate + APK** (real hardware, last)

Say them in that order. Don't jump to heart rate early — it's the trap.
