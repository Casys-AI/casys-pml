// File: /home/ubuntu/CascadeProjects/postbus_mvp/packages/core/src/dtos/api-response.dto.ts

/**
 * Generic wrapper for API responses.
 * @template T The type of the data payload in case of success.
 */
export interface ApiResponse<T> {
  /** Indicates if the request was successful. */
  success: boolean;
  /** The data payload if the request was successful. */
  data?: T;
  /** An error message or structured error if the request failed. */
  error?: string | null; // For simplicity, keeping string | null for now
  // Consider a more structured error object for future enhancements:
  // error?: { message: string; code?: string; details?: any } | null;
}
