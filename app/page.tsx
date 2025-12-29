"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  TrendingUp, TrendingDown, AlertTriangle,
  Activity, Clock, Search, Zap, Settings,
  Plus, Trash2, X, Loader2
} from "lucide-react";
import {
  AreaChart, Area, ResponsiveContainer, YAxis
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
type AssetType = 'stock' | 'crypto' | 'commodity';

interface WatchlistItem {
  symbol: string;
  name: string;
  type: AssetType;
  search_term: string;
  monitor_frequency: string;
}

interface SentimentData {
  sentiment_score: number;
  sentiment_label: string;
  is_alert: boolean;
  summary: string;
  prediction?: { rationale: string };
  timestamp?: string;
}

interface SentimentResponse {
  metadata: { last_updated: string };
  tickers: Record<string, SentimentData>; // 关键：允许通过字符串 key 访问
}

interface MarketData {
  price: number;
  changePercent: number;
  history: { value: number }[];
}

interface CombinedAsset extends WatchlistItem {
  sentiment?: SentimentData;
  market?: MarketData;
}

// --- Components ---

const SentimentBadge = ({ score, label }: { score?: number; label?: string }) => {
  // 处理 NA 情况
  if (score === undefined || label === undefined) {
    return (
        <div className="px-2 py-1 rounded-full text-xs font-medium border border-slate-200 bg-slate-100 text-slate-500 flex items-center gap-1.5">
          <Activity size={12} />
          <span>N/A</span>
        </div>
    );
  }

  let colorClass = "bg-slate-100 text-slate-500 border-slate-200"; // Neutral
  if (score >= 8) colorClass = "bg-green-100 text-green-700 border-green-200"; // Euphoria
  else if (score >= 4) colorClass = "bg-emerald-50 text-emerald-600 border-emerald-100"; // Bullish
  else if (score <= -8) colorClass = "bg-red-100 text-red-700 border-red-200"; // Panic
  else if (score <= -4) colorClass = "bg-orange-50 text-orange-600 border-orange-100"; // Fear

  return (
      <div className={cn("px-2 py-1 rounded-full text-xs font-medium border flex items-center gap-1.5", colorClass)}>
        <Activity size={12} />
        <span>{label}</span>
        <span className="font-bold">({score})</span>
      </div>
  );
};

// 图表组件：完全禁止交互
const Sparkline = ({ data, color }: { data: any[]; color: string }) => {
  if (!data || data.length === 0) return <div className="h-[60px] w-full mt-4 bg-slate-50 rounded" />;

  return (
      <div className="h-[60px] w-full mt-4 pointer-events-none select-none"> {/* 禁止鼠标交互 */}
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.2} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis domain={['dataMin', 'dataMax']} hide />
            <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                fill={`url(#gradient-${color})`}
                isAnimationActive={false} // 禁止动画，提升性能
                activeDot={false} // 禁止 hover 点
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
  );
};

// 管理 Watchlist 的弹窗
const WatchlistModal = ({
                          isOpen,
                          onClose,
                          currentList,
                          onUpdate
                        }: {
  isOpen: boolean;
  onClose: () => void;
  currentList: WatchlistItem[];
  onUpdate: (newList: WatchlistItem[]) => void;
}) => {
  const [list, setList] = useState(currentList);
  const [newSymbol, setNewSymbol] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<AssetType>("stock");

  // 同步外部状态
  useEffect(() => setList(currentList), [currentList]);

  const handleAdd = () => {
    if (!newSymbol || !newName) return;
    const newItem: WatchlistItem = {
      symbol: newSymbol.toUpperCase(),
      name: newName,
      type: newType,
      search_term: `${newSymbol} ${newName} ${newType === 'stock' ? 'stock' : newType}`,
      monitor_frequency: "30m"
    };
    const updated = [...list, newItem];
    setList(updated);
    // 重置表单
    setNewSymbol("");
    setNewName("");
  };

  const handleDelete = (symbol: string) => {
    setList(list.filter(i => i.symbol !== symbol));
  };

  const handleSave = async () => {
    // 调用 API 保存
    await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(list)
    });
    onUpdate(list);
    onClose();
  };

  if (!isOpen) return null;

  return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <h2 className="font-bold text-slate-800">管理关注列表</h2>
            <button onClick={onClose}><X size={20} className="text-slate-400 hover:text-slate-600"/></button>
          </div>

          <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2">
            {list.map(item => (
                <div key={item.symbol} className="flex justify-between items-center p-3 bg-slate-50 rounded border border-slate-100">
                  <div>
                    <span className="font-bold text-slate-700">{item.symbol}</span>
                    <span className="text-xs text-slate-500 ml-2">{item.name}</span>
                    <span className="text-[10px] uppercase bg-slate-200 text-slate-600 px-1 py-0.5 rounded ml-2">{item.type}</span>
                  </div>
                  <button onClick={() => handleDelete(item.symbol)} className="text-red-400 hover:text-red-600">
                    <Trash2 size={16} />
                  </button>
                </div>
            ))}
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-100 space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase">添加新资产</h3>
            <div className="grid grid-cols-2 gap-2">
              <input
                  placeholder="Symbol (e.g. TSLA)"
                  value={newSymbol} onChange={e => setNewSymbol(e.target.value)}
                  className="p-2 border rounded text-sm outline-none focus:border-blue-500"
              />
              <input
                  placeholder="Name (e.g. Tesla)"
                  value={newName} onChange={e => setNewName(e.target.value)}
                  className="p-2 border rounded text-sm outline-none focus:border-blue-500"
              />
            </div>
            <select
                value={newType}
                onChange={e => setNewType(e.target.value as AssetType)}
                className="w-full p-2 border rounded text-sm outline-none bg-white"
            >
              <option value="stock">Stock</option>
              <option value="crypto">Crypto</option>
              <option value="commodity">Commodity</option>
            </select>
            <div className="flex gap-2 pt-2">
              <button onClick={handleAdd} className="flex-1 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 text-sm font-medium">加入列表</button>
              <button onClick={handleSave} className="flex-1 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium">保存更改</button>
            </div>
          </div>
        </div>
      </div>
  );
};

