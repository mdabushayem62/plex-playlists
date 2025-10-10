/**
 * Error formatting utilities for user-friendly error messages
 */

interface FormattedError {
  message: string;
  suggestion?: string;
  technical?: string;
}

/**
 * Format error for user display with context and suggestions
 */
export function formatUserError(error: unknown, context: string): string {
  const formatted = parseError(error, context);

  let message = formatted.message;

  if (formatted.suggestion) {
    message += ` | Suggestion: ${formatted.suggestion}`;
  }

  if (formatted.technical) {
    message += ` | Technical: ${formatted.technical}`;
  }

  return message;
}

/**
 * Parse error and provide user-friendly message with context
 */
function parseError(error: unknown, context: string): FormattedError {
  const errorStr = error instanceof Error ? error.message : String(error);

  // Timeout errors
  if (errorStr.includes('timeout') || errorStr.includes('TimeoutError')) {
    return {
      message: `Plex server timed out while ${context}`,
      suggestion: 'Check if Plex server is overloaded (cache warming, scanning, transcoding). Try again in a few minutes.',
      technical: extractTechnicalDetails(errorStr)
    };
  }

  // Connection errors
  if (errorStr.includes('ECONNREFUSED') || errorStr.includes('connect ECONNREFUSED')) {
    return {
      message: `Cannot connect to Plex server while ${context}`,
      suggestion: 'Check if Plex server is running and PLEX_BASE_URL is correct.',
      technical: extractPlexUrl(errorStr)
    };
  }

  // Network errors
  if (errorStr.includes('ENOTFOUND') || errorStr.includes('getaddrinfo')) {
    return {
      message: `DNS lookup failed while ${context}`,
      suggestion: 'Check PLEX_BASE_URL hostname. Verify DNS resolution.',
      technical: extractPlexUrl(errorStr)
    };
  }

  // Rate limiting
  if (errorStr.includes('429') || errorStr.includes('rate limit')) {
    return {
      message: `Rate limited while ${context}`,
      suggestion: 'Plex API rate limit reached. Wait a few minutes before retrying.',
      technical: extractTechnicalDetails(errorStr)
    };
  }

  // Authentication errors
  if (errorStr.includes('401') || errorStr.includes('Unauthorized')) {
    return {
      message: `Authentication failed while ${context}`,
      suggestion: 'Check PLEX_AUTH_TOKEN is valid. Token may have expired.',
      technical: 'HTTP 401 Unauthorized'
    };
  }

  // Not found errors
  if (errorStr.includes('404') || errorStr.includes('Not Found')) {
    return {
      message: `Resource not found while ${context}`,
      suggestion: 'Playlist or library section may have been deleted in Plex.',
      technical: extractTechnicalDetails(errorStr)
    };
  }

  // Spotify/Last.fm API errors
  if (errorStr.includes('spotify') || errorStr.includes('last.fm')) {
    return {
      message: `External API error while ${context}`,
      suggestion: 'Genre enrichment service unavailable. Check API keys and rate limits.',
      technical: extractTechnicalDetails(errorStr)
    };
  }

  // Database errors
  if (errorStr.includes('SQLITE') || errorStr.includes('database')) {
    return {
      message: `Database error while ${context}`,
      suggestion: 'Check database file permissions and disk space.',
      technical: extractTechnicalDetails(errorStr)
    };
  }

  // No tracks selected
  if (errorStr.includes('no tracks selected')) {
    return {
      message: `No tracks available for playlist`,
      suggestion: 'Add more listening history or reduce genre restrictions. Check if tracks exist in Plex library.',
      technical: undefined
    };
  }

  // Generic error
  return {
    message: `Error ${context}: ${shortenMessage(errorStr)}`,
    suggestion: 'Check logs for details. If persistent, report issue with error details.',
    technical: extractTechnicalDetails(errorStr)
  };
}

/**
 * Extract Plex URL from error message
 */
function extractPlexUrl(errorStr: string): string | undefined {
  const urlMatch = errorStr.match(/https?:\/\/[^\s"]+/);
  if (urlMatch) {
    // Truncate query params for readability
    const url = urlMatch[0];
    const baseUrl = url.split('?')[0];
    return url.length > 80 ? baseUrl : url;
  }
  return undefined;
}

/**
 * Extract technical details without full stack trace
 */
function extractTechnicalDetails(errorStr: string): string | undefined {
  // Remove stack traces
  const cleaned = errorStr.split('\n')[0];

  // Extract error type and first part of message
  const match = cleaned.match(/\[(\w+Error)\]:\s*(.+?)(?:\s*at\s|$)/);
  if (match) {
    return `${match[1]}: ${shortenMessage(match[2])}`;
  }

  return shortenMessage(cleaned);
}

/**
 * Shorten long error messages
 */
function shortenMessage(msg: string): string {
  const maxLength = 150;
  if (msg.length <= maxLength) {
    return msg;
  }
  return msg.substring(0, maxLength) + '...';
}

/**
 * Check if error is likely due to server being overloaded
 */
export function isServerOverloadError(error: unknown): boolean {
  const errorStr = error instanceof Error ? error.message : String(error);
  return errorStr.includes('timeout') ||
         errorStr.includes('ETIMEDOUT') ||
         errorStr.includes('ECONNRESET');
}
