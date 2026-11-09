"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { useApp } from "@/components/providers";
import { Avatar, Button, Card, EmptyState, Field, Modal, Textarea } from "@/components/ui";
import { get, post as postApi, qk } from "@/lib/client/api";

type ContactRow = {
  id: string;
  label: string | null;
  invited: boolean;
  matched: { id: string; username: string; displayName: string; avatarUrl: string | null } | null;
};
type Suggestion = { id: string; username: string; displayName: string; avatarUrl: string | null; followersCount: number };
type PickedContact = { name?: string; tel?: string[] };
type ContactPicker = { select: (properties: string[], options: { multiple: boolean }) => Promise<PickedContact[]> };
type ContactEntry = { phoneHash: string; label?: string };
type MatchResponse = { stored: number; matched: unknown[] };

export default function ContactsPage() {
  const { t, fmt, toast } = useApp();
  const queryClient = useQueryClient();
  const [manualOpen, setManualOpen] = useState(false);
  const [manualPhones, setManualPhones] = useState("");

  const contacts = useQuery({ queryKey: qk.contacts, queryFn: () => get<{ contacts: ContactRow[] }>("/api/contacts") });
  const suggestions = useQuery({ queryKey: qk.suggestions, queryFn: () => get<{ people: Suggestion[] }>("/api/suggestions") });

  const refreshContacts = () => queryClient.invalidateQueries({ queryKey: qk.contacts });

  const syncContacts = useMutation({
    mutationFn: async (picker: ContactPicker) => {
      const selected = await picker.select(["name", "tel"], { multiple: true });
      const entries = await buildContactEntries(
        selected.flatMap((contact) => (contact.tel ?? []).map((tel) => ({ phone: tel, label: contact.name }))),
      );
      if (!entries.length) return { cancelled: selected.length === 0, stored: 0, matched: 0 };
      const result = await postApi<MatchResponse>("/api/contacts", { entries });
      return { cancelled: false, stored: result.stored, matched: result.matched.length };
    },
    onSuccess: (result) => {
      if (result.cancelled) return;
      toast(t("contacts.syncSuccess", { count: result.matched }), "success");
      refreshContacts();
    },
    onError: (error: Error) => {
      if (error.name === "AbortError") return;
      toast(error.message, "error");
    },
  });

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

  const startContactMatching = () => {
    const picker = (navigator as unknown as { contacts?: ContactPicker }).contacts;
    if (!picker) {
      setManualOpen(true);
      return;
    }
    syncContacts.mutate(picker);
  };

  const addManualContacts = async () => {
    try {
      const phones = manualPhones.split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean);
      const entries = await buildContactEntries(phones.map((phone) => ({ phone })));
      if (!entries.length) {
        toast(t("contacts.noPhoneNumbers"), "error");
        return;
      }
      const result = await postApi<MatchResponse>("/api/contacts", { entries });
      toast(t("contacts.syncSuccess", { count: result.matched.length }), "success");
      setManualOpen(false);
      setManualPhones("");
      refreshContacts();
    } catch (error) {
      toast(error instanceof Error ? error.message : t("common.error"), "error");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-2 pb-24 sm:px-4 lg:px-0 lg:pb-0">
      <header className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-ink">
            <Users className="h-5 w-5 text-brand" />
            {t("nav.contacts")}
          </h1>
          <p className="mt-1 max-w-md text-xs text-muted">{t("settings.contactsConsent")}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <Button size="sm" onClick={startContactMatching} loading={syncContacts.isPending}>
            <Users className="mr-2 h-4 w-4" />
            {t("settings.contactsSync")}
          </Button>
          <button type="button" onClick={() => setManualOpen(true)} className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline">
            {t("contacts.manualAdd")}
          </button>
        </div>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">{t("feed.suggested")}</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {suggestions.data?.people.map((person) => (
            <Card key={person.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={person.displayName} url={person.avatarUrl} size={40} />
                <Link href={`/u/${person.username}`} className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink hover:text-brand">{person.displayName}</span>
                  <span className="block truncate text-[11px] text-muted">
                    @${person.username} · {fmt.number(person.followersCount)} {t("profile.followers").toLowerCase()}
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
        <h2 className="text-sm font-semibold text-ink">{t("nav.contacts")}</h2>
        {contacts.isLoading && <p className="py-4 text-center text-xs text-muted">{t("common.loading")}</p>}
        {!contacts.isLoading && contacts.data?.contacts.length === 0 && (
          <EmptyState title={t("settings.contactsEmpty")} description={t("settings.contactsConsent")} />
        )}
        <ul className="space-y-2">
          {contacts.data?.contacts.map((contact) => (
            <li key={contact.id}>
              <Card className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={contact.matched?.displayName ?? contact.label ?? "?"} url={contact.matched?.avatarUrl} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{contact.matched?.displayName ?? contact.label ?? "—"}</p>
                    <p className="truncate text-[11px] text-muted">
                      {contact.matched ? `@${contact.matched.username}` : t("contacts.notOnUzon")}
                    </p>
                  </div>
                </div>
                {contact.matched && (
                  <div className="flex gap-2 sm:ml-auto">
                    <Button size="sm" variant="secondary" onClick={() => message.mutate(contact.matched!.username)}>
                      {t("profile.message")}
                    </Button>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <Modal open={manualOpen} onClose={() => setManualOpen(false)} title={t("contacts.manualTitle")}>
        <div className="space-y-3">
          <p className="text-xs text-muted">{t("contacts.manualHint")}</p>
          <Field label={t("auth.phone")} hint={t("auth.phoneHint")}>
            <Textarea rows={5} value={manualPhones} onChange={(event) => setManualPhones(event.target.value)} placeholder={t("contacts.manualPlaceholder")} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setManualOpen(false)}>{t("common.cancel")}</Button>
            <Button disabled={!manualPhones.trim()} onClick={addManualContacts}>{t("contacts.manualAdd")}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

async function buildContactEntries(items: { phone: string; label?: string }[]): Promise<ContactEntry[]> {
  const unique = new Map<string, ContactEntry>();
  for (const item of items) {
    const normalized = item.phone.replace(/[^\d+]/g, "");
    if (normalized.replace(/\D/g, "").length < 6) continue;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
    const phoneHash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    if (!unique.has(phoneHash)) unique.set(phoneHash, { phoneHash, ...(item.label ? { label: item.label.slice(0, 60) } : {}) });
  }
  return Array.from(unique.values()).slice(0, 500);
}
