"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle, ArrowLeft, Check, CheckCheck, ChevronDown, Clock, Crown, Flag, Info, Mic, MoreHorizontal, Paperclip, Pause, Phone, Pin, Play, Plus, RotateCcw, Search, Send, Smile, Square, SwitchCamera, Trash2, Video as VideoIcon, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useApp } from "@/components/providers";
import {
  Avatar, Badge, Button, EmptyState, ErrorState, Field, IconButton, Input, Menu, MenuItem, Modal, Skeleton, Switch, Textarea,
} from "@/components/ui";
import { ReportModal } from "@/components/post";
import { del, get, patch, post as postApi, qk, uploadMedia } from "@/lib/client/api";
import type { ConversationPayload, MessagePayload } from "@/lib/serialize";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*                         ЛОКАЛИЗАЦИЯ НОВЫХ СТРОК                            */
/* -------------------------------------------------------------------------- */

type L3 = { ru: string; en: string; uz: string };

const DICT: Record<string, L3> = {
  "chat.recordVoice": { ru: "Голосовое сообщение", en: "Voice message", uz: "Ovozli xabar" },
  "chat.recordVideo": { ru: "Видеосообщение", en: "Video message", uz: "Video xabar" },
  "chat.micAsking": { ru: "Запрос доступа к микрофону…", en: "Requesting microphone access…", uz: "Mikrofonga ruxsat so‘ralmoqda…" },
  "chat.camAsking": { ru: "Запрос доступа к камере…", en: "Requesting camera access…", uz: "Kameraga ruxsat so‘ralmoqda…" },
  "chat.permMic": { ru: "Нет доступа к микрофону. Разрешите его в настройках браузера.", en: "Microphone access denied. Allow it in your browser settings.", uz: "Mikrofonga ruxsat yo‘q. Brauzer sozlamalarida ruxsat bering." },
  "chat.permCam": { ru: "Нет доступа к камере или микрофону. Разрешите их в настройках браузера.", en: "Camera or microphone access denied. Allow them in your browser settings.", uz: "Kamera yoki mikrofonga ruxsat yo‘q. Brauzer sozlamalarida ruxsat bering." },
  "chat.noDevice": { ru: "Устройство записи не найдено.", en: "No recording device found.", uz: "Yozish qurilmasi topilmadi." },
  "chat.unsupported": { ru: "Ваш браузер не поддерживает запись.", en: "Your browser does not support recording.", uz: "Brauzeringiz yozishni qo‘llab-quvvatlamaydi." },
  "chat.recordFailed": { ru: "Не удалось начать запись.", en: "Could not start recording.", uz: "Yozishni boshlab bo‘lmadi." },
  "chat.tooShort": { ru: "Запись слишком короткая.", en: "Recording is too short.", uz: "Yozuv juda qisqa." },
  "chat.tooBig": { ru: "Файл слишком большой (максимум {mb} МБ).", en: "File is too large (max {mb} MB).", uz: "Fayl juda katta (maksimum {mb} MB)." },
  "chat.offline": { ru: "Нет соединения с сетью.", en: "No network connection.", uz: "Tarmoq bilan aloqa yo‘q." },
  "chat.sendFailed": { ru: "Не отправлено", en: "Not sent", uz: "Yuborilmadi" },
  "chat.sending": { ru: "Отправка…", en: "Sending…", uz: "Yuborilmoqda…" },
  "chat.retry": { ru: "Повторить", en: "Retry", uz: "Qayta urinish" },
  "chat.discard": { ru: "Удалить", en: "Discard", uz: "O‘chirish" },
  "chat.retake": { ru: "Переснять", en: "Retake", uz: "Qayta olish" },
  "chat.switchCam": { ru: "Сменить камеру", en: "Switch camera", uz: "Kamerani almashtirish" },
  "chat.startRecord": { ru: "Начать запись", en: "Start recording", uz: "Yozishni boshlash" },
  "chat.stopRecord": { ru: "Остановить запись", en: "Stop recording", uz: "Yozishni to‘xtatish" },
  "chat.holdHint": { ru: "Отпустите, чтобы завершить · влево — отмена", en: "Release to finish · slide left to cancel", uz: "Tugatish uchun qo‘yib yuboring · chapga — bekor" },
  "chat.tapHint": { ru: "Нажмите ■, чтобы завершить", en: "Tap ■ to finish", uz: "Tugatish uchun ■ ni bosing" },
  "chat.videoHint": { ru: "Нажмите на красную кнопку, чтобы начать запись", en: "Tap the red button to start recording", uz: "Yozishni boshlash uchun qizil tugmani bosing" },
  "chat.videoRec": { ru: "Идёт запись · макс. {sec} с", en: "Recording · max {sec}s", uz: "Yozilmoqda · maks. {sec} s" },
  "chat.videoReview": { ru: "Проверьте видео перед отправкой", en: "Review your video before sending", uz: "Yuborishdan oldin videoni ko‘rib chiqing" },
  "chat.play": { ru: "Воспроизвести", en: "Play", uz: "Ijro etish" },
  "chat.pause": { ru: "Пауза", en: "Pause", uz: "To‘xtatish" },
  "chat.speed": { ru: "Скорость", en: "Speed", uz: "Tezlik" },
  "chat.mediaError": { ru: "Не удалось воспроизвести", en: "Playback failed", uz: "Ijro etib bo‘lmadi" },
  "chat.emoji": { ru: "Эмодзи", en: "Emoji", uz: "Emoji" },
  "chat.emojiSearch": { ru: "Поиск эмодзи", en: "Search emoji", uz: "Emoji qidirish" },
  "chat.emojiNone": { ru: "Ничего не найдено", en: "Nothing found", uz: "Hech narsa topilmadi" },
  "chat.emojiRecent": { ru: "Недавние", en: "Recent", uz: "So‘nggilar" },
  "chat.emojiSmileys": { ru: "Смайлы", en: "Smileys", uz: "Smaylar" },
  "chat.emojiGestures": { ru: "Жесты", en: "Gestures", uz: "Ishoralar" },
  "chat.emojiHearts": { ru: "Сердца и праздник", en: "Hearts & party", uz: "Yuraklar va bayram" },
  "chat.emojiObjects": { ru: "Предметы и еда", en: "Objects & food", uz: "Buyumlar va taomlar" },
  "chat.emojiFlags": { ru: "Флаги", en: "Flags", uz: "Bayroqlar" },
  "chat.stickers": { ru: "Стикеры", en: "Stickers", uz: "Stikerlar" },
  "chat.today": { ru: "Сегодня", en: "Today", uz: "Bugun" },
  "chat.yesterday": { ru: "Вчера", en: "Yesterday", uz: "Kecha" },
  "chat.scrollDown": { ru: "Вниз", en: "Scroll down", uz: "Pastga" },
  "chat.attach": { ru: "Прикрепить файл", en: "Attach file", uz: "Fayl biriktirish" },
  "chat.photo": { ru: "Фото", en: "Photo", uz: "Rasm" },
  "chat.voiceShort": { ru: "Голосовое", en: "Voice", uz: "Ovozli" },
  "chat.videoShort": { ru: "Видео", en: "Video", uz: "Video" },
  "chat.fileShort": { ru: "Файл", en: "File", uz: "Fayl" },
  "chat.cancelRecord": { ru: "Отменить запись", en: "Cancel recording", uz: "Yozishni bekor qilish" },
  "chat.sendNow": { ru: "Отправить", en: "Send", uz: "Yuborish" },
  "chat.delivered": { ru: "Доставлено", en: "Delivered", uz: "Yetkazildi" },
  "chat.read": { ru: "Прочитано", en: "Read", uz: "O‘qildi" },
  "chat.sentOk": { ru: "Отправлено", en: "Sent", uz: "Yuborildi" },
};

function useTr() {
  const app = useApp();
  const rawT = app.t as unknown as (key: string, vars?: Record<string, unknown>) => string;
  const raw = app as unknown as { locale?: string; lang?: string; language?: string };
  // Инициализируем один раз на клиенте, без hydration mismatch
  const [domLang] = useState(() =>
    typeof document === "undefined" ? "ru" : (document.documentElement.lang || "ru").slice(0, 2),
  );
  const lang = String(raw.locale || raw.lang || raw.language || domLang).slice(0, 2).toLowerCase();

  const tr = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      try {
        const fromApp = rawT(key, vars);
        if (fromApp && fromApp !== key) return fromApp;
      } catch {
        /* ключа нет в основной локализации */
      }
      const entry = DICT[key];
      let s = entry ? (entry as Record<string, string>)[lang] ?? entry.en : key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
      return s;
    },
    [rawT, lang],
  );
  return { tr, lang };
}

type Tr = (key: string, vars?: Record<string, string | number>) => string;

/* -------------------------------------------------------------------------- */
/*                              КОНСТАНТЫ И УТИЛИТЫ                           */
/* -------------------------------------------------------------------------- */

const REACTIONS = ["❤️", "👍", "😂", "🎉", "😢", "🔥"];
const MAX_UPLOAD_MB = 50;
const MAX_VIDEO_SEC = 60;
const MAX_VOICE_SEC = 300;

const AUDIO_MIMES = ["audio/webm;codecs=opus", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];
const VIDEO_MIMES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm"];

function pickMime(candidates: string[]): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return undefined;
  return candidates.find((m) => {
    try {
      return MediaRecorder.isTypeSupported(m);
    } catch {
      return false;
    }
  });
}

