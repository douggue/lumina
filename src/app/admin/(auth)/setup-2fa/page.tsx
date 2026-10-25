import { redirect } from "next/navigation";
import { getUser } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { Setup2fa } from "./setup";

export const metadata = { title: "Set up two-factor authentication" };

export default async function Setup2faPage() {
  const user = await getUser();
  if (!user || !isStaff(user.role)) redirect("/admin/login");
  if (user.twoFactorEnabled) redirect("/admin");
  return (
    <div className="grid min-h-dvh place-items-center bg-midnight p-4">
      <Setup2fa email={user.email} />
    </div>
  );
}
