"use client";

import { useState, useCallback } from "react";

interface StepResult {
  step: number;
  name: string;
  passed: boolean;
  detail: string;
}

interface StockResult {
  code: string;
  name: string;
  price: number;
  changePercent: number;
  turnoverRate: number;
  volumeRatio: number;
  marketCapYi: number;
  steps: StepResult[];
}

interface AIAnalysis {
  code: string;
  name: string;
  summary: string;
  reasons: string[];
  risks: string[];
  suggestion: string;
}

interface ScanResponse {
  success: boolean;
  scanTime: string;
  totalScanned: number;
  totalPassed: number;
  totalPartial: number;
  passedStocks: StockResult[];
  partialStocks: StockResult[];
  aiAnalyses: Record<string, AIAnalysis>;
  error?: string;
}

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"passed" | "partial">("passed");
  const [analyzingCode, setAnalyzingCode] = useState<string | null>(null);

  const handleScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/scan");
      const json = await res.json();
      if (!json.success) {
        setError(json.error || "筛选失败");
      } else {
        setData(json);
        // 默认显示有数据的标签
        if (json.totalPassed === 0 && json.totalPartial > 0) {
          setActiveTab("partial");
        } else {
          setActiveTab("passed");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "请求失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAnalyze = useCallback(async (stock: StockResult) => {
    setAnalyzingCode(stock.code);
    try {
      const res = await fetch("/api/detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: stock.code,
          name: stock.name,
          price: stock.price,
          changePercent: stock.changePercent,
          turnoverRate: stock.turnoverRate,
          volumeRatio: stock.volumeRatio,
          marketCap: stock.marketCapYi,
        }),
      });
      const json = await res.json();
      if (json.success && data) {
        // 更新该股票的 steps
        const updateStocks = (list: StockResult[]) =>
          list.map(s => s.code === stock.code
            ? { ...s, steps: json.steps, allPassed: json.allPassed }
            : s
          );

        setData({
          ...data,
          passedStocks: updateStocks(data.passedStocks),
          partialStocks: updateStocks(data.partialStocks),
          aiAnalyses: json.analysis
            ? { ...data.aiAnalyses, [stock.code]: json.analysis }
            : data.aiAnalyses,
        });
      }
    } catch {
      // 静默失败
    } finally {
      setAnalyzingCode(null);
    }
  }, [data]);

  const currentStocks = activeTab === "passed" 
    ? data?.passedStocks ?? [] 
    : data?.partialStocks ?? [];

  return (
    <main className="flex-1">
      {/* 顶部标题区 */}
      <div className="border-b border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-4xl">🔍</span>
            <h1 className="text-3xl font-bold tracking-tight">
              StockSifter
            </h1>
            <span className="px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
              AI 量化选股
            </span>
          </div>
          <p className="text-slate-400 text-lg mb-2">
            杨永兴六步选股法 · 每日 14:30 自动筛选
          </p>
          <p className="text-slate-500 text-sm">
            尾盘买入 · 次日冲高兑现 · 适合 A 股短线
          </p>

          <button
            onClick={handleScan}
            disabled={loading}
            className="mt-6 px-8 py-3 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg font-semibold text-white transition-colors"
          >
            {loading ? "正在扫描全市场..." : "🚀 开始筛选"}
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* 六步说明卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          {[
            { step: 1, name: "涨幅 3%-5%", icon: "📈" },
            { step: 2, name: "30天有涨停", icon: "🔥" },
            { step: 3, name: "市值<200亿", icon: "💎" },
            { step: 4, name: "量比>1", icon: "📊" },
            { step: 5, name: "换手5%-10%", icon: "🔄" },
            { step: 6, name: "分时强势", icon: "⚡" },
          ].map((item) => (
            <div
              key={item.step}
              className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-center"
            >
              <div className="text-2xl mb-1">{item.icon}</div>
              <div className="text-xs text-slate-500 mb-1">第{item.step}步</div>
              <div className="text-sm font-medium text-slate-300">{item.name}</div>
            </div>
          ))}
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="p-4 mb-6 rounded-lg bg-red-950 border border-red-800 text-red-300">
            <p className="font-medium">⚠️ 筛选出错</p>
            <p className="text-sm mt-1 text-red-400">{error}</p>
          </div>
        )}

        {/* 加载中 */}
        {loading && (
          <div className="flex flex-col items-center py-20 text-slate-500">
            <div className="w-12 h-12 border-4 border-slate-700 border-t-red-500 rounded-full animate-spin mb-4" />
            <p className="text-lg">正在扫描全市场 {data?.totalScanned || "5000+"} 只股票...</p>
            <p className="text-sm mt-2">六步筛选需要逐只查询分时数据，请耐心等待</p>
          </div>
        )}

        {/* 筛选结果 */}
        {data && !loading && (
          <>
            {/* 统计概览 */}
            <div className="flex items-center gap-4 mb-6 text-sm">
              <span className="text-slate-500">扫描时间：{data.scanTime}</span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-500">共扫描 {data.totalScanned} 只</span>
            </div>

            {/* 标签切换 */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setActiveTab("passed")}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === "passed"
                    ? "bg-red-600 text-white"
                    : "bg-slate-900 text-slate-400 hover:bg-slate-800"
                }`}
              >
                ✅ 完全通过 ({data.totalPassed})
              </button>
              <button
                onClick={() => setActiveTab("partial")}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === "partial"
                    ? "bg-amber-600 text-white"
                    : "bg-slate-900 text-slate-400 hover:bg-slate-800"
                }`}
              >
                ⚡ 部分通过 ({data.totalPartial})
              </button>
            </div>

            {/* 股票列表 */}
            {currentStocks.length === 0 ? (
              <div className="py-20 text-center text-slate-500">
                <p className="text-lg">暂无股票通过筛选</p>
                <p className="text-sm mt-2">
                  {activeTab === "passed"
                    ? "今天没有股票完全通过六步条件，可能不是好的交易日"
                    : "所有筛选结果都完全通过了"}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {currentStocks.map((stock) => (
                  <StockCard
                    key={stock.code}
                    stock={stock}
                    analysis={data.aiAnalyses[stock.code]}
                    onAnalyze={() => handleAnalyze(stock)}
                    analyzing={analyzingCode === stock.code}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* 初始状态 */}
        {!data && !loading && !error && (
          <div className="py-20 text-center text-slate-600">
            <p className="text-lg">点击上方按钮开始筛选</p>
            <p className="text-sm mt-2">
              数据来源：东方财富 · AI 分析：DeepSeek
            </p>
          </div>
        )}

        {/* 底部风险提示 */}
        <div className="mt-12 p-4 rounded-lg bg-slate-900/50 border border-slate-800">
          <p className="text-xs text-slate-500">
            ⚠️ 风险提示：本工具仅用于学习和研究，不构成任何投资建议。股市有风险，投资需谨慎。
            筛选结果基于历史数据和实时行情，不代表未来走势。
          </p>
        </div>
      </div>
    </main>
  );
}

// ---------- 股票卡片组件 ----------

function StockCard({
  stock,
  analysis,
  onAnalyze,
  analyzing,
}: {
  stock: StockResult;
  analysis?: AIAnalysis;
  onAnalyze: () => void;
  analyzing: boolean;
}) {
  const allPassed = stock.steps.every(s => s.passed);

  return (
    <div className={`rounded-xl border overflow-hidden ${
      allPassed ? "border-red-500/30 bg-slate-900" : "border-amber-500/20 bg-slate-900/70"
    }`}>
      {/* 卡片头部 */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold">{stock.name}</span>
              <span className="text-sm text-slate-500">{stock.code}</span>
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm">
              <span className="text-up font-semibold">
                ¥{stock.price.toFixed(2)}
              </span>
              <span className="text-up">
                +{stock.changePercent.toFixed(2)}%
              </span>
              <span className="text-slate-500">
                市值 {stock.marketCapYi}亿
              </span>
              <span className="text-slate-500">
                换手 {stock.turnoverRate.toFixed(1)}%
              </span>
              <span className="text-slate-500">
                量比 {stock.volumeRatio.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={onAnalyze}
          disabled={analyzing}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
        >
          {analyzing ? "AI 分析中..." : analysis ? "🔄 重新分析" : "🤖 AI 分析"}
        </button>
      </div>

      {/* 六步状态 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 p-4">
        {stock.steps.map((step) => (
          <div
            key={step.step}
            className={`p-2 rounded-lg text-xs ${
              step.passed
                ? "bg-green-950/50 border border-green-800/50"
                : "bg-red-950/30 border border-red-800/30"
            }`}
          >
            <div className="flex items-center gap-1 mb-1">
              <span>{step.passed ? "✅" : "❌"}</span>
              <span className="text-slate-400">第{step.step}步</span>
            </div>
            <div className="font-medium text-slate-300 mb-1">{step.name}</div>
            <div className="text-slate-500 text-[11px]">{step.detail}</div>
          </div>
        ))}
      </div>

      {/* AI 分析结果 */}
      {analysis && (
        <div className="p-4 border-t border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🤖</span>
            <span className="font-semibold text-slate-300">AI 分析</span>
          </div>

          <p className="text-sm text-slate-400 mb-3">{analysis.summary}</p>

          {analysis.reasons.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-green-400 mb-1">入选理由</p>
              <ul className="space-y-1">
                {analysis.reasons.map((reason, i) => (
                  <li key={i} className="text-sm text-slate-400 flex gap-2">
                    <span className="text-green-500">•</span>
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis.risks.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-red-400 mb-1">风险提示</p>
              <ul className="space-y-1">
                {analysis.risks.map((risk, i) => (
                  <li key={i} className="text-sm text-slate-400 flex gap-2">
                    <span className="text-red-500">•</span>
                    {risk}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
            <p className="text-xs font-medium text-amber-400 mb-1">操作建议</p>
            <p className="text-sm text-slate-300">{analysis.suggestion}</p>
          </div>
        </div>
      )}
    </div>
  );
}
