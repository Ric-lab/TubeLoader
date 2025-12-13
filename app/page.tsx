"use client";

import { useState } from 'react';
import { z } from 'zod';
import { Download, Scissors, CheckCircle2, AlertCircle, Link2, Play, Music } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';

// Validation Schema
const downloadSchema = z.object({
    url: z.string().url("Please enter a valid YouTube URL"),
    format: z.enum(['mp4', 'mp3']),
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
    format: FormatType;
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
        format: 'mp4',
        startTime: '',
        endTime: ''
    });

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState<boolean>(false);
    const [status, setStatus] = useState<StatusMessage | null>(null);

    const validate = () => {
        try {
            downloadSchema.parse(formData);
            setErrors({});
            return true;
        } catch (err) {
            if (err instanceof z.ZodError) {
                const fieldErrors: Record<string, string> = {};
                err.errors.forEach(e => {
                    if (e.path[0]) fieldErrors[e.path[0].toString()] = e.message;
                });
                if (!fieldErrors['endTime'] && err.errors.some(e => e.message.includes("Both Start"))) {
                    fieldErrors['endTime'] = "Both Start and End times are required";
                }
                setErrors(fieldErrors);
            }
            return false;
        }
    };

    const handleDownload = async () => {
        if (!validate()) return;

        setLoading(true);
        setStatus(null);

        try {
            // Direct call to local Next.js API
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: formData.url,
                    format: formData.format,
                    start_time: formData.startTime || null,
                    end_time: formData.endTime || null
                })
            });

            const data = await response.json();

            if (response.ok) {
                setStatus({ type: 'success', message: `Success! ${data.title}` });
                setFormData(prev => ({ ...prev, url: '' }));
            } else {
                setStatus({ type: 'error', message: data.detail || 'Download failed' });
            }
        } catch (error) {
            setStatus({ type: 'error', message: 'System Execution Failed' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="w-full">
            {/* Header */}
            <div className="mb-8 text-center">
                <h2 className="text-3xl font-bold text-[#7531f3] tracking-tight mb-1">MediaLoader</h2>
                <p className="text-zinc-500 text-sm">LoveVet Enterprise Utility</p>
            </div>

            {/* Format Selector */}
            <div className="grid grid-cols-2 gap-3 mb-6 bg-zinc-100 p-1 rounded-2xl">
                {(['mp4', 'mp3'] as const).map((fmt) => (
                    <button
                        key={fmt}
                        onClick={() => setFormData(p => ({ ...p, format: fmt }))}
                        className={`relative flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all ${formData.format === fmt
                                ? 'bg-white text-[#7531f3] shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-700'
                            }`}
                    >
                        {fmt === 'mp4' ? <Play size={16} /> : <Music size={16} />}
                        {fmt === 'mp4' ? 'Video' : 'Audio'}
                    </button>
                ))}
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
                        placeholder="00:00:00"
                        value={formData.startTime}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, startTime: e.target.value }))}
                        error={errors.startTime}
                        className="text-center font-mono"
                    />
                    <Input
                        placeholder="00:00:00"
                        value={formData.endTime}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, endTime: e.target.value }))}
                        error={errors.endTime}
                        className="text-center font-mono"
                    />
                </div>

                <Button
                    onClick={handleDownload}
                    loading={loading}
                    className="w-full bg-gradient-to-r from-[#7531f3] to-[#9352f5]"
                >
                    <Download className="mr-2" size={18} />
                    Download Media
                </Button>
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
                    >
                        {status.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                        <p className="text-sm font-medium">{status.message}</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    );
}
