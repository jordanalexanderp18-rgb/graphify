#!/usr/bin/env python3
"""Create the index, area and template notes an Obsidian vault needs to stay navigable.

A vault without index notes degrades into a pile: notes exist, nothing points at
them, and the graph shows a star around whichever note happened to link a few
others. This writes one entry-point note, one map-of-content note per area, and
a small set of templates, so a new note has somewhere to be linked from the
moment it is created.

Nothing is ever overwritten. A note that already exists is left exactly as it is
and reported as skipped, so this is safe to re-run and safe to point at a vault
that already has content.

Generated trees (graphify-out/) are never written to: the reference note links
*into* them instead, which makes those artifacts reachable in the graph without
an edit that the next `graphify update` would discard.

Usage:
    python scripts/vault_scaffold.py C:\\Users\\you\\vault --dry-run
    python scripts/vault_scaffold.py C:\\Users\\you\\vault

Stdlib only, so it runs on a machine without graphify installed.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

INDEX = """---
type: indice
---
# claude-os

Punto de entrada del vault. Si una nota no se alcanza desde aqui siguiendo
enlaces, esta perdida aunque exista.

## Areas

- [[negocio]] — clientes, productos, prioridades
- [[estandares]] — como se hacen las cosas aqui
- [[sesiones]] — decisiones y descartes, sesion por sesion
- [[referencia]] — material generado por herramientas
- [[plantillas]] — de donde sale cada nota nueva

## Reglas

- Toda nota nueva se enlaza desde el MOC de su area el mismo dia que nace.
- Toda nota nueva enlaza al menos a otra. Una nota que no enlaza a nada es un
  callejon sin salida para quien navegue.
- Nada se edita a mano dentro de `graphify-out/`: se regenera y el cambio se
  pierde. Para darle alcance, se enlaza desde [[referencia]].
"""

NEGOCIO = """---
type: moc
area: negocio
---
# Negocio

Mapa del area. Cada nota de `negocio/` se enlaza desde aqui.

## Notas

- [[prioridades]] — que va primero y por que
- [[app-etiqueta]]
- [[ideas]]
- [[tip-y-tap]]
- [[webs-leads]]

## Pendiente de enlazar

Estas notas cuelgan solo de [[prioridades]]. Cuando dos de ellas se relacionen
entre si, el enlace va en las notas, no aqui: este MOC lista, no explica.

---

[[index|Volver al indice]]
"""

ESTANDARES = """---
type: moc
area: estandares
---
# Estandares

Como se hacen las cosas, para no volver a decidirlo cada vez. Una nota por
estandar, en imperativo y con el motivo.

## Notas

_Vacio por ahora._ Candidatos a primer estandar:

- Como se nombra una nota
- Que lleva una nota antes de considerarse terminada
- Cuando algo es un estandar y cuando es solo una preferencia

Cada nota nueva se crea desde [[plantilla-nota]] y se lista aqui.

---

[[index|Volver al indice]]
"""

SESIONES = """---
type: moc
area: sesiones
---
# Sesiones

Memoria de trabajo: que se decidio, que se descarto y por que. El registro de
lo que se hizo ya lo lleva el historial de cada proyecto; lo que no sobrevive
en ningun sitio es el razonamiento.

La seccion mas valiosa de cada entrada es **Descartado**. Es el unico lugar
donde queda constancia de un callejon sin salida, y volver a recorrerlo cuesta
una sesion entera.

## Entradas

_Ninguna todavia._ La primera se crea desde [[plantilla-sesion]].

---

[[index|Volver al indice]]
"""

REFERENCIA = """---
type: moc
area: referencia
---
# Referencia

Material generado por herramientas. **No se edita a mano**: se regenera y
cualquier cambio se pierde.

Esta nota existe para darle alcance en el grafo. Enlazar desde aqui convierte
esos archivos en nodos alcanzables sin tocarlos.

## graphify

- [[GRAPH_REPORT]] — nodos centrales y estructura de comunidades
- [[LESSONS]] — reflexiones acumuladas por graphify

