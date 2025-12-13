import { forwardRef } from 'react';
import { twMerge } from 'tailwind-merge';

export const Input = forwardRef(({ className, error, icon: Icon, ...props }, ref) => {
    return (
        <div className="relative w-full">
            {Icon && (
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#7531f3]/60">
                    <Icon size={18} />
                </div>
            )}
            <input
                ref={ref}
                className={twMerge(
                    "w-full rounded-xl bg-white/50 border border-zinc-200 px-4 py-3 text-sm text-zinc-900 transition-colors placeholder:text-zinc-400 focus:border-[#7531f3] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#7531f3]/10",
                    Icon && "pl-11",
                    error && "border-red-500 focus:border-red-500 focus:ring-red-500/10",
                    className
                )}
                {...props}
            />
            {error && (
                <p className="mt-1 text-xs text-red-500 font-medium ml-1">
                    {error}
                </p>
            )}
        </div>
    );
});

Input.displayName = 'Input';
