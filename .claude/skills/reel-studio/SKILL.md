---
name: reel-studio
description: Jordan's free, local reel pipeline: script → voice → word-synced captions → HyperFrames animation → mastered 9:16 MP4, with no paid editor (no CapCut Pro). Use when Jordan (@jordan_pincheira) asks to make or edit a Reel, TikTok or Short, add subtitles, make a voiceover, cut his clips, or "edit it like CapCut". It wraps /hyperframes, /embedded-captions, /talking-head-recut, /video-use and the /ig-* skills with the setup this cloud environment needs.
---

# Reel Studio

The glue for this repo's video skills, tuned for one creator. It does not
replace the vendored skills; it routes to them and adds what they lack here:
provisioning behind a restrictive network, free Spanish transcription for
video-use, Jordan's brand, and the Reels delivery spec.

## Who it is for

- **@jordan_pincheira**: personal trainer in Chile. He writes in Spanish and
  uses "tú". Content: fitness technique, routines, progress; curious about AI.
  He makes content, he does not sell, so leave out sales CTAs unless he asks.
- **Brand** (from the first demo, `template/index.html`): bg `#15100c`,
  fg `#f7efe6`, accent `#ff5400`. Anton for display type, JetBrains Mono for
  labels. Inter is on HyperFrames' generic-font list, so do not use it.

## 1. Provision once per cloud session

```bash
bash .claude/skills/reel-studio/setup.sh            # add --video-use for raw-footage cutting
source "$HOME/.cache/reel-studio/env.sh"
```

`huggingface.co` is blocked by this environment's network policy. The script
installs the pinned HyperFrames CLI from npm and the render browser. It also
fetches the Parakeet v3 model (Spanish ASR) from the k2-fsa GitHub release,
verified against the sha256 values HyperFrames pins, and installs Kokoro TTS
in a local venv. Telemetry stays off (`HYPERFRAMES_NO_TELEMETRY=1`).

## 2. Pick the route

| Jordan brings | Route |
| --- | --- |
| An idea or script, no footage | `/ig-reel` for the script → voice (step 3) → `new-reel.sh` → `/hyperframes` → `/general-video` |
| A clip of himself talking; wants subtitles | `/embedded-captions` (35 caption styles, local matting) |
| A talking clip; wants graphic cards and lower-thirds | `/talking-head-recut` |
| Several raw takes to cut (pauses, retakes, mistakes) | `/video-use`, with `parakeet_to_scribe.py` instead of an ElevenLabs key |
| A HeyGen avatar video | `/heygen-video`, then `/embedded-captions` |
| His own gym clips with a voice-over | Section 4 (`new-reel.sh <dir> template-footage`) |
| A short title or sting, no voice | `/motion-graphics` |

## 3. Script-only route, end to end

1. **Script.** Use `/ig-reel`: three scored hooks, 15–45 s, one idea. Never
   invent numbers; leave `{{dato}}` and ask.
2. **Voice.** `hyperframes tts guion.txt --voice em_alex --lang es --speed 1.05 -o voz_raw.wav`
   (`em_santa` is the other male Spanish voice). You cannot listen, so
   transcribe the result back and compare it with the script word by word.
   If Jordan records his own voice note, use that instead; a voice note beats a synthetic voice.
3. **Master.** Run `bash .claude/skills/reel-studio/master_audio.sh voz_raw.wav <project>/assets/voz.wav`
   (−14 LUFS, −1.5 dBTP).
4. **Word timings.** `hyperframes transcribe assets/voz.wav --engine parakeet --language es --json`.
5. **Project.** Run `bash .claude/skills/reel-studio/new-reel.sh <dir>`, then follow
   `/hyperframes` → `/general-video`. That covers the BRIEF.md, the design gate,
   lint and check, and the snapshot contact sheet, which you inspect before any render.
