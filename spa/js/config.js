/**
 * Configuration Manager
 * Stores and retrieves app configuration from localStorage
 */
const Config = {
    STORAGE_KEY: 'whitelist-spa-config',

    get() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '{}');
        } catch {
            return {};
        }
    },

    save(config) {
        const current = this.get();
        const merged = { ...current, ...config };
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(merged));
        return merged;
    },

    isConfigured() {
        const config = this.get();
        return !!(config.token && config.owner && config.repo);
    },

    clear() {
        localStorage.removeItem(this.STORAGE_KEY);
    },

    getRequired() {
        const config = this.get();
        if (!config.token || !config.owner || !config.repo) {
            throw new Error('Configuración incompleta');
        }
        return config;
    }
};
