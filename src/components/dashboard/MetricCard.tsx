'use client';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { type ReactNode, useState, useEffect, useRef } from 'react';

function AnimatedNumber({ value }: { value: number }) {
    const [display, setDisplay] = useState(0);
    const ref = useRef<number | null>(null);

    useEffect(() => {
        const start = 0;
        const end = value;
        const duration = 600;
        const startTime = performance.now();

        function tick(now: number) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(Math.round(start + (end - start) * eased));
            if (progress < 1) {
                ref.current = requestAnimationFrame(tick);
            }
        }
        ref.current = requestAnimationFrame(tick);
        return () => { if (ref.current) cancelAnimationFrame(ref.current); };
    }, [value]);

    return <>{display.toLocaleString()}</>;
}

interface MetricCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: ReactNode;
    trend?: {
        value: number;
        isPositive: boolean;
    };
    className?: string;
}

export function MetricCardSkeleton({ className }: { className?: string }) {
    return (
        <Card className={cn('', className)}>
            <CardContent className="p-6">
                <div className="flex items-center justify-between">
                    <div className="space-y-2">
                        <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                        <div className="h-7 w-14 animate-pulse rounded bg-muted" />
                        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                    </div>
                    <div className="h-12 w-12 animate-pulse rounded-full bg-muted" />
                </div>
            </CardContent>
        </Card>
    );
}

export function MetricCard({
    title,
    value,
    subtitle,
    icon,
    trend,
    className,
}: MetricCardProps) {
    return (
        <Card className={cn('', className)}>
            <CardContent className="p-6">
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <p className="text-sm font-medium text-muted-foreground">{title}</p>
                        <div className="flex items-baseline gap-2">
                            <p className="text-2xl font-bold">
                                {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
                            </p>
                            {trend && (
                                <span
                                    className={cn(
                                        'text-sm font-medium',
                                        trend.isPositive ? 'text-green-600' : 'text-red-600'
                                    )}
                                >
                                    {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
                                </span>
                            )}
                        </div>
                        {subtitle && (
                            <p className="text-xs text-muted-foreground">{subtitle}</p>
                        )}
                    </div>
                    <div className="rounded-full bg-primary/10 p-3">
                        {icon}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
