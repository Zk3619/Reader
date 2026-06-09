/** 阅读目标配置（对齐 legado-own ReadRecordGoalConfig） */

export type ReadRecordGoalConfig = {
  userName?: string;
  avatar?: string;
  dailyGoalMinutes: number;
};

const STORAGE_KEY = 'reader_read_record_goal_config';

export const DEFAULT_READ_RECORD_GOAL_CONFIG: ReadRecordGoalConfig = {
  dailyGoalMinutes: 120,
};

export function loadReadRecordGoalConfig(): ReadRecordGoalConfig {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_READ_RECORD_GOAL_CONFIG };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_READ_RECORD_GOAL_CONFIG };
    const parsed = JSON.parse(raw) as Partial<ReadRecordGoalConfig>;
    return {
      userName: parsed.userName?.trim() || undefined,
      avatar: parsed.avatar?.trim() || undefined,
      dailyGoalMinutes:
        typeof parsed.dailyGoalMinutes === 'number' && parsed.dailyGoalMinutes > 0
          ? Math.round(parsed.dailyGoalMinutes)
          : DEFAULT_READ_RECORD_GOAL_CONFIG.dailyGoalMinutes,
    };
  } catch {
    return { ...DEFAULT_READ_RECORD_GOAL_CONFIG };
  }
}

export function saveReadRecordGoalConfig(config: ReadRecordGoalConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore quota / private mode
  }
}

export function computeReadGoalProgressPercent(
  todaySeconds: number,
  dailyGoalMinutes: number,
): number {
  const goalSeconds = dailyGoalMinutes * 60;
  if (goalSeconds <= 0) return 0;
  return Math.min(100, Math.round((todaySeconds / goalSeconds) * 100));
}