// 详情弹窗
const DetailModal = ({ asset, onClose }: { asset: CombinedAsset; onClose: () => void }) => {
  if (!asset) return null;

  return (
      <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          onClick={onClose}
      >
        <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl"
        >
          <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-slate-900">{asset.name}</h2>
                <span className="text-slate-500 font-mono text-sm bg-slate-200 px-2 py-1 rounded">{asset.symbol}</span>
              </div>
              <div className="mt-2 flex items-center gap-4">
              <span className="text-3xl font-mono text-slate-900 tracking-tighter">
                ${asset.market?.price?.toLocaleString() ?? "---"}
              </span>
                <SentimentBadge score={asset.sentiment?.sentiment_score} label={asset.sentiment?.sentiment_label} />
              </div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">✕</button>
          </div>

          <div className="p-6 space-y-6">
            {asset.sentiment ? (
                <>
                  {asset.sentiment.is_alert && (
                      <div className="bg-red-50 border border-red-100 rounded-lg p-4 flex gap-3 items-start">
                        <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={18} />
                        <div>
                          <h4 className="text-red-800 font-bold text-sm mb-1">紧急警报触发</h4>
                          <p className="text-red-600 text-sm">该资产当前处于极度不稳定的市场环境中。</p>
                        </div>
                      </div>
                  )}
                  <div>
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
                      <Search size={14} /> AI 深度分析摘要
                    </h3>
                    <p className="text-slate-700 leading-relaxed text-sm bg-slate-50 p-4 rounded-lg border border-slate-100">
                      {asset.sentiment.summary}
                    </p>
                  </div>
                  {asset.sentiment.prediction && (
                      <div>
                        <h3 className="text-blue-500 text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
                          <Zap size={14} /> 趋势预判与逻辑
                        </h3>
                        <div className="text-slate-700 leading-relaxed text-sm bg-blue-50 p-4 rounded-lg border border-blue-100">
                          {asset.sentiment.prediction.rationale}
                        </div>
                      </div>
                  )}
                </>
            ) : (
                <div className="text-center py-10 text-slate-400">
                  <Activity size={48} className="mx-auto mb-4 opacity-20"/>
                  <p>暂无 AI 分析数据</p>
                  <p className="text-xs">等待下一次分析周期...</p>
                </div>
            )}
          </div>
        </motion.div>
      </motion.div>
  );
};

