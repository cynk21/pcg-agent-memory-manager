function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatInlineMarkdown(text: string): string {
  let res = escapeHtml(text);
  // Bold
  res = res.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  res = res.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  // Italic
  res = res.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  res = res.replace(/_([^_]+)_/g, '<em>$1</em>');
  // Links: [Text](url)
  res = res.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return res;
}

export function convertTextToGoogleDocHtml(rawText: string, docTitle: string = ''): string {
  if (rawText.includes('<html') || rawText.includes('<body')) {
    return rawText;
  }

  const lines = rawText.split('\n');
  const bodyHtml: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      bodyHtml.push('</ul>');
      inList = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      closeList();
      continue;
    }

    // Dokument-Titel (H1)
    if (/^#\s+/.test(line) || (i === 0 && /^Agenda der Ratssitzung/i.test(line))) {
      closeList();
      const titleText = line.replace(/^#\s*/, '');
      bodyHtml.push(`<h1>${formatInlineMarkdown(titleText)}</h1>`);
      continue;
    }

    // TOP-Überschriften (H2) – z.B. "1. Eröffnung", "2. Haupttagesordnungspunkt: ...", "TOP 1: ..."
    if (/^##\s+/.test(line) || /^(\d+\.|\bTOP\s+\d+:)\s+/.test(line)) {
      closeList();
      const h2Text = line.replace(/^##\s*/, '');
      bodyHtml.push(`<h2>${formatInlineMarkdown(h2Text)}</h2>`);
      continue;
    }

    // Sub-Überschriften (H3)
    if (/^###\s+/.test(line)) {
      closeList();
      const h3Text = line.replace(/^###\s*/, '');
      bodyHtml.push(`<h3>${formatInlineMarkdown(h3Text)}</h3>`);
      continue;
    }

    // Meta-Zeilen (Datum, Ort, Leitung etc.) – dezente Textzeilen
    if (/^(Datum|Protokoll-Referenz|Ort|Leitung|Entschuldigt|Abwesend):/i.test(line)) {
      closeList();
      bodyHtml.push(`<p class="meta-line">${formatInlineMarkdown(line)}</p>`);
      continue;
    }

    // Unterpunkte / Listenpunkte (auf allen Ebenen als saubere Standard-Aufzählung)
    const listMatch = line.match(/^[-*•]\s+(.*)$/);
    if (listMatch) {
      if (!inList) {
        bodyHtml.push('<ul>');
        inList = true;
      }
      bodyHtml.push(`<li>${formatInlineMarkdown(listMatch[1])}</li>`);
      continue;
    }

    // Normaler Textabsatz
    closeList();
    bodyHtml.push(`<p>${formatInlineMarkdown(line)}</p>`);
  }

  closeList();

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    font-family: Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.5;
    color: #000000;
  }
  h1 {
    font-family: Arial, sans-serif;
    font-size: 16pt;
    font-weight: bold;
    color: #000000;
    margin-top: 0pt;
    margin-bottom: 6pt;
  }
  h2 {
    font-family: Arial, sans-serif;
    font-size: 12pt;
    font-weight: bold;
    color: #000000;
    margin-top: 14pt;
    margin-bottom: 4pt;
  }
  h3 {
    font-family: Arial, sans-serif;
    font-size: 11pt;
    font-weight: bold;
    color: #000000;
    margin-top: 10pt;
    margin-bottom: 3pt;
  }
  p {
    margin-top: 2pt;
    margin-bottom: 4pt;
  }
  .meta-line {
    color: #444444;
    margin-top: 1pt;
    margin-bottom: 3pt;
  }
  ul {
    margin-top: 2pt;
    margin-bottom: 6pt;
    padding-left: 20pt;
  }
  li {
    margin-bottom: 3pt;
  }
  strong {
    font-weight: bold;
  }
</style>
</head>
<body>
${bodyHtml.join('\n')}
</body>
</html>`;
}
