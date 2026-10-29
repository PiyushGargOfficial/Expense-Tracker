import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import LoginForm from "@/components/LoginForm";

export default async function LoginPage() {
  // Already signed in: the login page has nothing to show, so pressing Back after signing in lands on Home
  // instead of an old copy of the form. The user check avoids a redirect loop when a session outlives its account.
  const session = await auth();
  if (session?.user?.id && (await db.user.findUnique({ where: { id: session.user.id }, select: { id: true } }))) redirect("/");
  return <LoginForm googleEnabled={Boolean(process.env.AUTH_GOOGLE_ID)} />;
}
