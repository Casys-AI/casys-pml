import type { SelectTopicCommand, SelectTopicResult } from '@casys/core';

/** Port: Topic Selection - action: execute (select primary topic) */
export interface SelectTopicExecutePort {
  /**
   * Retourne la sélection de topics et, optionnellement, un angle éditorial
   * et un résumé SEO écrémé strictement dérivé des seoInsights fournis.
   */
  execute(input: SelectTopicCommand): Promise<SelectTopicResult>;
  /** Chemin générique (LLM/agent) */
  invoke?(input: string): Promise<string>;
  /** Chemin typé optionnel */
  selectTopics?(input: unknown): Promise<SelectTopicResult>;
}

export type ISelectTopicExecutePort = SelectTopicExecutePort;
