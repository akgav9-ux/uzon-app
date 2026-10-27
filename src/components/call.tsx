
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
  Volume2,
  VolumeX,
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
  urls: string[];
  username?: string;
  credential?: string;
};

const FINISHED_STATUSES = [
  "ended",
  "declined",
  "missed",
  "failed",
];

export function CallScreen({ callId }: { callId: string }) {
  const { t, fmt, toast } = useApp();
  const queryClient = useQueryClient();

  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const remoteAudio = useRef<HTMLAudioElement>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const processedSignals = useRef<Set<string>>(new Set());
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const processingSignals = useRef(false);
  const isCleaningUp = useRef(false);
  const facing = useRef<"user" | "environment">("user");
  const mounted = useRef(false);
  const offerStarted = useRef(false);

  const [status, setStatus] = useState("connecting");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [iceWarning, setIceWarning] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [connectionState, setConnectionState] =
    useState<RTCPeerConnectionState>("new");

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
  });

  const signalQuery = useQuery({
    queryKey: qk.callSignals(callId),
    queryFn: () =>
      get<{ status: string; signals: Signal[] }>(
        `/api/calls/${callId}/signals`,
      ),
    refetchInterval: 1000,
    enabled: !isCleaningUp.current,
  });

  const iceServers: IceServer[] =
    configQuery.data?.config.iceServers ?? [
      { urls: ["stun:stun.l.google.com:19302"] },
    ];

  useEffect(() => {
    setIceWarning(
      !iceServers.some((server) =>
        server.urls.some((url) => url.toLowerCase().startsWith("turn:") ||
          url.toLowerCase().startsWith("turns:")),
      ),
    );
  }, [configQuery.data]);

  const sendSignal = useCallback(
    async (type: string, payload: Record<string, unknown> = {}) => {
      await postApi(`/api/calls/${callId}/signals`, { type, payload });
    },
    [callId],
  );

  const getMedia = useCallback(
    async (video: boolean): Promise<MediaStream> => {
      if (streamRef.current) {
        const stream = streamRef.current;

        if (video && !stream.getVideoTracks().length) {
          const videoStream =
            await navigator.mediaDevices.getUserMedia({
              video: { facingMode: facing.current },
              audio: false,
            });

          const track = videoStream.getVideoTracks()[0];
          if (track) stream.addTrack(track);

          if (localVideo.current) {
            localVideo.current.srcObject = stream;
          }
        }

        return stream;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Браузер не поддерживает доступ к камере и микрофону.");
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: video
            ? { facingMode: { ideal: facing.current } }
            : false,
        });

        stream.getAudioTracks().forEach((track) => {
          track.enabled = micOn;
        });

        stream.getVideoTracks().forEach((track) => {
          track.enabled = camOn;
        });

        streamRef.current = stream;

        if (localVideo.current && video) {
          localVideo.current.srcObject = stream;
          void localVideo.current.play().catch(() => undefined);
        }

        return stream;
      } catch (cause) {
        const message =
          cause instanceof Error
            ? cause.message
            : t("call.permissionDenied");

        setError(message);
        throw cause;
      }
    },
    [camOn, micOn, t],
  );

  const playRemoteAudio = useCallback(async () => {
    const audio = remoteAudio.current;
    if (!audio || !audio.srcObject) return;

    try {
      audio.muted = false;
      audio.volume = 1;

      if ("setSinkId" in audio && !speakerOn) {
        const setSinkId = (
          audio as HTMLAudioElement & {
            setSinkId?: (sinkId: string) => Promise<void>;
          }
        ).setSinkId;

        if (setSinkId) {
          try {
            await setSinkId("default");
          } catch {
            // Не все браузеры разрешают менять аудиовыход.
          }
        }
      }

      await audio.play();
      setAudioBlocked(false);
    } catch (cause) {
      console.warn("Не удалось запустить удалённое аудио:", cause);
      setAudioBlocked(true);
    }
  }, [speakerOn]);

  const attachRemoteStream = useCallback(
    (stream: MediaStream) => {
      remoteStreamRef.current = stream;

      if (remoteVideo.current && remoteVideo.current.srcObject !== stream) {
        remoteVideo.current.srcObject = stream;
        void remoteVideo.current.play().catch(() => undefined);
      }

      if (remoteAudio.current && remoteAudio.current.srcObject !== stream) {
        remoteAudio.current.srcObject = stream;
        void playRemoteAudio();
      }
    },
    [playRemoteAudio],
  );

  const flushPendingIce = useCallback(async (pc: RTCPeerConnection) => {
    if (!pc.remoteDescription) return;

    const candidates = pendingIce.current.splice(0);

    for (const candidate of candidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (cause) {
        console.warn("Не удалось применить ICE-кандидат:", cause);
      }
    }
  }, []);

  const createPeer = useCallback(async () => {
    if (pcRef.current) return pcRef.current;

    const kind = callQuery.data?.call.kind ?? "audio";
    const pc = new RTCPeerConnection({ iceServers });

    pcRef.current = pc;

    try {
      const stream = await getMedia(kind === "video");

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });
    } catch (cause) {
      pc.close();
      pcRef.current = null;
      throw cause;
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && !isCleaningUp.current) {
        void sendSignal("ice", {
          candidate: event.candidate.toJSON(),
        }).catch((cause) => {
          console.error("Не удалось отправить ICE-кандидат:", cause);
        });
      }
    };

    pc.ontrack = (event) => {
      let stream = event.streams[0];

      if (!stream) {
        stream = remoteStreamRef.current ?? new MediaStream();
        if (!stream.getTracks().some((track) => track.id === event.track.id)) {
          stream.addTrack(event.track);
        }
      }

      attachRemoteStream(stream);

      event.track.onunmute = () => {
        if (event.track.kind === "audio") {
          void playRemoteAudio();
        }
      };
    };

    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState);

      if (pc.connectionState === "connected") {
        setStatus("active");
        setError(null);
      } else if (pc.connectionState === "failed") {
        setError(t("call.iceWarning"));
        setStatus("failed");
      } else if (
        pc.connectionState === "disconnected" &&
        !isCleaningUp.current
      ) {
        setError("Связь прервалась. Пытаемся восстановить соединение…");
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") {
        setError(
          "Не удалось установить медиасоединение. Проверьте TURN и сеть обоих участников.",
        );
      }
    };

    return pc;
  }, [
    attachRemoteStream,
    callQuery.data?.call.kind,
    getMedia,
    iceServers,
    playRemoteAudio,
    sendSignal,
    t,
  ]);

  const cleanup = useCallback(() => {
    if (isCleaningUp.current) return;

    isCleaningUp.current = true;

    const pc = pcRef.current;
    pcRef.current = null;

    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.close();
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    remoteStreamRef.current = null;
    pendingIce.current = [];

    if (localVideo.current) localVideo.current.srcObject = null;
    if (remoteVideo.current) remoteVideo.current.srcObject = null;

    if (remoteAudio.current) {
      remoteAudio.current.pause();
      remoteAudio.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      cleanup();
    };
  }, [cleanup]);

  // Синхронизируем состояние завершения с сервером.
  useEffect(() => {
    const serverStatus =
      signalQuery.data?.status ?? callQuery.data?.call.status;

    if (!serverStatus || isCleaningUp.current) return;

    if (FINISHED_STATUSES.includes(serverStatus)) {
      setStatus(serverStatus);
      cleanup();
      return;
    }

    // Статус сервера active означает, что собеседник принял вызов,
    // но само WebRTC-соединение ещё может устанавливаться.
    if (
      serverStatus === "active" &&
      pcRef.current?.connectionState !== "connected"
    ) {
      setStatus("connecting");
    } else if (serverStatus === "ringing" && status !== "active") {
      setStatus("ringing");
    }
  }, [
    signalQuery.data?.status,
    callQuery.data?.call.status,
    cleanup,
  ]);

  // Обработка SDP и ICE-сигналов.
  useEffect(() => {
    const signals = signalQuery.data?.signals ?? [];
    const call = callQuery.data?.call;

    if (!call || !signals.length || isCleaningUp.current) return;
    if (processingSignals.current) return;

    processingSignals.current = true;

    void (async () => {
      try {
        for (const signal of signals) {
          if (processedSignals.current.has(signal.id)) continue;
          if (isCleaningUp.current) break;

          try {
            if (signal.type === "accept" && call.isInitiator) {
              if (offerStarted.current) {
                processedSignals.current.add(signal.id);
                continue;
              }

              offerStarted.current = true;

              const pc = await createPeer();
              const offer = await pc.createOffer();

              await pc.setLocalDescription(offer);

              await sendSignal("offer", {
                sdp: pc.localDescription,
              });

              setStatus("connecting");
            } else if (signal.type === "offer" && !call.isInitiator) {
              const pc = await createPeer();

              if (!pc.currentRemoteDescription) {
                const sdp = signal.payload.sdp as
                  | RTCSessionDescriptionInit
                  | undefined;

                if (!sdp) throw new Error("В сигнале offer отсутствует SDP.");

                await pc.setRemoteDescription(
                  new RTCSessionDescription(sdp),
                );

                await flushPendingIce(pc);

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                await sendSignal("answer", {
                  sdp: pc.localDescription,
                });
              }
            } else if (signal.type === "answer" && call.isInitiator) {
              const pc = pcRef.current;
              const sdp = signal.payload.sdp as
                | RTCSessionDescriptionInit
                | undefined;

              if (pc && sdp && !pc.currentRemoteDescription) {
                await pc.setRemoteDescription(
                  new RTCSessionDescription(sdp),
                );

                await flushPendingIce(pc);
              }
            } else if (signal.type === "ice") {
              const candidate = signal.payload.candidate as
                | RTCIceCandidateInit
                | undefined;

              if (candidate) {
                const pc = await createPeer();

                if (pc.remoteDescription) {
                  try {
                    await pc.addIceCandidate(
                      new RTCIceCandidate(candidate),
                    );
                  } catch (cause) {
                    console.warn("Ошибка ICE-кандидата:", cause);
                  }
                } else {
                  pendingIce.current.push(candidate);
                }
              }
            } else if (signal.type === "decline") {
              setStatus("declined");
              cleanup();
            } else if (signal.type === "end") {
              setStatus("ended");
              cleanup();
            }

            processedSignals.current.add(signal.id);
          } catch (cause) {
            // Не отмечаем сигнал обработанным при ошибке:
            // он сможет быть обработан повторно после следующего опроса.
            console.error(`Ошибка сигнала ${signal.type}:`, cause);
            setError(
              cause instanceof Error
                ? cause.message
                : "Не удалось обработать сигнал звонка.",
            );
          }
        }
      } finally {
        processingSignals.current = false;
      }
    })();
  }, [
    signalQuery.data?.signals,
    callQuery.data?.call,
    createPeer,
    sendSignal,
    flushPendingIce,
    cleanup,
  ]);

  // Для аудиозвонка не включаем камеру автоматически.
  // Для входящего видеозвонка готовим локальное превью до ответа.
  useEffect(() => {
    const call = callQuery.data?.call;
    if (!call || isCleaningUp.current) return;

    if (!call.isInitiator && call.kind === "video" && !streamRef.current) {
      void getMedia(true).catch(() => {
        toast(t("call.permissionDenied"), "error");
      });
    }
  }, [
    callQuery.data?.call.id,
    callQuery.data?.call.isInitiator,
    callQuery.data?.call.kind,
    getMedia,
    toast,
    t,
  ]);

  useEffect(() => {
    if (status !== "active") return;

    const answeredAt = callQuery.data?.call.answeredAt;
    const startTime = answeredAt
      ? new Date(answeredAt).getTime()
      : Date.now();

    const updateTimer = () => {
      setElapsed(Math.max(0, Date.now() - startTime));
    };

    updateTimer();
    const timer = window.setInterval(updateTimer, 1000);

    return () => window.clearInterval(timer);
  }, [status, callQuery.data?.call.answeredAt]);

  const unlockAudio = useCallback(() => {
    void playRemoteAudio();
  }, [playRemoteAudio]);

  const endCall = useMutation({
    mutationFn: () =>
      postApi(`/api/calls/${callId}`, { action: "end" }),
    onSuccess: () => {
      cleanup();
      setStatus("ended");
      queryClient.invalidateQueries({ queryKey: qk.calls });
      queryClient.invalidateQueries({ queryKey: qk.call(callId) });
    },
    onError: (cause: Error) => {
      setError(cause.message);
      cleanup();
      setStatus("ended");
    },
  });

  const acceptCall = useMutation({
    mutationFn: async () => {
      // API принимает вызов и, согласно исправленной серверной логике,
      // публикует accept-сигнал. Не отправляем accept повторно из клиента.
      await postApi(`/api/calls/${callId}`, { action: "accept" });
    },
    onSuccess: async () => {
      setError(null);
      setStatus("connecting");
      await queryClient.invalidateQueries({
        queryKey: qk.call(callId),
      });
      await queryClient.invalidateQueries({
        queryKey: qk.callSignals(callId),
      });

      // Создаём медиасоединение сразу после ответа пользователя.
      try {
        await createPeer();
        await playRemoteAudio();
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : t("call.permissionDenied"),
        );
      }
    },
    onError: (cause: Error) => {
      setError(cause.message);
      if (cause.message.toLowerCase().includes("ringing")) {
        setStatus("ended");
      }
    },
  });

  const declineCall = useMutation({
    mutationFn: () =>
      postApi(`/api/calls/${callId}`, { action: "decline" }),
    onSuccess: () => {
      cleanup();
      setStatus("declined");
      queryClient.invalidateQueries({ queryKey: qk.calls });
    },
    onError: (cause: Error) => setError(cause.message),
  });

  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
  };

  const toggleCamera = async () => {
    const next = !camOn;

    try {
      if (next && !streamRef.current?.getVideoTracks().length) {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing.current } },
          audio: false,
        });

        const newTrack = videoStream.getVideoTracks()[0];
        if (!newTrack) throw new Error("Камера не вернула видеотрек.");

        if (!streamRef.current) {
          streamRef.current = new MediaStream();
        }

        streamRef.current.addTrack(newTrack);

        const pc = pcRef.current;
        const sender = pc
          ?.getSenders()
          .find((item) => item.track?.kind === "video");

        if (sender) {
          await sender.replaceTrack(newTrack);
        } else if (pc) {
          pc.addTrack(newTrack, streamRef.current);
        }

        if (localVideo.current) {
          localVideo.current.srcObject = streamRef.current;
          await localVideo.current.play().catch(() => undefined);
        }
      }

      streamRef.current?.getVideoTracks().forEach((track) => {
        track.enabled = next;
      });

      setCamOn(next);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t("call.permissionDenied"),
      );
    }
  };

  const switchCamera = async () => {
    const stream = streamRef.current;
    const oldTrack = stream?.getVideoTracks()[0];

    facing.current =
      facing.current === "user" ? "environment" : "user";

    try {
      const replacementStream =
        await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: facing.current } },
          audio: false,
        });

      const newTrack = replacementStream.getVideoTracks()[0];
      if (!newTrack || !stream) return;

      const sender = pcRef.current
        ?.getSenders()
        .find((item) => item.track?.kind === "video");

      if (sender) await sender.replaceTrack(newTrack);

      if (oldTrack) {
        stream.removeTrack(oldTrack);
        oldTrack.stop();
      }

      stream.addTrack(newTrack);
      newTrack.enabled = camOn;

      if (localVideo.current) {
        localVideo.current.srcObject = stream;
        await localVideo.current.play().catch(() => undefined);
      }
    } catch (cause) {
      facing.current =
        facing.current === "user" ? "environment" : "user";

      setError(
        cause instanceof Error
          ? `Не удалось переключить камеру: ${cause.message}`
          : "Не удалось переключить камеру.",
      );
    }
  };

  const toggleSpeaker = () => {
    // В мобильных браузерах выбор динамика/разговорного динамика
    // часто контролируется самой ОС и не имеет универсального API.
    setSpeakerOn((current) => !current);
    void playRemoteAudio();
  };

  const kind = callQuery.data?.call.kind ?? "audio";
  const peer = callQuery.data?.peer;
  const ringing = status === "ringing";
  const finished = FINISHED_STATUSES.includes(status);
  const connected =
    connectionState === "connected" && status === "active";

  const statusLabel =
    connected
      ? fmt.duration(elapsed)
      : ringing
        ? "Вызов…"
        : status === "declined"
          ? "Вызов отклонён"
          : status === "missed"
            ? "Пропущенный вызов"
            : status === "failed"
              ? "Ошибка соединения"
              : connectionState === "connecting" ||
                  connectionState === "new"
                ? "Соединение…"
                : "Ожидание ответа…";

  return (
    <main
      className="fixed inset-0 z-[100] flex h-[100dvh] w-full flex-col overflow-hidden bg-[#080a0f] text-white"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      onClick={unlockAudio}
      onTouchStart={unlockAudio}
    >
      <audio
        ref={remoteAudio}
        autoPlay
        playsInline
        className="sr-only"
      />

      {kind === "video" && (
        <video
          ref={remoteVideo}
          autoPlay
          playsInline
          className={cn(
            "absolute inset-0 h-full w-full object-cover",
            !connected && "opacity-0",
          )}
        />
      )}

      <div
        className={cn(
          "absolute inset-0 flex flex-col items-center justify-center px-6 transition-opacity",
          kind === "video" && connected && "opacity-0 pointer-events-none",
        )}
      >
        <div className="relative mb-6">
          <div className="absolute -inset-4 animate-pulse rounded-full bg-white/[0.04]" />
          <Avatar
            name={peer?.displayName ?? "UZON"}
            url={peer?.avatarUrl}
            size={120}
            className="relative ring-4 ring-white/10 shadow-2xl"
          />
        </div>

        <h1 className="text-center text-2xl font-semibold">
          {peer?.displayName ?? "UZON"}
        </h1>

        <p className="mt-2 text-sm text-white/65">{statusLabel}</p>

        {kind === "video" && !connected && (
          <p className="mt-2 text-xs text-white/45">
            Видеозвонок
          </p>
        )}
      </div>

      <header className="relative z-20 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-4 pb-8 pt-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar
            name={peer?.displayName ?? "UZON"}
            url={peer?.avatarUrl}
            size={42}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {peer?.displayName ?? "UZON"}
            </p>
            <p className="text-xs text-white/65">{statusLabel}</p>
          </div>
        </div>

        <Link
          href="/messages"
          aria-label="Закрыть экран звонка"
          onClick={() => {
            if (!finished) {
              void endCall.mutateAsync().catch(() => undefined);
            } else {
              cleanup();
            }
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10"
        >
          <X className="h-5 w-5" />
        </Link>
      </header>

      {kind === "video" && (
        <div
          className={cn(
            "absolute right-4 top-20 z-20 h-40 w-28 overflow-hidden rounded-2xl border border-white/20 bg-[#1c1c1e] shadow-2xl sm:h-52 sm:w-36",
            (!camOn || finished) && "hidden",
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

      {error && !finished && (
        <div className="relative z-30 mx-4 mt-2 rounded-xl border border-white/10 bg-black/65 px-4 py-3 text-sm text-white/90">
          {error}
          <button
            className="ml-2 underline"
            onClick={() => setError(null)}
          >
            Закрыть
          </button>
        </div>
      )}

      {iceWarning && !finished && (
        <div className="relative z-30 mx-4 mt-2 rounded-xl bg-amber-500/15 px-3 py-2 text-xs text-amber-200">
          TURN-сервер не обнаружен в конфигурации. В некоторых сетях звонок
          может не соединиться.
        </div>
      )}

      <section className="relative z-30 mt-auto rounded-t-[28px] border-t border-white/10 bg-[#14161c]/95 px-5 pb-5 pt-5 backdrop-blur-2xl">
        {audioBlocked && !finished && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              unlockAudio();
            }}
            className="mb-4 w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-semibold text-black"
          >
            Нажмите, чтобы включить звук
          </button>
        )}

        {ringing && !callQuery.data?.call.isInitiator ? (
          <div className="flex items-center justify-center gap-12 py-3">
            <button
              aria-label="Отклонить вызов"
              onClick={() => declineCall.mutate()}
              disabled={declineCall.isPending}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-[#ff453a] shadow-lg transition active:scale-95 disabled:opacity-50"
            >
              <PhoneOff className="h-7 w-7" />
            </button>

            <button
              aria-label="Принять вызов"
              onClick={() => acceptCall.mutate()}
              disabled={acceptCall.isPending}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-[#30d158] shadow-lg transition active:scale-95 disabled:opacity-50"
            >
              <Mic className="h-7 w-7" />
            </button>
          </div>
        ) : (
          <>
            <div className="mb-5 flex items-center justify-center gap-3">
              <button
                aria-label={micOn ? "Выключить микрофон" : "Включить микрофон"}
                onClick={toggleMic}
                className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-full transition active:scale-95",
                  micOn ? "bg-white/10" : "bg-white text-black",
                )}
              >
                {micOn ? (
                  <Mic className="h-6 w-6" />
                ) : (
                  <MicOff className="h-6 w-6" />
                )}
              </button>

              <button
                aria-label={speakerOn ? "Режим громкой связи" : "Обычный режим звука"}
                onClick={toggleSpeaker}
                className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-full transition active:scale-95",
                  speakerOn ? "bg-white/10" : "bg-white text-black",
                )}
              >
                {speakerOn ? (
                  <Volume2 className="h-6 w-6" />
                ) : (
                  <VolumeX className="h-6 w-6" />
                )}
              </button>

              {kind === "video" && (
                <button
                  aria-label={camOn ? "Выключить камеру" : "Включить камеру"}
                  onClick={() => void toggleCamera()}
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-full transition active:scale-95",
                    camOn ? "bg-white/10" : "bg-white text-black",
                  )}
                >
                  {camOn ? (
                    <Video className="h-6 w-6" />
                  ) : (
                    <VideoOff className="h-6 w-6" />
                  )}
                </button>
              )}

              {kind === "video" && (
                <button
                  aria-label="Переключить камеру"
                  onClick={() => void switchCamera()}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 transition active:scale-95"
                >
                  <SwitchCamera className="h-6 w-6" />
                </button>
              )}
            </div>

            <button
              onClick={() => endCall.mutate()}
              disabled={endCall.isPending || finished}
              className="mx-auto flex h-16 w-[min(220px,70%)] items-center justify-center gap-3 rounded-full bg-[#ff453a] font-semibold shadow-lg transition active:scale-95 disabled:opacity-50"
            >
              <PhoneOff className="h-6 w-6" />
              Завершить
            </button>
          </>
        )}

        <p className="mt-4 text-center text-[11px] text-white/35">
          UZON · защищённый экран звонка
        </p>
      </section>

      {finished && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 px-6 backdrop-blur-md">
          <Avatar
            name={peer?.displayName ?? "UZON"}
            url={peer?.avatarUrl}
            size={88}
          />
          <p className="mb-6 mt-5 text-xl font-semibold">{statusLabel}</p>
          <Link href="/messages" onClick={cleanup}>
            <Button size="lg" className="bg-white text-black hover:bg-gray-200">
              Вернуться в чат
            </Button>
          </Link>
        </div>
      )}
    </main>
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
          {incoming.kind === "video" ? t("call.video") : t("call.audio")}
        </p>
      </div>

      <Link href={`/calls/${incoming.id}`}>
        <Button size="sm">{t("call.accept")}</Button>
      </Link>
    </div>
  );
}
