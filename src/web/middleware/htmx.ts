/**
 * HTMX middleware helpers
 * Utilities for detecting and handling HTMX requests
 */

import type { Request } from 'express';
import type { NavSidebarProps } from '../views/components/nav-sidebar.js';

/**
 * Check if the request is an HTMX request
 * HTMX sets the HX-Request header on all AJAX requests
 *
 * @param req - Express request object
 * @returns true if the request is from HTMX
 */
export function isHtmxRequest(req: Request): boolean {
  return req.headers['hx-request'] === 'true';
}

/**
 * Get the current URL from HX-Current-URL header
 * This header contains the current URL of the browser
 *
 * @param req - Express request object
 * @returns The current URL or undefined
 */
export function getHtmxCurrentUrl(req: Request): string | undefined {
  const url = req.headers['hx-current-url'];
  return typeof url === 'string' ? url : undefined;
}

/**
 * Get the target element ID from HX-Target header
 * This header contains the ID of the target element
 *
 * @param req - Express request object
 * @returns The target element ID or undefined
 */
export function getHtmxTarget(req: Request): string | undefined {
  const target = req.headers['hx-target'];
  return typeof target === 'string' ? target : undefined;
}

/**
 * Get the trigger element ID from HX-Trigger header
 * This header contains the ID of the element that triggered the request
 *
 * @param req - Express request object
 * @returns The trigger element ID or undefined
 */
export function getHtmxTrigger(req: Request): string | undefined {
  const trigger = req.headers['hx-trigger'];
  return typeof trigger === 'string' ? trigger : undefined;
}

/**
 * Get the prompt response from HX-Prompt header
 * This header contains the user's response to an hx-prompt
 *
 * @param req - Express request object
 * @returns The prompt response or undefined
 */
export function getHtmxPrompt(req: Request): string | undefined {
  const prompt = req.headers['hx-prompt'];
  return typeof prompt === 'string' ? prompt : undefined;
}

/**
 * Combine main content with an out-of-band (OOB) sidebar update
 * Use this for HTMX navigation to update both content and sidebar active state
 *
 * @param content - Main content HTML to render
 * @param sidebarProps - Props for the sidebar (page, setupComplete)
 * @returns Combined HTML with content + OOB sidebar
 *
 * @example
 * ```ts
 * if (isHtmxRequest(req)) {
 *   const content = DashboardContent(data);
 *   const html = withOobSidebar(content, { page: 'dashboard', setupComplete: true });
 *   res.send(html);
 * }
 * ```
 */
export async function withOobSidebar(
  content: string,
  sidebarProps: Omit<NavSidebarProps, 'oob'>
): Promise<string> {
  // Dynamically import to avoid circular dependency
  const { NavSidebar } = await import('../views/components/nav-sidebar.js');
  const sidebar = NavSidebar({ ...sidebarProps, oob: true });
  return content + sidebar;
}
