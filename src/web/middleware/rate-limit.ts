/**
 * Rate limiting middleware to prevent abuse
 * Protects sensitive endpoints from brute force and DOS attacks
 */

import rateLimit from 'express-rate-limit';
import { logger } from '../../logger.js';

/**
 * General rate limiter for most endpoints
 * Allows 100 requests per 15 minutes per IP
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { error: 'Too many requests, please try again later.' },
  handler: (req, res) => {
    logger.warn(
      {
        ip: req.ip,
        path: req.path,
        method: req.method
      },
      'rate limit exceeded'
    );
    res.status(429).json({ error: 'Too many requests, please try again later.' });
  }
});

/**
 * Strict rate limiter for sensitive operations
 * Allows 10 requests per 15 minutes per IP
 * Use for: login attempts, password changes, API key updates
 */
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all requests
  message: { error: 'Too many requests, please try again in 15 minutes.' },
  handler: (req, res) => {
    logger.warn(
      {
        ip: req.ip,
        path: req.path,
        method: req.method
      },
      'strict rate limit exceeded'
    );
    res.status(429).json({ error: 'Too many sensitive requests. Please try again in 15 minutes.' });
  }
});

/**
 * Moderate rate limiter for resource-intensive operations
 * Allows 20 requests per hour per IP
 * Use for: playlist generation, cache warming, imports
 */
export const resourceLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 requests per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many resource-intensive requests, please try again later.' },
  handler: (req, res) => {
    logger.warn(
      {
        ip: req.ip,
        path: req.path,
        method: req.method
      },
      'resource rate limit exceeded'
    );
    res.status(429).json({ error: 'Too many operations. Please try again in an hour.' });
  }
});

/**
 * Create a custom rate limiter with specified options
 */
export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message?: string;
}) {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: options.message || 'Too many requests, please try again later.' },
    handler: (req, res) => {
      logger.warn(
        {
          ip: req.ip,
          path: req.path,
          method: req.method
        },
        'custom rate limit exceeded'
      );
      res.status(429).json({ error: options.message || 'Too many requests, please try again later.' });
    }
  });
}
