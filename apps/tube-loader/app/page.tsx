"use client";

import { useRef, useState } from 'react';
import { z } from 'zod';
import { Download, Scissors, CheckCircle2, AlertCircle, Link2, Play, Music, Loader2, Folder, X, FileText, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';

// Validation Schema
const downloadSchema = z.object({
    url: z.string().url("Please enter a valid YouTube URL"),
    options: z.object({
        video: z.boolean(),
        audio: z.boolean(),
        transcription: z.boolean()
    }).refine(data => data.video || data.audio || data.transcription, {
        message: "Select at least one download option"
    }),
    startTime: z.string().regex(/^(\d{2}:\d{2}:\d{2})?$/, "Format: HH:MM:SS").optional().or(z.literal('')),
    endTime: z.string().regex(/^(\d{2}:\d{2}:\d{2})?$/, "Format: HH:MM:SS").optional().or(z.literal('')),
}).refine(data => {
    if (!!data.startTime !== !!data.endTime) return false;
    return true;
}, {
    message: "Both Start and End times are required",
    path: ["endTime"]
});

// Types
type FormatType = 'mp4' | 'mp3';

interface FormData {
    url: string;
    options: {
        video: boolean;
        audio: boolean;
        transcription: boolean;
    };
    startTime: string;
    endTime: string;
}

interface StatusMessage {
    type: 'success' | 'error';
    message: string;
}

export default function Home() {
    const [formData, setFormData] = useState<FormData>({
        url: '',
        options: {
            video: true,
            audio: false,
            transcription: false
        },
        startTime: '',
        endTime: '',
    });

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState<boolean>(false);
    const [status, setStatus] = useState<StatusMessage | null>(null);
    const [progress, setProgress] = useState<number>(0);
    const [progressDetail, setProgressDetail] = useState<string>('');
    const [downloadEta, setDownloadEta] = useState<string | null>(null);

    const abortControllerRef = useRef<AbortController | null>(null);



    const formatTimeInput = (value: string) => {
        // Strip non-numbers
        const numbers = value.replace(/\D/g, '');

        let digits = numbers.slice(0, 6);

        // Validate Minutes (index 2,3)
        if (digits.length >= 4) {
            const minutes = parseInt(digits.slice(2, 4));
            if (minutes > 59) digits = digits.slice(0, 3); // Remove last digit
        }

        // Validate Seconds (index 4,5)
        if (digits.length >= 6) {
            const seconds = parseInt(digits.slice(4, 6));
            if (seconds > 59) digits = digits.slice(0, 5); // Remove last digit
        }

        // Add colons
        if (digits.length >= 5) {
            return `${digits.slice(0, 2)}:${digits.slice(2, 4)}:${digits.slice(4)}`;
        } else if (digits.length >= 3) {
            return `${digits.slice(0, 2)}:${digits.slice(2)}`;
        }
        return digits;
    };

    const validate = () => {
        try {
            downloadSchema.parse(formData);
            setErrors({});
            return true;
        } catch (err) {
            if (err instanceof z.ZodError) {
                const fieldErrors: Record<string, string> = {};
                err.errors.forEach(e => {
                    const path = e.path[0] === 'options' ? 'options' : e.path[0].toString();
                    fieldErrors[path] = e.message;
                });
                if (!fieldErrors['endTime'] && err.errors.some(e => e.message.includes("Both Start"))) {
                    fieldErrors['endTime'] = "Both Start and End times are required";
                }
                setErrors(fieldErrors);
            }
            return false;
        }
    };

    const handleCancel = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setLoading(false);
        setStatus({ type: 'error', message: 'Download cancelled by user' });
        setProgress(0);
    };

    const handleDownload = async () => {
        if (!validate()) return;

        setLoading(true);
        setStatus(null);
        setProgress(0);
        setDownloadEta(null);
        setProgressDetail('Fetching video info...');

        try {
            // STEP 1: Fetch Video Info (Filename)
            const infoResponse = await fetch('/api/video-info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: formData.url,
                    options: formData.options
                })
            });

            if (!infoResponse.ok) {
                const errData = await infoResponse.json();
                throw new Error(errData.detail || "Failed to fetch video info");
            }
            const infoData = await infoResponse.json();

            // Adjust extension based on selection
            let suggestedName = infoData.filename || `video_${Date.now()}`;
            const selectedCount = Object.values(formData.options).filter(Boolean).length;

            if (selectedCount > 1 || (formData.options.transcription && selectedCount === 1)) {
                // If transcription is involved or multiple files, default to zip usually, 
                // BUT if transcription ONLY, it might be .txt or .zip. 
                // Let's stick to .zip if > 1. If transcription ONLY, maybe .txt?
                // Current backend logic zips trascription + media. If no media, just txt. 
                // Let's safe-bet on .zip for multi, specific ext for single.
                if (selectedCount > 1) {
                    suggestedName = suggestedName.replace(/\.[^/.]+$/, "") + ".zip";
                } else if (formData.options.transcription) {
                    suggestedName = suggestedName.replace(/\.[^/.]+$/, "") + ".txt";
                } else if (formData.options.audio) {
                    suggestedName = suggestedName.replace(/\.[^/.]+$/, "") + ".mp3";
                } else {
                    suggestedName = suggestedName.replace(/\.[^/.]+$/, "") + ".mp4";
                }
            } else {
                if (formData.options.audio) suggestedName = suggestedName.replace(/\.[^/.]+$/, "") + ".mp3";
            }

            // STEP 2: Prompt "Save As" Dialog
            let writableStream: FileSystemWritableFileStream | null = null;

            try {
                if ('showSaveFilePicker' in window) {
                    const types = [];
                    if (selectedCount > 1) {
                        types.push({ description: 'ZIP Archive', accept: { 'application/zip': ['.zip'] } });
                    } else if (formData.options.transcription) {
                        types.push({ description: 'Text File', accept: { 'text/plain': ['.txt'] } });
                    } else if (formData.options.audio) {
                        types.push({ description: 'Audio File', accept: { 'audio/mpeg': ['.mp3'] } });
                    } else {
                        types.push({ description: 'Video File', accept: { 'video/mp4': ['.mp4'] } });
                    }

                    const handle = await (window as any).showSaveFilePicker({
                        suggestedName: suggestedName,
                        types: types,
                    });
                    writableStream = await handle.createWritable();
                } else {
                    console.log("showSaveFilePicker not supported, will use standard download");
                }
            } catch (err: any) {
                if (err.name === 'AbortError') {
                    setLoading(false);
                    return;
                }
                console.warn("Save Picker failed, using fallback", err);
            }

            // STEP 3: Start Backend Download
            setProgressDetail('Starting download...');
            abortControllerRef.current = new AbortController();

            const response = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: formData.url,
                    options: formData.options,
                    start_time: formData.startTime || null,
                    end_time: formData.endTime || null,
                    downloadPath: undefined
                }),
                signal: abortControllerRef.current.signal
            });

            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                } catch (e) {
                    throw new Error(`Server connection failed (${response.status})`);
                }
                throw new Error(errorData.detail || `Server error: ${response.statusText || 'Unknown error'}`);
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
                throw new Error("Failed to initialize stream reader");
            }

            let serverFilename = '';
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;

                const lines = buffer.split('\n');
                // Keep the last part in buffer as it might be incomplete
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    console.log("[Stream]", line); // Debug log
                    try {
                        const data = JSON.parse(line);
                        if (data.status === 'progress') {
                            setProgress(data.progress);
                            setProgressDetail(data.detail);
                            if (data.eta) setDownloadEta(data.eta);
                        } else if (data.status === 'info') {
                            setProgressDetail(data.detail);
                        } else if (data.status === 'completed') {
                            console.log("[Stream Checked] Completed:", data);
                            serverFilename = data.filename;
                            setProgress(100);
                            setProgressDetail("Saving to disk...");
                        } else if (data.status === 'error') {
                            setStatus({ type: 'error', message: data.detail || 'Download failed' });
                            if (writableStream) await writableStream.close();
                            throw new Error(data.detail);
                        }
                    } catch (e: any) {
                        console.warn("[Stream Parse Error]", e, line);
                    }
                }
            }

            // Process any remaining buffer if stream ends and it's a complete line (though usually not)
            if (buffer.trim()) {
                try {
                    const data = JSON.parse(buffer);
                    if (data.status === 'completed') {
                        serverFilename = data.filename;
                    }
                } catch (e) { }
            }

            // STEP 4: Transfer to Chosen Location
            if (serverFilename) {
                setProgressDetail("Transferring...");
                const fileRes = await fetch(`/api/serve-file?filename=${encodeURIComponent(serverFilename)}`);
                if (!fileRes.ok) throw new Error("Failed to retrieve file from server");
                const blob = await fileRes.blob();

                if (writableStream) {
                    await writableStream.write(blob);
                    await writableStream.close();
                } else {
                    triggerStandardDownload(blob, suggestedName);
                }

                setStatus({ type: 'success', message: 'Download completed & saved!' });
                setFormData(prev => ({ ...prev, url: '' }));
            } else {
                throw new Error("No filename returned from server");
            }

        } catch (error: any) {
            if (error.name === 'AbortError') {
                return;
            }
            setStatus({ type: 'error', message: error.message || 'System Execution Failed' });
        } finally {
            setLoading(false);
            setProgress(0);
        }
    };

    const triggerStandardDownload = (blob: Blob, filename: string) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    };

    return (
        <Card className="w-full">
            {/* Header */}
            <div className="mb-8 text-center">
                <h2 className="text-3xl font-bold text-[#7531f3] tracking-tight mb-1">TubeLoader</h2>
                <p className="text-zinc-500 text-sm"></p>
            </div>

            {/* Options Selector */}
            <div className="mb-6 space-y-3">
                <p className="text-sm font-semibold text-zinc-500 mb-2">Selecione o que baixar:</p>
                <div className="grid grid-cols-3 gap-3">
                    {/* Video Option */}
                    <div
                        onClick={() => setFormData(p => ({ ...p, options: { ...p.options, video: !p.options.video } }))}
                        className={`cursor-pointer p-4 rounded-xl border transition-all flex items-center gap-3 ${formData.options.video ? 'border-[#7531f3] bg-[#7531f3]/5 shadow-sm' : 'border-zinc-200 hover:border-zinc-300 bg-white'
                            }`}
                    >
                        <div className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${formData.options.video ? 'bg-[#7531f3] border-[#7531f3]' : 'border-zinc-300 bg-white'
                            }`}>
                            {formData.options.video && <Check size={14} className="text-white" />}
                        </div>
                        <div className="flex flex-col">
                            <span className="font-semibold text-sm text-zinc-800 flex items-center gap-2">
                                <Play size={16} className={formData.options.video ? "text-[#7531f3]" : "text-zinc-400"} />
                                Vídeo
                            </span>
                            <span className="text-[10px] text-zinc-400 font-medium">MP4</span>
                        </div>
                    </div>

                    {/* Audio Option */}
                    <div
                        onClick={() => setFormData(p => ({ ...p, options: { ...p.options, audio: !p.options.audio } }))}
                        className={`cursor-pointer p-4 rounded-xl border transition-all flex items-center gap-3 ${formData.options.audio ? 'border-[#7531f3] bg-[#7531f3]/5 shadow-sm' : 'border-zinc-200 hover:border-zinc-300 bg-white'
                            }`}
                    >
                        <div className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${formData.options.audio ? 'bg-[#7531f3] border-[#7531f3]' : 'border-zinc-300 bg-white'
                            }`}>
                            {formData.options.audio && <Check size={14} className="text-white" />}
                        </div>
                        <div className="flex flex-col">
                            <span className="font-semibold text-sm text-zinc-800 flex items-center gap-2">
                                <Music size={16} className={formData.options.audio ? "text-[#7531f3]" : "text-zinc-400"} />
                                Áudio
                            </span>
                            <span className="text-[10px] text-zinc-400 font-medium">MP3</span>
                        </div>
                    </div>

                    {/* Transcription Option */}
                    <div
                        onClick={() => setFormData(p => ({ ...p, options: { ...p.options, transcription: !p.options.transcription } }))}
                        className={`cursor-pointer p-4 rounded-xl border transition-all flex items-center gap-3 ${formData.options.transcription ? 'border-[#7531f3] bg-[#7531f3]/5 shadow-sm' : 'border-zinc-200 hover:border-zinc-300 bg-white'
                            }`}
                    >
                        <div className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${formData.options.transcription ? 'bg-[#7531f3] border-[#7531f3]' : 'border-zinc-300 bg-white'
                            }`}>
                            {formData.options.transcription && <Check size={14} className="text-white" />}
                        </div>
                        <div className="flex flex-col">
                            <span className="font-semibold text-sm text-zinc-800 flex items-center gap-2">
                                <FileText size={16} className={formData.options.transcription ? "text-[#7531f3]" : "text-zinc-400"} />
                                Transcrição AI
                            </span>
                            <span className="text-[10px] text-zinc-400 font-medium">Auto-Generated</span>
                        </div>
                    </div>
                </div>
                {errors.options && <p className="text-red-500 text-xs ml-1">{errors.options}</p>}
            </div>

            <div className="space-y-5">
                <Input
                    placeholder="Paste YouTube Link"
                    value={formData.url}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, url: e.target.value }))}
                    icon={Link2}
                    error={errors.url}
                />

                <div className="flex items-center gap-4 py-2">
                    <div className="h-px bg-zinc-200 flex-1" />
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                        <Scissors size={12} /> Trim
                    </span>
                    <div className="h-px bg-zinc-200 flex-1" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <Input
                        placeholder="Hours:Minutes:Seconds"
                        value={formData.startTime}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, startTime: formatTimeInput(e.target.value) }))}
                        error={errors.startTime}
                        className="text-center font-mono placeholder:text-xs"
                        maxLength={8}
                    />
                    <Input
                        placeholder="Hours:Minutes:Seconds"
                        value={formData.endTime}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, endTime: formatTimeInput(e.target.value) }))}
                        error={errors.endTime}
                        className="text-center font-mono placeholder:text-xs"
                        maxLength={8}
                    />
                </div>



                <div className="flex gap-2">
                    <Button
                        onClick={handleDownload}
                        disabled={loading}
                        className="flex-1 bg-gradient-to-r from-[#7531f3] to-[#9352f5] h-auto py-4"
                    >
                        {loading ? (
                            <div className="flex flex-col items-center gap-2 w-full">
                                <div className="flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>
                                        {progress > 0 ? `${progress}%` : 'Processing...'}
                                        {downloadEta && progress > 0 && progress < 100 && (
                                            <span className="opacity-75 font-normal ml-2 text-xs">
                                                • {downloadEta} remaining
                                            </span>
                                        )}
                                    </span>
                                </div>
                                <Progress value={progress} className="h-1 bg-white/20" />
                                <span className="text-xs opacity-75 font-normal truncate max-w-[200px]">
                                    {progressDetail || "Initializing stream..."}
                                </span>
                            </div>
                        ) : (
                            <>
                                <Download className="mr-2" size={18} />
                                Download Media
                            </>
                        )}
                    </Button>

                    {loading && (
                        <Button
                            onClick={handleCancel}
                            variant="secondary"
                            className="h-auto px-4 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 border border-red-100"
                        >
                            <X size={20} />
                        </Button>
                    )}
                </div>
            </div>

            {/* LoveStyle Status Notification */}
            <AnimatePresence>
                {status && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className={`mt-6 p-4 rounded-2xl flex items-center gap-3 ${status.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                            }`}
                        {...({} as any)}
                    >
                        {status.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                        <p className="text-sm font-medium">{status.message}</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    );
}