6. **Render.** `hyperframes render --fps 30 --quality delivery -o renders/<name>.mp4`.
   Then run `bash .claude/skills/productora/scripts/finish_reel.sh renders/<name>.mp4 renders/<name>-final.mp4`.
   It sets −14 LUFS on the final mix: a mono voice mastered alone reads about −11 LUFS
   once the render makes it stereo. It also writes a copy of about 16 MB for his phone.
7. **Deliver.** Send the finished MP4 with `SendUserFile`. Jordan posts it himself.

## 4. Footage route: his clips and a voice-over

1. **Get the clips.** He puts the originals (not screen recordings) in a Google Drive
   folder shared as "Lector", meaning anyone with the link can view. Find the file IDs
   with the Google Drive connector (`search_files` with `parentId = '<folder id>'`). Then download them into the
   scratchpad with `curl -L "https://drive.usercontent.google.com/download?id=<ID>&export=download&confirm=t"`.
   The environment's allowlist covers that host. The connector's own download stops at 10 MB.
2. **Look before cutting.** His phone records 4K HEVC at 60 fps with a −90° rotation
   flag. Build contact sheets (`ffmpeg -ss <t> -t 12 -i clip.mp4 -vf "fps=2,scale=180:320,tile=6x4"`)
   and time each rep by eye.
3. **Proxy.** Transcode each clip to 1080x1920 H.264 at 30 fps with no audio:
   `-vf "scale=1080:1920:flags=lanczos,fps=30,eq=contrast=1.05:saturation=1.08,format=yuv420p" -c:v libx264 -crf 18 -g 15 -an`.
   Chromium may not decode HEVC, and the gym music on the clips is not his to publish.
4. **Voice.** By default, use a voice recorded by the person on screen (as a video, in a
   quiet room) or the local voice from section 3, and take word timings with Parakeet.
   His cloned voice "Jor" is HeyGen `create_speech`: ask him first, every time, before any
   HeyGen call, `list_voices` included (his standing rule, in `AGENTS.md`). With his OK, look
   up the ID with `list_voices`, because it is not stored here. The call returns an audio URL
   on `resource2.heygen.ai` and word timestamps. Drive the captions from those timestamps and
   confirm the words with Parakeet. It cost 1 credit for 23 s.
5. **Compose.** Run `new-reel.sh <dir> template-footage`. These rules come from the first reel:
   - A timed `<video>` must not sit inside a timed element, or lint fails with
     `video_nested_in_timed_element`. Put camera moves on untimed wrappers:
     `.shot > .kb > .punch > video`. Mark `.kb` with `data-layout-allow-overflow`.
   - Cut in the gaps between words. Set `data-media-start` so the movement matches the cue:
     he stands on "pecho arriba" and goes down on "baja".
   - In low-angle footage the heads sit near the top. Shift `.kb` down (`y: 260`) so the dark
     background becomes a header and the labels clear the faces.
   - Put the caption rail at `top: 1290px`, below the knees and above Instagram's caption area.
6. **Check, snapshot, render and deliver** as in section 3.

## Reels delivery spec

- 1080x1920, 30 fps, H.264 + AAC, 15–45 s.
- Safe zone: keep anything important between y=230 and y=1440, and keep the right 230 px
  clear for Instagram's action rail.
- Captions: at most 3 words per group, about 86 px Anton, with the active word in the accent colour.
  Hard swaps per group, one karaoke driver (`asr-keyword-glow`).
- The first frame already shows the hook. No intro, no greeting, no logo sting.

## Rules

- Never publish, and never log into Instagram for him. Jordan posts.
- Synthetic voice or avatar: tell Jordan to switch on Instagram's AI label.
- The HyperFrames Studio preview runs on this server and his phone cannot
  reach it, so send the rendered MP4 instead.
- Keep renders, voice files and his footage out of git; work in the scratchpad.
- `template/` is the first demo (squat, knees out) and `template-footage/` is the first
  reel from his clips (3 levels of squat). Adapt them, but never ship either one twice.
