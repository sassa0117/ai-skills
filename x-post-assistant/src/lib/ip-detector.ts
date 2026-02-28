interface IpKeywordRecord {
  keyword: string;
  franchiseId: string;
  franchise: {
    id: string;
    name: string;
    tier: string;
  };
}

interface DetectedIp {
  franchiseId: string;
  name: string;
  tier: string;
}

export function detectIp(
  text: string,
  keywords: IpKeywordRecord[]
): DetectedIp | null {
  const normalized = text.toLowerCase();
  let bestMatch: IpKeywordRecord | null = null;
  let bestLength = 0;

  for (const kw of keywords) {
    const kwNorm = kw.keyword.toLowerCase();
    if (normalized.includes(kwNorm) && kwNorm.length > bestLength) {
      bestMatch = kw;
      bestLength = kwNorm.length;
    }
  }

  if (!bestMatch) return null;

  return {
    franchiseId: bestMatch.franchiseId,
    name: bestMatch.franchise.name,
    tier: bestMatch.franchise.tier,
  };
}
