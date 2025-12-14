import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import archiver from 'archiver';
import crypto from 'crypto';

const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { url, options, start_time, end_time } = body;

        if (!url) {
            return NextResponse.json({ detail: "URL is required" }, { status: 400 });
        }

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                // Use temp directory for intermediate storage
                // CRITICAL: Use a UNIQUE directory per request to avoid collisions and allow safe "file hunting"
                const requestId = crypto.randomUUID();
                const downloadsDir = path.join(os.tmpdir(), 'tubeloader_temp', requestId);

                // Ensure directory exists
                if (!fs.existsSync(downloadsDir)) {
                    try { fs.mkdirSync(downloadsDir, { recursive: true }); } catch (e) { }
                }

                // Predictable filename template (limit title to 150 chars)
                const outputTemplate = `%(title).150s.%(ext)s`;
                const fullOutputTemplate = path.join(downloadsDir, outputTemplate);

                const args = [
                    '-m', 'yt_dlp',
                    url,
                    '-o', fullOutputTemplate,
                    '--no-playlist',
                    '--newline',
                    '--downloader', 'm3u8:native',
                    '-N', '16',
                    '--http-chunk-size', '10M',
                    '--resize-buffer',
                    '--no-mtime',
                    '--restrict-filenames',
                    // Quote the path in case of spaces
                    '--js-runtimes', `node:"${process.execPath}"`,
                ];

                const debugNode = JSON.stringify({ status: 'info', detail: `DEBUG: Node Path: ${process.execPath}` });
                controller.enqueue(encoder.encode(debugNode + '\n'));



                // Server-Side Cookies Strategy
                const cookiesPath = path.join(process.cwd(), 'cookies.txt');
                if (fs.existsSync(cookiesPath)) {
                    const msg = JSON.stringify({ status: 'info', detail: 'Authenticating with server-side cookies...' });
                    controller.enqueue(encoder.encode(msg + '\n'));
                    args.push('--cookies', cookiesPath);
                }

                // --- Format Selection Logic ---
                const wantVideo = options?.video;
                const wantAudio = options?.audio;
                const wantSubs = options?.transcription;

                if (wantVideo && wantAudio) {
                    // Video AND Audio: Download merged MP4. We will extract audio manually later.
                    args.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best');
                    args.push('--merge-output-format', 'mp4');
                    // Removed -x and -k to avoid file deletion issues.

                } else if (wantVideo) {
                    // Video Only
                    args.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best');
                    args.push('--merge-output-format', 'mp4');
                } else if (wantAudio) {
                    // Audio Only
                    args.push('-x', '--audio-format', 'mp3');
                } else if (wantSubs && !wantVideo && !wantAudio) {
                    // Transcription Only
                    args.push('--skip-download');
                }

                // --- Transcription Logic ---
                if (wantSubs) {
                    // Logic moved to post-processing (local AI)
                    // We DO NOT need to ask yt-dlp for subs anymore
                    const chunk = JSON.stringify({ status: 'info', detail: `Transcription enabled: Local AI will generate subtitles` });
                    controller.enqueue(encoder.encode(chunk + '\n'));
                }

                // --- Trimming Logic ---
                if (start_time && end_time) {
                    args.push('--download-sections', `*${start_time}-${end_time}`);
                    const chunk = JSON.stringify({ status: 'info', detail: `Trimming enabled: ${start_time} to ${end_time}` });
                    controller.enqueue(encoder.encode(chunk + '\n'));
                }

                console.log(`Executing: ${pythonCommand} ${args.join(' ')}`);

                const pythonProcess = spawn(pythonCommand, args);

                // ... signal handling ...
                if (req.signal) {
                    req.signal.addEventListener('abort', () => {
                        try { pythonProcess.kill(); } catch (e) { }
                    });
                }

                let capturedFilename = '';

                pythonProcess.stdout.on('data', (data) => {
                    const text = data.toString();
                    const lines = text.split('\n');
                    for (const line of lines) {
                        // Capture filename
                        if (line.includes('[download] Destination:')) {
                            const parts = line.split('Destination:');
                            if (parts.length > 1) capturedFilename = parts[1].trim();
                        }
                        if (line.includes('has already been downloaded')) {
                            const parts = line.split('[download]');
                            if (parts.length > 1) capturedFilename = parts[1].replace('has already been downloaded', '').trim();
                        }
                        // Capture Merger output (Critical for merged files)
                        if (line.includes('[Merger] Merging formats into')) {
                            const parts = line.match(/Merging formats into "(.*)"/);
                            if (parts && parts[1]) capturedFilename = parts[1].trim();
                        }

                        if (line.includes('[download]')) {
                            const progressMatch = line.match(/(\d+\.?\d*)%/);
                            const etaMatch = line.match(/ETA (\d{2}:\d{2}(?::\d{2})?)/);
                            if (progressMatch) {
                                const progress = parseFloat(progressMatch[1]);
                                const eta = etaMatch ? etaMatch[1] : null;
                                const chunk = JSON.stringify({ status: 'progress', progress, eta, detail: line.trim() });
                                controller.enqueue(encoder.encode(chunk + '\n'));
                            }
                        } else if (line.trim()) {
                            // Try to capture filename from other info lines if missed
                            if (!capturedFilename && line.includes(downloadsDir) && !line.includes(' ')) {
                                capturedFilename = line.trim();
                            }
                            const chunk = JSON.stringify({ status: 'info', detail: line.trim() });
                            controller.enqueue(encoder.encode(chunk + '\n'));
                        }
                    }
                });

                let stderrOutput = '';
                pythonProcess.stderr.on('data', (data) => {
                    const text = data.toString();
                    stderrOutput += text;
                    const chunk = JSON.stringify({ status: 'info', detail: `Warning: ${text.trim()}` });
                    controller.enqueue(encoder.encode(chunk + '\n'));
                });

                pythonProcess.on('close', async (code) => {
                    if (code !== 0) {
                        let errorDetail = `Process exited with code ${code}. Error: ${stderrOutput}`;
                        if (stderrOutput.includes('Could not copy Chrome cookie database')) {
                            errorDetail = "O banco de dados do Chrome está bloqueado. Por favor, feche o Google Chrome completamente e tente novamente.";
                        }
                        const chunk = JSON.stringify({ status: 'error', detail: errorDetail });
                        controller.enqueue(encoder.encode(chunk + '\n'));
                        controller.close();
                    } else {
                        const debug1 = JSON.stringify({ status: 'info', detail: `DEBUG: Process closed with 0. Captured: '${capturedFilename}'` });
                        controller.enqueue(encoder.encode(debug1 + '\n'));

                        let finalResult = '';
                        try {
                            let filesToPackage: { path: string, name: string }[] = [];

                            // If we have a captured filename, use it as pivot
                            if (capturedFilename) {
                                const dir = path.dirname(capturedFilename);
                                let ext = path.extname(capturedFilename);
                                let basename = path.basename(capturedFilename, ext);

                                // CRITICAL FIX: If captured filename is like "video.f140.m4a", real basename is "video"
                                // yt-dlp intermediate files have formats like .fXXX.ext or .f22.ext
                                // Regex: .f followed by digits or alphanumeric (sometimes fvideo)
                                if (basename.match(/\.f[a-z0-9]+$/)) {
                                    basename = basename.replace(/\.f[a-z0-9]+$/, '');
                                }

                                console.log(`DEBUG: Base analysis - Dir: ${dir}, Base: ${basename}, Ext: ${ext}`);

                                // --- DEBUG: LIST ALL FILES IN DIR ---
                                try {
                                    const allFiles = fs.readdirSync(dir);
                                    console.log(`DEBUG: Files in temp dir: ${JSON.stringify(allFiles)}`);
                                    const debugMsg = JSON.stringify({ status: 'info', detail: `[DEBUG] Files on disk: ${allFiles.join(', ')}` });
                                    controller.enqueue(encoder.encode(debugMsg + '\n'));
                                } catch (e) {
                                    console.error("DEBUG: Failed to list dir", e);
                                }
                                // ------------------------------------

                                // PRE-CALCULATE PATHS
                                const mp4Path = path.join(dir, `${basename}.mp4`);
                                const mp3Path = path.join(dir, `${basename}.mp3`);

                                // 1. Video (.mp4 / .webm / .mkv)
                                if (wantVideo) {
                                    // Primary attempt: standard merged mp4

                                    if (fs.existsSync(mp4Path)) {
                                        filesToPackage.push({ path: mp4Path, name: `${basename}.mp4` });
                                    } else {
                                        // Robust Fallback: Search for any video file with the same basename
                                        // This handles cases where merge failed (so we have .f137.mp4) or different container (.mkv)
                                        try {
                                            const savedFiles = fs.readdirSync(dir);
                                            // Find files that start with basename AND end with video ext
                                            let videoCandidate = savedFiles.find(f =>
                                                f.startsWith(basename) &&
                                                (f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mkv')) &&
                                                !f.endsWith('.mp3') // exclude audio
                                            );

                                            // NUCLEAR OPTION: If still nothing, look for ANY video file in the temp dir
                                            // (Since we use a unique temp dir per request, this is safe-ish)
                                            if (!videoCandidate) {
                                                videoCandidate = savedFiles.find(f =>
                                                    (f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mkv')) &&
                                                    !f.endsWith('.mp3')
                                                );
                                            }

                                            if (videoCandidate) {
                                                console.log(`DEBUG: Found fallback video file: ${videoCandidate}`);
                                                filesToPackage.push({
                                                    path: path.join(dir, videoCandidate),
                                                    name: videoCandidate
                                                });
                                            } else {
                                                console.log("DEBUG: No video file found for packaging.");
                                                const chunk = JSON.stringify({ status: 'info', detail: 'Warning: Could not locate video file to package.' });
                                                controller.enqueue(encoder.encode(chunk + '\n'));
                                            }
                                        } catch (e) {
                                            console.error("DEBUG: Error searching for video files", e);
                                        }
                                    }
                                }

                                // 2. Audio (.mp3)
                                if (wantAudio) {
                                    // If we downloaded video+audio, the audio might be inside mp4 OR extracted.
                                    // If we ran -x --audio-format mp3 -k, we expect a .mp3 file.
                                    // IF audio only, it is .mp3.
                                    if (fs.existsSync(mp3Path)) {
                                        filesToPackage.push({ path: mp3Path, name: `${basename}.mp3` });
                                    }
                                }

                                // 3. AI Transcription (Local)
                                if (wantSubs) {
                                    // We need an audio source. Ideally the mp3 we just downloaded.
                                    // If we have mp3Path, use it. If not, try to find one.
                                    let audioSourceForTranscribe = '';

                                    if (fs.existsSync(mp3Path)) {
                                        audioSourceForTranscribe = mp3Path;
                                    } else if (filesToPackage.find(f => f.name.endsWith('.mp3'))) {
                                        audioSourceForTranscribe = filesToPackage.find(f => f.name.endsWith('.mp3'))!.path;
                                    } else {
                                        // If no MP3, maybe we have MP4? Whisper can read MP4 too usually via ffmpeg
                                        if (fs.existsSync(mp4Path)) {
                                            audioSourceForTranscribe = mp4Path;
                                        }
                                    }

                                    if (audioSourceForTranscribe) {
                                        const notifyStart = JSON.stringify({ status: 'info', detail: 'Starting local AI transcription (Whisper)...' });
                                        controller.enqueue(encoder.encode(notifyStart + '\n'));

                                        const transcribeScript = path.join(process.cwd(), 'scripts', 'transcribe.py');
                                        const transcribeArgs = [transcribeScript, audioSourceForTranscribe, dir];

                                        await new Promise<void>((resolveTranscribe) => {
                                            const txChild = spawn(pythonCommand, transcribeArgs);

                                            txChild.stdout.on('data', (d) => {
                                                const msg = d.toString().trim();
                                                if (msg.startsWith('DEBUG:') || msg.startsWith('SUCCESS:')) {
                                                    // Send debug logs to frontend
                                                    const chunk = JSON.stringify({ status: 'info', detail: `[AI] ${msg}` });
                                                    controller.enqueue(encoder.encode(chunk + '\n'));
                                                }
                                            });

                                            txChild.stderr.on('data', (d) => {
                                                console.log(`[AI Error] ${d.toString()}`);
                                            });

                                            txChild.on('close', (code) => {
                                                if (code === 0) {
                                                    const txtName = `${basename}.srt`; // Script outputs basename.srt
                                                    const txtPath = path.join(dir, txtName);
                                                    if (fs.existsSync(txtPath)) {
                                                        filesToPackage.push({ path: txtPath, name: txtName });
                                                        const chunk = JSON.stringify({ status: 'info', detail: 'Transcription completed successfully.' });
                                                        controller.enqueue(encoder.encode(chunk + '\n'));
                                                    }
                                                } else {
                                                    const chunk = JSON.stringify({ status: 'info', detail: 'Transcription failed.' });
                                                    controller.enqueue(encoder.encode(chunk + '\n'));
                                                }
                                                resolveTranscribe();
                                            });
                                        });

                                    } else {
                                        const chunk = JSON.stringify({ status: 'info', detail: 'Skipping transcription: No audio source found.' });
                                        controller.enqueue(encoder.encode(chunk + '\n'));
                                    }
                                }

                                // Fallback: if list empty but file exists (e.g. slight name mismatch), try single file
                                if (filesToPackage.length === 0 && fs.existsSync(capturedFilename)) {
                                    const p = fs.statSync(capturedFilename);
                                    if (p.isFile()) {
                                        filesToPackage.push({ path: capturedFilename, name: path.basename(capturedFilename) });
                                    }
                                }

                                // --- MANUAL AUDIO EXTRACTION (FFMPEG) ---
                                // Check if we need to extract audio manually (Video + Audio case)
                                if (wantVideo && wantAudio) {
                                    // We expect to have a video file (mp4Path) but no mp3Path yet (unless standard download grabbed it separately which is rare with this config)
                                    const hasMp4 = filesToPackage.some(f => f.path === mp4Path || f.name.endsWith('.mp4'));
                                    const hasMp3 = filesToPackage.some(f => f.path === mp3Path || f.name.endsWith('.mp3'));

                                    if (hasMp4 && !hasMp3) {
                                        // Extract!
                                        const videoSource = mp4Path;
                                        if (fs.existsSync(videoSource)) {
                                            const notifyExtract = JSON.stringify({ status: 'info', detail: 'Extracting audio from video...' });
                                            controller.enqueue(encoder.encode(notifyExtract + '\n'));

                                            await new Promise<void>((resolveExtract) => {
                                                // ffmpeg -i input.mp4 -vn -acodec libmp3lame -q:a 2 output.mp3
                                                // -y to overwrite
                                                const ffmpegArgs = ['-i', videoSource, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', '-y', mp3Path];
                                                console.log(`Executing FFmpeg: ffmpeg ${ffmpegArgs.join(' ')}`);

                                                const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

                                                ffmpegProcess.on('close', (fCode) => {
                                                    if (fCode === 0 && fs.existsSync(mp3Path)) {
                                                        filesToPackage.push({ path: mp3Path, name: `${basename}.mp3` });
                                                        const chunk = JSON.stringify({ status: 'info', detail: 'Audio extracted successfully.' });
                                                        controller.enqueue(encoder.encode(chunk + '\n'));
                                                    } else {
                                                        const chunk = JSON.stringify({ status: 'info', detail: 'Audio extraction failed.' });
                                                        controller.enqueue(encoder.encode(chunk + '\n'));
                                                    }
                                                    resolveExtract();
                                                });

                                                ffmpegProcess.stderr.on('data', () => { }); // Consume stderr to prevent buffer fill
                                            });
                                        }
                                    }
                                }

                            }

                            // Decision: Zip or Serve?
                            if (filesToPackage.length > 1) {
                                const mainFile = filesToPackage[0] || { name: 'download', path: capturedFilename };
                                const zipName = `${path.basename(mainFile.name, path.extname(mainFile.name))}_pack.zip`;
                                const zipPath = path.join(path.dirname(mainFile.path), zipName);

                                const output = fs.createWriteStream(zipPath);
                                const archive = archiver('zip', { zlib: { level: 9 } });

                                await new Promise<void>((resolve, reject) => {
                                    output.on('close', () => resolve());
                                    archive.on('error', reject);
                                    archive.pipe(output);
                                    filesToPackage.forEach(f => archive.file(f.path, { name: f.name }));
                                    archive.finalize();
                                });

                                finalResult = zipPath;
                            } else if (filesToPackage.length === 1) {
                                finalResult = filesToPackage[0].path;
                            } else {
                                // If capturedFilename is all we have
                                if (capturedFilename && fs.existsSync(capturedFilename)) {
                                    finalResult = capturedFilename;
                                }
                            }

                        } catch (err: any) {
                            console.error("Processing Error:", err);
                            const chunk = JSON.stringify({ status: 'info', detail: `Processing error: ${err.message}` });
                            controller.enqueue(encoder.encode(chunk + '\n'));
                            // Try returning captured if valid
                            if (capturedFilename && fs.existsSync(capturedFilename)) finalResult = capturedFilename;
                        }

                        console.log("DEBUG: Final Result:", finalResult);
                        const debug2 = JSON.stringify({ status: 'info', detail: `DEBUG: Sending completed. Filename: '${finalResult}'` });
                        controller.enqueue(encoder.encode(debug2 + '\n'));

                        const chunk = JSON.stringify({
                            status: 'completed',
                            detail: 'Download finished',
                            filename: finalResult || 'unknown'
                        });
                        controller.enqueue(encoder.encode(chunk + '\n'));
                        controller.close();
                    }
                });
            }
        });

        return new NextResponse(stream, {
            headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' },
        });

    } catch (error: any) {
        return NextResponse.json({ detail: error.message }, { status: 500 });
    }
}