const baseMime = (mime: string) => mime.split(";")[0].trim();

function extFor(mime: string, kind: "audio" | "video") {
  const m = baseMime(mime);
  if (m.includes("mp4")) return kind === "audio" ? "m4a" : "mp4";
  if (m.includes("ogg")) return "ogg";
  return "webm";
}

function fmtDur(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

function mediaErrorKey(error: unknown, withCam: boolean): string {
  const name = (error as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return withCam ? "chat.permCam" : "chat.permMic";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return "chat.noDevice";
  if (name === "NotSupportedError" || name === "TypeError") return "chat.unsupported";
  return "chat.recordFailed";
}

function resample(values: number[], n: number): number[] {
  if (values.length === 0) return Array.from({ length: n }, () => 0.2);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const from = Math.floor((i * values.length) / n);
    const to = Math.max(from + 1, Math.floor(((i + 1) * values.length) / n));
    let max = 0;
    for (let j = from; j < to && j < values.length; j++) max = Math.max(max, values[j]);
    out.push(max);
  }
  const peak = Math.max(...out, 0.001);
  return out.map((v) => Math.max(0.12, v / peak));
}

function seededBars(seed: string, n: number): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const r = ((h >>> 0) % 1000) / 1000;
    out.push(0.22 + 0.78 * Math.abs(Math.sin(i * 0.55 + r * 2.2)) * (0.55 + 0.45 * r));
  }
  return out;
}

/* Один активный плеер за раз (WeakRef для корректной очистки) */
let activeMediaRef: WeakRef<HTMLMediaElement> | null = null;
function claimMedia(el: HTMLMediaElement) {
  const current = activeMediaRef?.deref();
  if (current && current !== el) {
    try { current.pause(); } catch { /* ignore */ }
  }
  activeMediaRef = new WeakRef(el);
}

let EMOJI_ONLY: RegExp | null = null;
try {
  EMOJI_ONLY = new RegExp("^(?:\\p{Extended_Pictographic}|\\p{Regional_Indicator}|\\p{Emoji_Modifier}|\\u200d|\\ufe0f|\\s){1,14}$", "u");
} catch {
  EMOJI_ONLY = null;
}
const isEmojiOnly = (text: string) => Boolean(EMOJI_ONLY && text.trim().length > 0 && text.trim().length <= 14 && EMOJI_ONLY.test(text));

/* ----------------------------- данные эмодзи ----------------------------- */

type EmojiItem = { emoji: string; keywords: string };
type EmojiCategory = { id: string; icon: string; labelKey: string; items: EmojiItem[] };

const EMOJI_DATA: EmojiCategory[] = [
  {
    id: "smileys",
    icon: "😀",
    labelKey: "chat.emojiSmileys",
    items: [
      { emoji: "😀", keywords: "grin улыбка" }, { emoji: "😃", keywords: "happy радость" }, { emoji: "😄", keywords: "laugh смех" }, { emoji: "😁", keywords: "beam" },
      { emoji: "😆", keywords: "lol" }, { emoji: "😅", keywords: "sweat неловко" }, { emoji: "😂", keywords: "joy ржу смех" }, { emoji: "🤣", keywords: "rofl" },
      { emoji: "🙂", keywords: "smile" }, { emoji: "😉", keywords: "wink подмигнуть" }, { emoji: "😊", keywords: "blush" }, { emoji: "😇", keywords: "angel ангел" },
      { emoji: "🥰", keywords: "love влюблен" }, { emoji: "😍", keywords: "heart eyes" }, { emoji: "🤩", keywords: "wow star" }, { emoji: "😘", keywords: "kiss поцелуй" },
      { emoji: "😋", keywords: "yum вкусно" }, { emoji: "😜", keywords: "tongue язык" }, { emoji: "🤪", keywords: "crazy" }, { emoji: "🤗", keywords: "hug обнять" },
      { emoji: "🤔", keywords: "think думаю" }, { emoji: "🤨", keywords: "hmm" }, { emoji: "😐", keywords: "neutral" }, { emoji: "😶", keywords: "silent молчу" },
      { emoji: "🙄", keywords: "eyeroll" }, { emoji: "😏", keywords: "smirk" }, { emoji: "😴", keywords: "sleep спать" }, { emoji: "😷", keywords: "mask маска" },
      { emoji: "🤒", keywords: "sick болен" }, { emoji: "😎", keywords: "cool круто" }, { emoji: "🤓", keywords: "nerd" }, { emoji: "😢", keywords: "sad cry грусть" },
      { emoji: "😭", keywords: "sob плач" }, { emoji: "😤", keywords: "angry" }, { emoji: "😡", keywords: "rage злой" }, { emoji: "🥺", keywords: "plead прошу" },
      { emoji: "😱", keywords: "scream страх" }, { emoji: "😳", keywords: "flushed" }, { emoji: "🥳", keywords: "party" }, { emoji: "😬", keywords: "grimace" },
    ],
  },
  {
    id: "gestures",
    icon: "👍",
    labelKey: "chat.emojiGestures",
    items: [
      { emoji: "👍", keywords: "like ok хорошо" }, { emoji: "👎", keywords: "dislike" }, { emoji: "👏", keywords: "clap аплодисменты" }, { emoji: "🙌", keywords: "hooray" },
      { emoji: "🙏", keywords: "pray спасибо please" }, { emoji: "🤝", keywords: "handshake" }, { emoji: "👌", keywords: "ok" }, { emoji: "✌️", keywords: "peace" },
      { emoji: "🤞", keywords: "luck удача" }, { emoji: "🤟", keywords: "love-you" }, { emoji: "👋", keywords: "wave привет salom" }, { emoji: "🤙", keywords: "call" },
      { emoji: "💪", keywords: "strong сила" }, { emoji: "👀", keywords: "eyes глаза" }, { emoji: "🫶", keywords: "heart-hands" }, { emoji: "🤷", keywords: "shrug" },
      { emoji: "🤦", keywords: "facepalm" }, { emoji: "🙈", keywords: "monkey обезьяна" }, { emoji: "🙉", keywords: "hear" }, { emoji: "🙊", keywords: "speak" },
      { emoji: "🫡", keywords: "salute" }, { emoji: "👊", keywords: "fist" }, { emoji: "✊", keywords: "power" }, { emoji: "☝️", keywords: "one" },
    ],
  },
  {
    id: "hearts",
    icon: "❤️",
    labelKey: "chat.emojiHearts",
    items: [
      { emoji: "❤️", keywords: "love сердце yurak" }, { emoji: "🧡", keywords: "orange" }, { emoji: "💛", keywords: "yellow" }, { emoji: "💚", keywords: "green" },
      { emoji: "💙", keywords: "blue" }, { emoji: "💜", keywords: "purple" }, { emoji: "🖤", keywords: "black" }, { emoji: "🤍", keywords: "white" },
      { emoji: "💔", keywords: "broken разбито" }, { emoji: "💕", keywords: "hearts" }, { emoji: "💖", keywords: "sparkle-heart" }, { emoji: "💯", keywords: "hundred сто" },
      { emoji: "🔥", keywords: "fire огонь olov" }, { emoji: "✨", keywords: "sparkles" }, { emoji: "⭐", keywords: "star звезда yulduz" }, { emoji: "🎉", keywords: "party праздник" },
      { emoji: "🎊", keywords: "confetti" }, { emoji: "🎁", keywords: "gift подарок" }, { emoji: "💥", keywords: "boom" }, { emoji: "💫", keywords: "dizzy" },
    ],
  },
  {
    id: "objects",
    icon: "⚽",
    labelKey: "chat.emojiObjects",
    items: [
      { emoji: "⚽", keywords: "football футбол" }, { emoji: "🏀", keywords: "basketball" }, { emoji: "🎮", keywords: "game игра" }, { emoji: "🎬", keywords: "movie кино" },
      { emoji: "🎵", keywords: "music музыка" }, { emoji: "🎤", keywords: "mic" }, { emoji: "🎧", keywords: "headphones наушники" }, { emoji: "📷", keywords: "camera камера" },
      { emoji: "📱", keywords: "phone телефон" }, { emoji: "💻", keywords: "laptop ноутбук" }, { emoji: "🚀", keywords: "rocket ракета" }, { emoji: "✈️", keywords: "plane самолет" },
      { emoji: "🚗", keywords: "car машина" }, { emoji: "☕", keywords: "coffee кофе" }, { emoji: "🍕", keywords: "pizza пицца" }, { emoji: "🍔", keywords: "burger" },
      { emoji: "🍉", keywords: "watermelon арбуз tarvuz" }, { emoji: "🍇", keywords: "grapes виноград" }, { emoji: "🍰", keywords: "cake торт" }, { emoji: "🍚", keywords: "plov плов osh" },
      { emoji: "🌹", keywords: "rose роза" }, { emoji: "🌞", keywords: "sun солнце" }, { emoji: "🌙", keywords: "moon луна" }, { emoji: "🌈", keywords: "rainbow радуга" },
    ],
  },
  {
    id: "flags",
    icon: "🏳️",
    labelKey: "chat.emojiFlags",
    items: [
      { emoji: "🇺🇿", keywords: "uzbekistan узбекистан o‘zbekiston" }, { emoji: "🇷🇺", keywords: "russia россия" }, { emoji: "🇬🇧", keywords: "uk britain" }, { emoji: "🇺🇸", keywords: "usa сша" },
      { emoji: "🇰🇿", keywords: "kazakhstan казахстан" }, { emoji: "🇹🇷", keywords: "turkey турция" }, { emoji: "🇨🇳", keywords: "china китай" }, { emoji: "🇩🇪", keywords: "germany германия" },
      { emoji: "🇫🇷", keywords: "france франция" }, { emoji: "🇰🇬", keywords: "kyrgyzstan киргизия" }, { emoji: "🇹🇯", keywords: "tajikistan таджикистан" }, { emoji: "🇦🇿", keywords: "azerbaijan азербайджан" },
    ],
  },
];

