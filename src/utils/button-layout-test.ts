// Utility functions for testing button layout and overflow issues

export const testButtonLayout = () => {
    const buttons = document.querySelectorAll('[class*="hd-1366-button"]');
    const containers = document.querySelectorAll('[class*="hd-1366-button-container"]');

    console.log('Button Layout Test Results:');
    console.log('========================');

    buttons.forEach((button, index) => {
        const rect = button.getBoundingClientRect();
        const parent = button.parentElement;
        const parentRect = parent?.getBoundingClientRect();

        console.log(`Button ${index + 1}:`, {
            text: button.textContent?.trim(),
            width: rect.width,
            height: rect.height,
            left: rect.left,
            right: rect.right,
            parentWidth: parentRect?.width,
            parentLeft: parentRect?.left,
            parentRight: parentRect?.right,
            isOverflowing: parentRect ? rect.right > parentRect.right : false,
            classes: button.className
        });
    });

    containers.forEach((container, index) => {
        const rect = container.getBoundingClientRect();
        const parent = container.parentElement;
        const parentRect = parent?.getBoundingClientRect();

        console.log(`Container ${index + 1}:`, {
            width: rect.width,
            height: rect.height,
            left: rect.left,
            right: rect.right,
            parentWidth: parentRect?.width,
            parentLeft: parentRect?.left,
            parentRight: parentRect?.right,
            isOverflowing: parentRect ? rect.right > parentRect.right : false,
            classes: container.className
        });
    });

    return {
        buttons: Array.from(buttons).map(button => ({
            element: button,
            rect: button.getBoundingClientRect(),
            text: button.textContent?.trim(),
            classes: button.className
        })),
        containers: Array.from(containers).map(container => ({
            element: container,
            rect: container.getBoundingClientRect(),
            classes: container.className
        }))
    };
};

export const checkOverflowIssues = () => {
    const results = testButtonLayout();
    const issues = [];

    results.buttons.forEach((button, index) => {
        const parent = button.element.parentElement;
        if (parent) {
            const parentRect = parent.getBoundingClientRect();
            const buttonRect = button.rect;

            if (buttonRect.right > parentRect.right) {
                issues.push({
                    type: 'button-overflow',
                    buttonIndex: index,
                    buttonText: button.text,
                    overflowAmount: buttonRect.right - parentRect.right,
                    buttonRect,
                    parentRect
                });
            }
        }
    });

    results.containers.forEach((container, index) => {
        const parent = container.element.parentElement;
        if (parent) {
            const parentRect = parent.getBoundingClientRect();
            const containerRect = container.rect;

            if (containerRect.right > parentRect.right) {
                issues.push({
                    type: 'container-overflow',
                    containerIndex: index,
                    overflowAmount: containerRect.right - parentRect.right,
                    containerRect,
                    parentRect
                });
            }
        }
    });

    if (issues.length > 0) {
        console.warn('Overflow Issues Found:', issues);
    } else {
        console.log('✅ No overflow issues found!');
    }

    return issues;
};

export const getResponsiveInfo = () => {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    const info = {
        screenWidth,
        screenHeight,
        isHD1366x768: screenWidth === 1366 && screenHeight === 768,
        isHDResolution: screenWidth >= 768 && screenWidth <= 1366,
        isFHDResolution: screenWidth >= 1367 && screenWidth <= 1920,
        breakpoint: getBreakpoint(screenWidth)
    };

    console.log('Responsive Info:', info);
    return info;
};

const getBreakpoint = (width: number) => {
    if (width < 640) return 'mobile';
    if (width >= 640 && width < 768) return 'sm';
    if (width >= 768 && width < 1024) return 'md';
    if (width >= 1024 && width < 1280) return 'lg';
    if (width >= 1280 && width < 1366) return 'xl';
    if (width === 1366) return 'hd-1366';
    if (width >= 1367 && width < 1920) return 'fhd';
    return 'xl+';
};

// Auto-run tests when imported
if (typeof window !== 'undefined') {
    // Run tests after DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                getResponsiveInfo();
                checkOverflowIssues();
            }, 1000);
        });
    } else {
        setTimeout(() => {
            getResponsiveInfo();
            checkOverflowIssues();
        }, 1000);
    }
}
