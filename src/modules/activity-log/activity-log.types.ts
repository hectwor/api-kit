export enum ActivityAction {
  LOGIN = "LOGIN",
  LOGIN_FAILED = "LOGIN_FAILED",
  LOGOUT = "LOGOUT",
  CREATE = "CREATE",
  UPDATE = "UPDATE",
  DELETE = "DELETE",
}

export enum ActivityStatus {
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
}

export interface ActivityLogEntity {
  id: string;
  userId?: string;
  action: string;
  status: string;
  errorCode?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt?: Date;
}

export interface ActivityLogCursor {
  createdAt: Date;
  id: string;
}

export interface ActivityLogFilters {
  action?: string;
  status?: string;
  entityType?: string;
  from?: Date;
  to?: Date;
}

/**
 * Persistence contract. The app implements this with its own ORM/schema.
 */
export interface ActivityLogRepository {
  create(log: ActivityLogEntity): Promise<ActivityLogEntity>;
  findByUserPaginated(userId: string, limit: number, cursor?: ActivityLogCursor, filters?: ActivityLogFilters): Promise<ActivityLogEntity[]>;
  deleteOlderThan(date: Date): Promise<number>;
}

export interface IActivityLogService {
  log(entry: ActivityLogEntity): Promise<ActivityLogEntity>;
  listByUser(userId: string, limit: number, cursor?: ActivityLogCursor, filters?: ActivityLogFilters): Promise<ActivityLogEntity[]>;
  purgeOlderThan(date: Date): Promise<number>;
}

export interface LogActivityInput {
  userId?: string;
  action: string;
  status?: string;
  errorCode?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}
