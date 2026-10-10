#!/usr/bin/env python3
"""Google Fotos via the Photos Picker API — stdlib only.

Since March 2025 Google only lets third-party apps read photos the user picks
by hand in Google's own picker. So the flow is: authorize once, open a picker
session, the user taps the photos on their phone, then this script downloads
exactly those.

Credentials come from the environment (or a JSON file next to the token):
  GOOGLE_FOTOS_CLIENT_ID, GOOGLE_FOTOS_CLIENT_SECRET   OAuth "Desktop app" client
  GOOGLE_FOTOS_REFRESH_TOKEN                           optional, skips `auth`
The token is cached at $GOOGLE_FOTOS_HOME/token.json (default ~/.config/google-fotos).
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly"
REDIRECT = "http://localhost"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
API = "https://photospicker.googleapis.com/v1"
HOME = Path(os.environ.get("GOOGLE_FOTOS_HOME", Path.home() / ".config" / "google-fotos"))
TOKEN_FILE = HOME / "token.json"


def die(msg):
    sys.exit(f"error: {msg}")


def client():
    cid = os.environ.get("GOOGLE_FOTOS_CLIENT_ID")
    secret = os.environ.get("GOOGLE_FOTOS_CLIENT_SECRET")
    if not (cid and secret) and TOKEN_FILE.exists():
        saved = json.loads(TOKEN_FILE.read_text())
        cid, secret = cid or saved.get("client_id"), secret or saved.get("client_secret")
    if not (cid and secret):
        die("set GOOGLE_FOTOS_CLIENT_ID and GOOGLE_FOTOS_CLIENT_SECRET (see SKILL.md)")
    return cid, secret


def http(method, url, *, data=None, token=None, raw=False):
    headers = {}
    body = None
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if data is not None:
        if method == "FORM":
            method, body = "POST", urllib.parse.urlencode(data).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            body = json.dumps(data).encode()
            headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            payload = resp.read()
    except urllib.error.HTTPError as e:
        die(f"{method} {url.split('?')[0]} -> {e.code}: {e.read().decode(errors='replace')[:500]}")
    except urllib.error.URLError as e:
        die(f"{url.split('?')[0]} unreachable ({e.reason}); is the host allowed by the network policy?")
    return payload if raw else (json.loads(payload) if payload else {})


def save_token(tok):
    HOME.mkdir(parents=True, exist_ok=True)
    TOKEN_FILE.write_text(json.dumps(tok, indent=2))
    TOKEN_FILE.chmod(0o600)


def access_token():
    tok = json.loads(TOKEN_FILE.read_text()) if TOKEN_FILE.exists() else {}
    if tok.get("access_token") and tok.get("expires_at", 0) > time.time() + 60:
        return tok["access_token"]
    refresh = os.environ.get("GOOGLE_FOTOS_REFRESH_TOKEN") or tok.get("refresh_token")
    if not refresh:
        die("not authorized yet: run `auth-url`, then `auth-code`")
    cid, secret = client()
    new = http("FORM", TOKEN_URL, data={
        "client_id": cid, "client_secret": secret,
        "refresh_token": refresh, "grant_type": "refresh_token"})
    tok.update(new, refresh_token=refresh, client_id=cid, client_secret=secret,
               expires_at=time.time() + new.get("expires_in", 3600))
    save_token(tok)
    return tok["access_token"]


def cmd_auth_url(_):
    cid, _secret = client()
    print(AUTH_URL + "?" + urllib.parse.urlencode({
        "client_id": cid, "redirect_uri": REDIRECT, "response_type": "code",
        "scope": SCOPE, "access_type": "offline", "prompt": "consent"}))


def cmd_auth_code(args):
    code = args.code
    if code.startswith("http"):
        query = urllib.parse.parse_qs(urllib.parse.urlparse(code).query)
        if "code" not in query:
            die("that URL has no ?code= in it")
        code = query["code"][0]
    cid, secret = client()
    tok = http("FORM", TOKEN_URL, data={
        "client_id": cid, "client_secret": secret, "code": code,
        "redirect_uri": REDIRECT, "grant_type": "authorization_code"})
    tok.update(client_id=cid, client_secret=secret,
               expires_at=time.time() + tok.get("expires_in", 3600))
    save_token(tok)
    print(f"authorized; token saved to {TOKEN_FILE}")
    if tok.get("refresh_token"):
        print("to survive a new container, store this as GOOGLE_FOTOS_REFRESH_TOKEN:")
        print(tok["refresh_token"])


def cmd_pick(args):
    s = http("POST", f"{API}/sessions", data={}, token=access_token())
    print(json.dumps({"session": s["id"], "open_this": s["pickerUri"]}, indent=2))


def session_ready(sid):
    return http("GET", f"{API}/sessions/{sid}", token=access_token())


def cmd_wait(args):
    deadline = time.time() + args.timeout
    while time.time() < deadline:
        s = session_ready(args.session)
        if s.get("mediaItemsSet"):
            print("photos picked")
            return
        poll = s.get("pollingConfig", {}).get("pollInterval", "5s").rstrip("s")
        time.sleep(max(float(poll), 3))
    die(f"nothing picked after {args.timeout}s; run `wait` again once the user is done")


def media_items(sid):
    page = None
    while True:
        q = {"sessionId": sid, "pageSize": 100}
        if page:
            q["pageToken"] = page
        r = http("GET", f"{API}/mediaItems?" + urllib.parse.urlencode(q), token=access_token())
        yield from r.get("mediaItems", [])
        page = r.get("nextPageToken")
        if not page:
            return


def cmd_list(args):
    if not session_ready(args.session).get("mediaItemsSet"):
        die("the user has not finished picking yet; run `wait` first")
    for m in media_items(args.session):
        f = m["mediaFile"]
        meta = f.get("mediaFileMetadata", {})
        print(f"{m['type']:5} {m.get('createTime', '')[:10]} {meta.get('width')}x{meta.get('height')} {f['filename']}")


def cmd_download(args):
    if not session_ready(args.session).get("mediaItemsSet"):
        die("the user has not finished picking yet; run `wait` first")
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    n = 0
    for m in media_items(args.session):
        f = m["mediaFile"]
        # =d keeps EXIF for photos; =dv is the playable video
        suffix = "=dv" if m["type"] == "VIDEO" else "=d"
        target = out / Path(f["filename"]).name
        if target.exists():
            target = target.with_stem(f"{target.stem}-{m['id'][:8]}")
        target.write_bytes(http("GET", f["baseUrl"] + suffix, token=access_token(), raw=True))
        n += 1
        print(target)
    print(f"{n} file(s) in {out}")
    if not args.keep:
        http("DELETE", f"{API}/sessions/{args.session}", token=access_token())


def main():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("auth-url", help="print the Google consent link")
    a = sub.add_parser("auth-code", help="exchange the code (or the whole localhost URL)")
    a.add_argument("code")
    sub.add_parser("pick", help="open a picker session; prints the link to tap")
    w = sub.add_parser("wait", help="poll until the user finishes picking")
    w.add_argument("session")
    w.add_argument("--timeout", type=int, default=600)
    ls = sub.add_parser("list", help="list the picked items")
    ls.add_argument("session")
    d = sub.add_parser("download", help="download the picked items")
    d.add_argument("session")
    d.add_argument("--out", default="google-fotos")
    d.add_argument("--keep", action="store_true", help="do not delete the session afterwards")
    args = p.parse_args()
    {"auth-url": cmd_auth_url, "auth-code": cmd_auth_code, "pick": cmd_pick, "wait": cmd_wait,
     "list": cmd_list, "download": cmd_download}[args.cmd](args)


if __name__ == "__main__":
    main()
