import { NextResponse } from 'next/server';
import yf from 'yahoo-finance2';

// 💾 双层缓存
// Quotes 缓存: 短期 (30秒)
const QUOTE_CACHE: Record<string, { data: any, timestamp: number }> = {};
// History 缓存: 长期 (15分钟) - 走势图不需要频繁刷
const HISTORY_CACHE: Record<string, { data: any[], timestamp: number }> = {};

const QUOTE_TTL = 30 * 1000;      // 30秒
const HISTORY_TTL = 15 * 60 * 1000; // 15分钟

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { symbols } = body;

        if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
            return NextResponse.json({});
        }

        const now = Date.now();
        const marketData: Record<string, any> = {};

        // --- 第一步：处理实时报价 (Batch 批量，便宜) ---
        // 找出哪些 Quote 过期了
        const quotesToFetch = symbols.filter(sym => {
            const cached = QUOTE_CACHE[sym];
            return !cached || (now - cached.timestamp > QUOTE_TTL);
        });

        if (quotesToFetch.length > 0) {
            console.log(`[API] ⚡️ Batch Fetching Quotes for: ${quotesToFetch.length} items`);
            try {
                // 🚀 关键：一次请求获取所有报价
                const quotes = await yf.quote(quotesToFetch, { returnErrors: false });

                quotes.forEach((q: any) => {
                    QUOTE_CACHE[q.symbol] = {
                        data: {
                            price: q.regularMarketPrice,
                            changePercent: q.regularMarketChangePercent
                        },
                        timestamp: now
                    };
                });
            } catch (e) {
                console.error("Quote Fetch Error:", e);
            }
        }

        // --- 第二步：处理 K 线历史 (必须逐个查，贵) ---
        // 找出哪些 History 过期了
        const historiesToFetch = symbols.filter(sym => {
            const cached = HISTORY_CACHE[sym];
            // 只有当缓存不存在，或者过期超过 15 分钟才去更新
            return !cached || (now - cached.timestamp > HISTORY_TTL);
        });

        if (historiesToFetch.length > 0) {
            console.log(`[API] 📉 Updating History for: ${historiesToFetch.join(', ')}`);

            // 并行请求，但因为这是为了填充长缓存，偶发的请求量可以接受
            await Promise.all(historiesToFetch.map(async (sym) => {
                try {
                    // 只取最近 24 小时，15分钟间隔
                    const result = await yf.historical(sym, {
                        period1: new Date(Date.now() - 24 * 60 * 60 * 1000),
                        period2: new Date(Date.now()),
                        interval: '15m',
                    });

                    let candles: any[] = [];
                    if (Array.isArray(result)) candles = result;
                    else if (typeof result === 'object' && Array.isArray((result as any).quotes)) candles = (result as any).quotes;

                    const historyData = candles.map((c: any) => ({ value: c.close }));

                    HISTORY_CACHE[sym] = {
                        data: historyData,
                        timestamp: now
                    };
                } catch (e) {
                    console.error(`History fail for ${sym}`);
                    // 如果失败，不要清空缓存，下次再试
                }
            }));
        }

        // --- 第三步：组装最终结果返回给前端 ---
        symbols.forEach(sym => {
            marketData[sym] = {
                // 如果有缓存用缓存，没有就给 0
                ...(QUOTE_CACHE[sym]?.data || { price: 0, changePercent: 0 }),
                // 如果有历史用历史，没有就给空数组
                history: HISTORY_CACHE[sym]?.data || []
            };
        });

        return NextResponse.json(marketData);

    } catch (error) {
        console.error("Market API Error:", error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}