const AssetCard = ({ asset, onClick }: { asset: CombinedAsset; onClick: () => void }) => {
  const score = asset.sentiment?.sentiment_score ?? 0;
  const isAlert = asset.sentiment?.is_alert ?? false;
  const change = asset.market?.changePercent ?? 0;

  const isPositive = score > 0;
  const isDanger = score <= -8;
  const chartColor = isDanger ? "#ef4444" : (change >= 0 ? "#10b981" : "#ef4444");

  // 🚨 浅色模式警报样式：红色边框 + 红色阴影 + 极淡的红色背景
  const alertStyles = isAlert
      ? "border-red-400 shadow-[0_4px_20px_-5px_rgba(239,68,68,0.3)] bg-red-50/50"
      : "border-slate-200 hover:border-blue-300 shadow-sm hover:shadow-md bg-white";

  return (
      <motion.div
          layoutId={asset.symbol}
          onClick={onClick}
          className={cn(
              "relative rounded-xl border p-5 cursor-pointer transition-all duration-300 group overflow-hidden",
              alertStyles
          )}
      >
        {isAlert && <div className="absolute inset-0 bg-red-500/5 animate-pulse pointer-events-none" />}

        <div className="flex justify-between items-start relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                {asset.symbol}
              </h3>
              {isAlert && <AlertTriangle size={16} className="text-red-500 animate-bounce" />}
            </div>
            <p className="text-slate-500 text-xs font-medium">{asset.name}</p>
          </div>
          <div className="text-right">
            <div className="text-slate-900 font-mono font-bold tracking-tight">
              {asset.market ? `$${asset.market.price.toLocaleString()}` : "Loading..."}
            </div>
            <div className={cn("text-xs font-mono flex items-center justify-end gap-1", change < 0 ? "text-red-500" : "text-green-600")}>
              {change < 0 ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
              {change.toFixed(2)}%
            </div>
          </div>
        </div>

        <div className="relative z-0 opacity-80 group-hover:opacity-100 transition-opacity">
          <Sparkline data={asset.market?.history ?? []} color={chartColor} />
        </div>

        <div className="mt-4 flex justify-between items-center relative z-10">
          <SentimentBadge score={asset.sentiment?.sentiment_score} label={asset.sentiment?.sentiment_label} />
          <span className="text-[10px] text-slate-400 font-mono group-hover:text-blue-400 transition-colors">Detail →</span>
        </div>
      </motion.div>
  );
};

export default function DashboardPage() {
  const [selectedAsset, setSelectedAsset] = useState<CombinedAsset | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [assets, setAssets] = useState<CombinedAsset[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // 1. Fetch Watchlist & Data
  const fetchData = async (currentWatchlist?: WatchlistItem[]) => {
    try {
      // 1. 获取 Watchlist (如果没有传参，则去服务器获取)
      let targetList = currentWatchlist;
      if (!targetList) {
        const wlRes = await fetch('/api/watchlist');
        targetList = await wlRes.json();
        setWatchlist(targetList || []);
      }

      if (!targetList || targetList.length === 0) {
        setAssets([]);
        setIsLoading(false);
        return;
      }

      // 2. 并行获取：Market Data (API) 和 Sentiment Analysis (Static JSON)
      const symbols = targetList.map(i => i.symbol);

      const [marketRes, sentimentRes] = await Promise.all([
        fetch('/api/market', {
          method: 'POST',
          body: JSON.stringify({ symbols }),
          headers: { 'Content-Type': 'application/json' }
        }),
        fetch('/data/latest_sentiment.json', { cache: 'no-store' }) // 假设放在 public/data
      ]);

      const marketData = await marketRes.json();

      let sentimentJson: SentimentResponse = {
        tickers: {},
        metadata: { last_updated: "" }
      };
      try { sentimentJson = await sentimentRes.json(); } catch(e) {}

      // 3. Merge Data
      const merged: CombinedAsset[] = targetList.map(item => ({
        ...item,
        market: marketData[item.symbol] || null,
        sentiment: sentimentJson.tickers[item.symbol] || undefined // 如果没分析过，就是 undefined
      }));

      setAssets(merged);
      setLastUpdated(sentimentJson.metadata?.last_updated || new Date().toISOString());
    } catch (error) {
      console.error("Fetch Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial Load & Refresh
  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(watchlist), 30000); // 30s 刷新
    return () => clearInterval(interval);
  }, []);

  return (
      <div className="min-h-screen bg-slate-50 text-slate-900 p-6 md:p-12 font-sans selection:bg-blue-100">

        {/* Header */}
        <header className="max-w-7xl mx-auto mb-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-slate-200 pb-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight mb-2 text-slate-900">
              Market Intelligence
            </h1>
            <p className="text-slate-500 text-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              System Operational • AI Models: o1-mini
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <button
                onClick={() => setIsSettingsOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md shadow-sm hover:bg-slate-50 text-slate-700 transition-colors"
            >
              <Settings size={14} /> Manage Watchlist
            </button>
            <div className="text-slate-400 text-xs font-mono flex items-center gap-2">
              <Clock size={12} />
              Last Analysis: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "--:--"} (NYSE)
            </div>
          </div>
        </header>

        {/* Content */}
        {isLoading && assets.length === 0 ? (
            <div className="flex justify-center items-center h-64 text-slate-400">
              <Loader2 className="animate-spin mr-2" /> Initializing data feeds...
            </div>
        ) : (
            <main className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {assets.map((asset) => (
                    <AssetCard
                        key={asset.symbol}
                        asset={asset}
                        onClick={() => setSelectedAsset(asset)}
                    />
                ))}
              </AnimatePresence>
              {assets.length === 0 && (
                  <div className="col-span-full text-center py-20 bg-white border border-dashed border-slate-300 rounded-xl text-slate-400">
                    Watchlist is empty. Add assets to start monitoring.
                  </div>
              )}
            </main>
        )}

        {/* Modals */}
        <AnimatePresence>
          {selectedAsset && (
              <DetailModal
                  asset={selectedAsset}
                  onClose={() => setSelectedAsset(null)}
              />
          )}
        </AnimatePresence>

        <WatchlistModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            currentList={watchlist}
            onUpdate={(newList) => {
              setWatchlist(newList);
              fetchData(newList); // 立即刷新数据
            }}
        />
      </div>
  );
}