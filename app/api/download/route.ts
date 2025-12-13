import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { url, format, start_time, end_time } = body;

        if (!url) {
            return NextResponse.json({ detail: "URL is required" }, { status: 400 });
        }

        // Use Python's yt-dlp module directly
        // This assumes python is in PATH. In prompt it was confirmed.

        const downloadsDir = path.join(os.homedir(), 'Downloads');
        const timestamp = Date.now();
        const tempOutputTemplate = path.join(downloadsDir, `tubeloader_${timestamp}_%(title)s.%(ext)s`);

        const args = [
            '-m', 'yt_dlp',
            url,
            '-o', tempOutputTemplate,
            '--no-playlist',
        ];

        if (format === 'mp3') {
            args.push('-x', '--audio-format', 'mp3');
        } else {
            args.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best');
        }

        if (start_time && end_time) {
            // Note: yt-dlp download sections is experimental or requires ffmpeg
            args.push('--download-sections', `*${start_time}-${end_time}`);
            args.push('--force-keyframes-at-cuts');
        }

        console.log(`Executing: python ${args.join(' ')}`);

        return new Promise((resolve) => {
            const pythonProcess = spawn('python', args);

            let stdout = '';
            let stderr = '';

            pythonProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    console.error('yt-dlp error:', stderr);
                    resolve(NextResponse.json({
                        detail: `Download failed: ${stderr || 'Unknown error'}`
                    }, { status: 500 }));
                } else {
                    // Parse filename from stdout or predict it? 
                    // Simplified: Return success message
                    // In a real app we'd parse the filename line.
                    resolve(NextResponse.json({
                        title: "Media Downloaded Successfully",
                        file: "Saved to Downloads folder"
                    }));
                }
            });
        });

    } catch (error: any) {
        return NextResponse.json({ detail: error.message }, { status: 500 });
    }
}
