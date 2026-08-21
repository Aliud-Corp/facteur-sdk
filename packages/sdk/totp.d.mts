/**
 * Types for `totp.mjs`, hand-written beside it — the arrangement every package in this
 * repository uses, and the one that keeps a published tarball free of a build step.
 */

/** The `secret` parameter of an `otpauth://` URI. */
export declare function secretFromUri(uri: string): string;

/**
 * The six-digit code for `at`, defaulting to now. Pass `at` to test a step boundary
 * rather than wait for one.
 */
export declare function totp(secret: string, at?: number): string;
