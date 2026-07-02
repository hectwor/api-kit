/**
 * Message catalog: maps message codes to human-readable text.
 * Apps can extend or override any entry, or provide a whole custom catalog.
 */
export type MessageCatalog = Record<string, string>;

/**
 * Default English catalog.
 */
export const messagesEn: MessageCatalog = {
  // Success
  CREATED: "Resource created successfully",
  UPDATED: "Resource updated successfully",
  DELETED: "Resource deleted successfully",
  RETRIEVED: "Resource retrieved successfully",
  LISTED: "Resources retrieved successfully",
  LOGGED_IN: "Logged in successfully",
  OPERATION_COMPLETED: "Operation completed successfully",

  // Errors
  VALIDATION_ERROR: "Validation error in the provided data",
  INVALID_INPUT: "Invalid input",
  MISSING_FIELD: "Required field missing",
  INVALID_TOKEN: "Invalid token",
  EXPIRED_TOKEN: "Token expired",
  MISSING_TOKEN: "Authorization token required",
  UNAUTHORIZED: "Unauthorized",
  FORBIDDEN: "Access denied",
  INSUFFICIENT_PERMISSIONS: "Insufficient permissions",
  NOT_FOUND: "Resource not found",
  NOT_FOUND_ROUTE: "Route not found",
  RESOURCE_NOT_FOUND: "The requested resource does not exist",
  ALREADY_EXISTS: "The resource already exists",
  DUPLICATE_ENTRY: "Duplicate entry",
  INVALID_OPERATION: "Invalid operation",
  BUSINESS_RULE_VIOLATION: "Business rule violation",
  INTERNAL_ERROR: "Internal server error",
  DATABASE_ERROR: "Database error",
  SERVICE_UNAVAILABLE: "Service unavailable",
  MISSING_USER_ID: "User id not found in request headers",
  ERROR: "An error occurred",
  VALIDATION_ERROR_PREFIX: "Validation error",
  RATE_LIMITED: "Too many requests. Please slow down and try again later.",
};

/**
 * Spanish catalog.
 */
export const messagesEs: MessageCatalog = {
  // Success
  CREATED: "Recurso creado exitosamente",
  UPDATED: "Recurso actualizado exitosamente",
  DELETED: "Recurso eliminado exitosamente",
  RETRIEVED: "Recurso obtenido exitosamente",
  LISTED: "Recursos obtenidos exitosamente",
  LOGGED_IN: "Sesión iniciada exitosamente",
  OPERATION_COMPLETED: "Operación completada exitosamente",

  // Errors
  VALIDATION_ERROR: "Error de validación en los datos proporcionados",
  INVALID_INPUT: "Entrada inválida",
  MISSING_FIELD: "Campo requerido faltante",
  INVALID_TOKEN: "Token inválido",
  EXPIRED_TOKEN: "Token expirado",
  MISSING_TOKEN: "Token de autorización requerido",
  UNAUTHORIZED: "No autorizado",
  FORBIDDEN: "Acceso denegado",
  INSUFFICIENT_PERMISSIONS: "Permisos insuficientes",
  NOT_FOUND: "Recurso no encontrado",
  NOT_FOUND_ROUTE: "Ruta no encontrada",
  RESOURCE_NOT_FOUND: "El recurso solicitado no existe",
  ALREADY_EXISTS: "El recurso ya existe",
  DUPLICATE_ENTRY: "Entrada duplicada",
  INVALID_OPERATION: "Operación inválida",
  BUSINESS_RULE_VIOLATION: "Violación de regla de negocio",
  INTERNAL_ERROR: "Error interno del servidor",
  DATABASE_ERROR: "Error en la base de datos",
  SERVICE_UNAVAILABLE: "Servicio no disponible",
  MISSING_USER_ID: "UserId no encontrado en headers",
  ERROR: "An error occurred",
  VALIDATION_ERROR_PREFIX: "Error de validación",
  RATE_LIMITED: "Too many requests. Please slow down and try again later.",
};

/**
 * Merge a partial override catalog over a base catalog.
 */
export function mergeMessages(base: MessageCatalog, overrides?: Partial<MessageCatalog>): MessageCatalog {
  const merged: MessageCatalog = { ...base };
  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}
