import React from 'react';

export function SkeletonLine({ width = '100%', height = 12, className = '' }: { width?: string; height?: number; className?: string }) {
    return (
        <div
            className={`bg-gray-200 rounded ${className}`}
            style={{ width, height }}
        />
    );
}

export function SkeletonCard({ lines = [24, 14, 14], gap = 8 }: { lines?: number[]; gap?: number }) {
    return (
        <div className="bg-white rounded-lg shadow-md p-6 animate-pulse">
            {lines.map((h, idx) => (
                <div key={idx} className={idx < lines.length - 1 ? `mb-${Math.min(6, Math.max(2, Math.floor(gap / 2)))}` : ''}>
                    <SkeletonLine height={h} width={idx === 0 ? '60%' : `${80 - idx * 10}%`} />
                </div>
            ))}
        </div>
    );
}

export function SkeletonList({ count = 6, lines = [24, 14, 14] }: { count?: number; lines?: number[] }) {
    return (
        <div className="space-y-4">
            {Array.from({ length: count }).map((_, idx) => (
                <SkeletonCard key={idx} lines={lines} />
            ))}
        </div>
    );
}


