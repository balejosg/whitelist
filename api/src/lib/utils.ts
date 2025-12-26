/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Utility functions for handling strict TypeScript types
 */

/**
 * Removes all properties with undefined values from an object.
 * This is useful when working with exactOptionalPropertyTypes,
 * where you cannot pass undefined to optional properties.
 */
export function stripUndefined<T extends object>(obj: T): { [K in keyof T as T[K] extends undefined ? never : K]: T[K] } {
    const result = {} as { [K in keyof T as T[K] extends undefined ? never : K]: T[K] };
    for (const key of Object.keys(obj) as Array<keyof T>) {
        if (obj[key] !== undefined) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (result as any)[key] = obj[key];
        }
    }
    return result;
}
