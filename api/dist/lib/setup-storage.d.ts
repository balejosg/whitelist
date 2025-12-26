/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Setup Storage - JSON file-based setup configuration
 * Stores initial setup data and registration tokens
 */
export interface SetupData {
    registrationToken: string;
    setupCompletedAt: string;
    setupByUserId: string;
}
/**
 * Get setup data from file
 * @returns SetupData or null if setup not completed
 */
export declare function getSetupData(): SetupData | null;
/**
 * Save setup data to file
 * @param data Setup configuration to save
 */
export declare function saveSetupData(data: SetupData): void;
/**
 * Check if initial setup is complete
 * @returns true if setup has been completed
 */
export declare function isSetupComplete(): boolean;
/**
 * Get the current registration token
 * @returns Registration token or null if setup not complete
 */
export declare function getRegistrationToken(): string | null;
/**
 * Generate a new registration token and save it
 * @returns The new registration token
 */
export declare function regenerateRegistrationToken(): string;
//# sourceMappingURL=setup-storage.d.ts.map