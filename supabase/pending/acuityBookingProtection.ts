/** Staged only: not imported by a deployed function until isolated end-to-end validation. */
export type AcuityActorRole = "owner" | "barber" | "client";

export interface AcuityInterval {
  calendarId: number;
  startsAt: string;
  endsAt: string;
}

function checkedInterval(interval: AcuityInterval): { start: number; end: number } {
  const start = Date.parse(interval.startsAt);
  const end = Date.parse(interval.endsAt);
  if (!Number.isSafeInteger(interval.calendarId) || interval.calendarId <= 0 ||
      !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error("Invalid occupied interval");
  }
  return { start, end };
}

/** Only use this appointment's verified remote coverage, never a neighbour's coverage. */
export function uncoveredAcuityIntervals(
  local: AcuityInterval,
  remote: AcuityInterval | null,
): AcuityInterval[] {
  const target = checkedInterval(local);
  if (!remote) return [{ ...local }];
  const occupied = checkedInterval(remote);
  if (remote.calendarId !== local.calendarId || occupied.end <= target.start || occupied.start >= target.end) {
    return [{ ...local }];
  }
  const parts: AcuityInterval[] = [];
  if (target.start < occupied.start) parts.push({ ...local, endsAt: remote.startsAt });
  if (target.end > occupied.end) parts.push({ ...local, startsAt: remote.endsAt });
  return parts;
}

/** Removes every caller-controlled override, including duplicate query parameters. */
export function prepareAcuityRequest(
  role: AcuityActorRole,
  path: string,
  method: string,
  body?: Record<string, unknown>,
): { path: string; method: string; body?: Record<string, unknown> } {
  if (!["owner", "barber", "client"].includes(role)) throw new Error("Forbidden role");
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("#") || path.includes("\\")) {
    throw new Error("Invalid Acuity path");
  }
  const verb = method.toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(verb)) throw new Error("Invalid method");
  const url = new URL(path, "https://acuityscheduling.com");
  const keys = Array.from(url.searchParams.keys());
  for (const key of keys) {
    if (["admin", "respectavailability"].includes(key.toLowerCase())) url.searchParams.delete(key);
  }
  const staff = role === "owner" || role === "barber";
  const write = ["POST", "PUT", "PATCH", "DELETE"].includes(verb);
  if (staff && (write || url.pathname === "/blocks" || url.pathname.startsWith("/blocks/"))) {
    url.searchParams.set("admin", "true");
  }
  const cleanBody = body ? { ...body } : undefined;
  if (cleanBody) {
    for (const key of Object.keys(cleanBody)) {
      if (["admin", "respectavailability"].includes(key.toLowerCase())) delete cleanBody[key];
    }
  }
  const query = url.searchParams.toString();
  return { path: `${url.pathname}${query ? `?${query}` : ""}`, method: verb, body: cleanBody };
}