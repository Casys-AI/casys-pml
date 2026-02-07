import * as fs from 'fs';
import OpenAI from 'openai';
import * as path from 'path';

import { type PodcastGeneratorPort } from '@casys/application';

import { createLogger } from '../../../utils/logger';

// Lazy initialization of OpenAI client to avoid build-time errors
let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  openai ??= new OpenAI();
  return openai;
}

export class OpenAITTSAdapter implements PodcastGeneratorPort {
  async generatePodcast(
    text: string,
    _language: string // Note: language is not directly used by OpenAI's tts-1 model but kept for interface compliance
  ): Promise<{ url: string; duration: number }> {
    try {
      const speechFile = path.resolve(`./public/generated/podcasts/${Date.now()}.mp3`);
      const publicUrl = `/generated/podcasts/${path.basename(speechFile)}`;

      // Ensure the directory exists
      const dir = path.dirname(speechFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const mp3 = await getOpenAIClient().audio.speech.create({
        model: 'tts-1',
        voice: 'alloy', // Alloy is a versatile, multilingual voice
        input: text,
      });

      const buffer = Buffer.from(await mp3.arrayBuffer());
      await fs.promises.writeFile(speechFile, buffer);

      // TODO: Implement duration calculation from the mp3 file if needed.
      return { url: publicUrl, duration: 0 };
    } catch (error) {
      const logger = createLogger('OpenAITTSAdapter');
      logger.error('Error generating podcast with OpenAI:', error);
      throw new Error('Failed to generate podcast.');
    }
  }
}
