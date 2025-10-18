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
    res.status(200).json({
      status: 'received',
      event: payload.event,
      timestamp: Date.now()
    });

    // Process event asynchronously (don't block response)
    const { processWebhook } = await import('../../adaptive/webhook-processor.js');
    processWebhook(payload).catch((err) => {
      logger.error({ err, payload }, 'webhook processing failed');
    });

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
 * RAW webhook debug endpoint - logs everything Plex sends
 * Configure this as a second webhook in Plex to see unfiltered events
 */
webhooksRouter.post('/debug', upload.single('thumb'), (req, res) => {
  try {
    const payloadJson = req.body.payload;

    if (payloadJson) {
      const payload = JSON.parse(payloadJson);

      // Log EVERYTHING with no filtering
      logger.info(
        {
          event: payload.event,
          Player: payload.Player,
          Metadata: payload.Metadata,
          Account: payload.Account,
          Server: payload.Server
        },
        '🔍 RAW WEBHOOK DEBUG'
      );
    }

    res.status(200).json({ status: 'logged' });
  } catch (error) {
    logger.error({ error }, 'debug webhook error');
    res.status(200).json({ status: 'error-but-ok' });
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
      debug: 'POST /webhooks/debug (raw logger)',
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
      debugUrl: `${req.protocol}://${req.get('host')}/webhooks/debug`,
      note: 'Configure this URL in Plex Settings > Webhooks'
    }
  });
});