/* Предварительно нормализованные плоские списки для быстрого поиска */
const EMOJI_FLAT: EmojiItem[] = EMOJI_DATA.flatMap((c) => c.items);
const EMOJI_BY_ID: Record<string, EmojiCategory> = Object.fromEntries(EMOJI_DATA.map((c) => [c.id, c]));

const RECENT_KEY = "uzon.emoji.recent";
function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string").slice(0, 24) : [];
  } catch {
    return [];
  }
}
function saveRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 24)));
  } catch {
    /* ignore */
  }
}

export type StickerPack = { id: string; title: string; stickers: { id: string; url: string }[] };
const STICKER_PACKS: StickerPack[] = [];

/* -------------------------------------------------------------------------- */
/*                                 ЭМОДЗИ-ПАНЕЛЬ                              */
/* -------------------------------------------------------------------------- */

function EmojiPanel({ tr, recent, onPick }: { tr: Tr; recent: string[]; onPick: (emoji: string) => void }) {
  const [tab, setTab] = useState<string>(recent.length > 0 ? "recent" : "smileys");
  const [q, setQ] = useState("");

  const tabs = useMemo(
    () => [
      ...(recent.length > 0 ? [{ id: "recent", icon: "🕘", label: tr("chat.emojiRecent") }] : []),
      ...EMOJI_DATA.map((c) => ({ id: c.id, icon: c.icon, label: tr(c.labelKey) })),
      ...(STICKER_PACKS.length > 0 ? [{ id: "stickers", icon: "🧩", label: tr("chat.stickers") }] : []),
    ],
    [recent.length, tr],
  );

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (term) {
      return EMOJI_FLAT.filter((row) => row.keywords.toLowerCase().includes(term)).map((row) => row.emoji);
    }
    if (tab === "recent") return recent;
    const cat = EMOJI_BY_ID[tab];
    return cat ? cat.items.map((row) => row.emoji) : [];
  }, [q, tab, recent]);

  return (
    <div className="mb-2 overflow-hidden rounded-2xl border border-line bg-surface shadow-lg">
      <div className="flex items-center gap-2 border-b border-line px-2.5 py-2">
        <Search className="h-4 w-4 shrink-0 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tr("chat.emojiSearch")}
          aria-label={tr("chat.emojiSearch")}
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} className="text-muted hover:text-ink" aria-label={tr("common.cancel")}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {tab === "stickers" && !q ? (
        <div className="h-52 overflow-y-auto p-2">
          {STICKER_PACKS.map((pack) => (
            <div key={pack.id} className="mb-2">
              <p className="mb-1 text-[11px] font-semibold text-muted">{pack.title}</p>
              <div className="grid grid-cols-4 gap-2">
                {pack.stickers.map((s) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={s.id} src={s.url} alt="" className="aspect-square w-full object-contain" loading="lazy" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="h-52 overflow-y-auto p-1.5">
          {list.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted">{tr("chat.emojiNone")}</p>
          ) : (
            <div className="grid grid-cols-8 gap-0.5 sm:grid-cols-10">
              {list.map((emoji, i) => (
                <button
                  key={`${emoji}-${i}`}
                  type="button"
                  onClick={() => onPick(emoji)}
                  className="flex h-10 items-center justify-center rounded-lg text-2xl transition hover:bg-surface2 active:scale-90"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!q && (
        <div className="flex gap-0.5 overflow-x-auto border-t border-line px-1.5 py-1">
          {tabs.map((tb) => (
            <button
              key={tb.id}
              type="button"
              title={tb.label}
              aria-label={tb.label}
              onClick={() => setTab(tb.id)}
              className={cn("flex h-9 w-10 shrink-0 items-center justify-center rounded-lg text-lg transition", tab === tb.id ? "bg-brandsoft" : "opacity-60 hover:bg-surface2 hover:opacity-100")}
            >
              {tb.icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 CHAT LIST                                  */
/* -------------------------------------------------------------------------- */

export function ChatList({ onOpen, activeId }: { onOpen: (conversation: ConversationPayload) => void; activeId?: string }) {
  const { t, fmt } = useApp();
  const { tr } = useTr();
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
    const needle = term.trim().toLowerCase();
    return list
      .filter((c) => filter === "all" || c.kind === filter)
      .filter((c) => !needle || (c.title ?? "").toLowerCase().includes(needle));
  }, [query.data, filter, term]);

  if (query.isLoading) return <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  if (query.isError) return <ErrorState message={t("common.error")} onRetry={() => query.refetch()} />;

  const previewOf = (m: NonNullable<ConversationPayload["lastMessage"]>) => {
    if (m.text) return m.text;
    const kind = m.media?.kind;
    if (kind === "audio") return `🎤 ${tr("chat.voiceShort")}`;
    if (kind === "video") return `⭕ ${tr("chat.videoShort")}`;
    if (kind === "image") return `🖼 ${tr("chat.photo")}`;
    return kind ? `📎 ${tr("chat.fileShort")}` : "";
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={term} onChange={(event) => setTerm(event.target.value)} placeholder={t("chat.searchHistory")} className="rounded-full pl-9" aria-label={t("chat.searchHistory")} />
        </div>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
          {t("chat.new")}
        </Button>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {(["all", "direct", "group", "channel"] as const).map((kind) => (
          <button
            key={kind}
            onClick={() => setFilter(kind)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition",
              filter === kind ? "border-transparent bg-gradient-to-r from-brand to-brand/75 text-white shadow-sm" : "border-line text-muted hover:text-ink",
            )}
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
                  "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.99] hover:border-brand/40",
                  activeId === conversation.id ? "border-brand bg-brandsoft" : "border-line bg-surface",
                )}
              >
                <Avatar name={conversation.title ?? "UZON"} url={conversation.avatarUrl} size={48} />
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
                        {previewOf(conversation.lastMessage)}
                      </>
                    ) : (
                      t("common.empty")
                    )}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[10px] text-muted">{conversation.lastMessage ? fmt.relative(conversation.lastMessage.createdAt) : ""}</span>
                  {conversation.unread > 0 && (
                    <span className="min-w-[18px] rounded-full bg-gradient-to-br from-brand to-brand/80 px-1.5 text-center text-[10px] font-bold leading-[18px] text-white">{conversation.unread}</span>
                  )}
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
/*                                  ТИПЫ ЧАТА                                 */
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

type PurposeKind = "image" | "video" | "audio" | "file";

type PendingItem = {
  id: string;
  kind: "text" | PurposeKind;
  text?: string;
  file?: File;
  replyToId?: string;
  localUrl?: string;
  duration?: number;
  isNote?: boolean;
  status: "sending" | "failed";
  error?: string;
  abort?: AbortController;
};

type ListRow = { type: "day"; key: string; label: string } | { type: "msg"; message: MessagePayload };

/* -------------------------------------------------------------------------- */
/*                                 CHAT ROOM                                  */
/* -------------------------------------------------------------------------- */

export function ChatRoom({ conversationId, onBack }: { conversationId: string; onBack?: () => void }) {
  const { t, user, toast, fmt } = useApp(); // 🔥 ДОБАВЛЕН fmt
  const { tr, lang } = useTr();
  const queryClient = useQueryClient();

  const draftKey = `uzon.draft.${conversationId}`;
  const [text, setText] = useState(() => {
    try {
      return typeof window === "undefined" ? "" : sessionStorage.getItem(draftKey) ?? "";
    } catch {
      return "";
    }
  });
  const [replyTo, setReplyTo] = useState<MessagePayload | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [voiceActive, setVoiceActive] = useState(false);
  const [voicePhase, setVoicePhase] = useState<"starting" | "recording" | "review">("starting");
  const [videoOpen, setVideoOpen] = useState(false);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [infoOpen, setInfoOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<MessagePayload | null>(null);
  const [showDown, setShowDown] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const atBottomRef = useRef(true);
  const firstScrollRef = useRef(true);
  const inflightRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef<PendingItem[]>([]);
  const voiceCtl = useRef<{ stop: () => void; cancel: () => void } | null>(null);
  const pressRef = useRef<{ t: number; x: number } | null>(null);

  pendingRef.current = pending;

  useEffect(() => setRecent(loadRecent()), []);

  useEffect(() => {
    try {
      if (text) sessionStorage.setItem(draftKey, text);
      else sessionStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  }, [text, draftKey]);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [text]);

  useEffect(() => {
    return () => {
      pendingRef.current.forEach((p) => {
        if (p.localUrl) URL.revokeObjectURL(p.localUrl);
        if (p.abort) p.abort.abort();
      });
    };
  }, []);

  const detail = useQuery({
    queryKey: qk.conversation(conversationId),
    queryFn: () => get<{ conversation: ConversationPayload; myRole: string; members: MemberRow[] }>(`/api/conversations/${conversationId}`),
  });

  const messagesQuery = useQuery({
    queryKey: qk.messages(conversationId),
    queryFn: () => get<{ messages: MessagePayload[] }>(`/api/conversations/${conversationId}/messages?limit=40`),
    refetchInterval: 8000,
    staleTime: 3000,
  });

  // Сортируем сообщения, чтобы старые были сверху
  const messages = useMemo(() => {
    const list = messagesQuery.data?.messages ?? [];
    return [...list].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [messagesQuery.data]);

  const rows = useMemo<ListRow[]>(() => {
    const out: ListRow[] = [];
    let lastDay = "";
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86_400_000).toDateString();
    for (const message of messages) {
      const d = new Date(message.createdAt);
      const key = d.toDateString();
      if (key !== lastDay) {
        lastDay = key;
        const label =
          key === today
            ? tr("chat.today")
            : key === yesterday
              ? tr("chat.yesterday")
              : d.toLocaleDateString(lang, { day: "numeric", month: "long", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
        out.push({ type: "day", key, label });
      }
      out.push({ type: "msg", message });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, lang]);

  // Автоскролл вниз при новых сообщениях
  useEffect(() => {
    if (messages.length === 0) return;
    if (firstScrollRef.current) {
      firstScrollRef.current = false;
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "auto" }), 50);
      return;
    }
    const el = listRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (dist < 300 || atBottomRef.current) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [messages]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottomRef.current = dist < 160;
    setShowDown(dist > 360);
  };

  /* --------------------------- реакции / закреп / удаление -------------------------- */

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
    onError: (error: Error) => toast(error.message, "error"),
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

  /* ------------------------------ ОТПРАВКА ------------------------------ */

  const runPending = async (item: PendingItem) => {
    if (inflightRef.current.has(item.id)) return;
    inflightRef.current.add(item.id);
    setPending((list) => list.map((x) => (x.id === item.id ? { ...x, status: "sending", error: undefined } : x)));
    const abort = new AbortController();
    item.abort = abort;
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error(tr("chat.offline"));
      let payload: Record<string, unknown>;
      if (item.kind === "text") {
        payload = { text: item.text, replyToId: item.replyToId };
      } else {
        if (!item.file) throw new Error(tr("chat.recordFailed"));
        const uploaded = await uploadMedia(item.file, { purpose: item.kind });
        payload = { mediaId: uploaded.media.id, attachmentKind: item.kind, replyToId: item.replyToId };
      }
      if (abort.signal.aborted) return;
      await postApi(`/api/conversations/${conversationId}/messages`, payload);
      await queryClient.refetchQueries({ queryKey: qk.messages(conversationId) });
      queryClient.invalidateQueries({ queryKey: qk.conversations });
      if (item.localUrl) URL.revokeObjectURL(item.localUrl);
      setPending((list) => list.filter((x) => x.id !== item.id));
    } catch (error) {
      if (abort.signal.aborted) return;
      const message = error instanceof Error && error.message ? error.message : t("create.uploadFailed");
      setPending((list) => list.map((x) => (x.id === item.id ? { ...x, status: "failed", error: message } : x)));
    } finally {
      inflightRef.current.delete(item.id);
    }
  };

  const enqueue = (partial: Omit<PendingItem, "id" | "status">) => {
    const item: PendingItem = {
      ...partial,
      id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      replyToId: replyTo?.id,
      status: "sending",
    };
    setPending((list) => [...list, item]);
    setReplyTo(null);
    atBottomRef.current = true;
    void runPending(item);
  };

  const discardPending = (id: string) => {
    setPending((list) => {
      const found = list.find((x) => x.id === id);
      if (found?.localUrl) URL.revokeObjectURL(found.localUrl);
      if (found?.abort) found.abort.abort();
      return list.filter((x) => x.id !== id);
    });
  };

  const submitText = () => {
    const value = text.trim();
    if (!value) return;
    enqueue({ kind: "text", text: value });
    setText("");
    setPanelOpen(false);
  };

  const sendRecorded = (blob: Blob, mime: string, duration: number, kind: "audio" | "video") => {
    if (blob.size > MAX_UPLOAD_MB * 1024 * 1024) {
      toast(tr("chat.tooBig", { mb: MAX_UPLOAD_MB }), "error");
      return;
    }
    const name = kind === "audio" ? `voice-${Date.now()}.${extFor(mime, "audio")}` : `video-note-${Date.now()}.${extFor(mime, "video")}`;
    const file = new File([blob], name, { type: baseMime(mime) });
    enqueue({ kind, file, duration, localUrl: URL.createObjectURL(file), isNote: kind === "video" });
  };

  const onFilesPicked = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
        toast(tr("chat.tooBig", { mb: MAX_UPLOAD_MB }), "error");
        return;
      }
      const kind: PurposeKind = file.type.startsWith("image") ? "image" : file.type.startsWith("video") ? "video" : file.type.startsWith("audio") ? "audio" : "file";
      enqueue({ kind, file, localUrl: kind === "file" ? undefined : URL.createObjectURL(file), isNote: false });
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  /* ------------------------------ ЭМОДЗИ ------------------------------ */

  const insertEmoji = (emoji: string) => {
    const el = taRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + emoji + text.slice(end));
    const next = [emoji, ...recent.filter((e) => e !== emoji)].slice(0, 24);
    setRecent(next);
    saveRecent(next);
    requestAnimationFrame(() => {
      if (el) {
        const pos = start + emoji.length;
        try {
          el.setSelectionRange(pos, pos);
        } catch {
          /* ignore */
        }
      }
    });
  };

  const togglePanel = () => {
    setPanelOpen((open) => {
      if (!open) taRef.current?.blur();
      else taRef.current?.focus();
      return !open;
    });
  };

  /* ------------------------ кнопка микрофона (hold / tap) ------------------------ */

  const onMicDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (videoOpen) return;
    if (voiceActive) {
      if (voicePhase === "recording") voiceCtl.current?.stop();
      return;
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    pressRef.current = { t: Date.now(), x: e.clientX };
    setPanelOpen(false);
    setVoicePhase("starting");
    setVoiceActive(true);
  };
  const onMicMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const p = pressRef.current;
    if (p && e.clientX - p.x < -90) {
      pressRef.current = null;
      voiceCtl.current?.cancel();
    }
  };
  const onMicUp = () => {
    const p = pressRef.current;
    pressRef.current = null;
    if (p && Date.now() - p.t > 600) voiceCtl.current?.stop();
  };

  /* ------------------------------- RENDER ------------------------------- */

  if (detail.isLoading || messagesQuery.isLoading) {
    return <div className="space-y-2 p-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }
  if (detail.isError) return <ErrorState message={t("errors.forbidden")} onRetry={() => detail.refetch()} />;

  const conversation = detail.data!.conversation;
  // ИСПРАВЛЕНИЕ: используем myRole из detail.data, а не из conversation (там его нет)
  const myRole = detail.data!.myRole;
  const pinned = messages.find((m) => m.pinned);
  const canPost = conversation.kind !== "channel" || myRole === "owner" || myRole === "admin" || !conversation.onlyAdminsCanPost;
  const canManage = myRole === "owner" || myRole === "admin" || Boolean(user && user.role !== "user");
  const hasText = text.trim().length > 0;

  return (
    <div className="flex h-[100dvh] w-full max-w-4xl mx-auto flex-col overflow-hidden bg-background border-x border-line">
      {/* ------------------------------- ШАПКА ------------------------------- */}
      <header className="relative flex shrink-0 items-center gap-2 border-b border-line bg-surface/90 px-3 py-2.5 backdrop-blur">
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-brand/50 to-transparent" />
        {onBack && (
          <IconButton label={t("common.back")} onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </IconButton>
        )}
        <Avatar name={conversation.title ?? "UZON"} url={conversation.avatarUrl} size={40} />
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
        <div className="flex shrink-0 items-center gap-2 border-b border-line bg-brandsoft px-3 py-1.5 text-[11px] text-brand">
          <Pin className="h-3 w-3" />
          <span className="truncate">{pinned.text ?? t("chat.pin")}</span>
        </div>
      )}

      {/* ----------------------------- СООБЩЕНИЯ ----------------------------- */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          onScroll={onScroll}
          className="absolute inset-0 flex flex-col overflow-y-auto overflow-x-hidden px-3 py-3"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 8%, color-mix(in srgb, var(--brand) 9%, transparent), transparent 38%), radial-gradient(circle at 90% 85%, color-mix(in srgb, var(--brand) 7%, transparent), transparent 42%)",
          }}
        >
          {messages.length === 0 && pending.length === 0 && <EmptyState title={t("chat.empty")} description={t("chat.write")} />}

          {rows.map((row) =>
            row.type === "day" ? (
              <div key={`day-${row.key}`} className="sticky top-1 z-10 flex justify-center py-1">
                <span className="rounded-full bg-surface/90 px-3 py-0.5 text-[11px] font-medium text-muted shadow-sm ring-1 ring-line backdrop-blur">{row.label}</span>
              </div>
            ) : (
              <MessageBubble
                key={row.message.id}
                message={row.message}
                t={t}
                tr={tr}
                fmt={fmt}
                onReply={() => {
                  setReplyTo(row.message);
                  taRef.current?.focus();
                }}
                onReact={(emoji) => react.mutate({ id: row.message.id, emoji })}
                onPin={() => pin.mutate({ id: row.message.id, action: row.message.pinned ? "unpin" : "pin" })}
                onDelete={() => remove.mutate(row.message.id)}
                onReport={() => setReportTarget(row.message)}
                canManage={canManage}
                showAuthor={conversation.kind !== "direct"}
              />
            ),
          )}

          {pending.map((item) => (
            <PendingBubble key={item.id} item={item} tr={tr} onRetry={() => void runPending(item)} onDiscard={() => discardPending(item.id)} />
          ))}
          <div ref={bottomRef} />
        </div>

        {showDown && (
          <button
            type="button"
            onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
            aria-label={tr("chat.scrollDown")}
            className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-muted shadow-lg transition hover:text-brand active:scale-90"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        )}
      </div>

      {replyTo && (
        <div className="flex shrink-0 items-center gap-2 border-t border-line bg-surface2 px-3 py-2 text-xs">
          <span className="h-8 w-0.5 rounded-full bg-brand" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-brand">{replyTo.sender.displayName}</span>
            <span className="block truncate text-muted">{replyTo.text ?? replyTo.media?.kind}</span>
          </span>
          <IconButton label={t("common.cancel")} onClick={() => setReplyTo(null)}>
            <X className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      )}

      {/* ------------------------------ ВВОД ------------------------------ */}
      {canPost ? (
        <footer className="safe-bottom shrink-0 border-t border-line bg-surface px-2 pb-2 pt-2">
          {panelOpen && !voiceActive && <EmojiPanel tr={tr} recent={recent} onPick={insertEmoji} />}

          <form
            className="flex items-end gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              submitText();
            }}
          >
            <input ref={fileRef} type="file" multiple accept="image/*,video/*,audio/*,.pdf,.txt,.zip" className="hidden" onChange={(e) => onFilesPicked(e.target.files)} />

            {!voiceActive && (
              <IconButton label={tr("chat.attach")} onClick={() => fileRef.current?.click()} type="button" className="mb-0.5">
                <Paperclip className="h-5 w-5" />
              </IconButton>
            )}

            {voiceActive ? (
              <VoiceRecorder
                tr={tr}
                ctl={voiceCtl}
                onPhase={setVoicePhase}
                onCancel={() => {
                  setVoiceActive(false);
                  setVoicePhase("starting");
                }}
                onError={(msg) => toast(msg, "error")}
                onSend={(blob, mime, duration) => {
                  setVoiceActive(false);
                  setVoicePhase("starting");
                  sendRecorded(blob, mime, duration, "audio");
                }}
              />
            ) : (
              <div className="relative flex min-w-0 flex-1 items-end rounded-[22px] bg-surface2 ring-1 ring-transparent transition focus-within:ring-brand/50">
                <textarea
                  ref={taRef}
                  rows={1}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  onFocus={() => setPanelOpen(false)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      submitText();
                    }
                  }}
                  placeholder={t("chat.write")}
                  aria-label={t("chat.write")}
                  className="max-h-32 min-h-[44px] min-w-0 flex-1 resize-none bg-transparent py-3 pl-4 pr-1 text-sm leading-5 text-ink outline-none placeholder:text-muted"
                />
                <button
                  type="button"
                  onClick={togglePanel}
                  aria-label={tr("chat.emoji")}
                  aria-pressed={panelOpen}
                  className={cn("mb-1 mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition", panelOpen ? "bg-brandsoft text-brand" : "text-muted hover:text-ink")}
                >
                  <Smile className="h-5 w-5" />
                </button>
              </div>
            )}

            <div className="mb-0.5 flex shrink-0 items-center gap-1">
              {hasText && !voiceActive ? (
                <button
                  type="submit"
                  aria-label={tr("chat.sendNow")}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand/80 text-white shadow-md transition active:scale-90"
                >
                  <Send className="h-5 w-5" />
                </button>
              ) : (
                <>
                  {!voiceActive && (
                    <button
                      type="button"
                      aria-label={tr("chat.recordVideo")}
                      title={tr("chat.recordVideo")}
                      onClick={() => {
                        setPanelOpen(false);
                        setVideoOpen(true);
                      }}
                      className="flex h-11 w-11 items-center justify-center rounded-full text-muted transition hover:bg-surface2 hover:text-ink active:scale-90"
                    >
                      <VideoIcon className="h-5 w-5" />
                    </button>
                  )}
                  {(!voiceActive || voicePhase !== "review") && (
                    <button
                      type="button"
                      aria-label={voiceActive ? tr("chat.stopRecord") : tr("chat.recordVoice")}
                      title={tr("chat.recordVoice")}
                      onContextMenu={(e) => e.preventDefault()}
                      onPointerDown={onMicDown}
                      onPointerMove={onMicMove}
                      onPointerUp={onMicUp}
                      onPointerCancel={() => {
                        pressRef.current = null;
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          if (voiceActive) voiceCtl.current?.stop();
                          else {
                            setVoicePhase("starting");
                            setVoiceActive(true);
                          }
                        }
                      }}
                      className={cn(
                        "flex h-11 w-11 touch-none select-none items-center justify-center rounded-full transition active:scale-90",
                        voiceActive ? "scale-110 bg-danger text-white shadow-lg" : "bg-gradient-to-br from-brand to-brand/80 text-white shadow-md",
                      )}
                      style={{ touchAction: "none" }}
                    >
                      {voiceActive ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-5 w-5" />}
                    </button>
                  )}
                </>
              )}
            </div>
          </form>
        </footer>
      ) : (
        <footer className="shrink-0 border-t border-line px-3 py-3 text-center text-xs text-muted">{t("chat.noPermission")}</footer>
      )}

      {videoOpen && (
        <VideoRecorderOverlay
          tr={tr}
          onClose={() => setVideoOpen(false)}
          onError={(msg) => toast(msg, "error")}
          onSend={(blob, mime, duration) => sendRecorded(blob, mime, duration, "video")}
        />
      )}

      {infoOpen && <ConversationInfoModal key={conversationId} conversationId={conversationId} onClose={() => setInfoOpen(false)} members={detail.data!.members} myRole={detail.data!.myRole} />}
      {reportTarget && <ReportModal open onClose={() => setReportTarget(null)} entityType="message" entityId={reportTarget.id} />}
      {call.isPending && <p className="px-3 py-1 text-xs text-muted">{t("call.connecting")}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              ЗАПИСЬ ГОЛОСА                                 */
/* -------------------------------------------------------------------------- */

type VoiceResult = { url: string; blob: Blob; mime: string; duration: number; peaks: number[] };

function VoiceRecorder({
  tr,
  ctl,
  onPhase,
  onSend,
  onCancel,
  onError,
}: {
  tr: Tr;
  ctl: MutableRefObject<{ stop: () => void; cancel: () => void } | null>;
  onPhase: (phase: "starting" | "recording" | "review") => void;
  onSend: (blob: Blob, mime: string, duration: number) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [phase, setPhase] = useState<"starting" | "recording" | "review">("starting");
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [result, setResult] = useState<VoiceResult | null>(null);

  const cb = useRef({ onPhase, onSend, onCancel, onError });
  cb.current = { onPhase, onSend, onCancel, onError };
  const trRef = useRef(tr);
  trRef.current = tr;

  const resultUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    let stream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    let ctx: AudioContext | null = null;
    let levelTimer: number | null = null;
    let secTimer: number | null = null;
    const chunks: Blob[] = [];
    const allLevels: number[] = [];
    let startedAt = 0;
    let cancelled = false;

    const cleanup = () => {
      if (levelTimer) window.clearInterval(levelTimer);
      if (secTimer) window.clearInterval(secTimer);
      levelTimer = secTimer = null;
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      ctx?.close().catch(() => {});
      ctx = null;
    };

    (async () => {
      if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        cb.current.onError(trRef.current("chat.unsupported"));
        cb.current.onCancel();
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch (error) {
        cb.current.onError(trRef.current(mediaErrorKey(error, false)));
        cb.current.onCancel();
        return;
      }
      // ИСПРАВЛЕНИЕ: проверяем alive после await
      if (!alive) {
        cleanup();
        return;
      }

      let analyser: AnalyserNode | null = null;
      try {
        const Ctx: typeof AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new Ctx();
        void ctx.resume().catch(() => {});
        const source = ctx.createMediaStreamSource(stream);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
      } catch {
        analyser = null;
      }

      // Ещё одна проверка alive после создания AudioContext
      if (!alive) {
        cleanup();
        return;
      }

      const mime = pickMime(AUDIO_MIMES);
      try {
        recorder = mime ? new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 64_000 }) : new MediaRecorder(stream);
      } catch {
        try {
          recorder = new MediaRecorder(stream);
        } catch {
          cb.current.onError(trRef.current("chat.unsupported"));
          cleanup();
          cb.current.onCancel();
          return;
        }
      }
      const rec = recorder;

      rec.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };
      rec.onstop = () => {
        const duration = (Date.now() - startedAt) / 1000;
        cleanup();
        if (!alive || cancelled) return;
        if (chunks.length === 0 || duration < 1) {
          cb.current.onError(trRef.current("chat.tooShort"));
          cb.current.onCancel();
          return;
        }
        const type = rec.mimeType || mime || "audio/webm";
        const blob = new Blob(chunks, { type });
        const url = URL.createObjectURL(blob);
        resultUrlRef.current = url;
        setResult({ url, blob, mime: type, duration, peaks: resample(allLevels, 40) });
        setPhase("review");
        cb.current.onPhase("review");
      };

      // ИСПРАВЛЕНИЕ: присваиваем ctl.current ДО rec.start()
      ctl.current = {
        stop: () => {
          if (rec.state !== "inactive") {
            try {
              rec.stop();
            } catch {
              /* ignore */
            }
          }
        },
        cancel: () => {
          cancelled = true;
          if (rec.state !== "inactive") {
            try {
              rec.stop();
            } catch {
              /* ignore */
            }
          }
          cleanup();
          cb.current.onCancel();
        },
      };

      startedAt = Date.now();
      rec.start(250);
      setPhase("recording");
      cb.current.onPhase("recording");

      const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
      levelTimer = window.setInterval(() => {
        let level = 0.15 + Math.random() * 0.1;
        if (analyser && data) {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          level = Math.min(1, Math.sqrt(sum / data.length) * 4);
        }
        allLevels.push(level);
        setLevels((prev) => [...prev.slice(-35), level]);
      }, 100);
      secTimer = window.setInterval(() => {
        const s = (Date.now() - startedAt) / 1000;
        setSeconds(Math.floor(s));
        if (s >= MAX_VOICE_SEC && rec.state !== "inactive") rec.stop();
      }, 250);
    })();

    return () => {
      alive = false;
      cancelled = true;
      try {
        if (recorder && recorder.state !== "inactive") recorder.stop();
      } catch {
        /* ignore */
      }
      cleanup();
      ctl.current = null;
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "review" && result) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[22px] bg-surface2 px-2 py-1.5">
        <button
          type="button"
          onClick={() => cb.current.onCancel()}
          aria-label={tr("chat.discard")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-danger transition hover:bg-danger/10 active:scale-90"
        >
          <Trash2 className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <AudioPlayer src={result.url} mine={false} peaks={result.peaks} fallbackDuration={result.duration} tr={tr} compact />
        </div>
        <button
          type="button"
          onClick={() => cb.current.onSend(result.blob, result.mime, result.duration)}
          aria-label={tr("chat.sendNow")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand/80 text-white shadow-md transition active:scale-90"
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
    );
  }

  const bars = Array.from({ length: 36 }, (_, i) => levels[levels.length - 36 + i] ?? 0);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[22px] border border-danger/30 bg-danger/5 px-2 py-1.5">
      <button
        type="button"
        onClick={() => ctl.current?.cancel()}
        aria-label={tr("chat.cancelRecord")}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-danger transition hover:bg-danger/10 active:scale-90"
      >
        <Trash2 className="h-5 w-5" />
      </button>
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-danger" />
      </span>
      <span className="w-10 shrink-0 text-xs font-semibold tabular-nums text-danger">{phase === "starting" ? "…" : fmtDur(seconds)}</span>
      <div className="flex h-8 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden" aria-hidden>
        {bars.map((v, i) => (
          <span key={i} className="w-[3px] shrink-0 rounded-full bg-danger transition-[height] duration-100" style={{ height: `${4 + Math.round(v * 24)}px`, opacity: 0.35 + v * 0.65 }} />
        ))}
      </div>
      <span className="hidden shrink-0 text-[10px] text-muted sm:block">{tr("chat.tapHint")}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                         ЗАПИСЬ КРУГЛОГО ВИДЕО                              */
/* -------------------------------------------------------------------------- */

function VideoRecorderOverlay({
  tr,
  onClose,
  onSend,
  onError,
}: {
  tr: Tr;
  onClose: () => void;
  onSend: (blob: Blob, mime: string, duration: number) => void;
  onError: (message: string) => void;
}) {
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [stage, setStage] = useState<"starting" | "ready" | "recording" | "review">("starting");
  const [seconds, setSeconds] = useState(0);
  const [canSwitch, setCanSwitch] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; blob: Blob; mime: string; duration: number } | null>(null);

  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const unmountedRef = useRef(false);
  const resultUrlRef = useRef<string | null>(null);
  const pressStartRef = useRef<{ time: number; x: number } | null>(null);

  // ИСПРАВЛЕНИЕ: выносим stopStream в useCallback, чтобы избежать stale closure
  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const openStream = useCallback(
    async (mode: "user" | "environment") => {
      stopStream();
      setStage("starting");
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("unsupported"), { name: "NotSupportedError" });
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode, width: { ideal: 720 }, height: { ideal: 720 }, aspectRatio: { ideal: 1 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (unmountedRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        setStage("ready");
        navigator.mediaDevices.enumerateDevices().then((devices) => setCanSwitch(devices.filter((d) => d.kind === "videoinput").length > 1)).catch(() => {});
      } catch (error) {
        if (!unmountedRef.current) setFatal(tr(mediaErrorKey(error, true)));
      }
    },
    [stopStream, tr],
  );

  useEffect(() => {
    if (typeof MediaRecorder === "undefined") {
      setFatal(tr("chat.unsupported"));
      return;
    }
    void openStream(facing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  useEffect(() => {
    const el = previewRef.current;
    if ((stage === "ready" || stage === "recording") && el && streamRef.current) {
      el.srcObject = streamRef.current;
      el.play().catch(() => {});
    }
  }, [stage, facing]);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      cancelledRef.current = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
      try {
        if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
      } catch {
        /* ignore */
      }
      stopStream();
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, [stopStream]);

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream || stage !== "ready") return;
    const mime = pickMime(VIDEO_MIMES);
    let rec: MediaRecorder;
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_200_000, audioBitsPerSecond: 64_000 }) : new MediaRecorder(stream);
    } catch {
      try {
        rec = new MediaRecorder(stream);
      } catch {
        setFatal(tr("chat.unsupported"));
        return;
      }
    }
    chunksRef.current = [];
    cancelledRef.current = false;
    rec.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
    };
    rec.onstop = () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      if (cancelledRef.current || unmountedRef.current) return;
      const duration = (Date.now() - startRef.current) / 1000;
      if (chunksRef.current.length === 0 || duration < 1) {
        onError(tr("chat.tooShort"));
        setStage("ready");
        return;
      }
      const type = rec.mimeType || mime || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      stopStream();
      setResult({ url, blob, mime: type, duration });
      setStage("review");
    };
    recRef.current = rec;
    startRef.current = Date.now();
    setSeconds(0);
    rec.start(500);
    setStage("recording");
    timerRef.current = window.setInterval(() => {
      const s = (Date.now() - startRef.current) / 1000;
      setSeconds(s);
      if (s >= MAX_VIDEO_SEC && rec.state !== "inactive") rec.stop();
    }, 200);
  };

  const stopRecording = (cancelled = false) => {
    // ИСПРАВЛЕНИЕ: защищаем от повторного вызова
    if (cancelledRef.current && cancelled) return;
    cancelledRef.current = cancelled;
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pressStartRef.current = { time: Date.now(), x: e.clientX };
    if (stage === "ready") startRecording();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pressStartRef.current || stage !== "recording") return;
    // ИСПРАВЛЕНИЕ: проверяем cancelledRef, чтобы не отменять повторно
    if (e.clientX - pressStartRef.current.x < -80 && !cancelledRef.current) {
      stopRecording(true);
      pressStartRef.current = null;
    }
  };

  const onPointerUp = () => {
    if (stage === "recording") {
      stopRecording(false);
    }
    pressStartRef.current = null;
  };

  const close = () => {
    cancelledRef.current = true;
    stopRecording(true);
    stopStream();
    onClose();
  };

  const ring = 2 * Math.PI * 48;
  const progress = Math.min(1, seconds / MAX_VIDEO_SEC);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/80 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-label={tr("chat.recordVideo")}>
      <button type="button" onClick={close} aria-label={tr("common.cancel")} className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25">
        <X className="h-5 w-5" />
      </button>

      {fatal ? (
        <div className="max-w-xs space-y-4 text-center text-white">
          <AlertCircle className="mx-auto h-10 w-10 text-danger" />
          <p className="text-sm leading-relaxed">{fatal}</p>
          <Button onClick={close}>{tr("common.cancel")}</Button>
        </div>
      ) : (
        <>
          <p className="mb-4 h-5 text-center text-xs font-medium text-white/80">
            {stage === "starting" ? tr("chat.camAsking") : stage === "ready" ? "Зажмите, чтобы записать" : stage === "recording" ? "Отпустите, чтобы отправить" : tr("chat.videoReview")}
          </p>

          <div className="relative h-[min(20rem,78vw)] w-[min(20rem,78vw)]">
            {stage === "review" && result ? (
              <VideoNote src={result.url} fallbackDuration={result.duration} tr={tr} />
            ) : (
              <>
                <div className="h-full w-full overflow-hidden rounded-full bg-black shadow-2xl">
                  <video
                    ref={previewRef}
                    autoPlay
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                    style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }}
                  />
                </div>
                <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 -rotate-90" aria-hidden>
                  <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.6" />
                  {stage === "recording" && (
                    <circle cx="50" cy="50" r="48" fill="none" stroke="rgb(239 68 68)" strokeWidth="2.2" strokeLinecap="round" strokeDasharray={ring} strokeDashoffset={ring * (1 - progress)} />
                  )}
                </svg>
                {stage === "recording" && (
                  <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-white backdrop-blur">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                    {fmtDur(seconds)}
                  </div>
                )}
                {stage === "starting" && <div className="absolute inset-0 flex items-center justify-center"><span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" /></div>}
              </>
            )}
          </div>

          <div className="mt-6 flex items-center justify-center gap-6">
            {stage === "review" ? (
              <>
                <button type="button" onClick={() => { if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current); resultUrlRef.current = null; setResult(null); setSeconds(0); void openStream(facing); }} className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/25 active:scale-95">
                  <RotateCcw className="h-4 w-4" />
                  {tr("chat.retake")}
                </button>
                <button
                  type="button"
                  onClick={() => { if (!result) return; onSend(result.blob, result.mime, result.duration); close(); }}
                  className="flex items-center gap-2 rounded-full bg-gradient-to-br from-brand to-brand/80 px-5 py-3 text-sm font-semibold text-white shadow-lg transition active:scale-95"
                >
                  <Send className="h-4 w-4" />
                  {tr("chat.sendNow")}
                </button>
              </>
            ) : (
              <>
                <span className="h-12 w-12" />
                <button
                  type="button"
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={() => stopRecording(true)}
                  disabled={stage === "starting"}
                  className={cn(
                    "flex h-[72px] w-[72px] touch-none select-none items-center justify-center rounded-full border-4 border-white transition active:scale-90 disabled:opacity-40",
                    stage === "recording" ? "bg-red-500" : "bg-transparent"
                  )}
                  style={{ touchAction: "none" }}
                >
                  {stage === "recording" ? <span className="h-6 w-6 rounded-md bg-white" /> : <span className="h-14 w-14 rounded-full bg-red-500" />}
                </button>
                <button
                  type="button"
                  onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
                  disabled={!canSwitch || stage !== "ready"}
                  className={cn("flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 active:scale-90 disabled:opacity-30", !canSwitch && "invisible")}
                >
                  <SwitchCamera className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
/* -------------------------------------------------------------------------- */
/*                               MESSAGE BUBBLE                               */
/* -------------------------------------------------------------------------- */

function isVideoNoteMedia(media: { kind?: string; name?: string | null } | null | undefined) {
  if (!media || media.kind !== "video") return false;
  return !media.name || /^video-note-/i.test(media.name);
}

function StatusTicks({ message, tr }: { message: MessagePayload; tr: Tr }) {
  const status = String((message as { status?: string }).status ?? "");
  if (status === "read") return <CheckCheck className="h-3.5 w-3.5 text-sky-300" aria-label={tr("chat.read")} />;
  if (status === "delivered") return <CheckCheck className="h-3.5 w-3.5" aria-label={tr("chat.delivered")} />;
  return <Check className="h-3.5 w-3.5" aria-label={tr("chat.sentOk")} />;
}

function MessageBubble({
  message,
  t,
  tr,
  fmt,
  onReply,
  onReact,
  onPin,
  onDelete,
  onReport,
  canManage,
  showAuthor,
}: {
  message: MessagePayload;
  t: (key: string, vars?: Record<string, unknown>) => string;
  tr: Tr;
  fmt: { time: (iso: string) => string };
  onReply: () => void;
  onReact: (emoji: string) => void;
  onPin: () => void;
  onDelete: () => void;
  onReport: () => void;
  canManage: boolean;
  showAuthor: boolean;
}) {
  const [showReactions, setShowReactions] = useState(false);
  const reactionsRef = useRef<HTMLDivElement | null>(null);

  // ИСПРАВЛЕНИЕ: закрываем панель реакций по клику вне
  useEffect(() => {
    if (!showReactions) return;
    const onClick = (e: MouseEvent) => {
      if (reactionsRef.current && !reactionsRef.current.contains(e.target as Node)) {
        setShowReactions(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showReactions]);

  if (message.deletedAt) {
    return (
      <p className={cn("max-w-[80%] rounded-2xl border border-dashed border-line px-3 py-2 text-xs italic text-muted", message.isMine && "ml-auto")}>
        {t("chat.deleted")}
      </p>
    );
  }

  const isNote = isVideoNoteMedia(message.media);
  const bigEmoji = Boolean(message.text) && !message.media && !message.replyTo && isEmojiOnly(message.text ?? "");

  return (
    <div className={cn("group flex w-full gap-2", message.isMine ? "justify-end" : "justify-start")}>
      {!message.isMine && showAuthor && <Avatar name={message.sender.displayName} url={message.sender.avatarUrl} size={30} className="mt-auto" />}
      <div className={cn("min-w-0 max-w-[82%] md:max-w-[65%]", message.isMine && "text-right")}>
        {showAuthor && !message.isMine && (
          <Link href={`/u/${message.sender.username}`} className="mb-0.5 block text-[11px] font-semibold text-brand hover:underline">
            {message.sender.displayName}
          </Link>
        )}

        <div
          className={cn(
            "relative inline-block max-w-full text-left text-sm",
            isNote || bigEmoji
              ? "p-0"
              : cn(
                  "rounded-2xl px-3 py-2 shadow-sm",
                  message.isMine ? "rounded-br-md bg-gradient-to-br from-brand to-brand/85 text-white" : "rounded-bl-md border border-line bg-surface text-ink",
                ),
          )}
        >
          {message.replyTo && (
            <p className={cn("mb-1.5 rounded-lg border-l-2 px-2 py-1 text-[11px]", message.isMine ? "border-white/70 bg-white/15 text-white/90" : "border-brand bg-brandsoft text-muted")}>
              <span className={cn("block font-semibold", message.isMine ? "text-white" : "text-brand")}>{message.replyTo.senderName}</span>
              <span className="line-clamp-2">{message.replyTo.text ?? t("common.upload")}</span>
            </p>
          )}

          {message.text && (
            <p className={cn("whitespace-pre-wrap break-words leading-relaxed", bigEmoji && "text-5xl leading-tight")}>{message.text}</p>
          )}

          {message.media?.url && <MediaView kind={message.media.kind} url={message.media.url} name={message.media.name ?? undefined} mine={message.isMine} isNote={isNote} tr={tr} />}

          <div
            className={cn(
              "mt-1 flex items-center justify-end gap-1 text-[10px]",
              message.isMine && !isNote && !bigEmoji ? "text-white/80" : "text-muted",
              (isNote || bigEmoji) && "absolute bottom-1 right-1 mt-0 rounded-full bg-black/45 px-1.5 py-0.5 text-white backdrop-blur-sm",
            )}
          >
            {message.pinned && <Pin className="h-2.5 w-2.5" />}
            {message.editedAt && <span>{t("chat.edited")}</span>}
            <span>{fmt.time(message.createdAt)}</span>
            {message.isMine && <StatusTicks message={message} tr={tr} />}
          </div>

          {showReactions && (
            <div
              ref={reactionsRef}
              className={cn("absolute -top-10 z-20 flex gap-0.5 rounded-full border border-line bg-surface px-1.5 py-1 shadow-lg", message.isMine ? "right-0" : "left-0")}
            >
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onReact(emoji);
                    setShowReactions(false);
                  }}
                  className="rounded-full px-1 text-lg transition hover:scale-125 active:scale-90"
                  aria-label={emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {message.reactions.length > 0 && (
          <div className={cn("mt-1 flex flex-wrap gap-1", message.isMine && "justify-end")}>
            {message.reactions.map((reaction) => (
              <span key={reaction.emoji} className="rounded-full border border-line bg-surface px-1.5 py-0.5 text-[11px] shadow-sm">
                {reaction.emoji} {reaction.userIds.length}
              </span>
            ))}
          </div>
        )}

        <div className={cn("mt-0.5 flex items-center gap-2 opacity-60 transition md:opacity-0 md:group-hover:opacity-100", message.isMine && "justify-end")}>
          <button onClick={() => setShowReactions((v) => !v)} className="p-1 text-muted hover:text-brand" aria-label={t("chat.reply")}>
            <Smile className="h-4 w-4" />
          </button>
          <button onClick={onReply} className="p-1 text-[11px] text-muted hover:text-brand">
            {t("chat.reply")}
          </button>
          {(
            <Menu
              align={message.isMine ? "right" : "left"}
              trigger={({ toggle }) => (
                <button onClick={toggle} className="p-1 text-muted hover:text-brand" aria-label={t("common.edit")}>
                  <MoreHorizontal className="h-4 w-4" />
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
            </Menu>
          )}
        </div>
      </div>
      <span className="sr-only">{message.isMine ? t("chat.sent") : message.sender.displayName}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                            ОТОБРАЖЕНИЕ МЕДИА                               */
/* -------------------------------------------------------------------------- */

function MediaView({
  kind,
  url,
  name,
  mine,
  isNote,
  duration,
  tr,
}: {
  kind?: string;
  url: string;
  name?: string;
  mine: boolean;
  isNote: boolean;
  duration?: number;
  tr: Tr;
}) {
  const { t } = useApp();
  if (kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="mt-1 max-h-72 w-full rounded-xl object-cover" loading="lazy" />;
  }
  if (kind === "video") {
    return isNote ? (
      <VideoNote src={url} fallbackDuration={duration} tr={tr} />
    ) : (
      <video src={url} controls playsInline preload="metadata" className="mt-1 max-h-72 w-full rounded-xl bg-black" />
    );
  }
  if (kind === "audio") return <AudioPlayer src={url} mine={mine} fallbackDuration={duration} tr={tr} />;
  return (
    <a href={url} download className="mt-1 flex items-center gap-2 text-xs underline">
      <Paperclip className="h-3.5 w-3.5" />
      <span className="truncate">{name ?? t("common.download")}</span>
    </a>
  );
}

function PendingBubble({ item, tr, onRetry, onDiscard }: { item: PendingItem; tr: Tr; onRetry: () => void; onDiscard: () => void }) {
  const failed = item.status === "failed";
  const isNote = item.kind === "video" && item.isNote;
  return (
    <div className="flex w-full justify-end">
      <div className="max-w-[82%] text-right md:max-w-[65%]">
        <div
          className={cn(
            "relative inline-block max-w-full text-left text-sm",
            isNote ? "p-0" : "rounded-2xl rounded-br-md bg-gradient-to-br from-brand to-brand/85 px-3 py-2 text-white shadow-sm",
            failed && "ring-2 ring-danger/70",
            !failed && "opacity-90",
          )}
        >
          {item.text && <p className="whitespace-pre-wrap break-words leading-relaxed">{item.text}</p>}
          {item.localUrl && <MediaView kind={item.kind} url={item.localUrl} name={item.file?.name} mine isNote={Boolean(isNote)} duration={item.duration} tr={tr} />}
          {!item.localUrl && item.kind === "file" && (
            <p className="flex items-center gap-2 text-xs">
              <Paperclip className="h-3.5 w-3.5" />
              <span className="truncate">{item.file?.name}</span>
            </p>
          )}
          <div className={cn("mt-1 flex items-center justify-end gap-1 text-[10px]", isNote ? "absolute bottom-1 right-1 mt-0 rounded-full bg-black/45 px-1.5 py-0.5 text-white backdrop-blur-sm" : "text-white/80")}>
            {failed ? <AlertCircle className="h-3 w-3" /> : <Clock className="h-3 w-3 animate-pulse" />}
            <span>{failed ? tr("chat.sendFailed") : tr("chat.sending")}</span>
          </div>
        </div>
        {failed && (
          <div className="mt-1 flex flex-wrap items-center justify-end gap-2 text-[11px]">
            {item.error && <span className="max-w-[16rem] truncate text-danger">{item.error}</span>}
            <button onClick={onRetry} className="flex items-center gap-1 rounded-full bg-brandsoft px-2.5 py-1 font-semibold text-brand active:scale-95">
              <RotateCcw className="h-3 w-3" />
              {tr("chat.retry")}
            </button>
            <button onClick={onDiscard} className="rounded-full px-2 py-1 text-muted hover:text-danger">
              {tr("chat.discard")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                AUDIO PLAYER                                */
/* -------------------------------------------------------------------------- */

function AudioPlayer({
  src,
  mine,
  peaks,
  fallbackDuration,
  tr,
  compact,
}: {
  src: string;
  mine: boolean;
  peaks?: number[];
  fallbackDuration?: number;
  tr: Tr;
  compact?: boolean;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const draggingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(fallbackDuration ?? 0);
  const [rate, setRate] = useState(1);
  const [failed, setFailed] = useState(false);

  const bars = useMemo(() => (peaks && peaks.length > 0 ? resample(peaks, 40) : seededBars(src, 40)), [peaks, src]);
  const total = isFinite(dur) && dur > 0 ? dur : fallbackDuration ?? 0;
  const ratio = total > 0 ? Math.min(1, cur / total) : 0;

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) {
      a.playbackRate = rate;
      a.play().catch(() => setFailed(true));
    } else {
      a.pause();
    }
  };

  const onMeta = () => {
    const a = ref.current;
    if (!a) return;
    if (a.duration === Infinity || isNaN(a.duration)) {
      const fix = () => {
        a.removeEventListener("timeupdate", fix);
        if (isFinite(a.duration)) setDur(a.duration);
        a.currentTime = 0;
      };
      a.addEventListener("timeupdate", fix);
      a.currentTime = 1e101;
    } else {
      setDur(a.duration);
    }
  };

  const seek = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const a = ref.current;
    if (a && total > 0) {
      a.currentTime = x * total;
      setCur(x * total);
    }
  };

  const cycleRate = () => {
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    if (ref.current) ref.current.playbackRate = next;
  };

  const playBtn = mine ? "bg-white text-brand" : "bg-brand text-white";
  const barOn = mine ? "bg-white" : "bg-brand";
  const barOff = mine ? "bg-white/40" : "bg-brand/30";
  const txt = mine ? "text-white/85" : "text-muted";

  return (
    <div className={cn("flex items-center gap-2.5", compact ? "w-full" : "mt-1 w-[min(260px,68vw)]")}>
      <audio
        ref={ref}
        src={src}
        preload="metadata"
        onLoadedMetadata={onMeta}
        onTimeUpdate={() => ref.current && !draggingRef.current && setCur(ref.current.currentTime)}
        onPlay={() => {
          if (ref.current) claimMedia(ref.current);
          setPlaying(true);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCur(0);
          if (ref.current) ref.current.currentTime = 0;
        }}
        onError={() => setFailed(true)}
        className="hidden"
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? tr("chat.pause") : tr("chat.play")}
        className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm transition active:scale-90", playBtn)}
      >
        {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
      </button>

      <div className="min-w-0 flex-1">
        <div
          className="flex h-7 cursor-pointer touch-none items-center gap-[2px]"
          role="slider"
          aria-valuemin={0}
          aria-valuemax={Math.round(total)}
          aria-valuenow={Math.round(cur)}
          aria-label={tr("chat.voiceShort")}
          onPointerDown={(e) => {
            draggingRef.current = true;
            // ИСПРАВЛЕНИЕ: используем setPointerCapture, чтобы pointerup сработал даже вне элемента
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              /* ignore */
            }
            seek(e);
          }}
          onPointerMove={(e) => draggingRef.current && seek(e)}
          onPointerUp={(e) => {
            draggingRef.current = false;
            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
          }}
          onPointerCancel={() => {
            draggingRef.current = false;
          }}
        >
          {bars.map((v, i) => (
            <span key={i} className={cn("min-w-0 flex-1 rounded-full transition-colors", (i + 0.5) / bars.length <= ratio ? barOn : barOff)} style={{ height: `${Math.round(5 + v * 20)}px` }} />
          ))}
        </div>
        <div className={cn("mt-0.5 flex items-center justify-between text-[10px] tabular-nums", txt)}>
          <span>{failed ? tr("chat.mediaError") : playing || cur > 0 ? fmtDur(cur) : fmtDur(total)}</span>
          <button type="button" onClick={cycleRate} aria-label={tr("chat.speed")} className={cn("rounded-full px-1.5 font-semibold transition", mine ? "bg-white/20 hover:bg-white/30" : "bg-brand/10 text-brand hover:bg-brand/20")}>
            {rate}x
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                VIDEO NOTE                                  */
/* -------------------------------------------------------------------------- */

function VideoNote({ src, fallbackDuration, tr }: { src: string; fallbackDuration?: number; tr: Tr }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(fallbackDuration ?? 0);

  const total = isFinite(dur) && dur > 0 ? dur : fallbackDuration ?? 0;
  const ratio = total > 0 ? Math.min(1, cur / total) : 0;
  const ring = 2 * Math.PI * 48;

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      setLoading(true);
      el.play().catch(() => {
        setFailed(true);
        setLoading(false);
      });
    } else {
      el.pause();
    }
  };

  const onMeta = () => {
    const el = ref.current;
    if (!el) return;
    if (el.duration === Infinity || isNaN(el.duration)) {
      const fix = () => {
        el.removeEventListener("timeupdate", fix);
        if (isFinite(el.duration)) setDur(el.duration);
        el.currentTime = 0;
      };
      el.addEventListener("timeupdate", fix);
      el.currentTime = 1e101;
    } else {
      setDur(el.duration);
    }
  };

  return (
    <div className="relative mt-1 h-64 w-64 max-w-full select-none">
      <div
        className="relative h-full w-full cursor-pointer overflow-hidden rounded-full bg-black shadow-lg"
        onClick={toggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        aria-label={playing ? tr("chat.pause") : tr("chat.play")}
      >
        <video
          ref={ref}
          src={src}
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
          onLoadedMetadata={onMeta}
          onTimeUpdate={() => ref.current && setCur(ref.current.currentTime)}
          onPlay={() => {
            if (ref.current) claimMedia(ref.current);
            setPlaying(true);
          }}
          onPlaying={() => setLoading(false)}
          onWaiting={() => setLoading(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setCur(0);
            if (ref.current) ref.current.currentTime = 0;
          }}
          onError={() => {
            setFailed(true);
            setLoading(false);
          }}
        />

        {!playing && !failed && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/25">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-black shadow-lg">
              <Play className="ml-0.5 h-6 w-6 fill-current" />
            </span>
          </div>
        )}
        {loading && <span className="absolute inset-0 m-auto h-9 w-9 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
        {failed && <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-6 text-center text-xs text-white">{tr("chat.mediaError")}</div>}
      </div>

      <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r="48.5" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.2" />
        <circle cx="50" cy="50" r="48.5" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeDasharray={ring} strokeDashoffset={ring * (1 - ratio)} />
      </svg>

      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium tabular-nums text-white backdrop-blur-sm">
        {playing || cur > 0 ? fmtDur(cur) : fmtDur(total)}
      </span>
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
