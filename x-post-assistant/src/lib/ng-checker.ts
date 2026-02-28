interface NgPatternRecord {
  id: string;
  pattern: string;
  reason: string;
  suggestion: string | null;
  severity: string;
}

export interface NgMatch {
  patternId: string;
  pattern: string;
  reason: string;
  suggestion: string | null;
  severity: string;
  matchedText: string;
}

export interface NgCheckResult {
  hasErrors: boolean;
  hasWarnings: boolean;
  matches: NgMatch[];
}

export function checkNgPatterns(
  text: string,
  patterns: NgPatternRecord[]
): NgCheckResult {
  const matches: NgMatch[] = [];

  for (const p of patterns) {
    try {
      const regex = new RegExp(p.pattern, "gi");
      const m = text.match(regex);
      if (m) {
        matches.push({
          patternId: p.id,
          pattern: p.pattern,
          reason: p.reason,
          suggestion: p.suggestion,
          severity: p.severity,
          matchedText: m[0],
        });
      }
    } catch {
      // パターンが正規表現でない場合、文字列マッチ
      if (text.includes(p.pattern)) {
        matches.push({
          patternId: p.id,
          pattern: p.pattern,
          reason: p.reason,
          suggestion: p.suggestion,
          severity: p.severity,
          matchedText: p.pattern,
        });
      }
    }
  }

  // 文字数チェック（280文字超過）
  if (text.length > 280) {
    matches.push({
      patternId: "__char_limit",
      pattern: "280文字超過",
      reason: "長文はドロップオフ率が上がる。短文 + 画像が最強",
      suggestion: "3行以内に収める。補足はセルフリプで",
      severity: "warning",
      matchedText: `${text.length}文字`,
    });
  }

  return {
    hasErrors: matches.some((m) => m.severity === "error"),
    hasWarnings: matches.some((m) => m.severity === "warning"),
    matches,
  };
}
