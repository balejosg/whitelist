import { describe, it, mock, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import https from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { getFileContent, updateFile } from '../src/lib/github.js';

interface MockResponse {
    statusCode: number;
    on: (event: string, handler: (data?: string) => void) => void;
}

interface RequestOptions {
    method: string;
    path: string;
    headers: Record<string, string>;
}

type RequestCallback = (res: IncomingMessage) => void;

void describe('GitHub API', () => {
    const originalEnv = process.env;

    beforeEach((): void => {
        process.env = { ...originalEnv };
        process.env.GITHUB_TOKEN = 'test_token';
        process.env.GITHUB_OWNER = 'test-owner';
        process.env.GITHUB_REPO = 'test-repo';
        process.env.GITHUB_BRANCH = 'main';
    });

    after((): void => {
        process.env = originalEnv;
    });

    void describe('getFileContent', () => {
        void it('fetches file content successfully', async () => {
            const mockContent = 'hello world';
            const mockBase64 = Buffer.from(mockContent).toString('base64');
            const mockResponseData = {
                type: 'file',
                encoding: 'base64',
                size: 11,
                name: 'test.txt',
                path: 'test.txt',
                content: mockBase64,
                sha: 'sha123'
            };

            const requestMock = mock.method(
                https,
                'request',
                (options: RequestOptions, callback: RequestCallback): ClientRequest => {
                    assert.strictEqual(options.method, 'GET');
                    assert.ok(options.path.includes('/contents/test.txt'));

                    const res: MockResponse = {
                        statusCode: 200,
                        on: (event: string, handler: (data?: string) => void): void => {
                            if (event === 'data') handler(JSON.stringify(mockResponseData));
                            if (event === 'end') handler();
                        }
                    };
                    callback(res as unknown as IncomingMessage);
                    return {
                        on: (): ClientRequest => ({} as ClientRequest),
                        end: (): void => { /* noop */ }
                    } as unknown as ClientRequest;
                }
            );

            const result = await getFileContent('test.txt');

            assert.strictEqual(result.content, mockContent);
            assert.strictEqual(result.sha, 'sha123');

            requestMock.mock.restore();
        });

        void it('throws error if file not found', async () => {
            const requestMock = mock.method(
                https,
                'request',
                (_options: RequestOptions, callback: RequestCallback): ClientRequest => {
                    const res: MockResponse = {
                        statusCode: 404,
                        on: (event: string, handler: (data?: string) => void): void => {
                            if (event === 'data') handler(JSON.stringify({ message: 'Not Found' }));
                            if (event === 'end') handler();
                        }
                    };
                    callback(res as unknown as IncomingMessage);
                    return {
                        on: (): ClientRequest => ({} as ClientRequest),
                        end: (): void => { /* noop */ }
                    } as unknown as ClientRequest;
                }
            );

            await assert.rejects(getFileContent('missing.txt'), /Not Found/);
            requestMock.mock.restore();
        });

        void it('throws error if path is not a file', async () => {
            const mockResponseData = {
                type: 'dir',
                name: 'test_dir',
                path: 'test_dir'
            };

            const requestMock = mock.method(
                https,
                'request',
                (_options: RequestOptions, callback: RequestCallback): ClientRequest => {
                    const res: MockResponse = {
                        statusCode: 200,
                        on: (event: string, handler: (data?: string) => void): void => {
                            if (event === 'data') handler(JSON.stringify(mockResponseData));
                            if (event === 'end') handler();
                        }
                    };
                    callback(res as unknown as IncomingMessage);
                    return {
                        on: (): ClientRequest => ({} as ClientRequest),
                        end: (): void => { /* noop */ }
                    } as unknown as ClientRequest;
                }
            );

            await assert.rejects(getFileContent('test_dir'), /Path is not a file/);
            requestMock.mock.restore();
        });
    });

    void describe('updateFile', () => {
        void it('updates file successfully', async () => {
            const requestMock = mock.method(
                https,
                'request',
                (options: RequestOptions, callback: RequestCallback): ClientRequest => {
                    assert.strictEqual(options.method, 'PUT');
                    const res: MockResponse = {
                        statusCode: 200,
                        on: (event: string, handler: (data?: string) => void): void => {
                            if (event === 'data') handler(JSON.stringify({ commit: { sha: 'new_sha' } }));
                            if (event === 'end') handler();
                        }
                    };
                    callback(res as unknown as IncomingMessage);
                    return {
                        on: (): ClientRequest => ({} as ClientRequest),
                        write: (data: string): void => {
                            const body = JSON.parse(data) as { message: string; sha: string };
                            assert.strictEqual(body.message, 'test update');
                            assert.strictEqual(body.sha, 'old_sha');
                        },
                        end: (): void => { /* noop */ }
                    } as unknown as ClientRequest;
                }
            );

            await updateFile('test.txt', 'new content', 'test update', 'old_sha');
            requestMock.mock.restore();
        });
    });
});
