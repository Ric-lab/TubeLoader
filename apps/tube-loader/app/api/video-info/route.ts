
import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

// Prevent caching
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const body = await req.json();
        const { url, options } = body;

        if (!url) {
            return NextResponse.json({ detail: "URL is required" }, { status: 400 });
        }

        const args = [
            '-m', 'yt_dlp',
            url,
            '--print', 'filename', // Only print the filename
            '--no-playlist',
            '--restrict-filenames', // ASCII safe
            '--js-runtimes', 'node', // Explicitly use Node.js
        ];

        // Server-Side Cookies Strategy
        const cookiesPath = path.join(process.cwd(), 'cookies.txt');
        if (fs.existsSync(cookiesPath)) {
            console.log("DEBUG: Using server-side cookies.txt");
            args.push('--cookies', cookiesPath);
        }

        // Match format logic from download route
        // If Audio Only
        if (options?.audio && !options?.video) {
            args.push('-x', '--audio-format', 'mp3');
        }
        // If Video included (Video Only OR Video+Audio)
        else if (options?.video) {
            args.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best');
            args.push('--merge-output-format', 'mp4');
        }
        // If Transcription Only (no video/audio)
        // We still run default to get "a filename" but technically it won't match 1:1 if we skip download.
        // But for "suggestion" purposes, getting the video filename is fine, we just change ext in frontend.
        else {
            // Default to video prediction
            args.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best');
            args.push('--merge-output-format', 'mp4');
        }

        const child = spawn('python', args);

        let stdout = '';
        let stderr = '';

        return new Promise((resolve) => {
            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('close', (code) => {
                if (code !== 0) {
                    // Try to extract error
                    console.error('Info fetch error:', stderr);
                    // Return the actual error from yt-dlp so it's visible to the user
                    let cleanError = stderr.replace(/ERROR: /g, '').split('\n')[0] || stderr;
                    if (stderr.includes('Could not copy Chrome cookie database')) {
                        cleanError = "O Google Chrome está aberto/bloqueado. Por favor, feche TODAS as janelas do Chrome e tente novamente.";
                    }
                    resolve(NextResponse.json({ detail: cleanError || 'Falha ao buscar informações do vídeo' }, { status: 500 }));
                } else {
                    const filename = stdout.trim().split('\n').pop() || 'video.mp4';
                    resolve(NextResponse.json({ filename: filename.trim() }));
                }
            });
        });

    } catch (error: any) {
        return NextResponse.json({ detail: error.message }, { status: 500 });
    }
}
