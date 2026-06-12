export const DATE_THRESHOLDS = [30, 14, 7, 1, 0];

export function dayDiff(fromDate: string, toDate: string): number {
  const [fy, fm, fd] = fromDate.split("-").map(Number);
  const [ty, tm, td] = toDate.split("-").map(Number);
  return Math.floor((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

export function dateThresholdKey(
  dateStr: string | null | undefined,
  today: string,
): string | null {
  if (!dateStr) return null;
  const days = dayDiff(today, String(dateStr).split("T")[0]);
  return DATE_THRESHOLDS.includes(days) ? `${days}d` : null;
}

export function zonedDateParts(date: Date, timezone = "Europe/Vienna") {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return {
      date: `${values.year}-${values.month}-${values.day}`,
      minutes: Number(values.hour) * 60 + Number(values.minute),
    };
  } catch {
    return zonedDateParts(date, "UTC");
  }
}

function previousIsoDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().split("T")[0];
}

export function shoppingReminderDueDate(
  localDate: string,
  localMinutes: number,
  reminderTime: string | null | undefined,
  lastSentDate: string | null | undefined,
): string | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(String(reminderTime || ""));
  if (!match) return null;

  const reminderMinutes = Number(match[1]) * 60 + Number(match[2]);
  if (!lastSentDate && localMinutes < reminderMinutes) return null;

  const scheduledDate = localMinutes >= reminderMinutes ? localDate : previousIsoDate(localDate);
  return lastSentDate === scheduledDate ? null : scheduledDate;
}

export function resolveOwnedRecipients(
  row: Record<string, unknown>,
  recipientIds: string[],
): string[] {
  const recipientSet = new Set(recipientIds);
  const candidates = [
    row?.erinnerung_empfaenger_user_id,
    row?.created_by_user_id,
    row?.user_id,
  ].filter(Boolean).map(String);

  for (const candidate of candidates) {
    if (recipientSet.has(candidate)) return [candidate];
  }
  return recipientIds;
}
