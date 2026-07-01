import { NextResponse } from "next/server";
import { analyzeStock } from "@/lib/ai";
import { runSixStepFilter } from "@/lib/filter";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { code } = await request.json();

    if (!code) {
      return NextResponse.json(
        { success: false, error: "缺少股票代码" },
        { status: 400 }
      );
    }

    // 先跑筛选找到这只股票的数据
    const { results } = await runSixStepFilter();
    const target = results.find(r => r.stock.code === code);

    if (!target) {
      // 如果不在筛选结果里，构造一个简单的分析
      return NextResponse.json({
        success: true,
        analysis: {
          code,
          name: code,
          summary: "该股票未通过六步筛选前置条件，不在候选列表中",
          reasons: [],
          risks: ["不满足六步选股条件", "短线交易风险大"],
          suggestion: "建议观望",
        },
      });
    }

    const analysis = await analyzeStock(target);

    return NextResponse.json({
      success: true,
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
