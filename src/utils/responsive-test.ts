// Utility functions for responsive testing
import { useState, useEffect } from 'react';

export const getScreenSize = () => {
    return {
        width: window.innerWidth,
        height: window.innerHeight,
        ratio: window.innerWidth / window.innerHeight
    };
};

export const isHD1366x768 = () => {
    const { width, height } = getScreenSize();
    return width === 1366 && height === 768;
};

export const isHDResolution = () => {
    const { width, height } = getScreenSize();
    return width >= 768 && width <= 1366;
};

export const isFHDResolution = () => {
    const { width, height } = getScreenSize();
    return width >= 1367 && width <= 1920;
};

export const getResponsiveClass = () => {
    const { width } = getScreenSize();

    if (width < 640) return 'mobile';
    if (width >= 640 && width < 768) return 'sm';
    if (width >= 768 && width < 1024) return 'md';
    if (width >= 1024 && width < 1280) return 'lg';
    if (width >= 1280 && width < 1366) return 'xl';
    if (width === 1366) return 'hd-1366';
    if (width >= 1367 && width < 1920) return 'fhd';
    return 'xl+';
};

// Debug function to log current screen info
export const logScreenInfo = () => {
    const screenInfo = getScreenSize();
    const responsiveClass = getResponsiveClass();

    console.log('Screen Info:', {
        ...screenInfo,
        responsiveClass,
        isHD1366x768: isHD1366x768(),
        isHDResolution: isHDResolution(),
        isFHDResolution: isFHDResolution()
    });

    return screenInfo;
};

// Hook for React components

export const useResponsive = () => {
    const [screenInfo, setScreenInfo] = useState(getScreenSize);

    useEffect(() => {
        const handleResize = () => {
            setScreenInfo(getScreenSize());
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return {
        ...screenInfo,
        responsiveClass: getResponsiveClass(),
        isHD1366x768: isHD1366x768(),
        isHDResolution: isHDResolution(),
        isFHDResolution: isFHDResolution()
    };
};
