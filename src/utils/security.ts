/**
 * Security utilities for input validation and sanitization
 */

import { resolve, normalize, relative } from 'path';
import { existsSync, statSync } from 'fs';

/**
 * Validate and sanitize a file path to prevent directory traversal attacks
 *
 * @param userPath - User-provided path (potentially malicious)
 * @param allowedBasePath - Base directory that paths must be within
 * @returns Sanitized absolute path
 * @throws Error if path is invalid or outside allowed directory
 */
export function sanitizeFilePath(userPath: string, allowedBasePath?: string): string {
  if (!userPath || typeof userPath !== 'string') {
    throw new Error('Invalid path: path must be a non-empty string');
  }

  // Normalize and resolve to absolute path
  const normalizedPath = normalize(userPath);
  const absolutePath = resolve(normalizedPath);

  // If allowedBasePath is provided, ensure path is within it
  if (allowedBasePath) {
    const normalizedBase = normalize(allowedBasePath);
    const absoluteBase = resolve(normalizedBase);

    // Calculate relative path from base to target
    const relativePath = relative(absoluteBase, absolutePath);

    // If relative path starts with '..' or is absolute, it's outside the base directory
    if (relativePath.startsWith('..') || resolve(relativePath) === relativePath) {
      throw new Error(`Path traversal detected: ${userPath} is outside allowed directory ${allowedBasePath}`);
    }
  }

  // Check for suspicious patterns
  if (absolutePath.includes('\0')) {
    throw new Error('Invalid path: null byte detected');
  }

  return absolutePath;
}

/**
 * Validate that a path exists and is a directory
 *
 * @param path - Path to validate
 * @returns true if path exists and is a directory
 */
export function isValidDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Escape HTML special characters to prevent XSS attacks
 *
 * @param unsafe - Potentially unsafe string containing user input
 * @returns HTML-escaped string safe for rendering
 */
export function escapeHtml(unsafe: string): string {
  if (typeof unsafe !== 'string') {
    return String(unsafe);
  }

  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitize user input for safe display in HTML
 * Combines trimming, length limiting, and HTML escaping
 *
 * @param input - User input string
 * @param maxLength - Maximum length (default: 500)
 * @returns Sanitized string
 */
export function sanitizeUserInput(input: string, maxLength = 500): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Trim whitespace
  let sanitized = input.trim();

  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '...';
  }

  // Escape HTML
  return escapeHtml(sanitized);
}

/**
 * Validate that a setting key matches the allowed SettingKey type
 * Prevents injection via dynamic object property access
 *
 * @param key - Key to validate
 * @param allowedKeys - Array of allowed key strings
 * @returns true if key is allowed
 */
export function isAllowedKey<T extends string>(key: string, allowedKeys: readonly T[]): key is T {
  return allowedKeys.includes(key as T);
}
