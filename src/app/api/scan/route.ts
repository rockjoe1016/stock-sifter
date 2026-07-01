import { NextResponse } from "next/server";
import { runSixStepFilter } from "@/lib/filter";
import { analyzeStock } from "@/lib/ai";
import type { StockFilterResult } from "@/lib/filter";
import type { AIAnalysis } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    // 1. 执行六步筛选
    const { results, totalScanned, scanTime } = await runSixStepFilter();

    // 2. 对通过的股票做 AI 分析（最多取前 10 只，避免超时）
    const passedStocks = results.filter(r => r.allPassed).slice(0, 10);
    const partialStocks = results.filter(r => !r.allPassed).slice(0, 10);

    const aiAnalyses: Record<string, AIAnalysis> = {};

    // 先分析完全通过的
    for (const result of passedStocks) {
      try {
        const analysis = await analyzeStock(result);
        aiAnalyses[result.stock.code] = analysis;
      } catch {
        // 跳过分析失败的
      }
    }

    return NextResponse.json({
      success: true,
      scanTime,
      totalScanned,
      totalPassed: passedStocks.length,
      totalPartial: partialStocks.length,
      passedStocks: passedStocks.map(formatResult),
      partialStocks: partialStocks.map(formatResult),
      aiAnalyses,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

function formatResult(r: StockFilterResult) {
  return {
    code: r.stock.code,
    name: r.stock.name,
    price: r.stock.price,
    changePercent: r.stock.changePercent,
    turnoverRate: r.stock.turnoverRate,
    volumeRatio: r.stock.volumeRatio,
    marketCapYi: +(r.stock.marketCap / 1_0000_0000).toFixed(1),
    steps: r.steps.map(s => ({
      step: s.step,
      name: s.name,
      passed: s.passed,
      detail: s.detail,
    })),
  };
}
