"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";

type Status = { kind: "ok" | "error"; message: string } | null;

export function SecurityCard({ email }: { email: string | null }) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<Status>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<Status>(null);
  const [savingEmail, setSavingEmail] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteStatus, setDeleteStatus] = useState<Status>(null);
  const [deleting, setDeleting] = useState(false);

  async function handlePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordStatus(null);

    if (password.length < 8) {
      setPasswordStatus({
        kind: "error",
        message: "Use at least 8 characters.",
      });
      return;
    }
    if (password !== confirmPassword) {
      setPasswordStatus({ kind: "error", message: "The passwords don't match." });
      return;
    }

    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSavingPassword(false);

    if (error) {
      setPasswordStatus({ kind: "error", message: error.message });
      return;
    }
    setPassword("");
    setConfirmPassword("");
    setPasswordStatus({ kind: "ok", message: "Password updated." });
  }

  async function handleEmail(event: React.FormEvent) {
    event.preventDefault();
    setEmailStatus(null);

    if (!newEmail.includes("@")) {
      setEmailStatus({ kind: "error", message: "Enter a valid email address." });
      return;
    }

    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    setSavingEmail(false);

    if (error) {
      setEmailStatus({ kind: "error", message: error.message });
      return;
    }
    setNewEmail("");
    setEmailStatus({
      kind: "ok",
      message: `Check ${newEmail} for a confirmation link. The change applies once you confirm.`,
    });
  }

  async function handleDelete() {
    setDeleteStatus(null);
    setDeleting(true);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail: deleteConfirm }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteStatus({
          kind: "error",
          message: data?.error ?? "Couldn't delete the account.",
        });
        return;
      }
      router.push("/my-stock");
      router.refresh();
    } catch {
      setDeleteStatus({
        kind: "error",
        message: "Couldn't reach the server. Try again.",
      });
    } finally {
      setDeleting(false);
    }
  }

  function statusLine(status: Status) {
    if (!status) return null;
    return (
      <p
        className={
          "text-xs " + (status.kind === "ok" ? "text-gain" : "text-destructive")
        }
      >
        {status.message}
      </p>
    );
  }

  return (
    <Card className="gap-5 p-6">
      <div>
        <h3 className="text-base font-semibold">Security</h3>
        <p className="text-sm text-muted-foreground">
          Your sign-in details and account.
        </p>
      </div>

      <form onSubmit={handlePassword} className="flex flex-col gap-3">
        <p className="text-sm font-medium">Change password</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            type="password"
            autoComplete="new-password"
            placeholder="New password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Input
            type="password"
            autoComplete="new-password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </div>
        {statusLine(passwordStatus)}
        <Button
          type="submit"
          variant="outline"
          className="w-fit rounded-full"
          disabled={savingPassword}
        >
          {savingPassword ? "Saving…" : "Update password"}
        </Button>
      </form>

      <Separator />

      <form onSubmit={handleEmail} className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium">Change email</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Currently {email ?? "—"}. We&apos;ll send a confirmation link before
            anything changes.
          </p>
        </div>
        <Input
          type="email"
          autoComplete="email"
          placeholder="new@email.com"
          value={newEmail}
          onChange={(event) => setNewEmail(event.target.value)}
          className="sm:max-w-sm"
        />
        {statusLine(emailStatus)}
        <Button
          type="submit"
          variant="outline"
          className="w-fit rounded-full"
          disabled={savingEmail}
        >
          {savingEmail ? "Sending…" : "Send confirmation"}
        </Button>
      </form>

      <Separator />

      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium text-destructive">Delete account</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Removes your account, watchlist and settings for good. This
            can&apos;t be undone.
          </p>
        </div>

        {deleteOpen ? (
          <div className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
            <p className="text-xs text-muted-foreground">
              Type <span className="font-medium text-foreground">{email}</span>{" "}
              to confirm.
            </p>
            <Input
              value={deleteConfirm}
              onChange={(event) => setDeleteConfirm(event.target.value)}
              placeholder={email ?? "your email"}
              className="sm:max-w-sm"
            />
            {statusLine(deleteStatus)}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  setDeleteOpen(false);
                  setDeleteConfirm("");
                  setDeleteStatus(null);
                }}
              >
                Cancel
              </Button>
              <Button
                className="rounded-full bg-destructive text-white hover:bg-destructive/90"
                disabled={
                  deleting ||
                  deleteConfirm.trim().toLowerCase() !==
                    (email ?? "").toLowerCase()
                }
                onClick={handleDelete}
              >
                {deleting ? "Deleting…" : "Delete my account"}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            className="w-fit rounded-full border-destructive/40 text-destructive hover:bg-destructive/5"
            onClick={() => setDeleteOpen(true)}
          >
            Delete account
          </Button>
        )}
      </div>
    </Card>
  );
}
