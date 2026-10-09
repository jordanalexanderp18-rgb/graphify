---
name: productora
description: Jordan's content production studio, "la productora". It takes any content request (a reel, a carousel in one of six trending styles, a reel cover, stories, a caption, a weekly plan, or a batch for a client) and runs it end to end through the installed skills, using brand profiles, briefs, quality gates and delivery specs. Use when Jordan (@jordan_pincheira) asks for content ("hazme contenido", "un carrusel", "la portada", "algo para un cliente"), asks for new or trending designs ("diseños nuevos", "en tendencia"), asks for several pieces at once, or asks what the productora can make.
---

# La productora

One front door for every content piece. Each piece is still built by the
specialised skill that owns it (the routes below). This skill adds the menu,
the brief, the brand profile, the quality gates and the delivery spec, so every
piece looks like it came from the same studio.

## 1. What it makes

| Pieza | He brings | Route | Delivers | Cost |
| --- | --- | --- | --- | --- |
| Reel con tus videos | Original clips in his Drive folder "Reels" | `/reel-studio` section 4 (`template-footage`) | MP4 | Free with a recorded voice or the local voice. His cloned voice is HeyGen: ask first (about 1 credit per 25 s) |
| Reel con tu avatar | Topic or script | `/heygen-video`; for an exact script use `create_video_from_avatar` | HeyGen MP4, then optional `/embedded-captions` | HeyGen credits: ask first; with his OK, check `get_current_user` before and after |
| Reel animado (sin grabar) | Topic | `/reel-studio` section 3 (`template`) | MP4 | Free with the local voice. His cloned voice is HeyGen: ask first (1 credit) |
| Subtítulos | A clip of him talking | `/embedded-captions` | MP4 | Free |
| Carrusel | Topic, or an existing reel | `/ig-carousel` for the copy, then `templates/carousel.html` + `scripts/render_slides.sh` | PNG 1080x1350 | Free |
| Carrusel en un estilo de tendencia | Topic and photos | `/ig-carousel` for the copy, then one of the six styles in `templates/estilos/` (section 7) + `render_slides.sh` | PNG 1080x1350 + PDF | Free |
| Catálogo de estilos | — | `templates/estilos/catalogo.html` (section 7) + `render_slides.sh` | 10 PNG + PDF | Free |
| Portada de reel | The reel | `templates/cover.html` + `render_slides.sh <html> <dir> 1080 1920` | PNG 1080x1920 | Free |
| Historias | Topic | `/ig-story`, then the same renderer at 1080x1920 | PNG | Free |
| Texto de publicación | Any piece | `/ig-caption`, then `/ig-human` | Text | Free |
| Plan de la semana | Goals | `/ig-plan`, plus `/ig-viral` for evidence | Plan | Free |
| Revisión de perfil o resultados | Screenshots or insights | `/ig-profile`, `/ig-audit` | Report | Free |
| Comentarios y mensajes | Pasted comments or DMs | `/ig-reply`, `/ig-comment`, `/ig-dm` | Drafts | Free |
| Ideas desde tus comentarios | Pasted comments or DMs | `/comment-mining` | Questions, objections, their exact words and ranked reel ideas | Free |
| Serie de contenido | Niche and how often he can post | `/series-planner`, then `/ig-plan` | A named series with 12 episodes | Free |
| Testimonios y resultados | Client messages and results, with permission | `/social-proof-mining` | Proof cards with the consent status and the claim each one supports | Free |
| Video largo a reels | A long video | `/ig-repurpose` + `/video-use` | MP4s | Free |
| Video traducido | One of his videos | HeyGen `create_video_translation` | MP4 | Credits: ask first |
| Afiche o pieza especial | Idea | `/canvas-design` | PNG or PDF | Free |
| Tarifario | Prices from `VENTAS.md` | `templates/tarifario.html` + `render_slides.sh` (a design with `@page` also gets `slides.pdf`) | 5 PNG at 1080x1350 + PDF | Free |
| Guía de grabación | — | `templates/guia-grabacion.html` + `render_slides.sh <html> <dir> 1080 1920` | PNG | Free |
| Guion para el cliente | Topic | `templates/guion.html` (card 1: what they say, recorded later in a quiet room; card 2: shot list for the location) + the same renderer at 1080x1920 | 2 PNG | Free |
| Documentos para clientes | Brief | `/theme-factory` + the docx, pptx and pdf skills | File | Free |

