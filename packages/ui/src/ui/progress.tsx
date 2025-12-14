"use client"

import * as React from "react"
import { twMerge } from "tailwind-merge"

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
    value?: number
}

export function Progress({ className, value, ...props }: ProgressProps) {
    return (
        <div
            className={twMerge(
                "relative h-4 w-full overflow-hidden rounded-full bg-secondary/20 bg-zinc-100",
                className
            )}
            {...props}
        >
            <div
                className="h-full w-full flex-1 bg-[#7531f3] transition-all duration-300 ease-in-out"
                style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
            />
        </div>
    )
}
