import { useEffect, useCallback } from 'react';

interface PerformanceMetrics {
    loadTime: number;
    renderTime: number;
    memoryUsage?: number;
}

export const usePerformance = (componentName: string) => {
    const startTime = performance.now();

    const measureRenderTime = useCallback(() => {
        const endTime = performance.now();
        const renderTime = endTime - startTime;

        // Log performance metrics in development
        if (import.meta.env.DEV) {
            (`[Performance] ${componentName} render time: ${renderTime.toFixed(2)}ms`);
        }

        // Send to analytics in production
        if (import.meta.env.PROD && renderTime > 100) {
            // You can send this to your analytics service
            console.warn(`[Performance Warning] ${componentName} took ${renderTime.toFixed(2)}ms to render`);
        }
    }, [componentName, startTime]);

    const measureMemoryUsage = useCallback(() => {
        if ('memory' in performance) {
            const memory = (performance as any).memory;
            const memoryUsage = memory.usedJSHeapSize / 1024 / 1024; // MB

            if (import.meta.env.DEV) {
                (`[Memory] ${componentName} memory usage: ${memoryUsage.toFixed(2)}MB`);
            }

            return memoryUsage;
        }
        return undefined;
    }, [componentName]);

    const measureNetworkRequest = useCallback((url: string, startTime: number) => {
        return () => {
            const endTime = performance.now();
            const duration = endTime - startTime;

            if (import.meta.env.DEV) {
                (`[Network] ${url} took ${duration.toFixed(2)}ms`);
            }

            return duration;
        };
    }, []);

    useEffect(() => {
        measureRenderTime();
        measureMemoryUsage();
    }, [measureRenderTime, measureMemoryUsage]);

    return {
        measureRenderTime,
        measureMemoryUsage,
        measureNetworkRequest
    };
};

// Hook for measuring component mount/unmount times
export const useComponentTiming = (componentName: string) => {
    useEffect(() => {
        const mountTime = performance.now();

        return () => {
            const unmountTime = performance.now();
            const lifetime = unmountTime - mountTime;

            if (import.meta.env.DEV) {
                (`[Component Lifecycle] ${componentName} lived for ${lifetime.toFixed(2)}ms`);
            }
        };
    }, [componentName]);
};

// Hook for measuring Firebase query performance
export const useFirebasePerformance = () => {
    const measureQuery = useCallback(async <T>(
        queryName: string,
        queryFn: () => Promise<T>
    ): Promise<T> => {
        const startTime = performance.now();

        try {
            const result = await queryFn();
            const endTime = performance.now();
            const duration = endTime - startTime;

            if (import.meta.env.DEV) {
                (`[Firebase Query] ${queryName} took ${duration.toFixed(2)}ms`);
            }

            return result;
        } catch (error) {
            const endTime = performance.now();
            const duration = endTime - startTime;

            console.error(`[Firebase Query Error] ${queryName} failed after ${duration.toFixed(2)}ms:`, error);
            throw error;
        }
    }, []);

    return { measureQuery };
};