**Repurpose by default.** When one piece works, offer the rest of the set: a reel
plus its cover, a carousel with the same idea, and a caption for each. The
first set (3 levels of squat) is the reference: one idea in three formats.

## 2. How a job runs

1. **Brief.** Copy `BRIEF-plantilla.md` into the job folder in the scratchpad and
   fill it in. Ask at most two questions. Jordan usually answers "elige tú": then
   decide, write the decision in the brief and tell him what you chose when you deliver.
   Before anyone records, send them the guía de grabación image and a short script
   to read: one hook, three points and one call to action.
2. **Brand.** Load `clientes/<slug>/MARCA.md`. Never invent a palette for a
   client who has one.
3. **Copy.** Write the script or the slides with the owning skill. Run the copy through
   `/ig-human` and use no invented numbers. Use standard coaching cues and nothing medical.
4. **HeyGen.** Ask Jordan before every HeyGen call, every time, free calls included: it is
   his standing rule ("No ocupes la HeyGen, siempre pregúntame", also in `AGENTS.md`). An OK
   covers only the job it was given for. Without one, use a recorded voice (his or the
   client's) or the local voice. Report the credits used at delivery.
5. **Build** along the route. Start a static piece with
   `scripts/new_job.sh <template.html> <job-dir>`: it copies the template and every font it
   loads (a missing font renders silently in a fallback), and lists the photos to add.
6. **Quality gates.** Do not deliver until these pass:
   - Video: `hyperframes check` with 0 errors, then a snapshot contact sheet that you
     have looked at frame by frame.
   - Statics: `node scripts/check_layout.cjs <design.html>` (add `--h 1920` for 9:16
     pieces) prints ok. It flags text near or past an edge, text touching other text
     (accents included) and text hidden under a box. Then render the slides and look at
     every one.
   - Always: text inside the safe zones, readable contrast, Spanish accents correct,
     and the handle spelled right.
7. **Finish.** For video, `scripts/finish_reel.sh <render.mp4> <out.mp4>` sets −14 LUFS
   on the final mix and writes a copy of about 16 MB. For statics, the PNGs as rendered.
8. **Deliver.** Use `SendUserFile` with the caption text, plus these reminders: switch
   on the AI label when the voice or avatar is synthetic, and add music from
   Instagram's own library at low volume.
9. **Log.** Add one row to the client's `MARCA.md` history.

## 3. Delivery specs

| Pieza | Spec |
| --- | --- |
| Reel | 1080x1920, 30 fps, H.264 + AAC, 15–45 s, −14 LUFS. Keep important content between y=230 and y=1440 and keep the right 230 px clear. |
| Portada | 1080x1920. Put the title inside the profile-grid crop (about y 285–1635) and at least 120 px from the sides. |
| Carrusel | 1080x1350 PNG, 6–10 slides (20 at most), type 32 px or larger, numbered slides, handle on every slide. |
| Historia | 1080x1920. Keep the top 250 px and the bottom 340 px clear for Instagram's story UI. |
| Texto | The first line has to survive the "... más" cut (about 125 characters). One ask and 3 hashtags. |

## 4. Clients

- **Selling:** prices, packages, costs, equipment, the sales steps, the contract
  checklist and how to register with Chile's tax service (SII) are in `VENTAS.md`.
  Quote from it, and update it when the real prices change.

- Jordan is client zero: `clientes/jordan/MARCA.md`.
- **This repository is public.** A real client's profile, footage, voice or avatar
  IDs and contact details go in a private repository, created by Jordan, with the
  Claude GitHub App granted access to it. Start from `clientes/_plantilla/MARCA.md`
  and never commit those files here.
- Get written consent before cloning anyone's face or voice. HeyGen asks for it too,
  through `create_avatar_consent`.
- Footage that shows other people (the spotter in the first reel) is fine for his
  own content. For a client, confirm they have the right to use it.

## 5. Tools and limits here

- **Network:** Custom allowlist with the package managers, Google Drive
  (`drive.usercontent.google.com`, `drive.google.com`) and `*.heygen.ai`. Instagram is
  out of reach, and nobody logs into it for him.
- **Drive:** the Google Drive connector lists folders and checks sharing. Download
  with curl from public "Lector" links, because the connector stops at 10 MB.
- **HeyGen** (only after asking, see section 2 step 4): `create_speech` returns his cloned
  voice with word timestamps.
  `create_video_from_avatar` takes an exact script. Studio and Video Agent URL inputs
  stop at 32 MB per video; `create_asset_upload` takes direct uploads up to 200 MB.
- **Render:** HyperFrames for video. For statics, `scripts/render_slides.sh` runs the
  preinstalled headless Chromium and needs no network. `scripts/check_layout.cjs` drives
  the same browser through the preinstalled global Playwright.
- **Canva:** the connector can generate and export designs when a client works in Canva.

## 6. Rules

- Never publish and never log into Instagram, Facebook or WhatsApp for anyone. The
  client posts.
- If the voice or avatar is synthetic, tell the client to switch on the AI label.
- Music comes from the platform's in-app library. HeyGen's library is used only inside
  videos rendered by HeyGen. Never download commercial tracks.
- Renders, footage and voice files stay in the scratchpad and out of git.
- The templates are the first jobs. Adapt them, but never ship one twice.

## 7. Estilos 2026

Six carousel looks from the October 2026 trend research. Each is a 3-slide template in
`templates/estilos/` (cover, one content slide, CTA) with the same sample content, so they
compare side by side; a real job adds the middle slides. `catalogo.html` gathers them in a
10-slide catalogue with the reel caption looks. It is a sales piece and can go to clients as
is: render each style to `out/<estilo>/` next to it first, and put four 1080x1920 frames of
the client's footage in `assets/frames/`.

| Estilo | File | Look | Ideal para | Letras |
| --- | --- | --- | --- | --- |
| Papel | `papel.html` | Warm off-white paper, serif headline with one italic accent, one accent colour | Tips, lists, personal brand | Instrument Serif + Instrument Sans |
| Neón | `neon.html` | Black, one neon accent, poster-size type, grayscale photos | Routines, challenges, gym | Boldonse + Geist Mono |
| Collage | `collage.html` | Kraft paper, taped polaroids, handwriting, a rubber stamp | Progress, behind the scenes | Bricolage Grotesque + Nothing You Could Do |
| Pop | `pop.html` | Yellow and hot pink, puffy outlined letters, blob photos, stickers | Quick tips, humour, a younger audience | Erica One + Outfit |
| Notas | `notas.html` | A note on a phone: highlighter, checklist, a redacted list as the hook | Lists, opinions | Instrument Sans |
| Revista | `editorial.html` | Magazine cover and feature pages, pull quote, folio | Premium brands, transformations | Gloock + Instrument Serif |

- All the fonts are SIL OFL. The styles' fonts ship in `canvas-design/canvas-fonts/`, and the
  catalogue's Anton and JetBrains Mono ship with the video skills; `new_job.sh` finds and
  copies them all.
- Boldonse caps stand 1.19 em tall: keep its display line-height at 1.34 or more, and 1.7
  when a line carries accents. Erica One draws its 1 as a plain block, so numerals use
  Outfit Bold.
- The notes look is generic on purpose: no real app's icons or toolbar.
- Caption looks for reels (catalogue slides 8 and 9): karaoke de marca (the spoken word
  turns the brand colour), minimal dinámico (clean lowercase, two or three words at a time),
  caja semitransparente (a dark box, for busy footage) and palabra clave (only the key word,
  huge). For talking-head video, `/embedded-captions` has 35 more caption identities.
- Instagram is out of reach. When the user likes a design there, ask for a screenshot and
  turn it into a new file here, keeping the layout idea and never another creator's brand,
  photos or copy.
- Sources: carousel guides from PostNitro, ContentStudio and PostEverywhere; design trend
  reports from Picsart, Adobe and Krumzi; caption trends from Blitzcut, OpusClip and Subclip;
  Pantone's 2026 colour (Cloud Dancer).
