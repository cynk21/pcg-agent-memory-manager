import crypto from 'node:crypto';

export type EvidencePacketSource = {
  name: string;
  context: string;
  budget: number;
  keywords?: string[];
};

function splitBlocks(context: string): string[] {
  if (!context) return [];
  const blocks = context.match(/--- [^\n]+[\s\S]*?(?=\n--- |$)/g);
  return blocks?.length ? blocks : context.split(/\n{2,}/).filter(Boolean);
}

function scoreBlock(block: string, keywords: string[], index: number): number {
  const lower = block.toLowerCase();
  const keywordScore = keywords.reduce((score, keyword) => score + (lower.includes(keyword.toLowerCase()) ? 3 : 0), 0);
  const freshnessScore = /heute|today|gestern|morgen|2026-10-\d{2}|neu|aktuell|offen|änderung|heads up/i.test(block) ? 5 : 0;
  return keywordScore + freshnessScore - index * 0.01;
}

export function buildEvidencePacket(sources: EvidencePacketSource[]): string {
  return sources.map(source => {
    const blocks = splitBlocks(source.context);
    if (blocks.length === 0) return `--- ${source.name} ---\n${source.context || '(Keine Quelle vorhanden.)'}`;
    const ranked = blocks
      .map((block, index) => ({ block, score: scoreBlock(block, source.keywords || [], index) }))
      .sort((a, b) => b.score - a.score);
    let remaining = source.budget;
    const selected: string[] = [];
    for (const item of ranked) {
      if (remaining <= 0) break;
      const block = item.block.length <= remaining ? item.block : `${item.block.slice(0, Math.max(0, remaining - 80))}\n...[Quelle gekürzt; Evidence Ledger enthält den vollständigen Stand]`;
      if (block.length > 0) selected.push(block);
      remaining -= block.length;
    }
    const digest = crypto.createHash('sha256').update(source.context, 'utf8').digest('hex').slice(0, 12);
    return `--- ${source.name} | Snapshot ${digest} ---\n${selected.join('\n\n') || '(Keine priorisierte Evidenz im Budget.)'}`;
  }).join('\n\n');
}
