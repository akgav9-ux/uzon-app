"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Globe, Lock, Monitor, Palette, ShieldCheck, Trash2, UserCog, Users, X } from "lucide-react";
import { useState } from "react";
import { useApp } from "@/components/providers";
import { Avatar, Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Switch, Textarea } from "@/components/ui";
import { del, get, patch, post as postApi, qk, uploadMedia } from "@/lib/client/api";
import { LOCALES } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type SessionRow = { id: string; userAgent: string | null; ip: string | null; createdAt: string; lastUsedAt: string };
type AccountInfo = { profile: { emailVerified: boolean; phoneVerified: boolean }; sessions: SessionRow[] };
type ContactRow = { id: string; label: string | null; invited: boolean; matched: { id: string; username: string; displayName: string; avatarUrl: string | null } | null };
type BlockRow = { id: string; username: string; displayName: string; avatarUrl: string | null };

const RULES = ["everyone", "followers", "contacts", "selected", "nobody"] as const;
const RULE_LABEL: Record<string, "settings.audienceEveryone" | "settings.audienceFollowers" | "settings.audienceContacts" | "settings.audienceSelected" | "settings.audienceNobody"> = {
  everyone: "settings.audienceEveryone",
  followers: "settings.audienceFollowers",
  contacts: "settings.audienceContacts",
  selected: "settings.audienceSelected",
  nobody: "settings.audienceNobody",
};

