/**
 * 东方财富数据接口层
 * 所有数据来自东方财富公开 API，免费、无需密钥
 */

// ---------- 类型定义 ----------

export interface StockInfo {
  code: string;          // 股票代码，如 000001
  name: string;          // 股票名称
  price: number;         // 最新价
  changePercent: number; // 涨跌幅 (%)
  changeAmount: number;  // 涨跌额
  volume: number;        // 成交量 (手)
  amount: number;        // 成交额 (元)
  turnoverRate: number;  // 换手率 (%)
  volumeRatio: number;   // 量比
  marketCap: number;     // 总市值 (元)
  circulationMarketCap: number; // 流通市值 (元)
  high: number;          // 最高价
  low: number;           // 最低价
  open: number;          // 开盘价
  preClose: number;      // 昨收价
  amplitude: number;     // 振幅 (%)
  peRatio: number;       // 市盈率
}

export interface KlineItem {
  date: string;    // 日期 YYYY-MM-DD
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;  // 成交量 (手)
  amount: number;  // 成交额 (元)
  changePercent: number; // 涨跌幅 (%)
}

export interface MinuteData {
  time: string;    // 时间 HH:MM
  price: number;   // 价格
  avgPrice: number; // 均价
  volume: number;  // 成交量 (手)
}

// ---------- 辅助函数 ----------

/**
 * 获取全A股实时行情列表
 * 东方财富 push2 接口，返回所有 A 股（沪深）
 * 需要分页获取，每页最多 100 条
 */
export async function getAllStocks(): Promise<StockInfo[]> {
  const fields = [
    "f12",  // 代码
    "f14",  // 名称
    "f2",   // 最新价
    "f3",   // 涨跌幅
    "f4",   // 涨跌额
    "f5",   // 成交量
    "f6",   // 成交额
    "f8",   // 换手率
    "f10",  // 量比
    "f20",  // 总市值
    "f21",  // 流通市值
    "f15",  // 最高
    "f16",  // 最低
    "f17",  // 开盘
    "f18",  // 昨收
    "f7",   // 振幅
    "f9",   // 市盈率
  ].join(",");

  const allStocks: StockInfo[] = [];
  const pageSize = 100;
  let page = 1;
  let total = 0;

  // 分页获取，最多 60 页（6000只）
  while (page <= 60) {
    const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=${page}&pz=${pageSize}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:0%2Bt:6,m:0%2Bt:80,m:1%2Bt:2,m:1%2Bt:23&fields=${fields}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://quote.eastmoney.com/",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      break;
    }

    const data = await res.json();

    if (!data?.data?.diff || data.data.diff.length === 0) {
      break;
    }

    total = data.data.total || total;

    for (const item of data.data.diff) {
      allStocks.push({
        code: String(item.f12 ?? ""),
        name: String(item.f14 ?? ""),
        price: Number(item.f2) || 0,
        changePercent: Number(item.f3) || 0,
        changeAmount: Number(item.f4) || 0,
        volume: Number(item.f5) || 0,
        amount: Number(item.f6) || 0,
        turnoverRate: Number(item.f8) || 0,
        volumeRatio: Number(item.f10) || 0,
        marketCap: Number(item.f20) || 0,
        circulationMarketCap: Number(item.f21) || 0,
        high: Number(item.f15) || 0,
        low: Number(item.f16) || 0,
        open: Number(item.f17) || 0,
        preClose: Number(item.f18) || 0,
        amplitude: Number(item.f7) || 0,
        peRatio: Number(item.f9) || 0,
      });
    }

    // 如果已经获取了全部，停止分页
    if (allStocks.length >= total) {
      break;
    }

    page++;
  }

  // 过滤掉无效数据（停牌、价格为0等）和 ST 股票
  return allStocks.filter(s => s.code && s.price > 0 && s.name && !s.name.includes("ST"));
}

/**
 * 获取个股历史日K线数据
 * 用于判断30天内是否出现过涨停
 */
export async function getDailyKline(code: string, days = 30): Promise<KlineItem[]> {
  // 东方财富市场前缀：1=沪市 0=深市
  const prefix = code.startsWith("6") ? "1" : "0";
  const klt = 101; // 日K
  const fqt = 0;   // 不复权

  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${prefix}.${code}&klt=${klt}&fqt=${fqt}&end=20500101&ltp=${days + 5}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": "https://quote.eastmoney.com/",
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    return [];
  }

  const data = await res.json();

  if (!data?.data?.klines) {
    return [];
  }

  const klines: KlineItem[] = data.data.klines.map((line: string) => {
    const parts = line.split(",");
    return {
      date: parts[0],
      open: Number(parts[1]) || 0,
      close: Number(parts[2]) || 0,
      high: Number(parts[3]) || 0,
      low: Number(parts[4]) || 0,
      volume: Number(parts[5]) || 0,
      amount: Number(parts[6]) || 0,
      changePercent: Number(parts[8]) || 0,
    };
  });

  // 取最近 days 天
  return klines.slice(-days);
}

/**
 * 判断某日是否涨停（涨幅 >= 9.8%，考虑10%涨停板有四舍五入）
 */
export function isLimitUp(changePercent: number): boolean {
  return changePercent >= 9.8;
}

/**
 * 获取个股分时数据
 * 用于判断：分时全天在均价线上、2:30后创新高
 */
export async function getMinuteData(code: string): Promise<MinuteData[]> {
  const prefix = code.startsWith("6") ? "1" : "0";

  const url = `https://push2.eastmoney.com/api/qt/stock/trends2/get?secid=${prefix}.${code}&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&fields2=f51,f52,f53,f54,f55,f56,f57,f58&iscr=0&ndays=1`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": "https://quote.eastmoney.com/",
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    return [];
  }

  const data = await res.json();

  if (!data?.data?.trends) {
    return [];
  }

  const trends: MinuteData[] = data.data.trends.map((line: string) => {
    const parts = line.split(",");
    return {
      time: parts[0],
      price: Number(parts[1]) || 0,
      avgPrice: Number(parts[2]) || 0,
      volume: Number(parts[5]) || 0,
    };
  });

  return trends;
}
