"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ban,
  Crown,
  Flag,
  Info,
  Mic,
  MoreHorizontal,
  Paperclip,
  Phone,
  Pin,
  Plus,
  Search,
  Send,
  Smile,
  Trash2,
  Video as VideoIcon,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/providers";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  Menu,
  MenuItem,
  Modal,
  Skeleton,
  Switch,
  Textarea,
} from "@/components/ui";
import { ReportModal } from "@/components/post";
import { del, get, patch, post as postApi, qk, uploadMedia } from "@/lib/client/api";
import type { ConversationPayload, MessagePayload } from "@/lib/serialize";
import { cn } from "@/lib/utils";

const EMOJI = ["😀", "😂", "🥰", "😎", "🤔", "👍", "👏", "🙏", "🔥", "🎉", "❤️", "💯", "😢", "😡", "🇺🇿", "⚽", "🎬", "🚀"];
const REACTIONS = ["❤️", "👍", "😂", "🎉", "😢", "🔥"];

/* -------------------------------------------------------------------------- */
/*                                 CHAT LIST                                  */
/* -------------------------------------------------------------------------- */

export function ChatList({ onOpen, activeId }: { onOpen: (conversation: ConversationPayload) => void; activeId?: string }) {
  const { t, fmt } = useApp();
  const [filter, setFilter] = useState<"all" | "direct" | "group" | "channel">("all");
  const [term, setTerm] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const query = useQuery({
    queryKey: qk.conversations,
    queryFn: () => get<{ conversations: ConversationPayload[] }>("/api/conversations"),
    refetchInterval: 12_000,
  });

  const conversations = useMemo(() => {
    const list = query.data?.conversations ?? [];
    return list
      .filter((c) => filter === "all" || c.kind === filter)
      .filter((c) => !term || (c.title ?? "").toLowerCase().includes(term.toLowerCase()));
  }, [query.data, filter, term]);

  if (query.isLoading) return <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  if (query.isError) return <ErrorState message={t("common.error")} onRetry={() => query.refetch()} />;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={term} onChange={(event) => setTerm(event.target.value)} placeholder={t("chat.searchHistory")} className="pl-9" aria-label={t("chat.searchHistory")} />
        </div>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
          {t("chat.new")}
        </Button>
      </div>
      <div className="flex gap-1.5 overflow-x-auto">
        {(["all", "direct", "group", "channel"] as const).map((kind) => (
          <button
            key={kind}
            onClick={() => setFilter(kind)}
            className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition", filter === kind ? "border-brand bg-brandsoft text-brand" : "border-line text-muted hover:text-ink")}
          >
            {kind === "all" ? t("common.all") : kind === "direct" ? t("chat.direct") : kind === "group" ? t("chat.group") : t("chat.channel")}
          </button>
        ))}
      </div>
      {conversations.length === 0 ? (
        <EmptyState title={t("chat.empty")} icon={<Send className="h-8 w-8" />} action={<Button size="sm" onClick={() => setCreateOpen(true)}>{t("chat.new")}</Button>} />
      ) : (
        <ul className="space-y-1.5">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <button
                onClick={() => onOpen(conversation)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition hover:border-brand/40",
                  activeId === conversation.id ? "border-brand bg-brandsoft" : "border-line bg-surface",
                )}
              >
                <Avatar name={conversation.title ?? "UZON"} url={conversation.avatarUrl} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-ink">{conversation.title ?? t("chat.direct")}</span>
                    {conversation.kind !== "direct" && <Badge>{conversation.membersCount}</Badge>}
                    {conversation.onlyAdminsCanPost && conversation.kind === "channel" && <Badge tone="brand">{t("chat.channel")}</Badge>}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {conversation.lastMessage ? (
                      <>
                        {conversation.lastMessage.isMine ? `${t("chat.sent")}: ` : ""}
                        {conversation.lastMessage.text ?? conversation.lastMessage.media?.kind ?? ""}
                      </>
                    ) : (
                      t("common.empty")
                    )}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[10px] text-muted">{conversation.lastMessage ? fmt.relative(conversation.lastMessage.createdAt) : ""}</span>
                  {conversation.unread > 0 && <span className="rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">{conversation.unread}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <CreateConversationModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={onOpen} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                       CREATE CONVERSATION MODAL                            */
/* -------------------------------------------------------------------------- */

export function CreateConversationModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (conversation: ConversationPayload) => void;
}) {
  const { t, toast } = useApp();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"direct" | "group" | "channel">("direct");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [term, setTerm] = useState("");

  const people = useQuery({
    queryKey: ["people", term],
    queryFn: () => get<{ people: { id: string; username: string; displayName: string; avatarUrl: string | null }[] }>(`/api/search?q=${encodeURIComponent(term || "u")}&type=people&limit=12`),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: () =>
      postApi<{ conversation: ConversationPayload }>("/api/conversations", {
        kind: mode,
        title: mode === "direct" ? undefined : title,
        description,
        slug,
        isPrivate,
        memberIds: selected,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: qk.conversations });
      toast(t("create.success"), "success");
      setSelected([]);
      setTitle("");
      onCreated?.(data.conversation);
      onClose();
    },
    onError: (error: Error) => toast(error.message, "error"),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "group" ? t("chat.createGroup") : mode === "channel" ? t("chat.createChannel") : t("chat.new")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button
            loading={mutation.isPending}
            disabled={mode !== "direct" && title.trim().length < 2}
            onClick={() => {
              if (mode === "direct" && selected.length === 0) return toast(t("chat.addMembers"), "error");
              mutation.mutate();
            }}
          >
            {t("common.confirm")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex gap-1.5">
          {(["direct", "group", "channel"] as const).map((kind) => (
            <button
              key={kind}
              onClick={() => setMode(kind)}
              className={cn("flex-1 rounded-xl border px-3 py-2 text-xs font-medium", mode === kind ? "border-brand bg-brandsoft text-brand" : "border-line text-muted")}
            >
              {kind === "direct" ? t("chat.direct") : kind === "group" ? t("chat.group") : t("chat.channel")}
            </button>
          ))}
        </div>
        {mode !== "direct" && (
          <>
            <Field label={t("create.titleField")} required>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={60} />
            </Field>
            <Field label={t("create.description")}>
              <Textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={400} />
            </Field>
          </>
        )}
        {mode === "channel" && (
          <>
            <Field label={t("chat.channelSlug")} hint={slug ? `/c/${slug}` : undefined}>
              <Input value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} maxLength={32} />
            </Field>
            <label className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-xs">
              {t("chat.private")}
              <Switch checked={isPrivate} onChange={setIsPrivate} label={t("chat.private")} />
            </label>
          </>
        )}
        <Field label={t("chat.addMembers")}>
          <Input value={term} onChange={(event) => setTerm(event.target.value)} placeholder={t("search.people")} />
        </Field>
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {people.data?.people.map((person) => (
            <label key={person.id} className={cn("flex cursor-pointer items-center gap-2.5 rounded-xl border px-2.5 py-2", selected.includes(person.id) ? "border-brand bg-brandsoft" : "border-line")}>
              <input
                type={mode === "direct" ? "radio" : "checkbox"}
                name="member"
                className="accent-[var(--brand)]"
                checked={selected.includes(person.id)}
                onChange={() =>
                  setSelected((prev) =>
                    mode === "direct" ? [person.id] : prev.includes(person.id) ? prev.filter((id) => id !== person.id) : [...prev, person.id],
                  )
                }
              />
              <Avatar name={person.displayName} url={person.avatarUrl} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-ink">{person.displayName}</span>
                <span className="block truncate text-[11px] text-muted">@{person.username}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 CHAT ROOM                                  */
/* -------------------------------------------------------------------------- */

type MemberRow = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  joinedAt: string;
  lastSeenAt: string | null;
};

export function ChatRoom({ conversationId, onBack }: { conversationId: string; onBack?: () => void }) {
  const { t, fmt, user, toast } = useApp();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<MessagePayload | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  // === аудио-запись ===
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [requestingMic, setRequestingMic] = useState(false);

  // === видео-запись ===
  const [recordingVideo, setRecordingVideo] = useState(false);
  const [videoSeconds, setVideoSeconds] = useState(0);
  const [requestingCam, setRequestingCam] = useState(false);

  const [infoOpen, setInfoOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<MessagePayload | null>(null);
  const [uploading, setUploading] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  // refs аудио
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRafRef = useRef<number | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const recordingStartAtRef = useRef<number>(0);

  // refs видео
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const currentStreamRef = useRef<MediaStream | null>(null);
  const videoTimerRef = useRef<number | null>(null);

  // общий флаг «отменено»
  const cancelledRecordRef = useRef(false);

  const fileRef = useRef<HTMLInputElement>(null);

  const detail = useQuery({
    queryKey: qk.conversation(conversationId),
    queryFn: () => get<{ conversation: ConversationPayload; myRole: string; members: MemberRow[] }>(`/api/conversations/${conversationId}`),
  });
  const messagesQuery = useQuery({
    queryKey: qk.messages(conversationId),
    queryFn: () => get<{ messages: MessagePayload[] }>(`/api/conversations/${conversationId}/messages?limit=40`),
    refetchInterval: 3000,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesQuery.data?.messages.length]);

  // присваиваем srcObject, когда <video> уже в DOM
  useEffect(() => {
    if (recordingVideo && videoPreviewRef.current && currentStreamRef.current) {
      videoPreviewRef.current.srcObject = currentStreamRef.current;
      const p = videoPreviewRef.current.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
  }, [recordingVideo]);

  // cleanup
  useEffect(() => {
    return () => {
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      if (videoTimerRef.current) window.clearInterval(videoTimerRef.current);
      if (analyserRafRef.current) cancelAnimationFrame(analyserRafRef.current);
      audioCtxRef.current?.close().catch(() => {});
      audioStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      currentStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  const send = useMutation({
    mutationFn: (payload: Record<string, unknown>) => postApi(`/api/conversations/${conversationId}/messages`, payload),
    onSuccess: () => {
      setText("");
      setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: qk.messages(conversationId) });
      queryClient.invalidateQueries({ queryKey: qk.conversations });
    },
    onError: (error: Error) => toast(error.message, "error"),
  });

  const react = useMutation({
    mutationFn: ({ id, emoji }: { id: string; emoji: string }) => patch(`/api/messages/${id}`, { action: "react", emoji }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.messages(conversationId) }),
  });
  const pin = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "pin" | "unpin" }) => patch(`/api/messages/${id}`, { action }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.conversation(conversationId) }),
    onError: (error: Error) => toast(error.message, "error"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/api/messages/${id}`),
    onSuccess: () => {
      toast(t("chat.deleted"), "success");
      queryClient.invalidateQueries({ queryKey: qk.messages(conversationId) });
    },
  });
  const call = useMutation({
    mutationFn: (kind: "audio" | "video") =>
      postApi<{ call: { id: string } }>("/api/calls", {
        calleeId: detail.data?.conversation.peer?.id,
        kind,
        conversationId,
      }),
    onSuccess: (data) => {
      window.location.href = `/calls/${data.call.id}`;
    },
    onError: (error: Error) => toast(error.message, "error"),
  });

  /* ----------------------------- АУДИО ----------------------------- */

  const startRecording = async () => {
    if (recording) return;
    cancelledRecordRef.current = false;
    setRequestingMic(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      // визуализация уровня
      try {
        const Ctx: typeof AudioContext =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          setAudioLevel(Math.min(1, rms * 4));
          analyserRafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        /* необязательно */
      }

      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        audioStreamRef.current?.getTracks().forEach((tr) => tr.stop());
        audioStreamRef.current = null;
        if (audioCtxRef.current) {
          audioCtxRef.current.close().catch(() => {});
          audioCtxRef.current = null;
        }
        if (analyserRafRef.current) {
          cancelAnimationFrame(analyserRafRef.current);
          analyserRafRef.current = null;
        }
        if (recordTimerRef.current) {
          window.clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        setAudioLevel(0);

        if (cancelledRecordRef.current || chunksRef.current.length === 0) {
          chunksRef.current = [];
          setRecording(false);
          setRecordSeconds(0);
          return;
        }

        const ext = mime.includes("mp4") ? "m4a" : "webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type });
        try {
          setUploading(true);
          const uploaded = await uploadMedia(file, { purpose: "audio" });
          await send.mutateAsync({ mediaId: uploaded.media.id, attachmentKind: "audio" });
        } catch (error) {
          toast(error instanceof Error ? error.message : t("create.uploadFailed"), "error");
        } finally {
          setUploading(false);
          setRecording(false);
          setRecordSeconds(0);
        }
      };

      recorderRef.current = recorder;
      recorder.start(250);
      recordingStartAtRef.current = Date.now();
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds(Math.floor((Date.now() - recordingStartAtRef.current) / 1000));
      }, 200);
    } catch {
      toast(t("call.permissionDenied"), "error");
      setRecording(false);
    } finally {
      setRequestingMic(false);
    }
  };

  const stopRecording = (cancelled = false) => {
    cancelledRecordRef.current = cancelled;
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    const mr = recorderRef.current;
    recorderRef.current = null;
    if (mr && mr.state !== "inactive") {
      try {
        mr.stop();
      } catch {
        /* ignore */
      }
    }
  };

  /* ----------------------------- ВИДЕО ----------------------------- */

  const startVideoRecording = async () => {
    if (recordingVideo) return;
    cancelledRecordRef.current = false;
    setRequestingCam(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: true,
      });
      currentStreamRef.current = stream;

      // Сначала включаем рендер превью, затем ждём кадр — srcObject выставит useEffect
      setRecordingVideo(true);
      setVideoSeconds(0);

      // Дожидаемся, что <video> уже в DOM
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        const p = videoPreviewRef.current.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      }

      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
          ? "video/webm;codecs=vp8,opus"
          : MediaRecorder.isTypeSupported("video/mp4")
            ? "video/mp4"
            : "video/webm";

      const recorder = new MediaRecorder(stream, { mimeType: mime });
      videoChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) videoChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        // Убиваем поток ТОЛЬКО после того как финальный dataavailable уже в chunks
        stream.getTracks().forEach((tr) => tr.stop());
        if (videoPreviewRef.current) videoPreviewRef.current.srcObject = null;
        currentStreamRef.current = null;

        if (videoTimerRef.current) {
          window.clearInterval(videoTimerRef.current);
          videoTimerRef.current = null;
        }

        if (cancelledRecordRef.current || videoChunksRef.current.length === 0) {
          videoChunksRef.current = [];
          setRecordingVideo(false);
          setVideoSeconds(0);
          return;
        }

        const ext = mime.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(videoChunksRef.current, { type: mime });
        const file = new File([blob], `video-note-${Date.now()}.${ext}`, { type: blob.type });
        try {
          setUploading(true);
          const uploaded = await uploadMedia(file, { purpose: "video" });
          await send.mutateAsync({ mediaId: uploaded.media.id, attachmentKind: "video" });
        } catch (error) {
          toast(error instanceof Error ? error.message : t("create.uploadFailed"), "error");
        } finally {
          setUploading(false);
          setRecordingVideo(false);
          setVideoSeconds(0);
        }
      };

      videoRecorderRef.current = recorder;
      recorder.start(1000);
      videoTimerRef.current = window.setInterval(() => setVideoSeconds((s) => s + 1), 1000);
    } catch {
      toast("Нет доступа к камере", "error");
      setRecordingVideo(false);
      setVideoSeconds(0);
      currentStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      currentStreamRef.current = null;
    } finally {
      setRequestingCam(false);
    }
  };

  const stopVideoRecording = async (cancelled = false) => {
    cancelledRecordRef.current = cancelled;
    if (videoTimerRef.current) {
      window.clearInterval(videoTimerRef.current);
      videoTimerRef.current = null;
    }
    const mr = videoRecorderRef.current;
    videoRecorderRef.current = null;
    if (!mr || mr.state === "inactive") return;

    // Явно ждём финальный чанк, иначе blob будет пустой / чёрный
    const finalChunk = new Promise<void>((resolve) => {
      mr.addEventListener(
        "dataavailable",
        (e) => {
          if (e.data && e.data.size > 0) videoChunksRef.current.push(e.data);
          resolve();
        },
        { once: true },
      );
      setTimeout(resolve, 400); // страховка
    });

    try {
      mr.stop();
    } catch {
      /* ignore */
    }
    await finalChunk;
  };

  /* ----------------------------- RENDER ----------------------------- */

  if (detail.isLoading || messagesQuery.isLoading) {
    return <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }
  if (detail.isError) return <ErrorState message={t("errors.forbidden")} onRetry={() => detail.refetch()} />;

  const conversation = detail.data!.conversation;
  const messages = messagesQuery.data?.messages ?? [];
  const pinned = messages.find((m) => m.pinned);
  const canPost = conversation.kind !== "channel" || conversation.myRole === "owner" || conversation.myRole === "admin" || !conversation.onlyAdminsCanPost;

  return (
    <div className="flex h-[calc(100dvh-11rem)] flex-col overflow-hidden rounded-2xl border border-line bg-surface md:h-[calc(100dvh-7.5rem)]">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        {onBack && (
          <IconButton label={t("common.back")} onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </IconButton>
        )}
        <Avatar name={conversation.title ?? "UZON"} url={conversation.avatarUrl} size={38} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{conversation.title ?? t("chat.direct")}</p>
          <p className="truncate text-[11px] text-muted">
            {conversation.kind === "direct" ? conversation.peer?.username ?? "" : `${conversation.membersCount} ${t("chat.members").toLowerCase()}`}
            {conversation.kind === "channel" && ` · ${t("chat.channel")}`}
          </p>
        </div>
        {conversation.kind === "direct" && conversation.peer && (
          <>
            <IconButton label={t("call.audio")} onClick={() => call.mutate("audio")}>
              <Phone className="h-4 w-4" />
            </IconButton>
            <IconButton label={t("call.video")} onClick={() => call.mutate("video")}>
              <VideoIcon className="h-4 w-4" />
            </IconButton>
          </>
        )}
        <IconButton label={t("chat.info")} onClick={() => setInfoOpen(true)}>
          <Info className="h-4 w-4" />
        </IconButton>
      </header>

      {pinned && (
        <div className="flex items-center gap-2 border-b border-line bg-brandsoft px-3 py-1.5 text-[11px] text-brand">
          <Pin className="h-3 w-3" />
          <span className="truncate">{pinned.text ?? t("chat.pin")}</span>
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {messages.length === 0 && <EmptyState title={t("chat.empty")} description={t("chat.write")} />}
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onReply={() => setReplyTo(message)}
            onReact={(emoji) => react.mutate({ id: message.id, emoji })}
            onPin={() => pin.mutate({ id: message.id, action: message.pinned ? "unpin" : "pin" })}
            onDelete={() => remove.mutate(message.id)}
            onReport={() => setReportTarget(message)}
            canManage={detail.data!.myRole === "owner" || detail.data!.myRole === "admin" || Boolean(user && user.role !== "user")}
            showAuthor={conversation.kind !== "direct"}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {replyTo && (
        <div className="flex items-center gap-2 border-t border-line bg-surface2 px-3 py-2 text-xs">
          <ArrowLeft className="h-3.5 w-3.5 rotate-180 text-brand" />
          <span className="min-w-0 flex-1 truncate text-muted">{replyTo.text ?? replyTo.media?.kind}</span>
          <IconButton label={t("common.cancel")} onClick={() => setReplyTo(null)}>
            <X className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      )}

      {canPost ? (
        <footer className="safe-bottom border-t border-line bg-surface px-2 py-2">
          {uploading && <p className="px-2 pb-1 text-[11px] text-muted">{t("create.uploading", { percent: "" })}</p>}
          {requestingMic && <p className="px-2 pb-1 text-[11px] text-muted">Запрос доступа к микрофону…</p>}
          {requestingCam && <p className="px-2 pb-1 text-[11px] text-muted">Запрос доступа к камере…</p>}

          {/* Маленькое превью камеры при записи видео */}
          {recordingVideo && (
            <div className="mb-2 flex justify-center">
              <div className="relative w-40 overflow-hidden rounded-2xl bg-black shadow-lg ring-1 ring-white/10">
                <div className="absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-md">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                  </span>
                  {videoSeconds}s
                </div>
                <video
                  ref={videoPreviewRef}
                  autoPlay
                  muted
                  playsInline
                  className="h-52 w-40 object-cover"
                  style={{ transform: "scaleX(-1)" }}
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
                  <p className="text-center text-[10px] font-medium text-white/85">Отпусти — отправится</p>
                </div>
              </div>
            </div>
          )}

          {/* Индикатор записи аудио */}
          {recording && (
            <div className="mb-2 flex items-center gap-3 rounded-2xl border border-danger/30 bg-danger/5 px-3 py-2">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-danger" />
              </span>
              <span className="text-xs font-semibold tabular-nums text-danger">
                {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, "0")}
              </span>
              <div className="flex flex-1 items-center justify-center gap-[3px] overflow-hidden">
                {Array.from({ length: 24 }).map((_, i) => (
                  <span
                    key={i}
                    className="w-1 rounded-full bg-danger"
                    style={{
                      height: `${4 + Math.round(audioLevel * 26 * (0.4 + 0.6 * Math.abs(Math.sin(i * 0.6))))}px`,
                      opacity: 0.4 + audioLevel * 0.6,
                    }}
                  />
                ))}
              </div>
              <span className="shrink-0 text-[10px] text-muted">Отпусти — отправится</span>
            </div>
          )}

          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!text.trim()) return;
              send.mutate({ text, replyToId: replyTo?.id });
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*,audio/*,.pdf,.txt,.zip"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                try {
                  setUploading(true);
                  const purpose = file.type.startsWith("image")
                    ? "image"
                    : file.type.startsWith("video")
                      ? "video"
                      : file.type.startsWith("audio")
                        ? "audio"
                        : "file";
                  const uploaded = await uploadMedia(file, { purpose });
                  await send.mutateAsync({ mediaId: uploaded.media.id, attachmentKind: purpose });
                } catch (error) {
                  toast(error instanceof Error ? error.message : t("create.uploadFailed"), "error");
                } finally {
                  setUploading(false);
                  if (fileRef.current) fileRef.current.value = "";
                }
              }}
            />

            <IconButton label={t("common.upload")} onClick={() => fileRef.current?.click()} type="button" className="mb-1">
              <Paperclip className="h-5 w-5" />
            </IconButton>

            <div className="relative flex-1">
              <Textarea
                rows={1}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (text.trim()) send.mutate({ text, replyToId: replyTo?.id });
                  }
                }}
                placeholder={recording ? t("chat.recording", { seconds: recordSeconds }) : recordingVideo ? "Идёт запись видео…" : t("chat.write")}
                aria-label={t("chat.write")}
                className="max-h-28 min-h-[44px] resize-none rounded-[22px] border-0 bg-surface2 px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand/50"
              />
              {emojiOpen && (
                <div className="absolute bottom-full left-0 z-20 mb-2 grid w-64 grid-cols-6 gap-1 rounded-xl border border-line bg-surface p-2 shadow-xl">
                  {EMOJI.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        setText((prev) => prev + emoji);
                        setEmojiOpen(false);
                      }}
                      className="rounded p-1 text-lg hover:bg-surface2"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative mb-1 flex items-center gap-1">
              {text.trim().length > 0 ? (
                <Button
                  type="submit"
                  size="sm"
                  loading={send.isPending}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand p-0 transition-all hover:bg-brand/90"
                  icon={<Send className="h-5 w-5" />}
                />
              ) : (
                <>
                  {/* ВИДЕО — hold-to-record */}
                  <button
                    type="button"
                    aria-label="Удерживай, чтобы записать видео"
                    onContextMenu={(e) => e.preventDefault()}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
                      void startVideoRecording();
                    }}
                    onPointerUp={(e) => {
                      e.preventDefault();
                      void stopVideoRecording(false);
                    }}
                    onPointerCancel={() => {
                      void stopVideoRecording(true);
                    }}
                    disabled={requestingCam}
                    className={cn(
                      "flex h-11 w-11 touch-none select-none items-center justify-center rounded-full transition-all",
                      requestingCam && "cursor-wait opacity-60",
                      recordingVideo ? "scale-110 bg-danger text-white" : "text-muted hover:bg-surface2 hover:text-ink",
                    )}
                    style={{ touchAction: "none" }}
                  >
                    <VideoIcon className="h-5 w-5" />
                  </button>

                  {/* АУДИО — hold-to-record */}
                  <button
                    type="button"
                    aria-label="Удерживай, чтобы записать голосовое"
                    onContextMenu={(e) => e.preventDefault()}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
                      void startRecording();
                    }}
                    onPointerUp={(e) => {
                      e.preventDefault();
                      stopRecording(false);
                    }}
                    onPointerCancel={() => stopRecording(true)}
                    disabled={requestingMic}
                    className={cn(
                      "flex h-11 w-11 touch-none select-none items-center justify-center rounded-full transition-all",
                      requestingMic && "cursor-wait opacity-60",
                      recording ? "animate-pulse bg-danger text-white" : "text-muted hover:bg-surface2 hover:text-ink",
                    )}
                    style={{ touchAction: "none" }}
                  >
                    <Mic className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>
          </form>
        </footer>
      ) : (
        <footer className="border-t border-line px-3 py-3 text-center text-xs text-muted">{t("chat.noPermission")}</footer>
      )}

      {infoOpen && (
        <ConversationInfoModal
          conversationId={conversationId}
          onClose={() => setInfoOpen(false)}
          members={detail.data!.members}
          myRole={detail.data!.myRole}
        />
      )}
      {reportTarget && <ReportModal open onClose={() => setReportTarget(null)} entityType="message" entityId={reportTarget.id} />}
      {call.isPending && <p className="px-3 py-1 text-xs text-muted">{t("call.connecting")}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                               MESSAGE BUBBLE                               */
/* -------------------------------------------------------------------------- */

function MessageBubble({
  message,
  onReply,
  onReact,
  onPin,
  onDelete,
  onReport,
  canManage,
  showAuthor,
}: {
  message: MessagePayload;
  onReply: () => void;
  onReact: (emoji: string) => void;
  onPin: () => void;
  onDelete: () => void;
  onReport: () => void;
  canManage: boolean;
  showAuthor: boolean;
}) {
  const { t, fmt } = useApp();
  const [showReactions, setShowReactions] = useState(false);
  if (message.deletedAt) {
    return (
      <p className={cn("max-w-[80%] rounded-2xl border border-dashed border-line px-3 py-2 text-xs italic text-muted", message.isMine && "ml-auto")}>
        {t("chat.deleted")}
      </p>
    );
  }

  const isVideoNote = message.media?.kind === "video";

  return (
    <div className={cn("group flex w-full gap-2", message.isMine ? "justify-end" : "justify-start")}>
      {!message.isMine && showAuthor && <Avatar name={message.sender.displayName} url={message.sender.avatarUrl} size={28} className="mt-auto" />}
      <div className={cn("max-w-[80%] md:max-w-[65%]", message.isMine && "text-right")}>
        {showAuthor && !message.isMine && (
          <Link href={`/u/${message.sender.username}`} className="mb-0.5 block text-[11px] font-semibold text-brand hover:underline">
            {message.sender.displayName}
          </Link>
        )}
        <div
          className={cn(
            "relative rounded-2xl px-3 py-2 text-sm",
            message.isMine ? "bg-brand text-white rounded-br-sm" : "border border-line bg-surface2 text-ink rounded-bl-sm",
            isVideoNote && "p-1.5 overflow-hidden",
          )}
        >
          {message.replyTo && (
            <p className={cn("mb-1 border-l-2 pl-2 text-[11px]", message.isMine ? "border-white/50 text-white/75" : "border-brand text-muted")}>
              {message.replyTo.senderName}: {message.replyTo.text ?? t("common.upload")}
            </p>
          )}
          {message.text && <p className="whitespace-pre-wrap break-words text-left leading-relaxed">{message.text}</p>}

          {message.media?.url &&
            (message.media.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={message.media.url} alt="" className="mt-1 max-h-72 w-full rounded-xl object-cover" loading="lazy" />
            ) : message.media.kind === "video" ? (
              <video src={message.media.url} controls playsInline className="mt-1 w-[240px] max-w-full rounded-xl bg-black" />
            ) : message.media.kind === "audio" ? (
              <AudioPlayer src={message.media.url} />
            ) : (
              <a href={message.media.url} download className="mt-1 flex items-center gap-2 text-xs underline">
                <Paperclip className="h-3.5 w-3.5" />
                {message.media.name ?? t("common.download")}
              </a>
            ))}

          <div className={cn("mt-1 flex items-center justify-end gap-1.5 text-[10px]", isVideoNote && "absolute bottom-2 right-2 rounded-full bg-black/50 px-1.5 py-0.5 text-white backdrop-blur-sm")}>
            {message.pinned && <Pin className="h-2.5 w-2.5" />}
            {message.editedAt && <span>{t("chat.edited")}</span>}
            <span>{fmt.time(message.createdAt)}</span>
            {message.isMine && <span>{message.status === "read" ? "✓✓" : "✓"}</span>}
          </div>

          {showReactions && (
            <div className={cn("absolute -top-9 z-10 flex gap-0.5 rounded-full border border-line bg-surface px-1.5 py-1 shadow-lg", message.isMine ? "right-0" : "left-0")}>
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onReact(emoji);
                    setShowReactions(false);
                  }}
                  className="rounded-full px-1 text-sm hover:bg-surface2"
                  aria-label={emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {message.reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {message.reactions.map((reaction) => (
              <span key={reaction.emoji} className="rounded-full border border-line bg-surface px-1.5 text-[10px]">
                {reaction.emoji} {reaction.userIds.length}
              </span>
            ))}
          </div>
        )}

        <div className={cn("mt-0.5 flex items-center gap-1 opacity-0 transition group-hover:opacity-100", message.isMine && "justify-end")}>
          <button onClick={() => setShowReactions((v) => !v)} className="text-[10px] text-muted hover:text-brand" aria-label={t("chat.reply")}>
            <Smile className="h-3.5 w-3.5" />
          </button>
          <button onClick={onReply} className="text-[10px] text-muted hover:text-brand">
            {t("chat.reply")}
          </button>
          {(message.isMine || canManage) && (
            <Menu
              align={message.isMine ? "right" : "left"}
              trigger={({ toggle }) => (
                <button onClick={toggle} className="text-muted hover:text-brand" aria-label={t("common.edit")}>
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              )}
            >
              {canManage && (
                <MenuItem icon={<Pin className="h-3.5 w-3.5" />} onClick={onPin}>
                  {message.pinned ? t("chat.unpin") : t("chat.pin")}
                </MenuItem>
              )}
              {!message.isMine && (
                <MenuItem icon={<Flag className="h-3.5 w-3.5" />} onClick={onReport}>
                  {t("common.report")}
                </MenuItem>
              )}
              {(message.isMine || canManage) && (
                <MenuItem icon={<Trash2 className="h-3.5 w-3.5" />} tone="danger" onClick={onDelete}>
                  {t("chat.delete")}
                </MenuItem>
              )}
              {!message.isMine && (
                <MenuItem icon={<Ban className="h-3.5 w-3.5" />} tone="danger" onClick={() => onReport()}>
                  {t("common.block")}
                </MenuItem>
              )}
            </Menu>
          )}
        </div>
      </div>
      <span className="sr-only">{message.isMine ? t("chat.sent") : message.sender.displayName}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                AUDIO PLAYER                                */
/* -------------------------------------------------------------------------- */

function AudioPlayer({ src }: { src: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const current = audioRef.current.currentTime;
      const duration = audioRef.current.duration;
      if (duration && duration > 0) {
        setProgress((current / duration) * 100);
      }
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setProgress(0);
  };

  return (
    <div className="mt-1 flex w-[240px] max-w-full items-center gap-3">
      <audio ref={audioRef} src={src} onTimeUpdate={handleTimeUpdate} onEnded={handleEnded} className="hidden" />
      <button
        type="button"
        onClick={togglePlay}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 text-white transition hover:bg-white/30"
      >
        {isPlaying ? (
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
          </svg>
        ) : (
          <svg className="ml-1 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      <div className="relative h-1 flex-1 rounded-full bg-white/20">
        <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                        CONVERSATION INFO MODAL                             */
/* -------------------------------------------------------------------------- */

function ConversationInfoModal({
  conversationId,
  onClose,
  members,
  myRole,
}: {
  conversationId: string;
  onClose: () => void;
  members: MemberRow[];
  myRole: string;
}) {
  const { t, toast, user } = useApp();
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: qk.conversation(conversationId),
    queryFn: () => get<{ conversation: ConversationPayload }>(`/api/conversations/${conversationId}`),
  });
  const [title, setTitle] = useState(detail.data?.conversation.title ?? "");
  const [description, setDescription] = useState(detail.data?.conversation.description ?? "");
  const [onlyAdmins, setOnlyAdmins] = useState(detail.data?.conversation.onlyAdminsCanPost ?? false);
  useEffect(() => {
    setTitle(detail.data?.conversation.title ?? "");
    setDescription(detail.data?.conversation.description ?? "");
    setOnlyAdmins(detail.data?.conversation.onlyAdminsCanPost ?? false);
  }, [detail.data]);

  const canManage = myRole === "owner" || myRole === "admin" || user?.role !== "user";
  const save = useMutation({
    mutationFn: () => patch(`/api/conversations/${conversationId}`, { title, description, onlyAdminsCanPost: onlyAdmins }),
    onSuccess: () => {
      toast(t("common.saved"), "success");
      queryClient.invalidateQueries({ queryKey: qk.conversation(conversationId) });
      queryClient.invalidateQueries({ queryKey: qk.conversations });
    },
    onError: (error: Error) => toast(error.message, "error"),
  });
  const memberAction = useMutation({
    mutationFn: (payload: Record<string, unknown>) => postApi(`/api/conversations/${conversationId}/members`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.conversation(conversationId) });
      toast(t("common.saved"), "success");
    },
    onError: (error: Error) => toast(error.message, "error"),
  });
  const leave = useMutation({
    mutationFn: () => postApi(`/api/conversations/${conversationId}/members`, { action: "leave" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.conversations });
      onClose();
    },
    onError: (error: Error) => toast(error.message, "error"),
  });

  return (
    <Modal open onClose={onClose} title={t("chat.info")} size="lg">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar name={detail.data?.conversation.title ?? "UZON"} url={detail.data?.conversation.avatarUrl} size={52} />
          <div>
            <p className="text-sm font-semibold text-ink">{detail.data?.conversation.title ?? t("chat.direct")}</p>
            <p className="text-xs text-muted">
              {members.length} {t("chat.members").toLowerCase()}
              {detail.data?.conversation.slug ? ` · /c/${detail.data.conversation.slug}` : ""}
            </p>
          </div>
        </div>

        {canManage && detail.data?.conversation.kind !== "direct" && (
          <div className="space-y-2 rounded-xl border border-line p-3">
            <Field label={t("create.titleField")}>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </Field>
            <Field label={t("create.description")}>
              <Textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
            </Field>
            {detail.data?.conversation.kind === "channel" && (
              <label className="flex items-center justify-between text-xs">
                {t("chat.onlyAdmins")}
                <Switch checked={onlyAdmins} onChange={setOnlyAdmins} label={t("chat.onlyAdmins")} />
              </label>
            )}
            <Button size="sm" onClick={() => save.mutate()} loading={save.isPending}>
              {t("common.save")}
            </Button>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold text-muted">{t("chat.members")}</p>
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {members.map((member) => (
              <li key={member.userId} className="flex items-center gap-2 rounded-xl border border-line px-2.5 py-1.5">
                <Avatar name={member.displayName} url={member.avatarUrl} size={30} />
                <Link href={`/u/${member.username}`} className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-ink">{member.displayName}</span>
                  <span className="block truncate text-[11px] text-muted">@{member.username}</span>
                </Link>
                {member.role === "owner" && (
                  <Badge tone="brand">
                    <Crown className="h-3 w-3" />
                    {t("chat.owner")}
                  </Badge>
                )}
                {member.role === "admin" && <Badge>{t("chat.admin")}</Badge>}
                {canManage && member.role !== "owner" && member.userId !== user?.id && (
                  <Menu
                    trigger={({ toggle }) => (
                      <IconButton label={t("chat.members")} onClick={toggle}>
                        <MoreHorizontal className="h-4 w-4" />
                      </IconButton>
                    )}
                  >
                    <MenuItem onClick={() => memberAction.mutate({ action: "role", userId: member.userId, role: member.role === "admin" ? "member" : "admin" })}>
                      {member.role === "admin" ? t("chat.member") : t("chat.admin")}
                    </MenuItem>
                    <MenuItem tone="danger" onClick={() => memberAction.mutate({ action: "remove", userIds: [member.userId] })}>
                      {t("chat.removeMember")}
                    </MenuItem>
                  </Menu>
                )}
              </li>
            ))}
          </ul>
        </div>

        {detail.data && detail.data.conversation.kind !== "direct" && myRole !== "owner" && (
          <Button variant="danger" size="sm" onClick={() => leave.mutate()} loading={leave.isPending}>
            {t("chat.leave")}
          </Button>
        )}
      </div>
    </Modal>
  );
}