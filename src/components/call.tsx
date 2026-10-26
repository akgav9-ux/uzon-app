"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mic, MicOff, PhoneOff, SwitchCamera, Video, VideoOff, X } from "lucide-react";
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
  peer: { displayName: string; username: string; avatarUrl: string | null } | null;
};
type Signal = { id: string; type: string; payload: Record<string, unknown>; fromUserId: string; createdAt: string };
type IceServer = { urls: string[]; username?: string; credential?: string };

export function CallScreen({ callId }: { callId: string }) {
  const { t, fmt, toast } = useApp();
  const queryClient = useQueryClient();
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const processedSignals = useRef<Set<string>>(new Set());
  const isCleaningUp = useRef(false);
  const facing = useRef<"user" | "environment">("user");
  const audioContextRef = useRef<AudioContext | null>(null);

  const [status, setStatus] = useState<string>("connecting");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [iceWarning, setIceWarning] = useState(false);

  const callQuery = useQuery({ queryKey: qk.call(callId), queryFn: () => get<CallState>(`/api/calls/${callId}`) });
  const configQuery = useQuery({ queryKey: qk.config, queryFn: () => get<{ config: { iceServers: IceServer[]; demoMode: boolean } }>("/api/config") });
  const signalQuery = useQuery({
    queryKey: qk.callSignals(callId),
    queryFn: () => get<{ status: string; signals: Signal[] }>(`/api/calls/${callId}/signals`),
    refetchInterval: 1200,
    enabled: !["ended", "declined", "missed", "failed"].includes(status),
  });

  const sendSignal = useCallback(
    (type: Signal["type"], payload?: Record<string, unknown>) =>
      postApi(`/api/calls/${callId}/signals`, { type, payload }).catch((err: Error) => setError(err.message)),
    [callId],
  );

  const iceServers: IceServer[] = configQuery.data?.config.iceServers ?? [{ urls: ["stun:stun.l.google.com:19302"] }];
  useEffect(() => {
    setIceWarning(!iceServers.some((server) => server.urls.some((url) => url.startsWith("turn"))));
  }, [iceServers]);

  // 🔥 Разблокировка звука для iOS/Safari
  const unlockAudio = useCallback(() => {
    if (!audioContextRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioContextRef.current = new AudioCtx();
      }
    }
    if (audioContextRef.current && audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume().then(() => {
        console.log("🔓 AudioContext resumed");
      }).catch(console.error);
    }
    
    if (remoteVideo.current) {
      remoteVideo.current.play().catch((err) => {
        console.error("❌ Play after unlock failed:", err);
      });
    }
  }, []);

  const getMedia = useCallback(async (video: boolean) => {
    if (streamRef.current) return streamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: video ? { facingMode: facing.current } : false,
      });
      streamRef.current = stream;
      if (localVideo.current && video) localVideo.current.srcObject = stream;
      return stream;
    } catch (err) {
      setError(t("call.permissionDenied"));
      throw err;
    }
  }, [t]);

  const createPeer = useCallback(async () => {
    if (pcRef.current) return pcRef.current;
    const kind = callQuery.data?.call.kind ?? "audio";
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;
    
    const stream = await getMedia(kind === "video");
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    
    pc.onicecandidate = (event) => {
      if (event.candidate) void sendSignal("ice", { candidate: event.candidate.toJSON() });
    };
    
    pc.ontrack = (event) => {
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        
        // Пытаемся включить звук. Если заблокировано - ждем клика.
        remoteVideo.current.play().then(() => {
          console.log("✅ Remote media playing");
        }).catch((err) => {
          console.warn("⚠️ Autoplay blocked:", err.name);
          // Разблокируем по любому клику пользователя
          document.addEventListener("click", unlockAudio, { once: true });
          document.addEventListener("touchstart", unlockAudio, { once: true });
        });
      }
    };
    
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "connected") setStatus("active");
      if (state === "failed") {
        setError(t("call.iceWarning"));
        setStatus("failed");
      }
    };
    return pc;
  }, [callQuery.data?.call.kind, getMedia, iceServers, sendSignal, t, unlockAudio]);

  useEffect(() => {
    if (signalQuery.data?.status && !isCleaningUp.current) {
      const serverStatus = signalQuery.data.status;
      if (serverStatus !== status) {
        setStatus(serverStatus);
        if (["ended", "declined", "missed", "failed"].includes(serverStatus)) {
          cleanup();
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signalQuery.data?.status]);

  useEffect(() => {
    const signals = signalQuery.data?.signals ?? [];
    if (!signals.length || !callQuery.data) return;
    
    void (async () => {
      for (const signal of signals) {
        if (processedSignals.current.has(signal.id)) continue;
        processedSignals.current.add(signal.id);

        try {
          if (signal.type === "accept" && callQuery.data.call.isInitiator) {
            const pc = await createPeer();
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await sendSignal("offer", { sdp: offer });
          }
          if (signal.type === "offer" && !callQuery.data.call.isInitiator) {
            const pc = await createPeer();
            await pc.setRemoteDescription(new RTCSessionDescription(signal.payload.sdp as RTCSessionDescriptionInit));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await sendSignal("answer", { sdp: answer });
          }
          if (signal.type === "answer") {
            const pc = pcRef.current;
            if (pc && !pc.currentRemoteDescription) {
              await pc.setRemoteDescription(new RTCSessionDescription(signal.payload.sdp as RTCSessionDescriptionInit));
            }
          }
          if (signal.type === "ice") {
            const pc = pcRef.current;
            const candidate = signal.payload.candidate as RTCIceCandidateInit;
            if (pc && pc.remoteDescription) await pc.addIceCandidate(candidate).catch(() => undefined);
          }
        } catch (err) {
          console.error("Signal processing error:", err);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signalQuery.data]);

  useEffect(() => {
    if (callQuery.data && !isCleaningUp.current && !signalQuery.data?.status) {
      setStatus(callQuery.data.call.status);
    }
  }, [callQuery.data?.call.status, signalQuery.data?.status]);

  useEffect(() => {
    if (status !== "active") return;
    const startTime = callQuery.data?.call.answeredAt 
      ? new Date(callQuery.data.call.answeredAt).getTime() 
      : Date.now();
      
    const timer = window.setInterval(() => setElapsed(Date.now() - startTime), 1000);
    return () => window.clearInterval(timer);
  }, [status, callQuery.data?.call.answeredAt]);

  function cleanup() {
    if (isCleaningUp.current) return;
    isCleaningUp.current = true;
    
    streamRef.current?.getTracks().forEach((track) => track.stop());
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current = null;
    if (localVideo.current) localVideo.current.srcObject = null;
    if (remoteVideo.current) remoteVideo.current.srcObject = null;
    
    // Закрываем AudioContext
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }

  const endCall = useMutation({
    mutationFn: () => postApi(`/api/calls/${callId}`, { action: "end" }),
    onSuccess: () => {
      cleanup();
      setStatus("ended");
      queryClient.invalidateQueries({ queryKey: qk.calls });
    },
  });
  
  const acceptCall = useMutation({
    mutationFn: () => postApi(`/api/calls/${callId}`, { action: "accept" }).then(() => sendSignal("accept")),
    onSuccess: () => {
      setStatus("active");
      unlockAudio(); // 🔥 Разблокируем звук при нажатии "Принять"
      if (callQuery.data && !callQuery.data.call.isInitiator) {
         createPeer().catch(console.error);
      }
    },
    onError: (err: Error) => {
      setError(err.message);
      if (err.message.includes("no longer ringing")) setStatus("ended");
    },
  });

  const declineCall = useMutation({
    mutationFn: () => postApi(`/api/calls/${callId}`, { action: "decline" }),
    onSuccess: () => {
      cleanup();
      setStatus("declined");
    },
  });

  useEffect(() => {
    if (!callQuery.data || isCleaningUp.current) return;
    const kind = callQuery.data.call.kind;
    if (!callQuery.data.call.isInitiator && kind === "video" && !streamRef.current) {
      getMedia(true).catch(() => toast(t("call.permissionDenied"), "error"));
    }
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callQuery.data?.call.id]);

  const kind = callQuery.data?.call.kind ?? "audio";
  const peer = callQuery.data?.peer;
  const ringing = status === "ringing";
  const finished = ["ended", "missed", "declined", "failed"].includes(status);

  const statusLabel =
    status === "active" ? fmt.duration(elapsed)
    : status === "ringing" ? "Вызов..."
    : status === "declined" ? "Отклонен"
    : status === "missed" ? "Пропущен"
    : status === "failed" ? "Ошибка сети"
    : "Соединение...";

  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[#0f1115] text-white">
      <video ref={remoteVideo} autoPlay playsInline className={cn("absolute inset-0 h-full w-full object-cover transition-opacity duration-500", status !== "active" && "opacity-0")} />

      <div className={cn("absolute inset-0 flex flex-col items-center justify-center z-10 transition-opacity", status === "active" && "opacity-0 pointer-events-none")}>
        <div className="relative mb-6">
          <div className="absolute inset-0 animate-ping rounded-full bg-white/10" />
          <Avatar name={peer?.displayName ?? "UZON"} url={peer?.avatarUrl} size={120} className="shadow-2xl ring-4 ring-white/10" />
        </div>
        <h2 className="text-2xl font-semibold">{peer?.displayName ?? "UZON"}</h2>
        <p className="mt-2 text-white/60">{statusLabel}</p>
        {iceWarning && !finished && <p className="mt-4 text-xs text-yellow-400 text-center px-4">Внимание: Нет TURN сервера. Звонок может не соединиться в мобильной сети.</p>}
      </div>

      {kind === "video" && (
        <div className={cn("absolute right-4 top-20 z-20 w-28 h-40 overflow-hidden rounded-2xl border-2 border-white/10 bg-black shadow-2xl transition-all", (!camOn || finished) && "opacity-0 translate-y-4")}>
          <video ref={localVideo} autoPlay playsInline muted className="h-full w-full object-cover" style={{ transform: "scaleX(-1)" }} />
        </div>
      )}

      <div className="relative z-30 flex items-start justify-between p-4 bg-gradient-to-b from-black/60 to-transparent">
        <div className="flex items-center gap-3">
           <Avatar name={peer?.displayName ?? "UZON"} url={peer?.avatarUrl} size={40} />
           <div>
              <p className="text-sm font-semibold">{peer?.displayName ?? "UZON"}</p>
              <p className="text-xs text-white/60">{statusLabel}</p>
           </div>
        </div>
        <Link href="/messages" onClick={cleanup}>
          <button className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition"><X className="h-5 w-5" /></button>
        </Link>
      </div>

      <div className="relative z-30 mt-auto bg-[#1c1c1e]/90 backdrop-blur-xl border-t border-white/5 pb-8 pt-4 px-6">
        {ringing && !callQuery.data?.call.isInitiator ? (
          <div className="flex justify-center gap-6">
            <button onClick={() => declineCall.mutate()} className="flex h-16 w-16 items-center justify-center rounded-full bg-[#ff3b30] text-white shadow-lg active:scale-95 transition"><PhoneOff className="h-7 w-7" /></button>
            <button 
              onClick={() => {
                unlockAudio(); // 🔥 Разблокируем звук при клике
                acceptCall.mutate();
              }} 
              className="flex h-16 w-16 items-center justify-center rounded-full bg-[#34c759] text-white shadow-lg active:scale-95 animate-bounce"
            >
              <Mic className="h-7 w-7" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between px-2">
            <button onClick={() => { const next = !micOn; setMicOn(next); streamRef.current?.getAudioTracks().forEach((tr) => (tr.enabled = next)); }} className={cn("flex h-14 w-14 items-center justify-center rounded-full transition active:scale-95", micOn ? "bg-white/10 text-white" : "bg-white text-black")}>
              {micOn ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
            </button>
            
            <button onClick={() => endCall.mutate()} disabled={finished} className="flex h-16 w-16 items-center justify-center rounded-full bg-[#ff3b30] text-white shadow-lg active:scale-95 disabled:opacity-50">
              <PhoneOff className="h-7 w-7" />
            </button>

            {kind === "video" ? (
              <div className="flex gap-2">
                <button onClick={() => { const next = !camOn; setCamOn(next); streamRef.current?.getVideoTracks().forEach((tr) => (tr.enabled = next)); }} className={cn("flex h-14 w-14 items-center justify-center rounded-full transition", camOn ? "bg-white/10 text-white" : "bg-white text-black")}>
                  {camOn ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}
                </button>
                <button onClick={async () => { 
                  facing.current = facing.current === "user" ? "environment" : "user"; 
                  try { await streamRef.current?.getVideoTracks()[0]?.applyConstraints({ facingMode: facing.current }); } catch {}
                }} className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-white">
                  <SwitchCamera className="h-6 w-6" />
                </button>
              </div>
            ) : <div className="h-14 w-14" />}
          </div>
        )}
      </div>

      {finished && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md">
          <p className="text-xl font-semibold text-white mb-6">{statusLabel}</p>
          <Link href="/messages" onClick={cleanup}><Button size="lg" className="bg-white text-black hover:bg-gray-200">Вернуться в чат</Button></Link>
        </div>
      )}
    </div>
  );
}

export function IncomingCallHost() {
  const { t, user } = useApp();
  const query = useQuery({
    queryKey: ["incoming-call"],
    queryFn: () => get<{ incoming: { id: string; kind: string; peer: { displayName: string; username: string; avatarUrl: string | null } }[] }>("/api/calls?scope=inbox"),
    enabled: Boolean(user),
    refetchInterval: 5000,
  });
  
  const incoming = query.data?.incoming?.[0];
  if (!incoming || !user) return null;

  return (
    <div className="animate-fade-up fixed inset-x-3 top-16 z-[80] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-2xl">
      <Avatar name={incoming.peer.displayName} url={incoming.peer.avatarUrl} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{incoming.peer.displayName}</p>
        <p className="text-[11px] text-muted">{t("call.incoming")} · {incoming.kind === "video" ? t("call.video") : t("call.audio")}</p>
      </div>
      <Link href={`/calls/${incoming.id}`}>
        <Button size="sm">{t("call.accept")}</Button>
      </Link>
    </div>
  );
}