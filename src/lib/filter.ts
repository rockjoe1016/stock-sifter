/**
 * 杨永兴六步选股法筛选逻辑
 *
 * 六步条件：
 * 1. 当天涨幅 3% - 5%
 * 2. 30天内出现过涨停
 * 3. 市值 < 200亿
 * 4. 量比 > 1
 * 5. 换手率 5% - 10%
 * 6. 分时全天在均价线上 + 2:30后创新高
 */

import {
  getAllStocks,
  getDailyKline,
  getMinuteData,
  isLimitUp,
  type StockInfo,
  type KlineItem,
  type MinuteData,
} from "./eastmoney";

// ---------- 筛选条件参数 ----------

export const FILTER_CONFIG = {
  // 第1步：涨幅范围
  changePercentMin: 3,
  changePercentMax: 5,

  // 第2步：30天内涨停
  limitUpDays: 30,
  limitUpThreshold: 9.8, // 涨幅 >= 9.8% 算涨停

  // 第3步：市值上限（200亿 = 20000000000）
  marketCapMax: 200_0000_0000,

  // 第4步：量比下限
  volumeRatioMin: 1,

  // 第5步：换手率范围
  turnoverRateMin: 5,
  turnoverRateMax: 10,

  // 第6步：2:30 后检查创新高
  afternoonCheckTime: "14:30",
} as const;

// ---------- 筛选结果类型 ----------

export interface FilterStepResult {
  step: number;
  name: string;
  passed: boolean;
  detail: string;
}

export interface StockFilterResult {
  stock: StockInfo;
  steps: FilterStepResult[];
  allPassed: boolean;
  // 预存数据，给 AI 分析用
  klineData?: KlineItem[];
  minuteData?: MinuteData[];
}

// ---------- 六步筛选核心逻辑 ----------

/**
 * 第1步：当天涨幅 3%-5%
 */
function checkStep1(stock: StockInfo): FilterStepResult {
  const passed = stock.changePercent >= FILTER_CONFIG.changePercentMin &&
                 stock.changePercent <= FILTER_CONFIG.changePercentMax;
  return {
    step: 1,
    name: "涨幅 3%-5%",
    passed,
    detail: `今日涨幅 ${stock.changePercent.toFixed(2)}%`,
  };
}

/**
 * 第2步：30天内出现过涨停
 */
function checkStep2(klineData: KlineItem[]): FilterStepResult {
  const recentKlines = klineData.slice(-FILTER_CONFIG.limitUpDays);
  const limitUpDays = recentKlines.filter(k => isLimitUp(k.changePercent));
  const passed = limitUpDays.length > 0;

  return {
    step: 2,
    name: "30天内有涨停",
    passed,
    detail: limitUpDays.length > 0
      ? `近30天涨停 ${limitUpDays.length} 次，最近涨停日 ${limitUpDays[limitUpDays.length - 1].date}`
      : "近30天无涨停",
  };
}

/**
 * 第3步：市值 < 200亿
 */
function checkStep3(stock: StockInfo): FilterStepResult {
  const marketCapYi = stock.marketCap / 1_0000_0000; // 转为亿
  const passed = stock.marketCap > 0 && stock.marketCap < FILTER_CONFIG.marketCapMax;
  return {
    step: 3,
    name: "市值 < 200亿",
    passed,
    detail: `总市值 ${marketCapYi.toFixed(1)} 亿`,
  };
}

/**
 * 第4步：量比 > 1
 */
function checkStep4(stock: StockInfo): FilterStepResult {
  const passed = stock.volumeRatio > FILTER_CONFIG.volumeRatioMin;
  return {
    step: 4,
    name: "量比 > 1",
    passed,
    detail: `量比 ${stock.volumeRatio.toFixed(2)}`,
  };
}

/**
 * 第5步：换手率 5%-10%
 */
function checkStep5(stock: StockInfo): FilterStepResult {
  const passed = stock.turnoverRate >= FILTER_CONFIG.turnoverRateMin &&
                 stock.turnoverRate <= FILTER_CONFIG.turnoverRateMax;
  return {
    step: 5,
    name: "换手率 5%-10%",
    passed,
    detail: `换手率 ${stock.turnoverRate.toFixed(2)}%`,
  };
}

/**
 * 第6步：分时全天在均价线上 + 2:30后创新高
 */
