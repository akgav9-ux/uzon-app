"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { useApp } from "@/components/providers";
import { Avatar, Button, Card, EmptyState, Field, Input, Modal } from "@/components/ui";
import { get, post as postApi, qk } from "@/lib/client/api";

type ContactRow = {
  id: string;
  label: string | null;
  invited: boolean;
  matched: { id: string; username: string; displayName: string; avatarUrl: string | null } | null;
};
type Suggestion = { id: string; username: string; displayName: string; avatarUrl: string | null; followersCount: number };

export default function ContactsPage() {
  const { t, fmt, toast } = useApp();
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [phone, setPhone] = useState("");

  const contacts = useQuery({ queryKey: qk.contacts, queryFn: () => get<{ contacts: ContactRow[] }>("/api/contacts") });
  const suggestions = useQuery({ queryKey: qk.suggestions, queryFn: () => get<{ people: Suggestion[] }>("/api/suggestions") });

  const follow = useMutation({
    mutationFn: (username: string) => postApi(`/api/users/${username}/actions`, { action: "follow" }),
    onSuccess: () => {
      toast(t("profile.follow"), "success");
      queryClient.invalidateQueries({ queryKey: qk.suggestions });
    },
    onError: (error: Error) => toast(error.message, "error"),
  });

  const message = useMutation({
    mutationFn: (username: string) => postApi<{ conversationId: string }>(`/api/users/${username}/actions`, { action: "message" }),
    onSuccess: (data) => {
      window.location.href = `/messages?id=${data.conversationId}`;
    },
    onError: (error: Error) => toast(error.message, "error"),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-2 pb-24 sm:px-4 lg:px-0 lg:pb-0">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-ink">
            <Users className="h-5 w-5 text-brand" />
            {t("nav.contacts")}
          </h1>
          <p className="max-w-md text-xs text-muted">{t("settings.contactsConsent")}</p>
        </div>
        <Link href="/settings">
          <Button size="sm" variant="secondary">{t("settings.contactsSync")}</Button>
        </Link>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">{t("feed.suggested")}</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {suggestions.data?.people.map((person) => (
            <Card key={person.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar name={person.displayName} url={person.avatarUrl} size={40} />
                <Link href={`/u/${person.username}`} className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink hover:text-brand">{person.displayName}</span>
                  <span className="block truncate text-[11px] text-muted">
                    @{person.username} · {fmt.number(person.followersCount)} {t("profile.followers").toLowerCase()}
                  </span>
                </Link>
              </div>
              <div className="flex gap-2 sm:ml-auto">
                <Button size="sm" variant="secondary" icon={<UserPlus className="h-3.5 w-3.5" />} onClick={() => follow.mutate(person.username)} loading={follow.isPending}>
                  {t("profile.follow")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => message.mutate(person.username)}>
                  {t("profile.message")}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">{t("nav.contacts")}</h2>
          <Button size="sm" variant="ghost" onClick={() => setInviteOpen(true)}>
            {t("notif.invite", { user: "", preview: "" }).trim() || "Invite"}
          </Button>
        </div>
        {contacts.data?.contacts.length === 0 && <EmptyState title={t("settings.contactsEmpty")} description={t("settings.contactsConsent")} />}
        <ul className="space-y-2">
          {contacts.data?.contacts.map((contact) => (
            <li key={contact.id}>
              <Card className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={contact.matched?.displayName ?? contact.label ?? "?"} url={contact.matched?.avatarUrl} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{contact.matched?.displayName ?? contact.label ?? "—"}</p>
                    <p className="truncate text-[11px] text-muted">
                      {contact.matched ? `@${contact.matched.username}` : t("settings.contactsEmpty")}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 sm:ml-auto">
                  {contact.matched ? (
                    <Button size="sm" variant="secondary" onClick={() => message.mutate(contact.matched!.username)}>
                      {t("profile.message")}
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setInviteOpen(true)}>
                      {t("common.send")}
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title={t("nav.contacts")}>
        <div className="space-y-3">
          <p className="text-xs text-muted">{t("settings.contactsConsent")}</p>
          <Field label={t("auth.phone")} hint={t("auth.phoneHint")}>
            <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+998901234567" />
          </Field>
          <Button
            disabled={phone.trim().length < 6}
            onClick={async () => {
              const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(phone.replace(/[^\d+]/g, "")));
              const phoneHash = Array.from(new Uint8Array(digest))
                .map((byte) => byte.toString(16).padStart(2, "0"))
                .join("");
              await postApi("/api/contacts", { entries: [{ phoneHash, label: phone }] });
              toast(t("common.saved"), "success");
              setInviteOpen(false);
              queryClient.invalidateQueries({ queryKey: qk.contacts });
            }}
          >
            {t("common.send")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}