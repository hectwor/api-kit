import type express from "express";

import { messagesEn, type MessageCatalog } from "../http/messages";

export type RequireUserId = (req: express.Request, res: express.Response) => string | null;

/**
 * Factory for a helper that reads the userId set by the token middleware.
 * Returns the id, or responds 401 and returns null when absent.
 */
export function createRequireUserId(messages: MessageCatalog = messagesEn): RequireUserId {
  return (req, res) => {
    const userId = req.headers.userId?.toString();
    if (!userId) {
      res.status(401).json({
        message: messages.MISSING_USER_ID ?? "User id not found in request headers",
        error: "MISSING_USER_ID",
      });
      return null;
    }
    return userId;
  };
}
