# Export verification

Verified on 28 August 2026.

- TypeScript: `npm run typecheck` passes.
- Both MP4s contain 40.000 seconds of H.264 video at 30 fps; dimensions are 1920×1080 and 1080×1920 respectively.
- Both contain 48 kHz stereo AAC. Container duration is 40.043 seconds because of AAC padding.
- Encoded audio mean level is −16.3 dBFS and sample peak is −1.8 dBFS; no clipped samples were detected by the level check.
- Eleven representative scene frames in each orientation were visually inspected, including frames extracted from the finished MP4s. No clipped or overlapping text was found.
- Research and simulation notes were enlarged in the portrait composition before the final render.
- The QR decoded to `https://dreamy-meringue-246d16.netlify.app/` from the source asset, both still renders, and end cards extracted from both finished MP4s.
- QR decoding also passed after reducing the full end card to a 1280px landscape display width and a 390px portrait display width. This is a digital scan check, not a guarantee for every physical screen or camera.
- Video file sizes: landscape 7,207,468 bytes; portrait 6,396,904 bytes.

Contact sheets and inspected frames are retained locally in `out/qa/` and excluded from Git; `npm run stills` regenerates the scene frames. The finished MP4s and posters are included in the repository. The advert is text-led with original instrumental music, not generated speech. Product interactions and charts are illustrative; published research is not presented as a CogniRun result.
