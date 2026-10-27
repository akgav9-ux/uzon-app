"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Mic,
  MicOff,
  PhoneOff,
  SwitchCamera,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/providers";
import { Avatar, Button } from "@/components/ui";
import { get, post as postApi, qk } from "@/lib/client/api";
import { cn } from "@/lib/utils";

type CallState = {
  call: {
    id: string;
    kind: "audio" | "video";
    status: string;
    initiatorId: string;
    calleeId: string;
    durationMs: number;
    createdAt: string;
    answeredAt: string | null;
    endedAt: string | null;
    isInitiator: boolean;
    endedReason: string | null;
  };
  peer: {
    displayName: string;
    username: string;
    avatarUrl: string | null;
  } | null;
};

type Signal = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  fromUserId: string;
  createdAt: string;
};

type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

type SignalsResponse = {
  status: string;
  signals: Signal[];
};

const TERMINAL_STATUSES = [
  "ended",
  "declined",
  "missed",
  "failed",
];

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

export function CallScreen({ callId }: { callId: string }) {
  const { t, fmt, toast } = useApp();
  const queryClient = useQueryClient();

  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const remoteAudio = useRef<HTMLAudioElement>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const processedSignals = useRef<Set<string>>(new Set());
  const pendingIceCandidates = useRef<RTCIceCandidateInit[]>([]);
  const processingSignals = useRef(false);
  const isCleaningUp = useRef(false);
  const facing = useRef<"user" | "environment">("user");
  const mountedRef = useRef(false);
  const localMediaPromise = useRef<Promise<MediaStream> | null>(null);

  const [status, setStatus] = useState("connecting");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [iceWarning, setIceWarning] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const callQuery = useQuery({
    queryKey: qk.call(callId),
    queryFn: () => get<CallState>(`/api/calls/${callId}`),
    refetchInterval: 3000,
  });

  const configQuery = useQuery({
    queryKey: qk.config,
    queryFn: () =>
      get<{
        config: {
          iceServers: IceServer[];
          demoMode: boolean;
        };
      }>("/api/config"),
    staleTime: 60_000,
  });

  const signalQuery = useQuery({
    queryKey: qk.callSignals(callId),
    queryFn: () =>
      get<SignalsResponse>(`/api/calls/${callId}/signals`),
    refetchInterval: 1200,
    enabled: !TERMINAL_STATUSES.includes(status),
  });

  const sendSignal = useCallback(
    async (
      type: Signal["type"],
      payload: Record<string, unknown> = {},
    ) => {
      if (isCleaningUp.current && type !== "end") return;

      await postApi(`/api/calls/${callId}/signals`, {
        type,
        payload,
      });
    },
    [callId],
  );

  const iceServers: RTCIceServer[] = (
    configQuery.data?.config.iceServers ?? []
  )
    .filter((server) => {
      const urls = Array.isArray(server.urls)
        ? server.urls
        : [server.urls];

      return urls.length > 0;
    })
    .map((server) => ({
      urls: server.urls,
      ...(server.username
        ? { username: server.username }
        : {}),
      ...(server.credential
        ? { credential: server.credential }
        : {}),
    }));

  const effectiveIceServers =
    iceServers.length > 0 ? iceServers : FALLBACK_ICE_SERVERS;

  useEffect(() => {
    const hasTurn = effectiveIceServers.some((server) => {
      const urls = Array.isArray(server.urls)
        ? server.urls
        : [server.urls];

      return urls.some((url) =>
        url.toLowerCase().startsWith("turn:") ||
        url.toLowerCase().startsWith("turns:"),
      );
    });

    setIceWarning(!hasTurn);
  }, [configQuery.data]);

  const getMedia = useCallback(
    async (video: boolean): Promise<MediaStream> => {
      if (isCleaningUp.current) {
        throw new Error("Звонок уже завершён");
      }

      if (streamRef.current) {
        const hasVideoTrack =
          streamRef.current.getVideoTracks().length > 0;

        if (!video || hasVideoTrack) {
          return streamRef.current;
        }

        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      if (localMediaPromise.current) {
        return localMediaPromise.current;
      }

      const mediaPromise = navigator.mediaDevices
        .getUserMedia({
          audio: true,
          video: video
            ? {
                facingMode: facing.current,
              }
            : false,
        })
        .then((stream) => {
          if (isCleaningUp.current) {
            stream.getTracks().forEach((track) => track.stop());
            throw new Error("Звонок уже завершён");
          }

          streamRef.current = stream;

          if (localVideo.current && video) {
            localVideo.current.srcObject = stream;
            void localVideo.current.play().catch(() => {});
          }

          setError(null);
          return stream;
        })
        .catch((err: unknown) => {
          console.error("[UZON CALL] getUserMedia failed:", err);

          const message = t("call.permissionDenied");
          setError(message);

          throw err;
        })
        .finally(() => {
          localMediaPromise.current = null;
        });

      localMediaPromise.current = mediaPromise;
      return mediaPromise;
    },
    [t],
  );

  const playRemoteAudio = useCallback(async () => {
    const audio = remoteAudio.current;

    if (!audio || !audio.srcObject || isCleaningUp.current) {
      return;
    }

    audio.autoplay = true;
    audio.muted = false;
    audio.volume = 1;

    try {
      await audio.play();
      setAudioBlocked(false);
    } catch (err) {
      console.warn(
        "[UZON CALL] Remote audio playback blocked:",
        err,
      );
      setAudioBlocked(true);
    }
  }, []);

  const flushPendingIceCandidates = useCallback(
    async (pc: RTCPeerConnection) => {
      if (!pc.remoteDescription) return;

      const pending = [...pendingIceCandidates.current];
      pendingIceCandidates.current = [];

      for (const candidate of pending) {
        try {
          await pc.addIceCandidate(
            new RTCIceCandidate(candidate),
          );
        } catch (err) {
          console.error(
            "[UZON CALL] Failed to add queued ICE candidate:",
            err,
          );
        }
      }
    },
    [],
  );

  const createPeer = useCallback(async () => {
    if (isCleaningUp.current) {
      throw new Error("Звонок уже завершён");
    }

    if (pcRef.current) {
      return pcRef.current;
    }

    const kind = callQuery.data?.call.kind ?? "audio";

    const pc = new RTCPeerConnection({
      iceServers: effectiveIceServers,
      iceCandidatePoolSize: 2,
    });

    pcRef.current = pc;

    try {
      const stream = await getMedia(kind === "video");

      if (isCleaningUp.current) {
        pc.close();
        throw new Error("Звонок уже завершён");
      }

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      pc.onicecandidate = (event) => {
        if (!event.candidate || isCleaningUp.current) return;

        void sendSignal("ice", {
          candidate: event.candidate.toJSON(),
        }).catch((err) => {
          console.error(
            "[UZON CALL] Failed to send ICE candidate:",
            err,
          );
        });
      };

      pc.ontrack = (event) => {
        if (isCleaningUp.current) return;

        const remoteStream =
          event.streams[0] ??
          new MediaStream([event.track]);

        console.info(
          "[UZON CALL] Remote track received:",
          event.track.kind,
          event.track.readyState,
          event.track.enabled,
        );

        if (event.track.kind === "audio") {
          const audio = remoteAudio.current;

          if (audio) {
            audio.srcObject = remoteStream;
            audio.muted = false;
            audio.volume = 1;
            void playRemoteAudio();
          }

          event.track.onunmute = () => {
            void playRemoteAudio();
          };
        }

        if (event.track.kind === "video") {
          const video = remoteVideo.current;

          if (video) {
            video.srcObject = remoteStream;
            void video.play().catch((err) => {
              console.warn(
                "[UZON CALL] Remote video playback failed:",
                err,
              );
            });
          }
        }
      };

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;

        console.info("[UZON CALL] ICE state:", state);

        if (state === "connected" || state === "completed") {
          setIceWarning(false);
        } else if (
          state === "failed" ||
          state === "disconnected"
        ) {
          setIceWarning(true);
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;

        console.info("[UZON CALL] Peer connection state:", state);

        if (state === "connected") {
          setStatus("active");
          setError(null);
          void playRemoteAudio();
        }

        if (state === "failed") {
          setError(
            "Не удалось установить соединение. Проверьте TURN и интернет.",
          );
          setStatus("failed");
        }

        if (state === "closed" && !isCleaningUp.current) {
          setStatus("ended");
        }
      };

      return pc;
    } catch (err) {
      if (pcRef.current === pc) {
        pcRef.current = null;
      }

      pc.close();
      throw err;
    }
  }, [
    callQuery.data?.call.kind,
    effectiveIceServers,
    getMedia,
    playRemoteAudio,
    sendSignal,
  ]);

  const cleanup = useCallback(() => {
    if (isCleaningUp.current) return;

    isCleaningUp.current = true;

    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });

    streamRef.current = null;
    localMediaPromise.current = null;

    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }

    pendingIceCandidates.current = [];

    if (localVideo.current) {
      localVideo.current.srcObject = null;
    }

    if (remoteVideo.current) {
      remoteVideo.current.srcObject = null;
    }

    if (remoteAudio.current) {
      remoteAudio.current.pause();
      remoteAudio.current.srcObject = null;
    }
  }, []);

  const unlockAudio = useCallback(() => {
    const audio = remoteAudio.current;

    if (!audio) return;

    audio.muted = false;
    audio.volume = 1;

    void audio.play()
      .then(() => {
        setAudioBlocked(false);
      })
      .catch((err) => {
        console.warn(
          "[UZON CALL] Audio still blocked:",
          err,
        );
        setAudioBlocked(true);
      });
  }, []);

  const endCall = useMutation({
    mutationFn: () =>
      postApi(`/api/calls/${callId}`, { action: "end" }),
    onSuccess: () => {
      cleanup();
      setStatus("ended");
      queryClient.invalidateQueries({ queryKey: qk.calls });
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const acceptCall = useMutation({
    mutationFn: async () => {
      await postApi(`/api/calls/${callId}`, {
        action: "accept",
      });

      await sendSignal("accept");
    },
    onSuccess: async () => {
      setError(null);

      // 🔥 Разблокируем звук сразу по клику "Принять"
      unlockAudio();

      try {
        await getMedia(
          callQuery.data?.call.kind === "video",
        );

        await createPeer();

        setStatus("connecting");
      } catch (err) {
        console.error("[UZON CALL] Accept failed:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Не удалось подключить микрофон",
        );
      }
    },
    onError: (err: Error) => {
      setError(err.message);

      if (err.message.includes("no longer ringing")) {
        setStatus("ended");
      }
    },
  });

  const declineCall = useMutation({
    mutationFn: () =>
      postApi(`/api/calls/${callId}`, {
        action: "decline",
      }),
    onSuccess: () => {
      cleanup();
      setStatus("declined");
      queryClient.invalidateQueries({ queryKey: qk.calls });
    },
    onError: (err: Error) => setError(err.message),
  });

  // Сбрасываем локальные ресурсы при смене вызова и размонтировании.
  useEffect(() => {
    mountedRef.current = true;
    isCleaningUp.current = false;

    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [callId, cleanup]);

  // Загружаем локальную камеру у участника видеозвонка.
  useEffect(() => {
    const call = callQuery.data?.call;

    if (!call || isCleaningUp.current) return;

    if (
      !call.isInitiator &&
      call.kind === "video" &&
      !streamRef.current
    ) {
      void getMedia(true).catch((err) => {
        console.error("[UZON CALL] Camera setup failed:", err);
        toast(t("call.permissionDenied"), "error");
      });
    }
  }, [
    callQuery.data?.call.id,
    callQuery.data?.call.kind,
    callQuery.data?.call.isInitiator,
    getMedia,
    t,
    toast,
  ]);

  // Синхронизируем статус вызова с сервером.
  useEffect(() => {
    const serverStatus =
      signalQuery.data?.status ??
      callQuery.data?.call.status;

    if (!serverStatus || isCleaningUp.current) return;

    if (TERMINAL_STATUSES.includes(serverStatus)) {
      setStatus(serverStatus);
      cleanup();
      return;
    }

    if (
      serverStatus === "ringing" ||
      serverStatus === "connecting"
    ) {
      setStatus((current) =>
        current === "active" ? current : serverStatus,
      );
    }
  }, [
    signalQuery.data?.status,
    callQuery.data?.call.status,
    cleanup,
  ]);

  // Обрабатываем сигналы строго последовательно.
  useEffect(() => {
    const signals = signalQuery.data?.signals ?? [];
    const call = callQuery.data?.call;

    if (
      !signals.length ||
      !call ||
      isCleaningUp.current ||
      processingSignals.current
    ) {
      return;
    }

    processingSignals.current = true;

    void (async () => {
      try {
        for (const signal of signals) {
          if (
            isCleaningUp.current ||
            processedSignals.current.has(signal.id)
          ) {
            continue;
          }

          try {
            if (
              signal.type === "accept" &&
              call.isInitiator
            ) {
              const pc = await createPeer();

              if (!pc.localDescription) {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);

                if (pc.localDescription) {
                  await sendSignal("offer", {
                    sdp: pc.localDescription,
                  });
                }
              }

              setStatus("connecting");
            } else if (
              signal.type === "offer" &&
              !call.isInitiator
            ) {
              const pc = await createPeer();

              const sdp = signal.payload
                .sdp as RTCSessionDescriptionInit | undefined;

              if (!sdp) {
                throw new Error("В offer отсутствует SDP");
              }

              if (
                !pc.remoteDescription ||
                pc.remoteDescription.type !== sdp.type
              ) {
                await pc.setRemoteDescription(
                  new RTCSessionDescription(sdp),
                );

                await flushPendingIceCandidates(pc);
              }

              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);

              if (pc.localDescription) {
                await sendSignal("answer", {
                  sdp: pc.localDescription,
                });
              }

              setStatus("connecting");
            } else if (signal.type === "answer") {
              const pc = pcRef.current;

              const sdp = signal.payload
                .sdp as RTCSessionDescriptionInit | undefined;

              if (!pc || !sdp) {
                throw new Error(
                  "Получен answer до создания PeerConnection",
                );
              }

              if (!pc.currentRemoteDescription) {
                await pc.setRemoteDescription(
                  new RTCSessionDescription(sdp),
                );

                await flushPendingIceCandidates(pc);
              }
            } else if (signal.type === "ice") {
              const pc = pcRef.current;

              const candidate = signal.payload
                .candidate as RTCIceCandidateInit | undefined;

              if (candidate) {
                if (!pc || !pc.remoteDescription) {
                  pendingIceCandidates.current.push(candidate);
                } else {
                  await pc.addIceCandidate(
                    new RTCIceCandidate(candidate),
                  );
                }
              }
            } else if (
              signal.type === "end" ||
              signal.type === "decline"
            ) {
              cleanup();

              setStatus(
                signal.type === "decline"
                  ? "declined"
                  : "ended",
              );
            }

            processedSignals.current.add(signal.id);
          } catch (err) {
            console.error(
              "[UZON CALL] Signal processing failed:",
              signal.type,
              signal.id,
              err,
            );

            setError(
              err instanceof Error
                ? err.message
                : "Ошибка обработки сигнала",
            );
          }
        }
      } finally {
        processingSignals.current = false;
      }
    })();
  }, [
    signalQuery.data,
    callQuery.data?.call.id,
    callQuery.data?.call.isInitiator,
    createPeer,
    sendSignal,
    flushPendingIceCandidates,
    cleanup,
  ]);

  // Таймер работает только после фактического подключения WebRTC.
  useEffect(() => {
    if (status !== "active") return;

    const answeredAt = callQuery.data?.call.answeredAt;
    const startTime = answeredAt
      ? new Date(answeredAt).getTime()
      : Date.now();

    const updateElapsed = () => {
      setElapsed(Math.max(0, Date.now() - startTime));
    };

    updateElapsed();

    const timer = window.setInterval(updateElapsed, 1000);

    return () => window.clearInterval(timer);
  }, [status, callQuery.data?.call.answeredAt]);

  const kind = callQuery.data?.call.kind ?? "audio";
  const peer = callQuery.data?.peer;
  const ringing =
    status === "ringing" ||
    (
      status === "connecting" &&
      callQuery.data?.call.status === "ringing"
    );

  const finished = TERMINAL_STATUSES.includes(status);

  const statusLabel =
    status === "active"
      ? fmt.duration(elapsed)
      : status === "ringing"
        ? "Входящий вызов..."
        : status === "declined"
          ? "Отклонён"
          : status === "missed"
            ? "Пропущен"
            : status === "failed"
              ? "Ошибка соединения"
              : status === "ended"
                ? "Вызов завершён"
                : "Соединение...";

  return (
    <div
      className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[#0f1115] text-white"
      onClick={unlockAudio}
      onTouchStart={unlockAudio}
    >
      {/* 🔥 ИСПРАВЛЕНИЕ ЗВУКА: убраны opacity-0 и h-px, теперь просто hidden */}
      <audio
        ref={remoteAudio}
        autoPlay
        playsInline
        className="hidden"
      />

      <video
        ref={remoteVideo}
        autoPlay
        playsInline
        className={cn(
          "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
          status !== "active" && "opacity-0",
          kind !== "video" && "hidden",
        )}
      />

      <div
        className={cn(
          "absolute inset-0 z-10 flex flex-col items-center justify-center transition-opacity",
          status === "active" && kind === "video" &&
            "opacity-0 pointer-events-none",
        )}
      >
        <div className="relative mb-6">
          <div className="absolute inset-0 animate-ping rounded-full bg-white/10" />
          <Avatar
            name={peer?.displayName ?? "UZON"}
            url={peer?.avatarUrl}
            size={120}
            className="shadow-2xl ring-4 ring-white/10"
          />
        </div>

        <h2 className="text-2xl font-semibold">
          {peer?.displayName ?? "UZON"}
        </h2>

        <p className="mt-2 text-white/60">{statusLabel}</p>

        {iceWarning && !finished && (
          <p className="mt-4 px-4 text-center text-xs text-yellow-400">
            TURN-сервер не обнаружен в настройках. Соединение
            между разными сетями может не работать.
          </p>
        )}

        {error && !finished && (
          <p className="mt-3 max-w-sm px-5 text-center text-sm text-red-300">
            {error}
          </p>
        )}
      </div>

      {kind === "video" && (
        <div
          className={cn(
            "absolute right-4 top-20 z-20 h-40 w-28 overflow-hidden rounded-2xl border-2 border-white/10 bg-black shadow-2xl",
            (!camOn || finished) && "opacity-0 translate-y-4",
          )}
        >
          <video
            ref={localVideo}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
        </div>
      )}

      <div className="relative z-30 flex items-start justify-between bg-gradient-to-b from-black/60 to-transparent p-4">
        <div className="flex items-center gap-3">
          <Avatar
            name={peer?.displayName ?? "UZON"}
            url={peer?.avatarUrl}
            size={40}
          />

          <div>
            <p className="text-sm font-semibold">
              {peer?.displayName ?? "UZON"}
            </p>
            <p className="text-xs text-white/60">{statusLabel}</p>
          </div>
        </div>

        <Link href="/messages" onClick={cleanup}>
          <button
            type="button"
            aria-label="Закрыть экран звонка"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
        </Link>
      </div>

      <div className="relative z-30 mt-auto border-t border-white/5 bg-[#1c1c1e]/90 px-6 pb-8 pt-4 backdrop-blur-xl">
        {audioBlocked && !finished && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              unlockAudio();
            }}
            className="mb-4 w-full animate-pulse rounded-xl bg-yellow-500 px-4 py-3 text-sm font-bold text-black"
          >
            Нажмите сюда, чтобы включить звук
          </button>
        )}

        {ringing && !callQuery.data?.call.isInitiator ? (
          <div className="flex justify-center gap-6">
            <button
              type="button"
              onClick={() => declineCall.mutate()}
              disabled={declineCall.isPending}
              aria-label="Отклонить вызов"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-[#ff3b30] text-white shadow-lg transition active:scale-95"
            >
              <PhoneOff className="h-7 w-7" />
            </button>

            <button
              type="button"
              onClick={() => acceptCall.mutate()}
              disabled={acceptCall.isPending}
              aria-label="Принять вызов"
              className="flex h-16 w-16 animate-bounce items-center justify-center rounded-full bg-[#34c759] text-white shadow-lg active:scale-95"
            >
              <Mic className="h-7 w-7" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between px-2">
            <button
              type="button"
              aria-label={micOn ? "Выключить микрофон" : "Включить микрофон"}
              onClick={() => {
                const next = !micOn;
                setMicOn(next);

                streamRef.current
                  ?.getAudioTracks()
                  .forEach((track) => {
                    track.enabled = next;
                  });
              }}
              className={cn(
                "flex h-14 w-14 items-center justify-center rounded-full transition active:scale-95",
                micOn
                  ? "bg-white/10 text-white"
                  : "bg-white text-black",
              )}
            >
              {micOn
                ? <Mic className="h-6 w-6" />
                : <MicOff className="h-6 w-6" />}
            </button>

            <button
              type="button"
              onClick={() => endCall.mutate()}
              disabled={finished || endCall.isPending}
              aria-label="Завершить вызов"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-[#ff3b30] text-white shadow-lg transition active:scale-95 disabled:opacity-50"
            >
              <PhoneOff className="h-7 w-7" />
            </button>

            {kind === "video" ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-label={camOn ? "Выключить камеру" : "Включить камеру"}
                  onClick={() => {
                    const next = !camOn;
                    setCamOn(next);

                    streamRef.current
                      ?.getVideoTracks()
                      .forEach((track) => {
                        track.enabled = next;
                      });
                  }}
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-full transition",
                    camOn
                      ? "bg-white/10 text-white"
                      : "bg-white text-black",
                  )}
                >
                  {camOn
                    ? <Video className="h-6 w-6" />
                    : <VideoOff className="h-6 w-6" />}
                </button>

                <button
                  type="button"
                  aria-label="Переключить камеру"
                  onClick={async () => {
                    facing.current =
                      facing.current === "user"
                        ? "environment"
                        : "user";

                    try {
                      await streamRef.current
                        ?.getVideoTracks()[0]
                        ?.applyConstraints({
                          facingMode: facing.current,
                        });
                    } catch (err) {
                      console.warn(
                        "[UZON CALL] Camera switch failed:",
                        err,
                      );
                    }
                  }}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-white"
                >
                  <SwitchCamera className="h-6 w-6" />
                </button>
              </div>
            ) : (
              <div className="h-14 w-14" />
            )}
          </div>
        )}
      </div>

      {finished && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md">
          <p className="mb-6 text-xl font-semibold text-white">
            {statusLabel}
          </p>

          <Link href="/messages" onClick={cleanup}>
            <Button
              size="lg"
              className="bg-white text-black hover:bg-gray-200"
            >
              Вернуться в чат
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

export function IncomingCallHost() {
  const { t, user } = useApp();

  const query = useQuery({
    queryKey: ["incoming-call"],
    queryFn: () =>
      get<{
        incoming: {
          id: string;
          kind: string;
          peer: {
            displayName: string;
            username: string;
            avatarUrl: string | null;
          };
        }[];
      }>("/api/calls?scope=inbox"),
    enabled: Boolean(user),
    refetchInterval: 5000,
  });

  const incoming = query.data?.incoming?.[0];

  if (!incoming || !user) return null;

  return (
    <div className="animate-fade-up fixed inset-x-3 top-16 z-[80] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-2xl">
      <Avatar
        name={incoming.peer.displayName}
        url={incoming.peer.avatarUrl}
        size={40}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">
          {incoming.peer.displayName}
        </p>
        <p className="text-[11px] text-muted">
          {t("call.incoming")} ·{" "}
          {incoming.kind === "video"
            ? t("call.video")
            : t("call.audio")}
        </p>
      </div>

      <Link href={`/calls/${incoming.id}`}>
        <Button size="sm">{t("call.accept")}</Button>
      </Link>
    </div>
  );
}