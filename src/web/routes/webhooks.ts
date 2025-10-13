/**
 * Webhook routes for Plex Media Server
 * Receives real-time events (play, stop, scrobble) for adaptive queue management
 *
 * Plex Webhook Documentation: https://support.plex.tv/articles/115002267687-webhooks/
 */

import { Router } from 'express';
import multer from 'multer';
import { logger } from '../../logger.js';
import type { PlexWebhookPayload } from '../../adaptive/types.js';

export const webhooksRouter = Router();

// Multer middleware for parsing multipart/form-data (Plex sends JSON in 'payload' field)
const upload = multer();

/**
 * Health check endpoint for webhook configuration testing
 * Used to verify webhook receiver is accessible from Plex
 */
webhooksRouter.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'plex-webhooks',
    timestamp: Date.now()
  });
});

/**
 * Main webhook receiver endpoint
 * Receives Plex webhook events and processes them for adaptive queue management
 *
 * IMPORTANT: Must respond within 5 seconds or Plex will retry/disable webhook
 */
webhooksRouter.post('/plex', upload.single('thumb'), async (req, res) => {
  try {
    // Extract JSON payload from multipart form data
    const payloadJson = req.body.payload;

    if (!payloadJson) {
      logger.warn('Received webhook with no payload field');
      return res.status(400).json({ error: 'Missing payload field' });
    }

    // Parse JSON payload
    let payload: PlexWebhookPayload;
    try {
      payload = JSON.parse(payloadJson);
    } catch (error) {
      logger.warn({ error, payloadJson }, 'Failed to parse webhook payload JSON');
      return res.status(400).json({ error: 'Invalid JSON in payload field' });
    }

    // Validate payload structure
    if (!payload.event || !payload.Player || !payload.Metadata) {
      logger.warn({ payload }, 'Webhook payload missing required fields');
      return res.status(400).json({ error: 'Invalid webhook payload structure' });
    }

    // Only process music track events
    if (payload.Metadata.type !== 'track') {
      logger.debug(
        { event: payload.event, type: payload.Metadata.type },
        'Ignoring non-track webhook event'
      );
      return res.status(200).json({ status: 'ignored', reason: 'not a track' });
    }

    // Log incoming event for monitoring
    logger.info(
      {
        event: payload.event,
        machineIdentifier: payload.Player.uuid,
        track: payload.Metadata.title,
        artist: payload.Metadata.grandparentTitle,
        ratingKey: payload.Metadata.ratingKey,
        viewOffset: payload.Metadata.viewOffset,
        duration: payload.Metadata.duration
      },
      'Received Plex webhook event'
    );

    // Respond immediately to meet 5-second requirement
    // Processing happens asynchronously (will be implemented in later steps)
    res.status(200).json({
      status: 'received',
      event: payload.event,
      timestamp: Date.now()
    });

    // TODO (Week 2): Process event asynchronously
    // - Detect skip events (media.stop with low completion %)
    // - Track session state (correlate to PlayQueue)
    // - Analyze patterns (genre fatigue, artist aversion)
    // - Trigger queue adaptations if patterns detected

  } catch (error) {
    logger.error({ error }, 'Unexpected error processing webhook');

    // Still respond quickly even on error
    res.status(500).json({
      error: 'Internal server error',
      timestamp: Date.now()
    });
  }
});

/**
 * Webhook configuration test endpoint (optional)
 * Returns information about received webhook configuration
 */
webhooksRouter.get('/test', (req, res) => {
  res.json({
    message: 'Webhook receiver is running',
    endpoints: {
      main: 'POST /webhooks/plex',
      health: 'GET /webhooks/health',
      test: 'GET /webhooks/test'
    },
    requirements: {
      contentType: 'multipart/form-data',
      payloadField: 'payload (JSON string)',
      responseTime: '< 5 seconds'
    },
    plexConfiguration: {
      url: `${req.protocol}://${req.get('host')}/webhooks/plex`,
      note: 'Configure this URL in Plex Settings > Webhooks'
    }
  });
});
