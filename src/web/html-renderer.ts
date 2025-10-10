/**
 * HTML renderer for @kitajs/html with Express
 * Type-safe JSX rendering without build step
 */

import type { Request, Response } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [elemName: string]: any;
    }
  }
}

/**
 * Render a TSX component to HTML and send as response
 */
export function renderHtml(res: Response, html: string) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

/**
 * Express middleware to add renderHtml helper to response
 */
export function htmlRendererMiddleware(req: Request, res: Response, next: () => void) {
  // Add custom render method to response
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (res as any).renderHtml = (html: string) => renderHtml(res, html);
  next();
}

// Extend Express Response type
declare module 'express-serve-static-core' {
  interface Response {
    renderHtml(html: string): void;
  }
}
