import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getOptionalIdentity } from "@/features/auth/session";

export default async function Home() {
  await connection();
  const identity = await getOptionalIdentity();
  redirect(identity ? "/dashboard" : "/login");
}
