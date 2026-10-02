#!/usr/bin/env python3
"""Install the command board and wire every agent to read it.

Three agents on one project start cold, each from its own idea of what matters,
and quietly contradict each other. This writes one board — MANDO.md — and the
per-agent hooks that make each of them read it before acting and update it
after: AGENTS.md for Claude Code, .cursor/rules/mando.mdc for Cursor, GEMINI.md
for Gemini.

The board is the single source of orders. The hooks are generated from it, never
edited by hand, so there is one place to change what the agents are told.

Existing files are never clobbered: the hook sections are delimited by markers
and only the text between them is replaced, so anything else in an AGENTS.md or
GEMINI.md survives. MANDO.md itself is written once and then left alone — it is
yours to keep.

Usage:
    python scripts/mando_install.py .                 # the current project
    python scripts/mando_install.py ~/vault --dry-run

Stdlib only.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

BEGIN = "<!-- mando:begin -->"
END = "<!-- mando:end -->"

MANDO = """# MANDO

Tablero de ordenes. Quien manda escribe aqui; quien ejecuta lee aqui y marca el
resultado aqui. Si una tarea no esta en este archivo, no existe.

Es un archivo versionado: viaja en el repo, asi que los tres agentes ven lo
mismo sin depender de ninguna conversacion.

## Como funciona

- **Una tarea, un responsable.** `@claude`, `@cursor` o `@gemini` en la linea.
- **Estado explicito:** `[ ]` pendiente · `[~]` en curso · `[x]` hecho · `[!]` bloqueado.
- **Un bloqueo se escribe, no se calla.** Marca `[!]` y di por que en una linea.
  Un agente parado en silencio es el fallo mas caro de todos.
- Al terminar algo que valga la pena recordar, la entrada va a `SESSIONS.md`,
  no aqui. Este tablero es el presente; `SESSIONS.md` es la memoria.

## En curso

_Nada ahora mismo._

## Pendiente

- [ ] @claude Ejemplo: borra esta linea y escribe la primera orden de verdad.

## Bloqueado

_Nada._

## Hecho

_Nada todavia._
"""

HOOK = """{begin}
## Mando

Este proyecto se coordina desde `MANDO.md`. No es documentacion: es el tablero
de ordenes, y es la unica fuente de lo que hay que hacer.

Reglas, antes de cualquier otra cosa:

1. **Lee `MANDO.md` al empezar.** Trabaja solo lo que este asignado a ti
   (`{handle}`) o sin asignar. Lo de otro agente no se toca.
2. **Marca la tarea `[~]` al empezarla y `[x]` al terminarla**, en el mismo
   commit que el trabajo.
3. **Si te bloqueas, marca `[!]` y escribe por que en una linea.** Nunca
   abandones una tarea en silencio: el siguiente agente repetira tu callejon
   sin salida.
4. **No inventes contenido.** Si falta informacion, dilo y deja la tarea `[!]`.
   Un dato supuesto se vuelve indistinguible del real en semanas.
5. Si el proyecto tiene `SESSIONS.md`, lee sus 2-3 entradas mas recientes antes
   de tocar nada, y revisa las secciones *Rejected* / *Descartado* antes de
   reintentar un enfoque. Un callejon sin salida cuesta una sesion entera.

No edites este bloque a mano: lo regenera `scripts/mando_install.py`.
{end}
"""

TARGETS = {
    "AGENTS.md": "@claude",
    "GEMINI.md": "@gemini",
}
CURSOR_PATH = ".cursor/rules/mando.mdc"
CURSOR_HEAD = """---
description: tablero de mando del proyecto
alwaysApply: true
---

"""


def splice(existing: str, block: str) -> str:
    """Return *existing* with the marked block replaced, or appended if absent.

    Replacing between markers is what makes this safe to re-run against a file
    the user also edits by hand: their text outside the markers is untouched,
    and the generated text never accumulates duplicates.
    """
    if BEGIN in existing and END in existing:
        head = existing.split(BEGIN)[0]
        tail = existing.split(END, 1)[1]
        return head + block.rstrip("\n") + tail
    sep = "" if existing.endswith("\n\n") or not existing else ("\n" if existing.endswith("\n") else "\n\n")
    return existing + sep + block


def main() -> int:
    ap = argparse.ArgumentParser(description="Install MANDO.md and wire agents to it.")
    ap.add_argument("project", type=Path, help="project or vault root")
    ap.add_argument("--dry-run", action="store_true", help="show what would change, write nothing")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, OSError):
            pass

    root = args.project.expanduser()
    if not root.is_dir():
        print(f"error: not a directory: {root}", file=sys.stderr)
        return 2

    created, updated, skipped = [], [], []

    board = root / "MANDO.md"
    if board.exists():
        skipped.append("MANDO.md")
    else:
        created.append("MANDO.md")
        if not args.dry_run:
            board.write_text(MANDO, encoding="utf-8", newline="\n")

    for name, handle in TARGETS.items():
        dest = root / name
        block = HOOK.format(begin=BEGIN, end=END, handle=handle)
        before = dest.read_text(encoding="utf-8") if dest.exists() else ""
        after = splice(before, block)
        if before == after:
            skipped.append(name)
            continue
        (updated if before else created).append(name)
        if not args.dry_run:
            dest.write_text(after, encoding="utf-8", newline="\n")

    cursor = root / CURSOR_PATH
    cursor_body = CURSOR_HEAD + HOOK.format(begin=BEGIN, end=END, handle="@cursor")
    before = cursor.read_text(encoding="utf-8") if cursor.exists() else ""
    if before == cursor_body:
        skipped.append(CURSOR_PATH)
    else:
        (updated if before else created).append(CURSOR_PATH)
        if not args.dry_run:
            cursor.parent.mkdir(parents=True, exist_ok=True)
            cursor.write_text(cursor_body, encoding="utf-8", newline="\n")

    verb = "would create" if args.dry_run else "created"
    verb2 = "would update" if args.dry_run else "updated"
    for label, items in ((verb, created), (verb2, updated), ("unchanged", skipped)):
        if items:
            print(f"{label} ({len(items)}):")
            for i in items:
                print(f"  {i}")
    if not created and not updated:
        print("nothing to do — everything is already in place")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
