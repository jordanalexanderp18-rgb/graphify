// Layout check for slide designs, run before looking at the renders. For every slide it reports:
//   EDGE     text closer than the margin to a slide edge, or past it
//   OVERLAP  text touching other text (accents and descenders included)
//   COVERED  text hidden under a box, photo or sticker drawn on top of it
//   FONT     a web font that failed to load (the render would use a fallback: start jobs with
//            new_job.sh, which copies the fonts next to the design)
// Boxes come from each glyph's real ink (canvas metrics), so display fonts whose caps stand taller
// than the font size (Boldonse) and accents above a tight line-height are caught. It does not judge
// contrast or taste: still look at every slide.
//
//   node .claude/skills/productora/scripts/check_layout.cjs [--w 1080 --h 1350 --m 56] design.html ...
//
// The design follows the templates' contract: <section class="slide"> elements, and ?slide=N
// shows only slide N. Uses the preinstalled Playwright with the same headless Chromium as
// render_slides.sh. Exit status 1 when anything is reported.
const path = require("node:path");
const { execSync } = require("node:child_process");

function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    return require(path.join(execSync("npm root -g").toString().trim(), "playwright"));
  }
}

// Runs inside the page, on the one visible slide.
function inspect(m) {
  const out = [];
  const slide = [...document.querySelectorAll(".slide")].find((s) => getComputedStyle(s).display !== "none");
  if (!slide) return out;
  const sr = slide.getBoundingClientRect();
  const ctx = document.createElement("canvas").getContext("2d");
  const block = "p,li,h1,h2,h3,span.hand";

  // Ink box of one character: canvas metrics give the glyph's real extent around its origin.
  const ink = (el, ch) => {
    const cs = getComputedStyle(el);
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const c = cs.textTransform === "uppercase" ? ch.toUpperCase() : cs.textTransform === "lowercase" ? ch.toLowerCase() : ch;
    return ctx.measureText(c);
  };
  // Full-slide layers (grain, paper fibre, scrims) sit on top on purpose.
  const overlay = (e) => {
    const r = e.getBoundingClientRect();
    return r.width * r.height >= 0.9 * sr.width * sr.height;
  };
  const opaque = (e) => {
    const cs = getComputedStyle(e);
    if (Number(cs.opacity) < 0.3 || cs.visibility === "hidden") return false;
    if (/^(IMG|VIDEO|CANVAS|svg)$/.test(e.tagName)) return true;
    if (cs.backgroundImage.includes("url(")) return true; // a photo; gradients are decoration
    const a = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
    if (!a) return false;
    const alpha = a[1].split(",")[3];
    return alpha === undefined || Number(alpha) >= 0.3;
  };
  const label = (e) => e.tagName.toLowerCase() + (e.classList.length ? "." + [...e.classList].join(".") : "");

  const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
  const boxes = [];
  let node;
  while ((node = walker.nextNode())) {
    if (!node.textContent.trim()) continue;
    const el = node.parentElement;
    const text = node.textContent;
    const txt = text.trim().replace(/\s+/g, " ").slice(0, 36);
    const range = document.createRange();
    const rects = [];
    let cover = null;
    for (let i = 0; i < text.length; i++) {
      if (/\s/.test(text[i])) continue;
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const mt = ink(el, text[i]);
      // The range box is the font box (ascent + descent), scaled by any transform on the way.
      const k = r.height / (mt.fontBoundingBoxAscent + mt.fontBoundingBoxDescent || r.height);
      const box = {
        l: r.left - k * mt.actualBoundingBoxLeft,
        r: r.left + k * mt.actualBoundingBoxRight,
        t: r.top + k * (mt.fontBoundingBoxAscent - mt.actualBoundingBoxAscent),
        b: r.top + k * (mt.fontBoundingBoxAscent + mt.actualBoundingBoxDescent),
      };
      rects.push(box);
      // Whatever is stacked above the glyph's centre, down to the text's own element.
      if (!cover) {
        const x = (box.l + box.r) / 2;
        const y = (box.t + box.b) / 2;
        if (x > 0 && y > 0 && x < innerWidth && y < innerHeight)
          for (const e of document.elementsFromPoint(x, y)) {
            if (e === el || el.contains(e) || e.contains(el)) break;
            if (overlay(e)) continue;
            if (opaque(e)) {
              cover = e;
              break;
            }
          }
      }
    }
    if (!rects.length) continue;
    const u = { l: 1e9, t: 1e9, r: -1e9, b: -1e9 };
    for (const r of rects) {
      u.l = Math.min(u.l, r.l);
      u.t = Math.min(u.t, r.t);
      u.r = Math.max(u.r, r.r);
      u.b = Math.max(u.b, r.b);
    }
    const gap = { l: u.l - sr.left, t: u.t - sr.top, r: sr.right - u.r, b: sr.bottom - u.b };
    if (Math.min(gap.l, gap.t, gap.r, gap.b) < m)
      out.push(`EDGE "${txt}" left ${gap.l | 0} top ${gap.t | 0} right ${gap.r | 0} bottom ${gap.b | 0}`);
    if (cover) out.push(`COVERED "${txt}" under ${label(cover)}`);
    boxes.push({ el, txt, core: rects.map((r) => ({ l: r.l + 1, r: r.r - 1, t: r.t + 1, b: r.b - 1 })) });
  }
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const A = boxes[i];
      const B = boxes[j];
      if (A.el === B.el || A.el.contains(B.el) || B.el.contains(A.el)) continue;
      const pa = A.el.closest(block);
      if (pa && pa === B.el.closest(block)) continue;
      const hit = A.core.some((a) => B.core.some((b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b));
      if (hit) out.push(`OVERLAP "${A.txt}" x "${B.txt}"`);
    }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = { w: 1080, h: 1350, m: 56 };
  const files = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) opt[args[i].slice(2)] = Number(args[++i]);
    else files.push(args[i]);
  }
  if (!files.length) {
    console.error("usage: check_layout.cjs [--w 1080 --h 1350 --m 56] design.html ...");
    process.exit(2);
  }

  const { chromium } = loadPlaywright();
  const executablePath =
    process.env.CHROME || "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox", "--disable-gpu"] });
  const page = await browser.newPage({ viewport: { width: opt.w, height: opt.h } });
  let problems = 0;

  for (const f of files) {
    const url = "file://" + path.resolve(f);
    await page.goto(url, { waitUntil: "load" });
    const count = await page.evaluate(() => document.querySelectorAll(".slide").length);
    const report = [];
    await page.evaluate(() => document.fonts.ready);
    for (const fam of await page.evaluate(() => [...new Set([...document.fonts].filter((f) => f.status === "error").map((f) => f.family))]))
      report.push(`FONT ${fam} did not load`);
    for (let n = 1; n <= count; n++) {
      await page.goto(`${url}?slide=${n}`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      for (const line of await page.evaluate(inspect, opt.m)) report.push(`slide ${n} ${line}`);
    }
    problems += report.length;
    console.log(`${path.basename(f)}: ${count ? "" : "no .slide elements "}${report.length ? "\n  " + report.join("\n  ") : "ok"}`);
  }
  await browser.close();
  process.exit(problems ? 1 : 0);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(2);
});
