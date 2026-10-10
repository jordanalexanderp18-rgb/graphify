#!/usr/bin/env python3
"""bajar.py: download a public video from a link so Claude can watch it.

    python3 -I .claude/skills/ver-links/bajar.py "<link>" <out-dir>

No login and no cookies, ever. Prints one JSON line at the end:
  {"estado": "ok", "archivo": ..., "subtitulos": [...], "titulo": ..., "autor": ..., "duracion": ...}
  {"estado": "bloqueado", "host": ...}   the environment's network does not allow that site
  {"estado": "login", "detalle": ...}    the site wants a login: stop, ask for a screen recording
  {"estado": "error", "detalle": ...}
"""
import glob, json, os, re, shutil, subprocess, sys
from urllib.parse import urlparse, urlunparse

STRIP_QUERY = ("instagram.com", "tiktok.com")  # tracking params only; YouTube needs ?v=


def ensure_ytdlp():
    try:
        import yt_dlp  # noqa: F401
    except ImportError:
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "--break-system-packages",
                        "yt-dlp[default]"], check=False)


def clean(url):
    p = urlparse(url.strip())
    if any(p.netloc.endswith(d) for d in STRIP_QUERY):
        p = p._replace(query="", fragment="")
    return urlunparse(p)


def main():
    if len(sys.argv) != 3:
        print(__doc__.strip().splitlines()[2].strip(), file=sys.stderr)
        sys.exit(2)
    url, out = clean(sys.argv[1]), sys.argv[2]
    os.makedirs(out, exist_ok=True)
    ensure_ytdlp()
    cmd = [sys.executable, "-m", "yt_dlp", "--no-playlist", "--no-cookies", "--no-progress",
           "--restrict-filenames", "--write-info-json",
           "-f", "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/bv*[height<=720]+ba/b",
           "--merge-output-format", "mp4",
           "--write-subs", "--write-auto-subs", "--sub-langs", "es.*,en.*", "--convert-subs", "srt",
           "-o", os.path.join(out, "video.%(ext)s"), url]
    node = shutil.which("node")
    if node and "youtu" in url:
        cmd[3:3] = ["--js-runtimes", f"node:{node}"]  # YouTube's player challenge needs a JS runtime
    r = subprocess.run(cmd, capture_output=True, text=True)
    err = r.stderr + r.stdout
    videos = [f for f in glob.glob(os.path.join(out, "video.*")) if f.endswith((".mp4", ".webm", ".mkv", ".mov"))]
    if r.returncode == 0 and videos:
        info = {}
        try:
            info = json.load(open(os.path.join(out, "video.info.json")))
        except Exception:
            pass
        print(json.dumps({"estado": "ok", "archivo": videos[0],
                          "subtitulos": sorted(glob.glob(os.path.join(out, "video.*.srt"))),
                          "titulo": info.get("title"), "autor": info.get("uploader") or info.get("channel"),
                          "duracion": info.get("duration"), "descripcion": (info.get("description") or "")[:500]},
                         ensure_ascii=False))
        return
    low = err.lower()
    if re.search(r"tunnel connection failed|proxyerror|unable to connect to proxy|403 forbidden.*proxy|"
                 r"connection refused|name or service not known|failed to resolve", low):
        print(json.dumps({"estado": "bloqueado", "host": urlparse(url).netloc}))
    elif re.search(r"login required|log in|sign in to confirm|cookies|requested content is not available|"
                   r"rate-limit reached", low):
        print(json.dumps({"estado": "login", "detalle": err.strip().splitlines()[-1][:300]}, ensure_ascii=False))
    else:
        print(json.dumps({"estado": "error", "detalle": "\n".join(err.strip().splitlines()[-3:])[:600]},
                         ensure_ascii=False))


if __name__ == "__main__":
    main()
