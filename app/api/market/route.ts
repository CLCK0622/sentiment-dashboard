import { NextResponse } from 'next/server';
import YahooFinance from "yahoo-finance2";

// 💾 双层缓存
const QUOTE_CACHE: Record<string, { data: any, timestamp: number }> = {};
const HISTORY_CACHE: Record<string, { data: any[], timestamp: number }> = {};

const QUOTE_TTL = 30 * 1000;      // 30秒
const HISTORY_TTL = 15 * 60 * 1000; // 15分钟

// ✅ 关键修复：将 YahooFinance 实例移到外面，全局共享
const yf = new YahooFinance();

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { symbols } = body;

        if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
            return NextResponse.json({});
        }

        const now = Date.now();
        const marketData: Record<string, any> = {};

        // --- 第一步：处理实时报价 (Batch 批量) ---
        const quotesToFetch = symbols.filter(sym => {
            const cached = QUOTE_CACHE[sym];
            return !cached || (now - cached.timestamp > QUOTE_TTL);
        });

        if (quotesToFetch.length > 0) {
            console.log(`[API] ⚡️ Batch Fetching Quotes for: ${quotesToFetch.length} items`);
            try {
                // ✅ 修复1: 移除 returnErrors 参数
                const quotes = await yf.quote(quotesToFetch) as any[];

                if (Array.isArray(quotes)) {
                    quotes.forEach((q: any) => {
                        QUOTE_CACHE[q.symbol] = {
                            data: {
                                price: q.regularMarketPrice,
                                changePercent: q.regularMarketChangePercent
                            },
                            timestamp: now
                        };
                    });
                }
            } catch (e) {
                console.error("Quote Fetch Error:", e);
            }
        }

        // --- 第二步：处理 K 线历史 (逐个串行) ---
        const historiesToFetch = symbols.filter(sym => {
            const cached = HISTORY_CACHE[sym];
            return !cached || (now - cached.timestamp > HISTORY_TTL);
        });

        if (historiesToFetch.length > 0) {
            console.log(`[API] 📉 Updating History for: ${historiesToFetch.length} items (Serial Mode)`);

            const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

            // 🔄 带重试的请求函数
            const fetchWithRetry = async (sym: string, retries = 3): Promise<boolean> => {
                for (let attempt = 1; attempt <= retries; attempt++) {
                    try {
                        const result = await yf.chart(sym, {
                            period1: new Date(Date.now() - 24 * 60 * 60 * 1000),
                            period2: new Date(),
                            interval: '15m',
                        });

                        let candles: any[] = [];
                        if (result && Array.isArray(result.quotes)) {
                            candles = result.quotes;
                        }

                        const historyData = candles.map((c: any) => ({ value: c.close }));

                        HISTORY_CACHE[sym] = {
                            data: historyData,
                            timestamp: Date.now()
                        };

                        console.log(`[API] ✅ Updated: ${sym}`);
                        return true;

                    } catch (e: any) {
                        const is429 = e.message?.includes('Too Many Requests') || e.message?.includes('429');

                        if (is429 && attempt < retries) {
                            // 如果是 429 错误且还有重试次数，等更久再试
                            const waitTime = 2000 * attempt; // 2秒, 4秒, 6秒
                            console.log(`[API] ⏳ Rate limited ${sym}, retry ${attempt}/${retries} in ${waitTime}ms`);
                            await delay(waitTime);
                        } else {
                            console.error(`[API] ❌ History fail for ${sym}: ${e.message || e}`);
                            return false;
                        }
                    }
                }
                return false;
            };

            // 逐个处理，每次间隔更长
            for (const sym of historiesToFetch) {
                await fetchWithRetry(sym);

                // 🐌 增加到 1.5 秒间隔，避免触发限流
                await delay(1500);
            }
            console.log(`[API] 🏁 All history updates finished.`);
        }

        // --- 第三步：组装返回结果 ---
        symbols.forEach(sym => {
            marketData[sym] = {
                ...(QUOTE_CACHE[sym]?.data || { price: 0, changePercent: 0 }),
                history: HISTORY_CACHE[sym]?.data || []
            };
        });

        return NextResponse.json(marketData);

    } catch (error) {
        console.error("Market API Error:", error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}