export default function SettingsPage() {
  const { t, user, setUser, theme, setTheme, locale, setLocale, toast, refreshUser } = useApp();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"profile" | "privacy" | "appearance" | "security" | "notifications" | "contacts" | "blocks">("profile");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [showJoined, setShowJoined] = useState(user?.showJoinedDate ?? true);
  const [isCreator, setIsCreator] = useState(user?.isCreator ?? false);

  const account = useQuery({ queryKey: ["account"], queryFn: () => get<AccountInfo>("/api/account") });
  const contacts = useQuery({ queryKey: qk.contacts, queryFn: () => get<{ contacts: ContactRow[] }>("/api/contacts"), enabled: tab === "contacts" });
  const blocks = useQuery({ queryKey: qk.blocks, queryFn: () => get<{ blocks: BlockRow[] }>("/api/blocks"), enabled: tab === "blocks" });

  const saveProfile = useMutation({
    mutationFn: () => patch("/api/account", { scope: "profile", displayName, username, bio, showJoinedDate: showJoined, isCreator }),
    onSuccess: async () => {
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ["account"] });
      toast(t("common.saved"), "success");
    },
    onError: (error: Error) => toast(error.message, "error"),
  });

  const saveSettings = useMutation({
    mutationFn: (payload: Record<string, unknown>) => patch("/api/account", { scope: "settings", ...payload }),
    onSuccess: async () => {
      await refreshUser();
      toast(t("settings.synced"), "success");
    },
    onError: (error: Error) => toast(error.message, "error"),
  });

  const savePrivacy = useMutation({
    mutationFn: (payload: Record<string, string>) => patch("/api/account", { scope: "privacy", ...payload }),
    onSuccess: async () => {
      await refreshUser();
      toast(t("common.saved"), "success");
    },
    onError: (error: Error) => toast(error.message, "error"),
  });

  const uploadAvatar = useMutation({
    mutationFn: async (file: File) => {
      const uploaded = await uploadMedia(file, { purpose: "avatar" });
      return patch("/api/account", { scope: "profile", avatarKey: uploaded.media.key });
    },
    onSuccess: async () => {
      await refreshUser();
      toast(t("common.saved"), "success");
    },
    onError: (error: Error) => toast(error.message, "error"),
  });

  const changePassword = useMutation({
    mutationFn: (payload: { currentPassword: string; newPassword: string }) => postApi("/api/account", { action: "changePassword", ...payload }),
    onSuccess: () => {
      toast(t("common.saved"), "success");
      queryClient.invalidateQueries({ queryKey: ["account"] });
    },
    onError: (error: Error) => toast(error.message, "error"),
  });

  const revoke = useMutation({
    mutationFn: (payload: Record<string, unknown>) => postApi("/api/account", payload),
    onSuccess: () => {
      toast(t("common.saved"), "success");
      queryClient.invalidateQueries({ queryKey: ["account"] });
    },
  });

  const deleteAccount = useMutation({
    mutationFn: () => postApi("/api/account", { action: "deleteAccount", confirm: confirmText, password }),
    onSuccess: () => {
      setUser(null);
      window.location.href = "/";
    },
    onError: (error: Error) => toast(error.message, "error"),
  });

  const syncContacts = useMutation({
    mutationFn: async () => {
      const permission = await navigator.permissions?.query({ name: "contacts" as PermissionName }).catch(() => null);
      void permission;
      const entries = await readDeviceContacts();
      if (!entries.length) throw new Error(t("settings.contactsEmpty"));
      return postApi<{ stored: number }>("/api/contacts", { entries });
    },
    onSuccess: (data) => {
      toast(`${t("common.saved")}: ${data.stored}`, "success");
      queryClient.invalidateQueries({ queryKey: qk.contacts });
    },
    onError: (error: Error) => toast(error.message, "error"),
  });

  const unblock = useMutation({
    mutationFn: (usernameValue: string) => postApi(`/api/users/${usernameValue}/actions`, { action: "unblock" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.blocks });
      toast(t("common.unblock"), "success");
    },
  });

  if (!user) return null;
  const privacy = user.privacy as Record<string, string>;
  const tabs = [
    { id: "profile", label: t("settings.profile"), icon: <UserCog className="h-4 w-4" /> },
    { id: "privacy", label: t("settings.privacy"), icon: <Lock className="h-4 w-4" /> },
    { id: "appearance", label: t("settings.appearance"), icon: <Palette className="h-4 w-4" /> },
    { id: "security", label: t("settings.security"), icon: <ShieldCheck className="h-4 w-4" /> },
    { id: "notifications", label: t("settings.notifications"), icon: <Bell className="h-4 w-4" /> },
    { id: "contacts", label: t("settings.contacts"), icon: <Users className="h-4 w-4" /> },
    { id: "blocks", label: t("settings.blocks"), icon: <X className="h-4 w-4" /> },
  ] as const;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-ink">{t("settings.title")}</h1>
        <p className="text-xs text-muted">{t("settings.synced")}</p>
      </header>

      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition",
              tab === item.id ? "border-brand bg-brandsoft text-brand" : "border-line text-muted hover:text-ink",
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {tab === "profile" && (
        <Card className="space-y-4 p-4">
          <div className="flex items-center gap-4">
            <Avatar name={displayName || user.displayName} url={user.avatarUrl} size={72} />
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) uploadAvatar.mutate(file);
                }}
              />
              <span className="rounded-xl border border-line px-3 py-2 text-xs text-ink hover:border-brand">
                {uploadAvatar.isPending ? t("common.saving") : t("profile.avatar")}
              </span>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("auth.displayName")} required>
              <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={60} />
            </Field>
            <Field label={t("auth.username")} hint="@username">
              <Input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""))} maxLength={30} />
            </Field>
          </div>
          <Field label={t("profile.bio")}>
            <Textarea rows={3} value={bio} onChange={(event) => setBio(event.target.value)} maxLength={400} />
          </Field>
          <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
            <span className="text-xs">{t("profile.creatorMode")}</span>
            <Switch checked={isCreator} onChange={setIsCreator} label={t("profile.creatorMode")} />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
            <span className="text-xs">{t("profile.joined", { date: "" }).trim()}</span>
            <Switch checked={showJoined} onChange={setShowJoined} label="joined date" />
          </div>
          <Button onClick={() => saveProfile.mutate()} loading={saveProfile.isPending}>
            {t("common.save")}
          </Button>
        </Card>
      )}

      {tab === "privacy" && (
        <Card className="divide-y divide-[var(--line)] p-0">
          {([
            ["phoneVisibility", "settings.privacyPhone"],
            ["findableByPhone", "settings.privacyFindByPhone"],
            ["whoCanMessage", "settings.privacyMessage"],
            ["whoCanCall", "settings.privacyCall"],
            ["whoCanSeeStories", "settings.privacyStories"],
            ["whoCanComment", "settings.privacyComment"],
            ["whoCanTag", "settings.privacyTag"],
            ["whoCanSeeFollowing", "settings.privacyFollowing"],
            ["whoCanSeeActivity", "settings.privacyActivity"],
          ] as const).map(([key, labelKey]) => (
            <div key={key} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm text-ink">{t(labelKey)}</p>
                <p className="text-[11px] text-muted">{key === "phoneVisibility" ? t("settings.privacyPhone") : ""}</p>
              </div>
              <Select
                value={privacy[key] ?? "nobody"}
                onChange={(event) => savePrivacy.mutate({ [key]: event.target.value })}
                className="h-9 w-44 text-xs"
                aria-label={t(labelKey)}
              >
                {RULES.map((rule) => (
                  <option key={rule} value={rule}>
                    {t(RULE_LABEL[rule]!)}
                  </option>
                ))}
              </Select>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <p className="text-sm text-ink">{t("settings.privacyProfile")}</p>
            <Select
              value={privacy.profileVisibility ?? "public"}
              onChange={(event) => savePrivacy.mutate({ profileVisibility: event.target.value })}
              className="h-9 w-44 text-xs"
              aria-label={t("settings.privacyProfile")}
            >
              <option value="public">{t("settings.audiencePublic")}</option>
              <option value="private">{t("settings.audiencePrivate")}</option>
            </Select>
          </div>
          {savePrivacy.isPending && <p className="px-4 py-2 text-xs text-muted">{t("common.saving")}</p>}
        </Card>
      )}

      {tab === "appearance" && (
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Palette className="h-4 w-4 text-brand" />
              {t("settings.theme")}
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {(["dark", "light", "system"] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => {
                    setTheme(option);
                    void saveSettings.mutate({ theme: option });
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-3 text-xs transition",
                    theme === option ? "border-brand bg-brandsoft text-brand" : "border-line text-muted hover:text-ink",
                  )}
                >
                  <Monitor className="h-4 w-4" />
                  {option === "dark" ? t("settings.themeDark") : option === "light" ? t("settings.themeLight") : t("settings.themeSystem")}
                </button>
              ))}
            </div>
          </Card>
          <Card className="space-y-3 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Globe className="h-4 w-4 text-brand" />
              {t("settings.language")}
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {LOCALES.map((item) => (
                <button
                  key={item.code}
                  onClick={() => {
                    setLocale(item.code);
                    void saveSettings.mutate({ locale: item.code });
                  }}
                  className={cn(
                    "rounded-xl border px-3 py-3 text-xs transition",
                    locale === item.code ? "border-brand bg-brandsoft text-brand" : "border-line text-muted hover:text-ink",
                  )}
                >
                  <span className="block font-semibold">{item.label}</span>
                  <span className="text-[10px] opacity-70">{item.short}</span>
                </button>
              ))}
            </div>
          </Card>
          <Card className="space-y-3 p-4">
            <label className="flex items-center justify-between">
              <span className="text-sm text-ink">{t("settings.autoplay")}</span>
              <Switch
                checked={user.autoplay}
                onChange={(value) => {
                  void saveSettings.mutate({ autoplay: value });
                }}
                label={t("settings.autoplay")}
              />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-sm text-ink">{t("settings.dataSaver")}</span>
              <Switch
                checked={user.dataSaver}
                onChange={(value) => {
                  void saveSettings.mutate({ dataSaver: value });
                }}
                label={t("settings.dataSaver")}
              />
            </label>
          </Card>
        </div>
      )}

      {tab === "security" && (
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <p className="text-sm font-semibold text-ink">{t("settings.changePassword")}</p>
            <PasswordForm onSubmit={(values) => changePassword.mutate(values)} pending={changePassword.isPending} />
            <div className="flex flex-wrap gap-2 text-[11px]">
              <Badge tone={account.data?.profile.emailVerified ? "success" : "warning"}>email: {account.data?.profile.emailVerified ? "✓" : "!"}</Badge>
              <Badge tone={account.data?.profile.phoneVerified ? "success" : "warning"}>phone: {account.data?.profile.phoneVerified ? "✓" : "!"}</Badge>
            </div>
            {!account.data?.profile.emailVerified && user.email && (
              <Button size="sm" variant="secondary" onClick={() => postApi("/api/auth", { action: "resend", channel: "email" }).then(() => toast(t("auth.recoverSent"), "success"))}>
                {t("auth.recover")}
              </Button>
            )}
          </Card>

          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">{t("settings.sessions")}</p>
              <Button size="sm" variant="secondary" onClick={() => revoke.mutate({ action: "revokeOthers" })}>
                {t("settings.revokeAll")}
              </Button>
            </div>
            <ul className="space-y-2">
              {account.data?.sessions.map((session) => (
                <li key={session.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-ink">{session.userAgent?.slice(0, 60) ?? "UZON"}</p>
                    <p className="text-[11px] text-muted">
                      {session.ip ?? ""} · {t("settings.currentSession") === session.id ? t("settings.currentSession") : ""}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => revoke.mutate({ action: "revokeSession", sessionId: session.id })}>
                    {t("settings.revoke")}
                  </Button>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="space-y-3 border-danger/40 p-4">
            <p className="text-sm font-semibold text-danger">{t("auth.deleteAccount")}</p>
            <p className="text-xs text-muted">{t("auth.deleteWarning")}</p>
            <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
              {t("auth.deleteAccount")}
            </Button>
          </Card>
        </div>
      )}

      {tab === "notifications" && (
        <Card className="divide-y divide-[var(--line)] p-0">
          {Object.keys(user.notifications).map((category) => (
            <label key={category} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-ink">{t(`notif.${category === "messages" ? "message" : "title"}` as never)} · {category}</span>
              <Switch
                checked={user.notifications[category] ?? true}
                onChange={(value) => void saveSettings.mutate({ notifications: { ...user.notifications, [category]: value } })}
                label={category}
              />
            </label>
          ))}
        </Card>
      )}

      {tab === "contacts" && (
        <Card className="space-y-3 p-4">
          <p className="text-xs text-muted">{t("settings.contactsConsent")}</p>
          <Button onClick={() => syncContacts.mutate()} loading={syncContacts.isPending} icon={<Users className="h-4 w-4" />}>
            {t("settings.contactsSync")}
          </Button>
          {contacts.data?.contacts.length === 0 && <EmptyState title={t("settings.contactsEmpty")} />}
          <ul className="space-y-2">
            {contacts.data?.contacts.map((contact) => (
              <li key={contact.id} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2">
                <Avatar name={contact.matched?.displayName ?? contact.label ?? "?"} url={contact.matched?.avatarUrl} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-ink">{contact.matched?.displayName ?? contact.label ?? "—"}</p>
                  <p className="truncate text-[11px] text-muted">{contact.matched ? `@${contact.matched.username}` : t("settings.contactsEmpty")}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => del(`/api/contacts?id=${contact.id}`).then(() => queryClient.invalidateQueries({ queryKey: qk.contacts }))}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === "blocks" && (
        <Card className="space-y-3 p-4">
          {blocks.data?.blocks.length === 0 && <EmptyState title={t("settings.blocksEmpty")} />}
          <ul className="space-y-2">
            {blocks.data?.blocks.map((row) => (
              <li key={row.id} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2">
                <Avatar name={row.displayName} url={row.avatarUrl} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-ink">{row.displayName}</p>
                  <p className="truncate text-[11px] text-muted">@{row.username}</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => unblock.mutate(row.username)}>
                  {t("common.unblock")}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t("auth.deleteAccount")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>{t("common.cancel")}</Button>
            <Button variant="danger" disabled={confirmText !== "DELETE" || !password} loading={deleteAccount.isPending} onClick={() => deleteAccount.mutate()}>
              {t("common.confirm")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-danger">{t("auth.deleteWarning")}</p>
          <Field label={t("auth.deleteConfirm")}>
            <Input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} />
          </Field>
          <Field label={t("auth.password")}>
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function PasswordForm({ onSubmit, pending }: { onSubmit: (values: { currentPassword: string; newPassword: string }) => void; pending: boolean }) {
  const { t } = useApp();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNext] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ currentPassword, newPassword });
        setCurrent("");
        setNext("");
      }}
    >
      <Field label={t("settings.currentPassword")}>
        <Input type="password" value={currentPassword} onChange={(event) => setCurrent(event.target.value)} required minLength={1} />
      </Field>
      <Field label={t("auth.newPassword")} hint="min 8">
        <Input type="password" value={newPassword} onChange={(event) => setNext(event.target.value)} required minLength={8} />
      </Field>
      <Button type="submit" size="sm" loading={pending} disabled={!currentPassword || newPassword.length < 8}>
        {t("common.save")}
      </Button>
    </form>
  );
}

/**
 * Reads the device address book when the Contacts API is available (Android via
 * Capacitor plugin or Chrome's Contact Picker). Falls back to manual entry so
 * the feature is never silently fake.
 */
async function readDeviceContacts(): Promise<{ phoneHash: string; label?: string }[]> {
  const picker = (navigator as unknown as { contacts?: { select: (fields: string[], options: { multiple: boolean }) => Promise<{ tel?: string[]; name?: string }[]> } }).contacts;
  if (picker) {
    const picked = await picker.select(["name", "tel"], { multiple: true });
    const entries = picked
      .flatMap((entry) => (entry.tel ?? []).map((tel) => ({ tel, name: entry.name })))
      .filter((entry) => entry.tel);
    return Promise.all(entries.map(async (entry) => ({ phoneHash: await hashPhone(entry.tel!), label: entry.name })));
  }
  const manual = window.prompt("Enter phone numbers to match, one per line (international format):", "");
  if (!manual) return [];
  const lines = manual
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return Promise.all(lines.map(async (line) => ({ phoneHash: await hashPhone(line) })));
}

async function hashPhone(phone: string): Promise<string> {
  const normalized = phone.replace(/[^\d+]/g, "");
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
