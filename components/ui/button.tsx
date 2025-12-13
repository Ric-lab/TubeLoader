"use client";

import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

export function Button({
    className,
    variant = 'primary',
    loading,
    disabled,
    children,
    ...props
}) {
    const baseStyles = "relative inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7531f3] disabled:opacity-50 disabled:cursor-not-allowed";

    const variants = {
        primary: "bg-[#7531f3] text-white hover:bg-[#6025cc] shadow-lg shadow-[#7531f3]/30",
        secondary: "bg-white text-[#7531f3] border border-[#7531f3]/20 hover:bg-[#7531f3]/5",
        ghost: "text-zinc-600 hover:text-[#7531f3] hover:bg-[#7531f3]/5",
    };

    return (
        <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={twMerge(baseStyles, variants[variant], className)}
            disabled={disabled || loading}
            {...props}
        >
            {loading ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                </>
            ) : children}
        </motion.button>
    );
}
