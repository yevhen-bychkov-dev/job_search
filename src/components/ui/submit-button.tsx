"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  className = "button button-primary",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

export function ConfirmSubmitButton({
  children,
  confirmation,
}: {
  children: React.ReactNode;
  confirmation: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className="button button-danger"
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(confirmation)) event.preventDefault();
      }}
    >
      {pending ? "Deleting…" : children}
    </button>
  );
}
