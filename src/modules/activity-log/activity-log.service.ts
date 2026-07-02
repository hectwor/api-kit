import { ActivityStatus, type ActivityLogCursor, type ActivityLogEntity, type ActivityLogFilters, type ActivityLogRepository, type IActivityLogService } from "./activity-log.types";

/**
 * Storage-agnostic activity log service. Delegates persistence to the
 * repository the app provides.
 */
export class ActivityLogService implements IActivityLogService {
  constructor(private readonly repository: ActivityLogRepository) {}

  async log(entry: ActivityLogEntity): Promise<ActivityLogEntity> {
    return await this.repository.create({
      ...entry,
      status: entry.status || ActivityStatus.SUCCESS,
    });
  }

  async listByUser(userId: string, limit: number, cursor?: ActivityLogCursor, filters?: ActivityLogFilters): Promise<ActivityLogEntity[]> {
    return await this.repository.findByUserPaginated(userId, limit, cursor, filters);
  }

  async purgeOlderThan(date: Date): Promise<number> {
    return await this.repository.deleteOlderThan(date);
  }
}
