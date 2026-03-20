/**
 * Agora credentials. Use a new project from console.agora.io (Voice & Video).
 * Set in .env or paste below for quick test.
 */
const AGORA_APP_ID = process.env.REACT_APP_AGORA_APP_ID || '';
const AGORA_TOKEN = process.env.REACT_APP_AGORA_TOKEN || '';
const CHANNEL_NAME = 'main-room';

export { AGORA_APP_ID, AGORA_TOKEN, CHANNEL_NAME };
