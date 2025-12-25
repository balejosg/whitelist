/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * GitHub API client for pushing approved domains to whitelist files
 */
interface WhitelistFile {
    name: string;
    path: string;
}
interface AddDomainResult {
    success: boolean;
    message: string;
}
interface BlockedCheckResult {
    blocked: boolean;
    matchedRule: string | null;
}
export declare function getFileContent(filePath: string): Promise<{
    content: string;
    sha: string;
}>;
export declare function updateFile(filePath: string, content: string, message: string, sha?: string | null): Promise<unknown>;
export declare function addDomainToWhitelist(domain: string, groupId: string): Promise<AddDomainResult>;
export declare function listWhitelistFiles(): Promise<WhitelistFile[]>;
export declare function isDomainInWhitelist(domain: string, groupId: string): Promise<boolean>;
export declare function isDomainBlocked(domain: string): Promise<BlockedCheckResult>;
declare const _default: {
    getFileContent: typeof getFileContent;
    updateFile: typeof updateFile;
    addDomainToWhitelist: typeof addDomainToWhitelist;
    listWhitelistFiles: typeof listWhitelistFiles;
    isDomainInWhitelist: typeof isDomainInWhitelist;
    isDomainBlocked: typeof isDomainBlocked;
};
export default _default;
//# sourceMappingURL=github.d.ts.map