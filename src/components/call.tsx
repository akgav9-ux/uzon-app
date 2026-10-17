"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mic, MicOff, PhoneOff, SwitchCamera, Video, VideoOff, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/providers";
import { Avatar, Button, IconButton } from "@/components/ui";
import { get, post as postApi, qk } from "@/lib/client/api";

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

/** Full 1:1 WebRTC call screen with DB-backed signalling. */
export function CallScreen({ callId }: { callId: string }) {
  const { t, fmt, toast } = useApp();
  const queryClient = useQueryClient();
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const remoteReady = useRef(false);
  const facing = useRef<"user" | "environment">("user");

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

  const getMedia = useCallback(async (video: boolean) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: video ? { facingMode: facing.current } : false,
    });
    streamRef.current = stream;
    if (localVideo.current && video) localVideo.current.srcObject = stream;
    return stream;
  }, []);

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
      if (remoteVideo.current) remoteVideo.current.srcObject = event.streams[0] ?? new MediaStream([event.track]);
      remoteReady.current = true;
    };
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "connected") setStatus("active");
      if (state === "failed") {
        setError(t("call.iceWarning"));
        setStatus("failed");
      }
      if (state === "disconnected") setStatus("connecting");
    };
    for (const candidate of pendingIce.current) {
      await pc.addIceCandidate(candidate).catch(() => undefined);
    }
    pendingIce.current = [];
    return pc;
  }, [callQuery.data?.call.kind, getMedia, iceServers, sendSignal, t]);

  // Callee accepts → initiator creates the offer.
  useEffect(() => {
    const signals = signalQuery.data?.signals ?? [];
    if (!signals.length || !callQuery.data) return;
    void (async () => {
      for (const signal of signals) {
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
          else pendingIce.current.push(candidate);
        }
        if (signal.type === "decline") setStatus("declined");
        if (signal.type === "end") setStatus("ended");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signalQuery.data]);

  useEffect(() => {
    if (callQuery.data) setStatus(callQuery.data.call.status);
  }, [callQuery.data?.call.status]);

  useEffect(() => {
    if (status !== "active") return;
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Date.now() - started), 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  const endCall = useMutation({
    mutationFn: () => postApi(`/api/calls/${callId}`, { action: "end" }),
    onSuccess: () => {
      cleanup();
      queryClient.invalidateQueries({ queryKey: qk.calls });
    },
  });
  const acceptCall = useMutation({
    mutationFn: () => postApi(`/api/calls/${callId}`, { action: "accept" }).then(() => sendSignal("accept")),
    onSuccess: () => setStatus("active"),
    onError: (err: Error) => setError(err.message),
  });
  const declineCall = useMutation({
    mutationFn: () => postApi(`/api/calls/${callId}`, { action: "decline" }),
    onSuccess: () => {
      cleanup();
      setStatus("declined");
    },
  });

  function cleanup() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current = null;
    if (localVideo.current) localVideo.current.srcObject = null;
    if (remoteVideo.current) remoteVideo.current.srcObject = null;
  }

  // Start local preview as soon as the call is known (callee previews while ringing).
  useEffect(() => {
    if (!callQuery.data) return;
    const kind = callQuery.data.call.kind;
    if (!callQuery.data.call.isInitiator && kind === "video") {
      getMedia(true).catch(() => {
        setError(t("call.permissionDenied"));
        toast(t("call.permissionDenied"), "error");
      });
    }
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callQuery.data?.call.id]);

  useEffect(() => {
    if (!navigator.mediaDevices || typeof RTCPeerConnection === "undefined") setError(t("call.notSupported"));
  }, [t]);

  const kind = callQuery.data?.call.kind ?? "audio";
  const peer = callQuery.data?.peer;
  const ringing = status === "ringing";
  const finished = ["ended", "missed", "declined", "failed"].includes(status);

  const statusLabel =
    status === "active"
      ? `${t("call.active")} · ${fmt.duration(elapsed)}`
      : status === "ringing"
        ? t("call.ringing")
        : status === "declined"
          ? t("call.declined")
          : status === "missed"
            ? t("call.missed")
            : status === "failed"
              ? t("common.error")
              : t("call.connecting");

  return (
    <div className="relative flex h-[calc(100dvh-8rem)] flex-col overflow-hidden rounded-3xl bg-black">
      <video ref={remoteVideo} autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />
      {kind === "video" && (
        <video
          ref={localVideo}
          autoPlay
          playsInline
          muted
          className={cnLocal(camOn)}
        />
      )}
      <div className="relative z-10 flex flex-1 flex-col">
        <div className="safe-top flex items-start gap-3 p-4">
          <Avatar name={peer?.displayName ?? "UZON"} url={peer?.avatarUrl} size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-white">{peer?.displayName ?? t("call.start")}</p>
            <p className="text-xs text-white/70">
              {peer?.username ? `@${peer.username}` : ""} · {statusLabel}
            </p>
            {iceWarning && !finished && <p className="mt-1 max-w-sm text-[10px] text-warning">{t("call.iceWarning")}</p>}
            {error && <p className="mt-1 text-[11px] text-danger">{error}</p>}
          </div>
          <Link href="/messages" aria-label={t("common.close")}>
            <IconButton label={t("common.close")} className="text-white hover:bg-white/15">
              <X className="h-4 w-4" />
            </IconButton>
          </Link>
        </div>

        {ringing && !callQuery.data?.call.isInitiator && (
          <div className="relative z-10 mx-auto mt-auto mb-4 flex gap-3">
            <Button variant="danger" size="lg" icon={<PhoneOff className="h-4 w-4" />} onClick={() => declineCall.mutate()} loading={declineCall.isPending}>
              {t("call.decline")}
            </Button>
            <Button size="lg" icon={<Mic className="h-4 w-4" />} onClick={() => acceptCall.mutate()} loading={acceptCall.isPending}>
              {t("call.accept")}
            </Button>
          </div>
        )}

        {!ringing && (
          <div className="relative z-10 mx-auto mb-6 mt-auto flex items-center gap-3">
            <IconButton
              label={micOn ? t("call.mute") : t("call.unmute")}
              className={cnControl(!micOn)}
              onClick={() => {
                const next = !micOn;
                setMicOn(next);
                streamRef.current?.getAudioTracks().forEach((track) => (track.enabled = next));
              }}
            >
              {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </IconButton>
            {kind === "video" && (
              <>
                <IconButton
                  label={camOn ? t("call.cameraOff") : t("call.cameraOn")}
                  className={cnControl(!camOn)}
                  onClick={() => {
                    const next = !camOn;
                    setCamOn(next);
                    streamRef.current?.getVideoTracks().forEach((track) => (track.enabled = next));
                  }}
                >
                  {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                </IconButton>
                <IconButton
                  label={t("call.switchCamera")}
                  className={cnControl(false)}
                  onClick={async () => {
                    facing.current = facing.current === "user" ? "environment" : "user";
                    const videoTrack = streamRef.current?.getVideoTracks()[0];
                    try {
                      await videoTrack?.applyConstraints({ facingMode: facing.current });
                    } catch {
                      setError(t("call.permissionDenied"));
                    }
                  }}
                >
                  <SwitchCamera className="h-5 w-5" />
                </IconButton>
              </>
            )}
            <button
              onClick={() => endCall.mutate()}
              disabled={finished}
              aria-label={t("call.end")}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-danger text-white transition hover:opacity-90 disabled:opacity-40"
            >
              <PhoneOff className="h-6 w-6" />
            </button>
          </div>
        )}
      </div>
      {finished && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-center gap-3 bg-black/80 px-4 py-3">
          <p className="text-sm text-white">{statusLabel}</p>
          <Link href="/messages">
            <Button size="sm" variant="secondary">{t("errors.back")}</Button>
          </Link>
        </div>
      )}
    </div>
  );
}

function cnLocal(camOn: boolean) {
  return `absolute bottom-24 right-4 z-10 h-32 w-24 rounded-xl border border-white/20 object-cover shadow-lg ${camOn ? "" : "opacity-0"}`;
}
function cnControl(active: boolean) {
  return `flex h-12 w-12 items-center justify-center rounded-full border border-white/20 text-white transition hover:bg-white/15 ${active ? "bg-danger" : "bg-white/10"}`;
}

/** Global incoming-call banner driven by polling (no push provider required). */
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
