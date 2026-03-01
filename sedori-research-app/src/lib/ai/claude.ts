import Anthropic from "@anthropic-ai/sdk";
import {
  SEDORI_RESEARCH_SYSTEM_PROMPT,
  buildResearchPrompt,
} from "../prompts/sedori-research";
import type { AiJudgment, ScrapingResult } from "../types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function analyzeWithClaude(
  keyword: string,
  purchasePrice: number | undefined,
  scrapedData: ScrapingResult
): Promise<AiJudgment> {
  const userPrompt = buildResearchPrompt(keyword, purchasePrice, scrapedData);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    system: SEDORI_RESEARCH_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  // AI応答からrecommendationを抽出
  let recommendation: AiJudgment["recommendation"] = "cautious";
  if (text.includes("強気")) recommendation = "strong_buy";
  else if (text.includes("標準")) recommendation = "buy";
  else if (text.includes("慎重")) recommendation = "cautious";
  else if (text.includes("見送り")) recommendation = "skip";

  // 利益・ROI抽出
  const profitMatch = text.match(/推定利益[：:]\s*¥?([\d,]+)/);
  const roiMatch = text.match(/ROI[：:]\s*([\d.]+)%/);

  // リスク抽出
  const risksSection = text.match(/リスク・注意点[\s\S]*?(?=###|$)/);
  const risks = risksSection
    ? risksSection[0]
        .split("\n")
        .filter((line) => line.trim().startsWith("-") || line.trim().startsWith("・"))
        .map((line) => line.replace(/^[\s\-・]+/, "").trim())
        .filter(Boolean)
    : [];

  return {
    recommendation,
    reasoning: text,
    estimatedProfit: profitMatch
      ? parseInt(profitMatch[1].replace(/,/g, ""), 10)
      : undefined,
    estimatedROI: roiMatch ? parseFloat(roiMatch[1]) : undefined,
    risks,
  };
}
