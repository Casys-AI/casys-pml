import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';

import type { AITextModelPort } from '@casys/application';

/**
 * Adapter for OpenAI's chat models, extending LangChain's ChatOpenAI class.
 * This makes it a valid LangChain BaseLanguageModel, ready to be used in agents and chains,
 * while providing project-specific defaults.
 */
export class OpenAIAdapter extends ChatOpenAI implements AITextModelPort {
  constructor(apiKey?: string) {
    // Call the parent constructor with project-specific defaults.
    // Note: gpt-5 doesn't support custom temperature, only default (1)
    // GPT-5 reasoning: 'minimal' for speed, 'medium' (default), 'high' for complex tasks
    super({
      apiKey: apiKey ?? process.env.OPENAI_API_KEY,
      model: 'gpt-5',
      reasoning: {
        effort: 'low', // 'minimal' | 'low' | 'medium' | 'high'
      },
      // Note: GPT-5 doesn't support 'summary' (that's for o1/o3 models)
      // For verbosity control, use the 'text' parameter at call time
    });
  }

  /**
   * Generates a simple text response for a given prompt.
   * This method fulfills the AITextModel interface.
   */
  async generateText(prompt: string): Promise<string> {
    const result = await this.invoke(prompt);
    return result.content as string;
  }

  /**
   * Generates text in streaming mode (yields chunks progressively)
   * Uses LangChain's .stream() method for token-by-token streaming
   */
  async *generateTextStream(prompt: string): AsyncGenerator<string, void, unknown> {
    const stream = await this.stream(prompt);

    for await (const chunk of stream) {
      const content = chunk.content;
      if (typeof content === 'string' && content.length > 0) {
        yield content;
      }
    }
  }

  /**
   * Provides an embedding model instance.
   */
  /**
   * Explicitly redeclare the serializable keys to satisfy TypeScript's type checker
   * across package boundaries in a monorepo.
   */
  get lc_serializable_keys(): string[] {
    return super.lc_serializable_keys;
  }

  getEmbeddingModel() {
    return new OpenAIEmbeddings({
      apiKey: this.apiKey,
    });
  }
}
