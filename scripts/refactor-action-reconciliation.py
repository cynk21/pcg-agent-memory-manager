"""Kandidat 1 des Architektur-Umbaus: Aktionspunkt-Abgleich aus server.ts in ein eigenes Modul verschieben.

Ablauf:
  1. Prueft, dass server.ts und die Zieldatei nicht bereits umgebaut wurden.
  2. Verschiebt die Funktionen per Klammer-Matching.
  3. Ersetzt sie in server.ts durch Import plus Re-Export (Tests bleiben unveraendert).
  4. Fuehrt `npm run check` aus. Schlaegt etwas fehl, wird alles exakt zurueckgesetzt.

Aufruf (im Repo-Ordner):
  python scripts/refactor-action-reconciliation.py
"""
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SERVER = ROOT / "server.ts"
TARGET = ROOT / "src" / "server" / "action-reconciliation.ts"
BACKUP = ROOT / "server.ts.before-reconciliation.bak"

NAMES = [
    "normalizeTaskComparisonText",
    "areTaskTextsSimilar",
    "extractGoogleTaskStates",
    "removeCompletedTaskRecommendations",
    "removeStaleNextStepsFromProjectStatus",
    "ensureCriticalProjectTasks",
    "findNearestSourceUrl",
    "buildShortTaskNotes",
    "ensureMeetingProtocolTasks",
    "ensureActionSectionTasks",
]


def match_paren(src: str, open_idx: int) -> int:
    """Index der schliessenden Klammer zu src[open_idx] ('(' oder '{')."""
    pair = {"(": ")", "{": "}"}[src[open_idx]]
    op = src[open_idx]
    depth = 0
    for k in range(open_idx, len(src)):
        if src[k] == op:
            depth += 1
        elif src[k] == pair:
            depth -= 1
            if depth == 0:
                return k
    raise SystemExit("Unausgewogene Klammern")


def find_block(src: str, name: str) -> tuple[int, int]:
    """(start, end) des Funktionsblocks inkl. direkt darueber stehendem JSDoc/Kommentar."""
    m = re.search(r"^(export )?function " + re.escape(name) + r"\b", src, flags=re.M)
    if not m:
        raise SystemExit(f"Funktion nicht gefunden: {name}")
    start = m.start()

    # Direkt darueberstehenden Kommentar/JSDoc mitnehmen
    head = src[:start]
    stripped = head.rstrip("\n")
    if stripped.endswith("*/"):
        start = stripped.rfind("/**")
        start = head.rfind("\n", 0, start) + 1 if start > 0 else 0
    elif stripped.rsplit("\n", 1)[-1].lstrip().startswith("//"):
        start = head.rfind("\n", 0, len(stripped) - len(stripped.rsplit("\n", 1)[-1])) + 1

    # Parameterliste ueberspringen
    p = src.index("(", m.end())
    p_end = match_paren(src, p)

    # Funktionskoerper: die '{' steht am Zeilenende. Rueckgabetyp-Literale
    # wie '{ open: string[] }' stehen dagegen in derselben Zeile wie Inhalt.
    body = re.compile(r"\{[ \t]*\n").search(src, p_end)
    if not body:
        raise SystemExit(f"Funktionskoerper nicht gefunden: {name}")
    j = body.start()
    end_brace = match_paren(src, j)
    end = end_brace + 1
    if src[end:end + 1] == "\n":
        end += 1
    return start, end


def main() -> int:
    src = SERVER.read_text(encoding="utf-8")
    if TARGET.exists():
        print("Abbruch: Zieldatei existiert bereits:", TARGET)
        return 1
    if "action-reconciliation" in src:
        print("Abbruch: server.ts verweist schon auf action-reconciliation.")
        return 1

    blocks = sorted((*find_block(src, n), n) for n in NAMES)
    for a, b in zip(blocks, blocks[1:]):
        if a[1] > b[0]:
            raise SystemExit(f"Ueberlappende Bloecke: {a[2]} / {b[2]}")

    # Sanity: jeder verschobene Block muss mit 'function' oder einem Kommentar beginnen und mit '}' enden
    for s, e, n in blocks:
        chunk = src[s:e].rstrip()
        if not chunk.endswith("}"):
            raise SystemExit(f"Block endet nicht mit '}}': {n}")
        if f"function {n}" not in chunk:
            raise SystemExit(f"Block enthaelt Funktion nicht: {n}")

    moved = "\n".join(src[s:e].rstrip("\n") + "\n" for s, e, _ in blocks)
    moved = re.sub(r"^function ", "export function ", moved, flags=re.M)
    header = (
        "// Aktionspunkt-Abgleich: Google-Tasks-Zustaende, Aehnlichkeit, Protokoll- und Abschnitts-Tasks.\n"
        "// Reine Funktionen ohne I/O. Von server.ts re-exportiert, in tests/ geprueft.\n\n"
    )

    rest = src
    for s, e, _ in sorted(blocks, reverse=True):
        rest = rest[:s] + rest[e:]
    names_list = ", ".join(NAMES)
    imp = (
        f"import {{ {names_list} }} from './src/server/action-reconciliation.ts';\n"
        f"export {{ {names_list} }};"
    )
    lines = rest.split("\n")
    idx = max(i for i, l in enumerate(lines) if l.startswith("import "))
    lines.insert(idx + 1, imp)

    shutil.copyfile(SERVER, BACKUP)
    TARGET.write_text(header + moved, encoding="utf-8")
    SERVER.write_text("\n".join(lines), encoding="utf-8")
    print(f"Verschoben: {len(NAMES)} Funktionen -> {TARGET.relative_to(ROOT)}")

    shell = sys.platform == "win32"
    res = subprocess.run("npm run check", cwd=ROOT, shell=shell, capture_output=True, text=True)
    print((res.stdout + res.stderr)[-2500:])
    if res.returncode != 0:
        SERVER.write_text(src, encoding="utf-8")
        TARGET.unlink(missing_ok=True)
        print("FEHLER: npm run check ist rot. server.ts und Zieldatei wurden zurueckgesetzt.")
        return 1

    BACKUP.unlink(missing_ok=True)
    print("OK: npm run check gruen. Naechster Schritt: git diff pruefen, dann committen.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
