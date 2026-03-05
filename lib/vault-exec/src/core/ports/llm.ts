export interface LLMClient {
  chat(systemPrompt: string, userMessage: string): Promise<string>;
}
