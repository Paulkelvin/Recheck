import { auth } from "@/auth";

type Role = "buyer" | "surveyor" | "admin";

/**
 * Loads the current session and throws a 401/403-shaped error if the
 * caller isn't signed in or isn't one of the allowed roles. Call this
 * at the top of every API route that isn't fully public — there's no
 * DB-level row security backing this app, so the API layer is the gate.
 */
export async function requireRole(...allowedRoles: Role[]) {
  const session = await auth();

  if (!session?.user) {
    throw new AccessError(401, "Not signed in");
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(session.user.role)) {
    throw new AccessError(403, "Not authorized for this action");
  }

  return session.user;
}

export class AccessError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
