"""Kandidat 2 des Architektur-Umbaus: LLM-Gateway aus server.ts in src/server/llm-gateway.ts verschieben.

Verschoben (unveraendert, per Klammer-Matching):
  convertToOpenAIMessages, getGenAIClient, callOpenAICompatibleGateway, generateGeminiContentWithTimeout
Bleibt in server.ts: generateAIContent (Kandidatenlisten, Fallback-Regeln, Modell-Speicherung).
Zusaetzlich: tests/llm-gateway.test.ts fuer die bisher ungetestete Nachrichtenkonvertierung.

Ablauf:
  1. Prueft, dass Zieldateien nicht existieren.
  2. Verschiebt die Funktionen, ersetzt sie in server.ts durch einen Import.
  3. Fuehrt `npm run check` aus. Ist es rot, wird alles exakt zurueckgesetzt.

Aufruf (im Repo-Ordner):
  python scripts/refactor-llm-gateway.py
"""
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SERVER = ROOT / "server.ts"
TARGET = ROOT / "src" / "server" / "llm-gateway.ts"
TEST = ROOT / "tests" / "llm-gateway.test.ts"
BACKUP = ROOT / "server.ts.before-llm-gateway.bak"

NAMES = [
    "convertToOpenAIMessages",
    "getGenAIClient",
    "callOpenAICompatibleGateway",
    "generateGeminiContentWithTimeout",
]
# Von server.ts benoetigt (convertToOpenAIMessages nur intern im Modul)
SERVER_IMPORTS = ["getGenAIClient", "callOpenAICompatibleGateway", "generateGeminiContentWithTimeout"]
GENAI_IMPORT = "import { GoogleGenAI } from '@google/genai';"

HEADER = (
    "// LLM-Gateway: Nachrichtenkonvertierung, OpenAI-kompatibler Gateway-Aufruf, Gemini-Client mit Timeout.\n"
    "// generateAIContent (Kandidatenlisten, Fallback, Modell-Speicherung) bleibt in server.ts.\n\n"
    "import { GoogleGenAI } from '@google/genai';\n"
    "import { getEffectiveApiConfig } from './ai-config.ts';\n\n"
)

TEST_CONTENT = """import test from 'node:test';
import assert from 'node:assert/strict';
import { convertToOpenAIMessages } from '../src/server/llm-gateway.ts';

test('maps system instruction, parts and model role to OpenAI messages', () => {
  const messages = convertToOpenAIMessages(
    [
      { role: 'user', parts: [{ text: 'Frage' }] },
      { role: 'model', parts: [{ text: 'Antwort' }] },
    ],
    { parts: [{ text: 'Du bist ein Assistent.' }] },
  );
  assert.deepEqual(messages, [
    { role: 'system', content: 'Du bist ein Assistent.' },
    { role: 'user', content: 'Frage' },
    { role: 'assistant', content: 'Antwort' },
  ]);
});

test('falls back to a placeholder message when no content is given', () => {
  assert.deepEqual(convertToOpenAIMessages([]), [{ role: 'user', content: 'Hallo' }]);
});
"""


def match_close(src: str, open_idx: int) -> int:
    """Index der schliessenden Klammer zu src[open_idx] ('(' oder '{')."""
    op = src[open_idx]
    close = {"(": ")", "{": "}"}[op]
    depth = 0
    for k in range(open_idx, len(src)):
        if src[k] == op:
            depth += 1
        elif src[k] == close:
            depth -= 1
            if depth == 0:
                return k
    raise SystemExit("Unausgewogene Klammern")


def find_block(src: str, name: str) -> tuple[int, int]:
    m = re.search(r"^(export )?(async )?function " + re.escape(name) + r"\b", src, flags=re.M)
    if not m:
        raise SystemExit(f"Funktion nicht gefunden: {name}")
    start = m.start()
    # Vor dem Block muss eine Leerzeile stehen, damit kein Kommentar abgeschnitten wird
    if start > 1 and src[start - 2:start] != "\n\n":
        raise SystemExit(f"Unerwartete Zeile vor {name}; Abbruch zur Sicherheit.")
    p = src.index("(", m.end())
    p_end = match_close(src, p)
    # Funktionskoerper: '{' am Zeilenende. Rueckgabetyp-Literale wie '{ text?: string }' sind in derselben Zeile.
    body = re.compile(r"\{[ \t]*\n").search(src, p_end)
    if not body:
        raise SystemExit(f"Funktionskoerper nicht gefunden: {name}")
    end = match_close(src, body.start()) + 1
    if src[end:end + 1] == "\n":
        end += 1
    if src[end:end + 1] == "\n":
        end += 1
    return start, end


def main() -> int:
    src = SERVER.read_text(encoding="utf-8")
    if TARGET.exists() or TEST.exists():
        print("Abbruch: Zieldatei existiert bereits.")
        return 1
    if "llm-gateway" in src:
        print("Abbruch: server.ts verweist schon auf llm-gateway.")
        return 1

    blocks = sorted((*find_block(src, n), n) for n in NAMES)
    for a, b in zip(blocks, blocks[1:]):
        if a[1] > b[0]:
            raise SystemExit(f"Ueberlappende Bloecke: {a[2]} / {b[2]}")
    for s, e, n in blocks:
        chunk = src[s:e].rstrip()
        if not chunk.endswith("}") or f"function {n}" not in chunk:
            raise SystemExit(f"Block-Pruefung fehlgeschlagen: {n}")

    moved = "\n".join(src[s:e].rstrip("\n") + "\n" for s, e, _ in blocks)
    moved = re.sub(r"^(async )?function ", r"export \1function ", moved, flags=re.M)

    rest = src
    for s, e, _ in sorted(blocks, reverse=True):
        rest = rest[:s] + rest[e:]
    if rest.count("GoogleGenAI") == 1 and GENAI_IMPORT in rest:
        rest = rest.replace(GENAI_IMPORT + "\n", "")

    imp = f"import {{ {', '.join(SERVER_IMPORTS)} }} from './src/server/llm-gateway.ts';"
    lines = rest.split("\n")
    idx = max(i for i, l in enumerate(lines) if l.startswith("import "))
    lines.insert(idx + 1, imp)

    shutil.copyfile(SERVER, BACKUP)
    TARGET.write_text(HEADER + moved, encoding="utf-8")
    TEST.write_text(TEST_CONTENT, encoding="utf-8")
    SERVER.write_text("\n".join(lines), encoding="utf-8")
    print(f"Verschoben: {len(NAMES)} Funktionen -> {TARGET.relative_to(ROOT)}")
    print(f"Test angelegt: {TEST.relative_to(ROOT)}")

    res = subprocess.run("npm run check", cwd=ROOT, shell=sys.platform == "win32",
                         capture_output=True, text=True)
    print((res.stdout + res.stderr)[-2500:])
    if res.returncode != 0:
        SERVER.write_text(src, encoding="utf-8")
        TARGET.unlink(missing_ok=True)
        TEST.unlink(missing_ok=True)
        print("FEHLER: npm run check ist rot. Alles wurde zurueckgesetzt.")
        return 1

    BACKUP.unlink(missing_ok=True)
    print("OK: npm run check gruen. Naechster Schritt: git diff pruefen.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
