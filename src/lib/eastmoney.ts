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
/**
 * 获取全A股实时行情列表
 * 优先从东方财富拉取（数据全），如果失败则回退到腾讯 qt 接口（海外可访问）
 */
export async function getAllStocks(): Promise<StockInfo[]> {
  try {
    const result = await getAllStocksFromEastMoney();
    if (result.length > 100) {
      return result;
    }
  } catch {
    // 继续走备用源
  }

  // 备用：腾讯 qt.gtimg.cn 接口（海外可访问，无 Referer 限制）
  return await getAllStocksFromTencent();
}

async function getAllStocksFromEastMoney(): Promise<StockInfo[]> {
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
      signal: AbortSignal.timeout(5000),
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
 * 腾讯 qt.gtimg.cn 接口（全球可访问，无 Referer 限制）
 * 海外 Vercel 部署时作为备用数据源
 */
async function getAllStocksFromTencent(): Promise<StockInfo[]> {
  const shList = await fetchTencentBatch("sh");
  const szList = await fetchTencentBatch("sz");
  const merged = [...shList, ...szList];
  return merged.filter(s => s.code && s.price > 0 && s.name && !s.name.includes("ST"));
}

async function fetchTencentBatch(market: "sh" | "sz"): Promise<StockInfo[]> {
  // 先尝试从 eastmoney 拿代码列表（如果这一步也失败，就跳过该市场）
  const allCodes: string[] = [];
  try {
    const listUrl = market === "sh"
      ? "https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=2000&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:1+t:2,m:1+t:23&fields=f12"
      : "https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=3000&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80&fields=f12";

    const r = await fetch(listUrl, {
      headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://quote.eastmoney.com/" },
      signal: AbortSignal.timeout(5000),
    });
    if (r.ok) {
      const d = await r.json();
      if (d?.data?.diff) {
        for (const item of d.data.diff) {
          if (item.f12) allCodes.push(`${market}${item.f12}`);
        }
      }
    }
  } catch {
    // 列表拉不到就返回空
    return [];
  }

  if (allCodes.length === 0) return [];

  // 腾讯接口一次最多约 80 个，分批
  const result: StockInfo[] = [];
  const batchSize = 60;
  for (let i = 0; i < allCodes.length; i += batchSize) {
    const batch = allCodes.slice(i, i + batchSize);
    const url = `https://qt.gtimg.cn/q=${batch.join(",")}`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const text = await r.text();

      // 解析：v_sh600000="1~名字~代码~...";
      const lines = text.split(";").filter(l => l.includes("="));
      for (const line of lines) {
        const eqIdx = line.indexOf("=");
        if (eqIdx < 0) continue;
        const valuePart = line.slice(eqIdx + 1).trim();
        const match = valuePart.match(/^"(.+)"$/);
        if (!match) continue;
        const fields = match[1].split("~");
        if (fields.length < 50) continue;

        const fullCode = fields[2] || "";
        const code = fullCode.replace(/^(sh|sz)/, "");
        result.push({
          code,
          name: fields[1] || "",
          price: Number(fields[3]) || 0,
          changePercent: Number(fields[32]) || 0,
          changeAmount: Number(fields[31]) || 0,
          volume: Number(fields[6]) || 0,
          amount: 0,
          turnoverRate: Number(fields[38]) || 0,
          volumeRatio: Number(fields[49]) || 0,
          marketCap: Number(fields[45]) * 1e8 || 0,
          circulationMarketCap: Number(fields[44]) * 1e8 || 0,
          high: Number(fields[33]) || 0,
          low: Number(fields[34]) || 0,
          open: Number(fields[5]) || 0,
          preClose: Number(fields[4]) || 0,
          amplitude: 0,
          peRatio: Number(fields[39]) || 0,
        });
      }
    } catch {
      // 单批失败继续
    }
  }

  return result;
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
