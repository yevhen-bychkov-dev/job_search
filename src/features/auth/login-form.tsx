"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";

import { signInAction } from "./actions";
import { INITIAL_AUTH_STATE } from "./types";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(signInAction, INITIAL_AUTH_STATE);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status === "error") feedbackRef.current?.focus();
  }, [state]);
  return (
    <form action={action} className="stack" noValidate>
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required aria-describedby="email-error" aria-invalid={Boolean(state.errors?.email)} value={email} onChange={(event) => setEmail(event.target.value)} />
        <p id="email-error" className="field-error">{state.errors?.email}</p>
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required aria-describedby="password-error" aria-invalid={Boolean(state.errors?.password)} value={password} onChange={(event) => setPassword(event.target.value)} />
        <p id="password-error" className="field-error">{state.errors?.password}</p>
      </div>
      {state.message ? <p ref={feedbackRef} className="alert alert-error" role="alert" tabIndex={-1}>{state.message}</p> : null}
      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
    </form>
  );
}
