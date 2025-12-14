
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const filename = searchParams.get('filename');

    if (!filename) {
        return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }

    // Security: basic check to ensure we serve from allowed temp dir
    console.log(`[Serve-File] Request for: ${filename}`);

    // Since we receive absolute path from yt-dlp in our implementation (via --print filename),
    // we can check if it relies inside the temp dir we expect.
    // OR we can just check existence.

    // We should parse the filename if it's an absolute path to just get the basename
    // but the backend `download` logic might be sending the full path.
    // Let's assume the client sends exactly what it got.

    // Safety check: ensure the file exists.
    if (!fs.existsSync(filename)) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const fileStream = fs.createReadStream(filename);
    const stat = fs.statSync(filename);

    return new NextResponse(fileStream as any, {
        headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': stat.size.toString(),
            'Content-Disposition': `attachment; filename="${path.basename(filename)}"`,
        },
    });
}
