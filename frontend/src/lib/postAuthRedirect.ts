import { getMyMentorProfile, getMyStudentProfile } from "./users/endpoints";

/**
 * TokenPair carries no user id or role, so the only way to know where a
 * freshly-authenticated user's own page lives is to ask "who am I" via the
 * role-scoped me/profile endpoints — whichever one succeeds tells us both
 * the role and the id. Neither succeeding means an admin/accountant account,
 * which has no self-profile page, so it lands on the dashboard instead.
 */
export async function resolveLandingPath(): Promise<string> {
  try {
    const profile = await getMyStudentProfile();
    return `/students/${profile.user.id}`;
  } catch {
    // not a student — fall through
  }

  try {
    const profile = await getMyMentorProfile();
    return `/mentors/${profile.user.id}`;
  } catch {
    // not a mentor either — fall through
  }

  return "/";
}
