// The "Destira" system user hosts official events (see official-events.ts).
// It's a real users row only because events.hostUserId is NOT NULL; it must
// never count as a member in any audience/retention metric.
export const DESTIRA_SYSTEM_USER_ID = "destira-system";
