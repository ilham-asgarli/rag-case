import { redirect } from "next/navigation";
import { getSession } from "@/server/guards";

export default async function IndexPage() {
  const session = await getSession();
  redirect(session ? "/chat" : "/sign-in");
}
