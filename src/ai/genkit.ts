import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

/**
 * Genkit initialization with development origin configuration.
 * Resolves CORS warnings in the Studio preview environment.
 */
export const ai = genkit({
  plugins: [googleAI()],
  model: 'googleai/gemini-2.5-flash',
  // Configure allowed origins for Genkit UI and local development
  allowedDevOrigins: ['http://localhost:9002', 'http://localhost:3000'],
});
