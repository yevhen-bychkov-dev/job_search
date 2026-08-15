"use client";

import { useActionState, useState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";

import { signInAction } from "./actions";
import { INITIAL_AUTH_STATE } from "./types";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(signInAction, INITIAL_AUTH_STATE);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <form action={action} className="stack" noValidate>
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required aria-describedby="email-error" value={email} onChange={(event) => setEmail(event.target.value)} />
        <p id="email-error" className="field-error">{state.errors?.email}</p>
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required aria-describedby="password-error" value={password} onChange={(event) => setPassword(event.target.value)} />
        <p id="password-error" className="field-error">{state.errors?.password}</p>
      </div>
      {state.message ? <p className="alert alert-error" role="alert">{state.message}</p> : null}
      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
    </form>
  );
}
