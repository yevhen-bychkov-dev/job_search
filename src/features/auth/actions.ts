"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { isPlaywrightTestMode } from "@/lib/supabase/environment";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { reportUnexpectedError } from "@/lib/server-errors";

import { TEST_IDENTITY, TEST_SESSION_COOKIE } from "./session";
import { safeAuthDestination, type AuthActionState } from "./types";

export async function signInAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = typeof formData.get("email") === "string" ? String(formData.get("email")).trim() : "";
  const password = typeof formData.get("password") === "string" ? String(formData.get("password")) : "";
  const errors: { email?: string; password?: string } = {};
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) errors.email = "Enter a valid email address.";
  if (password.length < 8 || password.length > 200) errors.password = "Enter a password of at least 8 characters.";
  if (Object.keys(errors).length) {
    return { status: "error", message: "Check the highlighted fields.", errors };
  }

  if (isPlaywrightTestMode()) {
    if (email !== TEST_IDENTITY.email || password !== "DemoPass!123") {
      return { status: "error", message: "Email or password is incorrect." };
    }
    (await cookies()).set(TEST_SESSION_COOKIE, "authenticated", {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
    });
  } else {
    try {
      const supabase = await createServerSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { status: "error", message: "Email or password is incorrect." };
    } catch (error) {
      reportUnexpectedError("auth.sign_in", error);
      return {
        status: "error",
        message: "Sign-in is temporarily unavailable. Please try again.",
      };
    }
  }

  redirect(safeAuthDestination(formData.get("next")));
}

export async function signOutAction(): Promise<void> {
  if (isPlaywrightTestMode()) {
    (await cookies()).delete(TEST_SESSION_COOKIE);
  } else {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      reportUnexpectedError("auth.sign_out", error);
      redirect("/account?error=signout");
    }
  }
  redirect("/login?signedOut=1");
}
