import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const WATCHLIST_FILE = path.join(process.cwd(), '../data', 'watchlist.json');

// GET: 读取列表
export async function GET() {
    try {
        // 如果文件不存在，返回空数组
        try {
            await fs.access(WATCHLIST_FILE);
        } catch {
            return NextResponse.json([]);
        }

        const data = await fs.readFile(WATCHLIST_FILE, 'utf-8');
        return NextResponse.json(JSON.parse(data));
    } catch (error) {
        return NextResponse.json({ error: 'Failed to load watchlist' }, { status: 500 });
    }
}

// POST: 更新列表 (添加或删除)
export async function POST(request: Request) {
    try {
        const body = await request.json();
        // 简单的校验：必须是数组
        if (!Array.isArray(body)) {
            return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
        }

        // 确保目录存在
        const dir = path.dirname(WATCHLIST_FILE);
        try { await fs.access(dir); }
        catch { await fs.mkdir(dir, { recursive: true }); }

        await fs.writeFile(WATCHLIST_FILE, JSON.stringify(body, null, 2), 'utf-8');
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to save watchlist' }, { status: 500 });
    }
}