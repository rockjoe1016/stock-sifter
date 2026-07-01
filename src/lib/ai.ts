/**
 * DeepSeek AI 分析模块
 * 对筛选通过的股票做简短分析：入选理由、风险提示、操作建议
 */

import type { StockFilterResult } from "./filter";

export interface AIAnalysis {
  code: string;
  name: string;
  summary: string;      // 一句话总结
  reasons: string[];    // 入选理由
  risks: string[];      // 风险提示
  suggestion: string;   // 操作建议
}

/**
 * 调用 DeepSeek API 分析单只股票
 */
export async function analyzeStock(result: StockFilterResult): Promise<AIAnalysis> {
  const { stock, steps, klineData } = result;

  // 如果没有 API Key，返回基于规则的简单分析
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return generateRuleBasedAnalysis(result);
  }

  const stepDetails = steps
    .map(s => `第${s.step}步 [${s.passed ? "通过" : "未通过"}] ${s.name}: ${s.detail}`)
    .join("\n");

  const recentKline = klineData?.slice(-5).map(k => 
    `${k.date}: 开${k.open} 收${k.close} 涨跌${k.changePercent.toFixed(2)}%`
  ).join("\n") || "无K线数据";

  const prompt = `你是一位短线交易分析师。请根据以下数据，用简短的大白话分析这只股票。

股票：${stock.name}（${stock.code}）
当前价：${stock.price}
涨跌幅：${stock.changePercent}%
换手率：${stock.turnoverRate}%
量比：${stock.volumeRatio}
总市值：${(stock.marketCap / 1_0000_0000).toFixed(1)}亿

六步筛选结果：
${stepDetails}

近5日K线：
${recentKline}

请按以下 JSON 格式回复（不要有其他内容）：
{
  "summary": "一句话总结这只股票今天的情况",
  "reasons": ["入选理由1", "入选理由2"],
  "risks": ["风险提示1", "风险提示2"],
  "suggestion": "操作建议，30字以内"
}`;

  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      return generateRuleBasedAnalysis(result);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return generateRuleBasedAnalysis(result);
    }

    const parsed = JSON.parse(content);

    return {
      code: stock.code,
      name: stock.name,
      summary: parsed.summary || "",
      reasons: parsed.reasons || [],
      risks: parsed.risks || [],
      suggestion: parsed.suggestion || "",
    };
  } catch {
    return generateRuleBasedAnalysis(result);
  }
}

/**
 * 无 API Key 时的规则分析（兜底方案）
 */
function generateRuleBasedAnalysis(result: StockFilterResult): AIAnalysis {
  const { stock, steps } = result;

  const reasons: string[] = [];
  const risks: string[] = [];

  // 涨幅分析
  if (stock.changePercent >= 3 && stock.changePercent <= 5) {
    reasons.push(`涨幅${stock.changePercent.toFixed(1)}%，处于3-5%健康区间，不过热`);
  }

  // 换手率分析
  if (stock.turnoverRate >= 5 && stock.turnoverRate <= 10) {
    reasons.push(`换手率${stock.turnoverRate.toFixed(1)}%，筹码充分换手`);
  } else if (stock.turnoverRate > 10) {
    risks.push(`换手率${stock.turnoverRate.toFixed(1)}%偏高，注意抛压`);
  }

  // 量比分析
  if (stock.volumeRatio > 1) {
    reasons.push(`量比${stock.volumeRatio.toFixed(2)}，资金活跃度提升`);
  }

  // 市值分析
  const marketCapYi = stock.marketCap / 1_0000_0000;
  if (marketCapYi < 200) {
    reasons.push(`市值${marketCapYi.toFixed(0)}亿，小盘股弹性好`);
  }

  // 第2步
  const step2 = steps.find(s => s.step === 2);
  if (step2?.passed) {
    reasons.push(step2.detail);
  }

  // 第6步
  const step6 = steps.find(s => s.step === 6);
  if (step6?.passed) {
    reasons.push("分时强势，全天均价线上方运行");
  } else {
    risks.push(step6?.detail || "分时走势不达标");
  }

  // 通用风险
  risks.push("短线交易风险大，注意止损");
  if (!result.allPassed) {
    risks.push("未完全通过六步筛选，谨慎参与");
  }

  const summary = `${stock.name}（${stock.code}）今日涨${stock.changePercent.toFixed(1)}%，` +
    `量比${stock.volumeRatio.toFixed(1)}，换手${stock.turnoverRate.toFixed(1)}%，` +
    result.allPassed ? "完全通过六步筛选" : "部分通过筛选";

  const suggestion = result.allPassed
    ? "符合六步选股条件，可关注尾盘低吸机会，次日冲高兑现"
    : "部分条件不达标，建议观望或轻仓试探";

  return {
    code: stock.code,
    name: stock.name,
    summary,
    reasons,
    risks,
    suggestion,
  };
}
