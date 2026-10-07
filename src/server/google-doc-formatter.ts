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
  let inSubList = false;

  const closeList = () => {
    if (inSubList) {
      bodyHtml.push('</ul></li>');
      inSubList = false;
    }
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

    // H1 (# Title oder expliziter Agenda-Titel am Anfang)
    if (/^#\s+/.test(line) || (i === 0 && /^Agenda der Ratssitzung/i.test(line))) {
      closeList();
      const titleText = line.replace(/^#\s*/, '');
      bodyHtml.push(`<h1>${formatInlineMarkdown(titleText)}</h1>`);
      continue;
    }

    // H2 (## Topic oder "1. Eröffnung", "TOP 1:", etc.)
    if (/^##\s+/.test(line) || /^(\d+\.|\bTOP\s+\d+:)\s+/.test(line)) {
      closeList();
      const h2Text = line.replace(/^##\s*/, '');
      bodyHtml.push(`<h2>${formatInlineMarkdown(h2Text)}</h2>`);
      continue;
    }

    // H3 (### Subtopic)
    if (/^###\s+/.test(line)) {
      closeList();
      const h3Text = line.replace(/^###\s*/, '');
      bodyHtml.push(`<h3>${formatInlineMarkdown(h3Text)}</h3>`);
      continue;
    }

    // Meta-Informationen (Datum, Protokoll-Referenz, Leitung)
    if (/^(Datum|Protokoll-Referenz|Ort|Leitung|Entschuldigt|Abwesend):/i.test(line)) {
      closeList();
      bodyHtml.push(`<div class="meta-row">${formatInlineMarkdown(line)}</div>`);
      continue;
    }

    // Verschachtelte Unter-Liste (z. B. "  - " oder "    • ")
    const subListMatch = rawLine.match(/^(\s{2,}|\t+)[-*•]\s+(.*)$/);
    if (subListMatch) {
      if (!inList) {
        bodyHtml.push('<ul>');
        inList = true;
      }
      if (!inSubList) {
        bodyHtml.push('<ul>');
        inSubList = true;
      }
      bodyHtml.push(`<li>${formatInlineMarkdown(subListMatch[2])}</li>`);
      continue;
    }

    // Normale Liste auf Hauptebene (- , * , • )
    const listMatch = line.match(/^[-*•]\s+(.*)$/);
    if (listMatch) {
      if (inSubList) {
        bodyHtml.push('</ul>');
        inSubList = false;
      }
      if (!inList) {
        bodyHtml.push('<ul>');
        inList = true;
      }
      bodyHtml.push(`<li>${formatInlineMarkdown(listMatch[1])}</li>`);
      continue;
    }

    // Blockquote oder Highlight
    if (line.startsWith('>')) {
      closeList();
      const quoteText = line.replace(/^>\s*/, '');
      bodyHtml.push(`<div class="highlight-box">${formatInlineMarkdown(quoteText)}</div>`);
      continue;
    }

    // Normaler Absatz
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
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11pt;
    line-height: 1.5;
    color: #202124;
    padding: 0;
    margin: 0;
  }
  h1 {
    font-size: 18pt;
    font-weight: bold;
    color: #1a365d;
    margin-top: 0;
    margin-bottom: 8px;
    padding-bottom: 4px;
    border-bottom: 2px solid #2b6cb0;
  }
  h2 {
    font-size: 13.5pt;
    font-weight: bold;
    color: #2b6cb0;
    margin-top: 20px;
    margin-bottom: 6px;
    padding-bottom: 2px;
    border-bottom: 1px solid #e2e8f0;
  }
  h3 {
    font-size: 11.5pt;
    font-weight: bold;
    color: #2d3748;
    margin-top: 12px;
    margin-bottom: 4px;
  }
  .meta-row {
    font-size: 10pt;
    color: #4a5568;
    background-color: #f7fafc;
    border-left: 4px solid #3182ce;
    padding: 4px 10px;
    margin-bottom: 4px;
  }
  p {
    margin-top: 4px;
    margin-bottom: 6px;
  }
  ul {
    margin-top: 4px;
    margin-bottom: 8px;
    padding-left: 24px;
  }
  li {
    margin-bottom: 4px;
  }
  strong {
    font-weight: bold;
    color: #1a202c;
  }
  .highlight-box {
    background-color: #ebf8ff;
    border-left: 4px solid #3182ce;
    padding: 8px 12px;
    border-radius: 4px;
    margin: 8px 0;
    color: #2b6cb0;
  }
  a {
    color: #3182ce;
    text-decoration: underline;
  }
</style>
</head>
<body>
${bodyHtml.join('\n')}
</body>
</html>`;
}
