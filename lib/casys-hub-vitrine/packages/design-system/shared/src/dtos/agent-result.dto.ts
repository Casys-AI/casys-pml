/**
 * @description Interface de base pour le résultat retourné par l'agent LangChain.
 */
interface BaseAgentResult {
  output: string; // La réponse textuelle de l'agent
  [key: string]: unknown; // Permet d'autres champs potentiels
}

/**
 * @description DTO pour la réponse enrichie de notre API agent.
 */
export interface AgentResponseDTO {
  success: boolean;
  result: BaseAgentResult;
  message?: string; // Message d'erreur optionnel
  sessionId?: string; // sessionId pour le debug
}
