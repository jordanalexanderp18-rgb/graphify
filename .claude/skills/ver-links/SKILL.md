---
name: ver-links
description: Watch a video from a link the user pastes (a YouTube video, an Instagram reel, a TikTok) so Claude can say what it shows and says, copy its format, or check what it promises. It downloads the public video with no login, then reads it with ver-videos-y-audios (transcript plus frame sheets). Use when the user sends a youtube.com, youtu.be, instagram.com/reel or tiktok.com link, alone or with "míralo", "puedes verlo", "qué dice", "hazme uno así".
---

# Ver links

Jordan browses Instagram on his phone and sends links. This skill turns a link into a file
Claude can watch.

## Steps

1. **Read the page.** Fetch the link with the web fetch tool
   (`mcp__Parallel_Search__web_fetch`, objective: author, caption and topic). It runs outside
   this container, so it works even when the site is blocked here, and it gives the author and
   the caption. Tell the user what the video is in one line.
2. **Download it.**
   `python3 -I .claude/skills/ver-links/bajar.py "<link>" <scratchpad>/ver-links/<id>`
   installs yt-dlp the first time, drops tracking parameters and prints one JSON line:
   - `ok`: the file (720p MP4 at most), YouTube subtitles when there are any, title, author,
     duration.
   - `bloqueado`: the environment's network does not allow the site. Tell the user to add the
     domains below under Allowed domains (the cloud environment menu in the session's title
     bar, then Edit), with the package managers box left ticked. A running session picks the
     change up in about a minute.
   - `login`: the site wants an account. Stop there and ask for a screen recording. Never ask
     for a password or cookies, never pass `--cookies-from-browser`, and never route the
     download through a proxy or a downloader website to get around it.
   - `error`: report the last lines. Retry once only after a timeout.
3. **Watch it** with `/ver-videos-y-audios` on the downloaded file: transcript with timestamps,
   and every frame sheet read. When YouTube gave subtitles, read the `.srt` instead of
   transcribing.
4. **Answer** what the user asked, in Spanish. With no question, say what it is, what is worth
   taking from it and whether it fits his content or the productora.

## Domains to allow

| Site | Domains |
| --- | --- |
| YouTube | `youtube.com`, `*.youtube.com`, `youtu.be`, `*.googlevideo.com`, `*.ytimg.com` |
| Instagram | `instagram.com`, `*.instagram.com`, `*.cdninstagram.com`, `*.fbcdn.net` |
| TikTok (untested) | `tiktok.com`, `*.tiktok.com`, `*.tiktokcdn.com`, `*.tiktokv.com` |

## Rules

- Watching is for learning: summarise, take notes, copy a structure or an editing idea. Never
  re-upload someone else's video, and never copy their brand, photos or script word for word.
- Downloads stay in the scratchpad, never in git.
- YouTube sometimes answers cloud servers with "Sign in to confirm you're not a bot", and
  Instagram can refuse logged-out requests. Both come back as `login`: then the link only works
  from Claude Code on a computer, or as a screen recording.
