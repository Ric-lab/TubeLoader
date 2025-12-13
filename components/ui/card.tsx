"use client";

import { motion } from 'framer-motion';
import { twMerge } from 'tailwind-merge';

export function Card({ className, children, ...props }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={twMerge("love-card p-8", className)}
            {...props}
        >
            {children}
        </motion.div>
    );
}
