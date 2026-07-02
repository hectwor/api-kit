import type express from "express";
import type Joi from "joi";

import { ERROR_CODES } from "../http/codes";
import { messagesEn, type MessageCatalog } from "../http/messages";
import type { ResponseBuilder } from "../http/response-builder";
import { HTTP_STATUS } from "../http/status";

export type SchemaValidator = (schema: Joi.ObjectSchema) => express.RequestHandler;

/** Property key under which a validation middleware stores its Joi schema. */
export const SCHEMA_TAG = "__apiKitSchema" as const;

/** A request handler carrying the Joi schema it validates (for OpenAPI introspection). */
export type SchemaTaggedHandler = express.RequestHandler & { [SCHEMA_TAG]?: Joi.ObjectSchema };

export interface SchemaValidatorOptions {
  responses: ResponseBuilder;
  /** Catalog used for the error text prefix (key VALIDATION_ERROR_PREFIX). Default: ResponseBuilder's catalog. */
  messages?: MessageCatalog;
}

/**
 * Joi body-validation middleware factory.
 * Returns a `validateSchema(schema)` function to chain in routes:
 *
 *   router.post("/users", validateSchema(CreateUserSchema), controller.create)
 *
 * On failure responds 400 with all validation messages joined; on success
 * replaces `req.body` with the validated (and possibly coerced) value.
 */
export function createSchemaValidator(options: SchemaValidatorOptions): SchemaValidator {
  const { responses } = options;
  const messages = options.messages ?? responses.messages ?? messagesEn;
  const prefix = messages.VALIDATION_ERROR_PREFIX ?? "Validation error";

  return (schema: Joi.ObjectSchema) => {
    const handler: SchemaTaggedHandler = (req, res, next) => {
      const { error, value } = schema.validate(req.body, { abortEarly: false });

      if (error) {
        const errorMessage = error.details.map((detail) => detail.message).join(", ");
        return responses.sendError(res, ERROR_CODES.INVALID_INPUT, `${prefix}: ${errorMessage}`, HTTP_STATUS.BAD_REQUEST);
      }

      req.body = value;
      next();
    };
    // Tag the middleware so the OpenAPI layer can auto-document the request body
    // of any route that uses it (see collectExpressRoutes / createOpenApiRoutes).
    handler[SCHEMA_TAG] = schema;
    return handler;
  };
}
