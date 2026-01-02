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
        const quotesToFetch = symbols.filter(sym => {
            const cached = QUOTE_CACHE[sym];
            return !cached || (now - cached.timestamp > QUOTE_TTL);
        });

        if (quotesToFetch.length > 0) {
            console.log(`[API] ⚡️ Batch Fetching Quotes for: ${quotesToFetch.length} items`);
            try {
                // 🚀 修复点：添加 'as any[]' 强制转换
                // 告诉 TS 这肯定是一个数组，不要报错
                const quotes = await yf.quote(quotesToFetch, { returnErrors: false }) as any[];

                // 双重保险：确保它是个数组再遍历
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

        // --- 第二步：处理 K 线历史 (必须逐个查，贵) ---
        const historiesToFetch = symbols.filter(sym => {
            const cached = HISTORY_CACHE[sym];
            return !cached || (now - cached.timestamp > HISTORY_TTL);
        });

        if (historiesToFetch.length > 0) {
            console.log(`[API] 📉 Updating History for: ${historiesToFetch.join(', ')}`);

            await Promise.all(historiesToFetch.map(async (sym) => {
                try {
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
                }
            }));
        }

        // --- 第三步：组装最终结果返回给前端 ---
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