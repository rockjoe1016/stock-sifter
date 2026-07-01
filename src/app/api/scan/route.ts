import { NextResponse } from "next/server";
import { runSixStepFilter } from "@/lib/filter";
import type { StockFilterResult } from "@/lib/filter";

export const dynamic = "force-dynamic";
// Vercel Hobby 计划 API 最大 10s，这里只需要 5s 内返回
export const maxDuration = 10;

export async function GET() {
  try {
    // 只跑基础筛选（不查 K 线 + 分时数据），确保 5s 内返回
    const { results, totalScanned, scanTime } = await runQuickFilter();

    return NextResponse.json({
      success: true,
      scanTime,
      totalScanned,
      totalPassed: results.filter(r => r.allPassed).length,
      totalPartial: results.filter(r => !r.allPassed).length,
      passedStocks: results.filter(r => r.allPassed).slice(0, 15).map(formatResult),
      partialStocks: results.filter(r => !r.allPassed).slice(0, 15).map(formatResult),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

/**
 * 快速筛选：只跑步骤 1/3/4/5（都是实时行情数据）
 * 不查 K 线（步骤2）和分时（步骤6），确保快速返回
 */
async function runQuickFilter() {
  const { getAllStocks } = await import("@/lib/eastmoney");
  const { FILTER_CONFIG, checkStep1, checkStep3, checkStep4, checkStep5 } = await import("@/lib/filter");

  const scanTime = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  const allStocks = await getAllStocks();
  const totalScanned = allStocks.length;

  const candidates: Array<{
    stock: typeof allStocks[0];
    step1: ReturnType<typeof checkStep1>;
    step3: ReturnType<typeof checkStep3>;
    step4: ReturnType<typeof checkStep4>;
    step5: ReturnType<typeof checkStep5>;
  }> = [];

  for (const stock of allStocks) {
    const step1 = checkStep1(stock);
    if (!step1.passed) continue;

    const step3 = checkStep3(stock);
    if (!step3.passed) continue;

    const step4 = checkStep4(stock);
    const step5 = checkStep5(stock);

    candidates.push({ stock, step1, step3, step4, step5 });
  }

  // 按涨幅排序，取前 30 名
  candidates.sort((a, b) => b.stock.changePercent - a.stock.changePercent);
  const topCandidates = candidates.slice(0, 30);

  // 步骤2、6 暂时标记为"未验证"，等 detail API 再补
  const results: StockFilterResult[] = topCandidates.map((item) => {
    const steps = [
      item.step1,
      { step: 2, name: "30天内有涨停", passed: false, detail: "点击「AI分析」验证" },
      item.step3,
      item.step4,
      item.step5,
      { step: 6, name: "分时均价线 + 2:30创新高", passed: false, detail: "点击「AI分析」验证" },
    ];
    const allPassed = steps.every(s => s.passed);
    return { stock: item.stock, steps, allPassed };
  });

  // 排序：4 步以上的优先
  results.sort((a, b) => {
    const aPassed = a.steps.filter(s => s.passed).length;
    const bPassed = b.steps.filter(s => s.passed).length;
    if (bPassed !== aPassed) return bPassed - aPassed;
    return b.stock.changePercent - a.stock.changePercent;
  });

  return { results, totalScanned, scanTime };
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
