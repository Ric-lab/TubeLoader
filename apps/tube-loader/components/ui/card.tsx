import { motion } from 'framer-motion';
import { twMerge } from 'tailwind-merge';
type CardProps = {
    children: React.ReactNode;
    className?: string;
    [key: string]: any;
};

export function Card({ className, children, ...props }: CardProps) {
    const MotionDiv = motion.div as any;
    return (
        <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={twMerge("love-card p-8", className)}
            {...props}
        >
            {children}
        </MotionDiv>
    );
}
