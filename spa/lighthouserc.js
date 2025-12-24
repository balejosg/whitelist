module.exports = {
    ci: {
        collect: {
            url: ['http://localhost:3000/'],
            numberOfRuns: 3,
            settings: {
                preset: 'desktop',
                throttlingMethod: 'simulate',
            },
        },
        assert: {
            assertions: {
                'categories:performance': ['warn', { minScore: 0.7 }],
                'categories:accessibility': ['error', { minScore: 0.8 }],
                'categories:best-practices': ['warn', { minScore: 0.8 }],
                'categories:seo': ['warn', { minScore: 0.7 }],
                // Specific performance metrics
                'first-contentful-paint': ['warn', { maxNumericValue: 2000 }],
                'largest-contentful-paint': ['warn', { maxNumericValue: 3000 }],
                'cumulative-layout-shift': ['warn', { maxNumericValue: 0.1 }],
                'interactive': ['warn', { maxNumericValue: 5000 }],
            },
        },
        upload: {
            target: 'temporary-public-storage',
        },
    },
};