## Consultas guardadas

- [[query_20260914_153043_6c1cea3c_traza_la_conexion_entre_el_sistema_de_gestion_tip|Traza: conexion con el sistema de gestion tip]]

---

[[index|Volver al indice]]
"""

PLANTILLAS = """---
type: moc
area: plantillas
---
# Plantillas

Toda nota nueva sale de una de estas. El objetivo no es la forma: es que la
nota nazca ya enlazada, porque enlazarla despues casi nunca ocurre.

- [[plantilla-nota]] — una idea, un tema, un cliente
- [[plantilla-decision]] — algo que se decidio y conviene no rediscutir
- [[plantilla-sesion]] — entrada de trabajo, con lo descartado

Para que Obsidian las ofrezca con un atajo: Ajustes → Plantillas → carpeta
`plantillas`.

---

[[index|Volver al indice]]
"""

PLANTILLA_NOTA = """---
type: nota
area:
tags: []
---
# Titulo

Una frase que diga de que va esto. Si no se puede resumir en una,
probablemente son dos notas.

## Contenido

## Relacionado

- Enlaza al MOC de su area: [[negocio]], [[estandares]] o [[referencia]]
- Enlaza al menos a otra nota concreta, no solo al MOC

---

[[plantillas|Plantilla usada]]
"""

PLANTILLA_DECISION = """---
type: decision
fecha:
area:
---
# Que se decidio

En una frase, en pasado y en concreto.

## Contexto

Que hizo falta decidir esto.

## Alternativas descartadas

- Opcion A — descartada porque...

Sin esta seccion la decision se vuelve a discutir dentro de tres meses.

## Consecuencias

Que queda atado a partir de ahora y que habria que revisar para cambiarlo.

---

[[plantillas|Plantilla usada]]
"""

PLANTILLA_SESION = """---
type: sesion
fecha:
---
# AAAA-MM-DD — titulo corto

## Contexto

Por que hubo esta sesion. Una o dos frases.

## Decisiones

- Se eligio X sobre Y porque Z.

## Descartado

- Se probo A — fallo por B. No reintentar sin resolver B antes.

## Abierto

- Que deberia retomar la proxima sesion.

---

[[sesiones|Volver al mapa de sesiones]] · [[plantillas|Plantilla usada]]
"""

FILES = {
    "index.md": INDEX,
    "negocio/negocio.md": NEGOCIO,
    "estandares/estandares.md": ESTANDARES,
    "sesiones/sesiones.md": SESIONES,
    "referencia/referencia.md": REFERENCIA,
    "plantillas/plantillas.md": PLANTILLAS,
    "plantillas/plantilla-nota.md": PLANTILLA_NOTA,
    "plantillas/plantilla-decision.md": PLANTILLA_DECISION,
    "plantillas/plantilla-sesion.md": PLANTILLA_SESION,
}


def main() -> int:
    ap = argparse.ArgumentParser(description="Scaffold index, area and template notes in a vault.")
    ap.add_argument("vault", type=Path, help="path to the vault root")
    ap.add_argument("--dry-run", action="store_true", help="show what would be written, write nothing")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, OSError):
            pass

    root = args.vault.expanduser()
    if not root.is_dir():
        print(f"error: not a directory: {root}", file=sys.stderr)
        return 2

    created, skipped = [], []
    for rel, body in sorted(FILES.items()):
        dest = root / rel
        if dest.exists():
            skipped.append(rel)
            continue
        created.append(rel)
        if args.dry_run:
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        # newline="\n" keeps the files identical on Windows; Obsidian does not
        # care, but a vault synced between machines otherwise shows every line
        # as changed.
        dest.write_text(body, encoding="utf-8", newline="\n")

    verb = "would create" if args.dry_run else "created"
    if created:
        print(f"{verb} ({len(created)}):")
        for rel in created:
            print(f"  {rel}")
    if skipped:
        print(f"already there, left untouched ({len(skipped)}):")
        for rel in skipped:
            print(f"  {rel}")
    if not created:
        print("nothing to do — every note already exists")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
