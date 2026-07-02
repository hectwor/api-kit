import { ActivityStatus, type IActivityLogService, type LogActivityInput } from "./activity-log.types";
import type { LoggerLike } from "../../logging/logger";

export type LogActivity = (entry: LogActivityInput) => void;

/**
 * Fire-and-forget activity logging. Never throws and never blocks the request:
 * a lost audit row is preferable to a failed or slowed user operation.
 */
export function createActivityLogger(service: IActivityLogService, logger?: LoggerLike): LogActivity {
  return (entry) => {
    void service
      .log({
        id: "",
        userId: entry.userId,
        action: entry.action,
        status: entry.status ?? ActivityStatus.SUCCESS,
        errorCode: entry.errorCode,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: entry.metadata,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
      })
      .catch((error: unknown) => {
        logger?.warn("Activity log write failed (non-fatal)", {
          action: entry.action,
          entityType: entry.entityType,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  };
}
