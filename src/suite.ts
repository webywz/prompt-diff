import { diffPrompts } from "./diffPrompts.js";
import { readSource } from "./io.js";
import type { DiffPromptsOptions, SuitePairInput, SuitePairResult, SuiteReport, SuiteStats } from "./types.js";

export async function processSuite(
  pairs: SuitePairInput[],
  options: DiffPromptsOptions = {},
): Promise<SuiteReport> {
  const results: SuitePairResult[] = [];
  
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    if (!pair) continue;
    const id = pair.id ?? `pair-${i + 1}`;
    
    try {
      const oldText = await readSource(pair.old);
      const newText = await readSource(pair.new);
      
      const result = diffPrompts(oldText, newText, {
        ...options,
        oldLabel: pair.old,
        newLabel: pair.new,
      });
      
      results.push({
        id,
        old: pair.old,
        new: pair.new,
        result,
      });
    } catch (err) {
      results.push({
        id,
        old: pair.old,
        new: pair.new,
        result: null as any, // Will be filtered in stats
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  
  const stats = calculateSuiteStats(results);
  
  return {
    pairs: results,
    stats,
  };
}

function calculateSuiteStats(results: SuitePairResult[]): SuiteStats {
  const successful = results.filter(r => !r.error);
  const failed = results.filter(r => r.error).length;
  
  if (successful.length === 0) {
    return {
      count: results.length,
      maxScore: 0,
      avgScore: 0,
      failed: failed > 0 ? failed : undefined,
    };
  }
  
  const scores = successful.map(r => r.result.risk.score);
  const maxScore = Math.max(...scores);
  const avgScore = Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
  
  return {
    count: results.length,
    maxScore,
    avgScore,
    failed: failed > 0 ? failed : undefined,
  };
}
