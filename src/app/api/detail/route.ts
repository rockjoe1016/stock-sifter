import { NextResponse } from "next/server";
import { getDailyKline, getMinuteData } from "@/lib/eastmoney";
import { checkStep2, checkStep6 } from "@/lib/filter";
import { analyzeStock } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const { code, name, price, changePercent, turnoverRate, volumeRatio, marketCap } = await request.json();

    if (!code) {
      return NextResponse.json(
        { success: false, error: "缺少股票代码" },
        { status: 400 }
      );
    }

    // 1. 查 K 线数据，验证步骤2
    const klineData = await getDailyKline(code, 30);
    const step2 = checkStep2(klineData);

    // 2. 查分时数据，验证步骤6
    const minuteData = await getMinuteData(code);
    const step6 = checkStep6(minuteData);

    // 3. 构造 stock 对象供 AI 分析
    const stock = {
      code,
      name: name || code,
      price: price || 0,
      changePercent: changePercent || 0,
      changeAmount: 0,
      volume: 0,
      amount: 0,
      turnoverRate: turnoverRate || 0,
      volumeRatio: volumeRatio || 0,
      marketCap: (marketCap || 0) * 1_0000_0000,
      circulationMarketCap: 0,
      high: 0,
      low: 0,
      open: 0,
      preClose: 0,
      amplitude: 0,
      peRatio: 0,
    };

    const result = {
      stock,
      steps: [
        { step: 1, name: "涨幅 3%-5%", passed: changePercent >= 3 && changePercent <= 5, detail: `涨幅 ${changePercent.toFixed(2)}%` },
        step2,
        { step: 3, name: "市值 < 200亿", passed: (marketCap || 0) < 200, detail: `市值 ${marketCap ?? 0}亿` },
        { step: 4, name: "量比 > 1", passed: volumeRatio > 1, detail: `量比 ${volumeRatio.toFixed(2)}` },
        { step: 5, name: "换手率 5%-10%", passed: turnoverRate >= 5 && turnoverRate <= 10, detail: `换手率 ${turnoverRate.toFixed(2)}%` },
        step6,
      ],
      allPassed: false,
      klineData,
      minuteData,
    };

    result.allPassed = result.steps.every(s => s.passed);

    // 4. AI 分析
    let analysis = null;
    try {
      analysis = await analyzeStock(result);
    } catch (e) {
      // AI 分析失败不影响主要步骤
    }

    return NextResponse.json({
      success: true,
      steps: result.steps,
      allPassed: result.allPassed,
      analysis,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
