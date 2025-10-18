/**
 * Setup file for integration tests
 * Loads real .env file before any modules are imported
 */

import dotenv from 'dotenv';

// Load .env file from project root
dotenv.config({ path: '.env' });