function checkStep6(minuteData: MinuteData[]): FilterStepResult {
  if (minuteData.length === 0) {
    return {
      step: 6,
      name: "分时均价线 + 2:30创新高",
      passed: false,
      detail: "无分时数据",
    };
  }

  // 过滤有效交易时段（9:30-15:00）
  const validData = minuteData.filter(m => {
    const time = m.time.split(" ")[1] || m.time;
    return time >= "09:30" && time <= "15:00";
  });

  if (validData.length === 0) {
    return {
      step: 6,
      name: "分时均价线 + 2:30创新高",
      passed: false,
      detail: "无有效分时数据",
    };
  }

  // 条件A：全天价格在均价线之上
  const belowAvg = validData.filter(m => m.price < m.avgPrice && m.avgPrice > 0);
  const allAboveAvg = belowAvg.length === 0;

  // 条件B：2:30后创新高
  const afternoonData = validData.filter(m => {
    const time = m.time.split(" ")[1] || m.time;
    return time >= FILTER_CONFIG.afternoonCheckTime;
  });

  if (afternoonData.length === 0) {
    return {
      step: 6,
      name: "分时均价线 + 2:30创新高",
      passed: false,
      detail: "尚未到 14:30，无法判断",
    };
  }

  const dayHigh = Math.max(...validData.map(m => m.price));
  const afternoonHigh = Math.max(...afternoonData.map(m => m.price));
  const newHighAfternoon = afternoonHigh >= dayHigh;

  const passed = allAboveAvg && newHighAfternoon;

  let detail = "";
  if (!allAboveAvg) {
    detail += `有 ${belowAvg.length} 分钟跌破均价线；`;
  } else {
    detail += "全天在均价线上方；";
  }
  if (newHighAfternoon) {
    detail += "14:30后创日内新高";
  } else {
    detail += "14:30后未创日内新高";
  }

  return {
    step: 6,
    name: "分时均价线 + 2:30创新高",
    passed,
    detail,
  };
}

// ---------- 主筛选函数 ----------

/**
 * 执行六步筛选
 * 策略：先用实时数据（步骤1/3/4/5）快速过滤，再对候选股票查K线（步骤2）和分时（步骤6）
 * 分两档展示：完全通过（6/6）和部分通过（4+/6）
 */
export async function runSixStepFilter(): Promise<{
  results: StockFilterResult[];
  totalScanned: number;
  scanTime: string;
}> {
  const scanTime = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

  // 1. 获取全A股行情
  const allStocks = await getAllStocks();
  const totalScanned = allStocks.length;

  // 2. 预筛选：只需通过步骤1（涨幅3-5%）和步骤3（市值<200亿）
  //    不再强制要求步骤4/5通过，避免开盘初期换手率低导致全部被过滤
  const candidates: { stock: StockInfo; step1: FilterStepResult; step3: FilterStepResult; step4: FilterStepResult; step5: FilterStepResult }[] = [];

  for (const stock of allStocks) {
    const step1 = checkStep1(stock);
    if (!step1.passed) continue;

    const step3 = checkStep3(stock);
    if (!step3.passed) continue;

    const step4 = checkStep4(stock);
    const step5 = checkStep5(stock);

    candidates.push({ stock, step1, step3, step4, step5 });
  }

  // 3. 按涨幅排序，最多取前 30 只做深度检查（K线+分时）
  candidates.sort((a, b) => b.stock.changePercent - a.stock.changePercent);
  const topCandidates = candidates.slice(0, 30);

  // 4. 对候选股票查K线（第2步）和分时数据（第6步）
  const finalResults: StockFilterResult[] = [];

  for (const item of topCandidates) {
    try {
      // 第2步：查K线
      const klineData = await getDailyKline(item.stock.code, FILTER_CONFIG.limitUpDays);
      const step2 = checkStep2(klineData);

      // 第6步：查分时
      const minuteData = await getMinuteData(item.stock.code);
      const step6 = checkStep6(minuteData);

      // 组装完整结果
      const steps: FilterStepResult[] = [
        item.step1,
        step2,
        item.step3,
        item.step4,
        item.step5,
        step6,
      ];

      const passedCount = steps.filter(s => s.passed).length;
      const allPassed = passedCount === 6;

      // 只保留通过 4 步及以上的
      if (passedCount >= 4) {
        finalResults.push({
          stock: item.stock,
          steps,
          allPassed,
          klineData,
          minuteData,
        });
      }

      // 礼貌请求，避免被限流
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch {
      // 单只股票出错，跳过继续
      continue;
    }
  }

  // 按通过步数排序，同通过数按涨幅排序
  finalResults.sort((a, b) => {
    const aPassed = a.steps.filter(s => s.passed).length;
    const bPassed = b.steps.filter(s => s.passed).length;
    if (bPassed !== aPassed) return bPassed - aPassed;
    return b.stock.changePercent - a.stock.changePercent;
  });

  return {
    results: finalResults,
    totalScanned,
    scanTime,
  };
}
