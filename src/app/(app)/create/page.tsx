"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clapperboard, FileText, Image as ImageIcon, PlaySquare, X, Camera, BookOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/providers";
import { Badge, Button, Card, Field, Input, Progress, Select, Textarea } from "@/components/ui";
import { StoryComposer } from "@/components/stories";
import { get, post as postApi, qk, uploadMedia } from "@/lib/client/api";
import { cn } from "@/lib/utils";

type Mode = "story" | "clip" | "video" | "photo" | "text" | null;

export default function CreatePage() {
  const { t, toast } = useApp();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>(null);
  const [storyOpen, setStoryOpen] = useState(false);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [category, setCategory] = useState("blogs");
  const [audience, setAudience] = useState<"public" | "followers" | "contacts" | "private">("public");
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [progress, setProgress] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [mediaInfo, setMediaInfo] = useState<{ durationMs: number; width: number; height: number } | null>(null);
  const [channelId, setChannelId] = useState("");
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterPreview, setPosterPreview] = useState<string | null>(null);
  const [frames, setFrames] = useState<string[]>([]); // Кадры из видео
  const abortRef = useRef<AbortController | null>(null);

  const config = useQuery({ queryKey: qk.config, queryFn: () => get<{ config: { clipMaxSeconds: number; videoMaxMb: number; imageMaxMb: number } }>("/api/config") });
  const channels = useQuery({ queryKey: ["my-channels"], queryFn: () => get<{ conversations: { id: string; title: string | null; slug: string | null; myRole: string }[] }>("/api/conversations?kind=channel") });
  const limits = config.data?.config;
  const postableChannels = (channels.data?.conversations ?? []).filter((c) => c.myRole === "owner" || c.myRole === "admin");

  useEffect(() => {
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
      if (posterPreview) URL.revokeObjectURL(posterPreview);
      frames.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previews, posterPreview, frames]);

  const reset = () => {
    setFiles([]);
    setPreviews([]);
    setMediaInfo(null);
    setProgress(0);
    setText("");
    setTitle("");
    setDescription("");
    setHashtags("");
    setPosterFile(null);
    setPosterPreview(null);
    setFrames([]);
  };

  // Генерация кадров из видео
  const generateFrames = (file: File) => {
    return new Promise<string[]>((resolve) => {
      const video = document.createElement("video");
      video.src = URL.createObjectURL(file);
      video.muted = true;
      video.playsInline = true;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const frames: string[] = [];
      let time = 0;
      const duration = video.duration || 10; // fallback

      video.onloadedmetadata = () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      };

      video.onseeked = () => {
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          frames.push(canvas.toDataURL("image/jpeg", 0.7));
        }
        time += duration / 4;
        if (time < duration && frames.length < 4) {
          video.currentTime = time;
        } else {
          URL.revokeObjectURL(video.src);
          resolve(frames);
        }
      };

      video.currentTime = 0;
    });
  };

  const probeVideo = (file: File) =>
    new Promise<void>((resolve) => {
      const url = URL.createObjectURL(file);
      const element = document.createElement("video");
      element.preload = "metadata";
      element.onloadedmetadata = () => {
        setMediaInfo({ durationMs: Math.round(element.duration * 1000), width: element.videoWidth, height: element.videoHeight });
        resolve();
      };
      element.onerror = () => resolve();
      element.src = url;
    });

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    if (!selected.length) return;
    setFiles(selected);
    setPreviews(selected.map((file) => URL.createObjectURL(file)));
    setFrames([]);
    setPosterFile(null);
    setPosterPreview(null);
    if (mode !== "photo") {
      await probeVideo(selected[0]!);
      const generated = await generateFrames(selected[0]!);
      setFrames(generated);
    }
  };

  const selectFrame = async (dataUrl: string) => {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], "poster.jpg", { type: "image/jpeg" });
    setPosterFile(file);
    setPosterPreview(dataUrl);
  };

  const publish = useMutation({
    mutationFn: async () => {
      setProgress(2);
      abortRef.current = new AbortController();

      if (mode === "photo") {
        const mediaIds: string[] = [];
        for (const [index, file] of files.entries()) {
          const uploaded = await uploadMedia(file, {
            purpose: "image",
            visibility: audience,
            signal: abortRef.current.signal,
            onProgress: (percent) => setProgress(Math.round(((index + percent / 100) / files.length) * 90)),
          });
          mediaIds.push(uploaded.media.id);
        }
        setProgress(95);
        return postApi<{ post: { id: string } }>("/api/posts", { text, mediaIds, audience, commentsEnabled, conversationId: channelId || undefined });
      }

      if (mode === "text") {
        setProgress(90);
        return postApi<{ post: { id: string } }>("/api/posts", { text, audience, commentsEnabled, conversationId: channelId || undefined });
      }

      if (mode === "clip" || mode === "video") {
        const file = files[0];
        if (!file) throw new Error(t("create.chooseFile"));
        if (limits && file.size > limits.videoMaxMb * 1024 * 1024) throw new Error(t("create.tooBig", { mb: limits.videoMaxMb }));
        if (mediaInfo?.durationMs && mode === "clip" && limits && mediaInfo.durationMs > limits.clipMaxSeconds * 1000) {
          throw new Error(t("create.tooLong", { seconds: limits.clipMaxSeconds }));
        }
        const uploaded = await uploadMedia(file, {
          purpose: mode === "clip" ? "clip" : "video",
          visibility: audience,
          signal: abortRef.current.signal,
          onProgress: (percent) => setProgress(Math.round(percent * 0.85)),
        });

        let posterKey: string | undefined;
        if (posterFile) {
          const uploadedPoster = await uploadMedia(posterFile, { purpose: "image" });
          posterKey = uploadedPoster.media.key;
        }

        setProgress(90);
        const payload = await postApi<{ video: { id: string; kind: string } }>("/api/videos", {
          title: title.trim() || file.name,
          description,
          category,
          kind: mode === "clip" ? "clip" : "long",
          mediaId: uploaded.media.id,
          posterKey,
          hashtags: hashtags.split(/[\s,]+/).map((tag) => tag.replace(/^#/, "")).filter(Boolean).slice(0, 12),
          durationMs: mediaInfo?.durationMs,
          audience,
          commentsEnabled,
        });
        return payload;
      }
      throw new Error(t("common.error"));
    },
    onSuccess: (data) => {
      setProgress(100);
      toast(t("create.success"), "success");
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["clips-feed"] });
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: qk.storyTray });
      reset();
      const videoData = data as { video?: { id: string; kind: string } };
      if (videoData?.video?.kind === "long") router.push(`/videos/${videoData.video.id}`);
      else if (videoData?.video?.kind === "clip") router.push("/clips");
      else router.push("/home");
    },
    onError: (error: Error) => {
      setProgress(0);
      toast(error.message || t("create.uploadFailed"), "error");
    },
  });

  const options: { mode: Exclude<Mode, null>; label: string; icon: React.ReactNode; hint: string }[] = [
    { mode: "story", label: t("create.story"), icon: <Camera className="h-5 w-5" />, hint: t("story.expires", { hours: 24 }) },
    { mode: "clip", label: t("create.clip"), icon: <Clapperboard className="h-5 w-5" />, hint: t("clips.maxDuration", { minutes: Math.round((limits?.clipMaxSeconds ?? 300) / 60) }) },
    { mode: "video", label: t("create.video"), icon: <PlaySquare className="h-5 w-5" />, hint: t("video.title") },
    { mode: "photo", label: t("create.photo"), icon: <ImageIcon className="h-5 w-5" />, hint: `${limits?.imageMaxMb ?? 12} MB` },
    { mode: "text", label: t("create.text"), icon: <FileText className="h-5 w-5" />, hint: t("post.text") },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-2 pb-24 sm:px-4 lg:px-0 lg:pb-0">
      <header>
        <h1 className="text-xl font-semibold text-ink">{t("create.title")}</h1>
        <p className="text-xs text-muted">{t("app.tagline")}</p>
      </header>

      {!mode ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {options.map((option) => (
            <button
              key={option.mode}
              onClick={() => {
                if (option.mode === "story") setStoryOpen(true);
                else setMode(option.mode);
              }}
              className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left transition hover:border-brand/50 hover:bg-brandsoft/40"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brandsoft text-brand transition group-hover:scale-105">
                {option.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{option.label}</span>
                <span className="mt-0.5 block text-[11px] text-muted break-words whitespace-normal leading-snug">{option.hint}</span>
              </span>
            </button>
          ))}
          <Card className="flex items-center gap-3 p-4 sm:col-span-2">
            <BookOpen className="h-5 w-5 shrink-0 text-brand" />
            <p className="text-xs text-muted">
              {t("create.recording")} · {t("create.trimHint")}
            </p>
          </Card>
        </div>
      ) : (
        <Card className="space-y-4 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge tone="brand">{options.find((o) => o.mode === mode)?.label}</Badge>
              {mediaInfo?.durationMs ? <Badge>{`${Math.round(mediaInfo.durationMs / 1000)}s · ${mediaInfo.width}×${mediaInfo.height}`}</Badge> : null}
            </div>
            <Button variant="ghost" size="sm" icon={<X className="h-4 w-4" />} onClick={() => { reset(); setMode(null); }}>
              {t("common.cancel")}
            </Button>
          </div>

          {(mode === "clip" || mode === "video" || mode === "photo") && (
            <div>
              <input
                id="uzon-file"
                type="file"
                accept={mode === "photo" ? "image/*" : "video/*"}
                multiple={mode === "photo"}
                className="hidden"
                onChange={handleFileChange}
              />
              <label
                htmlFor="uzon-file"
                className="flex h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-surface2 text-xs text-muted transition hover:border-brand hover:text-brand"
              >
                {previews.length ? (
                  mode === "photo" ? (
                    <span className="flex gap-1.5 overflow-hidden">
                      {previews.slice(0, 4).map((url) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={url} src={url} alt="" className="h-40 w-28 rounded-lg object-cover" />
                      ))}
                    </span>
                  ) : (
                    <video src={previews[0]} className="h-44 rounded-xl object-contain" muted playsInline controls />
                  )
                ) : (
                  <>
                    {options.find((o) => o.mode === mode)?.icon}
                    {t("create.chooseFile")}
                    <span className="text-[10px] opacity-70">{t("create.recording")}</span>
                  </>
                )}
              </label>
            </div>
          )}

          {(mode === "clip" || mode === "video") && (
            <>
              <Field label={t("create.titleField")} required>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder={t("create.titleField")} />
              </Field>
              <Field label={t("create.description")}>
                <Textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={4000} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("create.hashtags")}>
                  <Input value={hashtags} onChange={(event) => setHashtags(event.target.value)} placeholder="#tashkent #travel" />
                </Field>
                <Field label={t("create.category")}>
                  <Select value={category} onChange={(event) => setCategory(event.target.value)}>
                    {["blogs", "news", "travel", "education", "technology", "entertainment", "documentary", "music", "sport", "culture"].map((item) => (
                      <option key={item} value={item}>
                        {t(`category.${item}` as never)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              {/* Выбор обложки */}
              <Field label="Обложка видео (превью)">
                {frames.length > 0 && (
                  <div className="mb-3 flex gap-2 overflow-x-auto">
                    {frames.map((frame, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => selectFrame(frame)}
                        className={cn(
                          "shrink-0 overflow-hidden rounded-lg border-2 transition",
                          posterPreview === frame ? "border-brand" : "border-transparent hover:border-brand/50"
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={frame} alt={`frame ${idx + 1}`} className="h-16 w-24 object-cover" />
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  {posterPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={posterPreview} alt="preview" className="h-20 w-32 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-20 w-32 items-center justify-center rounded-lg bg-surface2 text-xs text-muted">
                      Нет обложки
                    </div>
                  )}
                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id="poster-file"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setPosterFile(file);
                          setPosterPreview(URL.createObjectURL(file));
                        }
                      }}
                    />
                    <Button type="button" variant="secondary" size="sm" onClick={() => document.getElementById("poster-file")?.click()}>
                      Загрузить свою
                    </Button>
                  </div>
                </div>
              </Field>

              {mode === "video" && <p className="text-[11px] text-muted">{t("video.processingNote")}</p>}
            </>
          )}

          {(mode === "photo" || mode === "text") && (
            <Field label={t("post.text")}>
              <Textarea rows={4} value={text} onChange={(event) => setText(event.target.value)} maxLength={4000} placeholder={t("feed.newPost")} />
            </Field>
          )}

          {postableChannels.length > 0 && (
            <Field label={t("create.channel")}>
              <Select value={channelId} onChange={(event) => setChannelId(event.target.value)}>
                <option value="">{t("profile.posts")}</option>
                {postableChannels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.title}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("post.audience")}>
              <Select value={audience} onChange={(event) => setAudience(event.target.value as never)}>
                <option value="public">{t("settings.audiencePublic")}</option>
                <option value="followers">{t("settings.audienceFollowers")}</option>
                <option value="contacts">{t("settings.audienceContacts")}</option>
                <option value="private">{t("settings.audiencePrivate")}</option>
              </Select>
            </Field>
            <Field label={t("post.allowComments")}>
              <Select value={commentsEnabled ? "yes" : "no"} onChange={(event) => setCommentsEnabled(event.target.value === "yes")}>
                <option value="yes">{t("common.yes")}</option>
                <option value="no">{t("common.no")}</option>
              </Select>
            </Field>
          </div>

          {publish.isPending && <Progress value={progress} />}
          <div className="flex items-center gap-2">
            <Button
              className={cn("flex-1")}
              loading={publish.isPending}
              disabled={(mode === "text" && !text.trim()) || ((mode === "photo" || mode === "clip" || mode === "video") && files.length === 0) || ((mode === "clip" || mode === "video") && !title.trim())}
              onClick={() => publish.mutate()}
            >
              {t("common.publish")}
            </Button>
            {publish.isPending && (
              <Button
                variant="ghost"
                onClick={() => {
                  abortRef.current?.abort();
                  publish.reset();
                  setProgress(0);
                }}
              >
                {t("common.cancel")}
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted">
            {progress > 0 ? t("create.uploading", { percent: progress }) : t("common.optional")}
          </p>
        </Card>
      )}

      <StoryComposer open={storyOpen} onClose={() => setStoryOpen(false)} />
    </div>
  );
}