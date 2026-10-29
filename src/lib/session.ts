import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";

/** Current user or redirect to login. Used by every server action and page. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user) redirect("/login");
  return user;
}

/** Membership check: the single gate for every group read/write. */
export async function requireMember(groupId: string, userId: string) {
  const m = await db.member.findFirst({ where: { groupId, userId, left: false } });
  if (!m) throw new Error("Not a member of this group");
  return m;
}
