import { NextResponse } from 'next/server';
import YahooFinance from "yahoo-finance2";

export async function POST(request: Request) {
    try {
        const { symbols } = await request.json();

        if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
            return NextResponse.json({});
        }

        // 1. 获取实时报价 (批量)
        const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] })
        const quotes = await yf.quote(symbols);

        // 2. 获取迷你走势图 (并行)
        // 获取最近 1 天的数据，间隔 15 分钟，足够画 Sparkline
        const historyPromises = symbols.map(async (sym) => {
            try {
                const result = await yf.chart(sym, {
                    period1: new Date(Date.now() - 24 * 60 * 60 * 1000), // 过去24小时
                    period2: new Date(Date.now()),
                    interval: "15m"
                });
                return { symbol: sym, data: result };
            } catch (e) {
                return { symbol: sym, data: [] };
            }
        });

        const histories = await Promise.all(historyPromises);

        // 3. 组装数据
        const marketData: Record<string, any> = {};

        // 处理 Quotes
        quotes.forEach((q) => {
            marketData[q.symbol] = {
                price: q.regularMarketPrice,
                changePercent: q.regularMarketChangePercent,
                history: []
            };
        });

        // 处理 History
        histories.forEach((h) => {
            if (marketData[h.symbol] && h.data) {
                let candles: any[] = [];

                // 兼容性判断：有时返回直接数组，有时返回 { quotes: [...] } 对象
                if (Array.isArray(h.data)) {
                    candles = h.data;
                } else if (typeof h.data === 'object' && Array.isArray((h.data as any).quotes)) {
                    candles = (h.data as any).quotes;
                }

                // 只有当 candles 确实是数组且有内容时才进行 map
                if (candles.length > 0) {
                    marketData[h.symbol].history = candles.map((candle: any) => ({
                        value: candle.close
                    }));
                }
            }
        });

        return NextResponse.json(marketData);

    } catch (error) {
        console.error("Market API Error:", error);
        return NextResponse.json({ error: 'Failed to fetch market data' }, { status: 500 });
    }
}