
"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  Clock3,
  Eye,
  Heart,
  Info,
  MessageCircle,
  Play,
  Radio,
  Search,
  Settings,
  UserPlus,
  Users,
  UsersRound,
  Video,
  Zap,
  ChevronDown,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useApp } from "@/components/providers";
import { ErrorState, Skeleton } from "@/components/ui";
import { get } from "@/lib/client/api";

type AnalyticsData = {
  periodDays: number;
  generatedAt: string;
  totals: {
    users: number;
    registrationsToday: number;
    registrations7d: number;
    registrations30d: number;
    active24h: number;
    active7d: number;
    active30d: number;
  } | null;
  registrationsByDay: { day: string; count: number }[];
  events: { type: string; count: number; watchMs: number }[];
  content: { channels: number; groups: number };
  notes: Record<string, string>;
};

const COLORS = {
  blue: "#3288ff",
  green: "#20e3a2",
  purple: "#a855f7",
  pink: "#f044b6",
  orange: "#ffad42",
  cyan: "#27d9f2",
};

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`min-w-0 rounded-2xl border border-[#172c4d] bg-[#071326]/90 shadow-[0_8px_35px_rgba(0,0,0,0.15)] ${className}`}
    >
      {children}
    </section>
  );
}

function Sparkline({
  values,
  color,
  height = 48,
}: {
  values: number[];
  color: string;
  height?: number;
}) {
  const id = useMemo(
    () => `glow-${color.replace("#", "")}-${height}`,
    [color, height],
  );

  const points = useMemo(() => {
    const source = values.length ? values : [0, 0];
    const padded = source.length === 1 ? [source[0], source[0]] : source;
    const max = Math.max(...padded, 1);
    const min = Math.min(...padded, 0);
    const range = max - min || 1;

    return padded.map((value, index) => ({
      x: 2 + (index / Math.max(padded.length - 1, 1)) * 196,
      y: height - 5 - ((value - min) / range) * (height - 13),
    }));
  }, [values, height]);

  const line = points
    .map((point, index) =>
      `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`,
    )
    .join(" ");

  const area = `${line} L 198 ${height} L 2 ${height} Z`;

  return (
    <svg
      viewBox={`0 0 200 ${height}`}
      preserveAspectRatio="none"
      className="block w-full overflow-visible"
      style={{ height }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {points.length < 30 &&
        points.map((point, index) => (
          <circle
            key={index}
            cx={point.x}
            cy={point.y}
            r="2"
            fill={color}
          />
        ))}
    </svg>
  );
}

function MetricCard({
  title,
  value,
  icon: Icon,
  color,
  spark,
  hint,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  spark?: number[];
  hint?: string;
}) {
  const { fmt } = useApp();

  const displayValue =
    typeof value === "number" ? fmt.number(value) : value;

  return (
    <Panel className="relative overflow-hidden p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[#29466e]">
      <div
        className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full opacity-[0.08] blur-2xl"
        style={{ backgroundColor: color }}
      />
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-xs leading-5 text-[#94a9c8]">{title}</p>
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{
            color,
            backgroundColor: `${color}18`,
            boxShadow: `inset 0 0 0 1px ${color}30`,
          }}
        >
          <Icon size={18} />
        </span>
      </div>
      <p className="relative mt-3 text-3xl font-semibold tracking-tight text-white">
        {displayValue}
      </p>
      {hint && (
        <p className="mt-1 text-[11px] text-[#7088aa]">{hint}</p>
      )}
      {spark && (
        <div className="mt-3">
          <Sparkline values={spark} color={color} />
        </div>
      )}
    </Panel>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  subtitle,
  color = COLORS.blue,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{
          color,
          backgroundColor: `${color}18`,
          boxShadow: `inset 0 0 0 1px ${color}25`,
        }}
      >
        <Icon size={19} />
      </span>
      <div className="min-w-0">
        <h2 className="font-semibold text-white">{title}</h2>
        {subtitle && (
          <p className="mt-0.5 text-xs text-[#8298b8]">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [days, setDays] = useState<7 | 30 | 90>(7);
  const [chartMode, setChartMode] = useState<"line" | "bars">("line");

  const query = useQuery({
    queryKey: ["admin-analytics", days],
    queryFn: () =>
      get<AnalyticsData>(`/api/admin/analytics?days=${days}`),
    refetchInterval: 60_000,
  });

  if (query.isLoading) {
    return (
      <div className="min-h-[80vh] space-y-4 rounded-2xl bg-[#050d1b] p-5">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="rounded-2xl bg-[#050d1b] p-5">
        <ErrorState
          message="Не удалось загрузить аналитику. Проверь права доступа и подключение к локальной базе."
          onRetry={() => query.refetch()}
        />
      </div>
    );
  }

  const data = query.data;
  const totals = data.totals;
  const registrations = data.registrationsByDay;

  const eventCount = (type: string) =>
    data.events.find((item) => item.type === type)?.count ?? 0;

  const watchMs =
    data.events.find((item) => item.type === "view")?.watchMs ?? 0;

  const registrationTotal =
    days === 7
      ? totals?.registrations7d ?? 0
      : days === 30
        ? totals?.registrations30d ?? 0
        : registrations.reduce((sum, item) => sum + item.count, 0);

  const formatDay = (day: string) => {
    const [, month, date] = day.split("-");
    return `${date}.${month}`;
  };

  const registrationValues = registrations.map((item) => item.count);
  const maxRegistrations = Math.max(1, ...registrationValues);
  const chartPoints = registrations.map((item, index) => {
    const count = registrations.length;
    const x = count <= 1 ? 50 : 4 + (index / (count - 1)) * 92;
    const y = 92 - (item.count / maxRegistrations) * 78;
    return { ...item, x, y };
  });

  const linePath = chartPoints
    .map((point, index) =>
      `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`,
    )
    .join(" ");

  const areaPath = chartPoints.length
    ? `${linePath} L ${chartPoints[chartPoints.length - 1].x} 96 L ${chartPoints[0].x} 96 Z`
    : "";

  const activityItems = [
    {
      label: "Просмотры видео",
      value: eventCount("view"),
      icon: Play,
      color: COLORS.cyan,
    },
    {
      label: "Лайки",
      value: eventCount("like"),
      icon: Heart,
      color: COLORS.pink,
    },
    {
      label: "Подписки",
      value: eventCount("follow"),
      icon: UserPlus,
      color: COLORS.purple,
    },
  ];

  return (
    <div className="min-h-screen -m-3 space-y-5 bg-[#050d1b] p-3 text-white sm:-m-5 sm:p-5 lg:-m-6 lg:p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/admin"
            aria-label="Назад в админку"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#1b3153] bg-[#0a1930] text-[#a9c2e8] transition hover:border-blue-500 hover:text-white"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Аналитика <span className="text-blue-400">UZON</span>
            </h1>
            <p className="mt-1 text-sm text-[#8298b8]">
              Регистрации, активность и использование контента
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 rounded-full border border-[#173a3a] bg-[#08231f] px-3 py-2 text-xs text-emerald-300 sm:flex">
  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
  Система активна
</span>
          <button
            type="button"
            onClick={() => query.refetch()}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#1b3153] bg-[#0a1930] text-[#a9c2e8] hover:text-white"
            aria-label="Обновить аналитику"
            title="Обновить аналитику"
          >
            <Activity size={18} />
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-[#7f96b8]">
          <CalendarDays size={15} />
          Период статистики
        </div>
        <div className="inline-flex rounded-xl border border-[#1c3152] bg-[#09162a] p-1">
          {([7, 30, 90] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setDays(value)}
              className={`rounded-lg px-4 py-2 text-sm transition ${
                days === value
                  ? "bg-gradient-to-r from-indigo-600 to-blue-500 font-semibold text-white shadow-lg shadow-blue-900/30"
                  : "text-[#91a8ca] hover:bg-[#132541] hover:text-white"
              }`}
            >
              {value} дней
            </button>
          ))}
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Всего пользователей"
          value={totals?.users ?? 0}
          icon={Users}
          color={COLORS.blue}
          spark={registrationValues}
          hint="Все не удалённые аккаунты"
        />
        <MetricCard
          title="Активны за 24 часа"
          value={totals?.active24h ?? 0}
          icon={Zap}
          color={COLORS.green}
          hint="По последней активности"
        />
        <MetricCard
          title="Активны за 7 дней"
          value={totals?.active7d ?? 0}
          icon={Clock3}
          color={COLORS.purple}
          hint="Уникальные профили по lastSeenAt"
        />
        <MetricCard
          title="Активны за 30 дней"
          value={totals?.active30d ?? 0}
          icon={CalendarDays}
          color={COLORS.pink}
          hint="Уникальные профили по lastSeenAt"
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard
          title="Регистрации сегодня"
          value={totals?.registrationsToday ?? 0}
          icon={UserPlus}
          color={COLORS.cyan}
          hint="За последние 24 часа"
        />
        <MetricCard
          title={`Регистрации за ${days} дней`}
          value={registrationTotal}
          icon={ChartNoAxesCombined}
          color={COLORS.green}
        />
        <MetricCard
          title="Просмотры видео"
          value={eventCount("view")}
          icon={Play}
          color={COLORS.cyan}
        />
        <MetricCard
          title="Лайки"
          value={eventCount("like")}
          icon={Heart}
          color={COLORS.pink}
        />
        <MetricCard
          title="Подписки"
          value={eventCount("follow")}
          icon={UserPlus}
          color={COLORS.purple}
        />
        <MetricCard
          title="Отписки"
          value={eventCount("unfollow")}
          icon={Users}
          color={COLORS.orange}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(270px,0.85fr)]">
        <Panel className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle
              icon={ChartNoAxesCombined}
              title="Новые регистрации"
              subtitle={`По дням за выбранный период · ${days} дней`}
            />
            <div className="flex rounded-lg border border-[#1c3152] bg-[#09162a] p-1">
              <button
                type="button"
                onClick={() => setChartMode("line")}
                className={`rounded-md px-3 py-1.5 text-xs ${
                  chartMode === "line"
                    ? "bg-indigo-600 text-white"
                    : "text-[#8ca3c5] hover:text-white"
                }`}
              >
                Линия
              </button>
              <button
                type="button"
                onClick={() => setChartMode("bars")}
                className={`rounded-md px-3 py-1.5 text-xs ${
                  chartMode === "bars"
                    ? "bg-indigo-600 text-white"
                    : "text-[#8ca3c5] hover:text-white"
                }`}
              >
                Столбцы
              </button>
            </div>
          </div>

          {registrations.length === 0 ? (
            <p className="py-16 text-center text-sm text-[#8298b8]">
              За этот период регистраций нет.
            </p>
          ) : (
            <div className="mt-6">
              {chartMode === "line" ? (
                <div className="relative h-64">
                  <div className="absolute inset-0 flex flex-col justify-between pb-5">
                    {[3, 2, 1, 0].map((tick) => (
                      <div
                        key={tick}
                        className="flex items-center gap-3"
                      >
                        <span className="w-4 text-right text-[10px] text-[#6e86a8]">
                          {Math.round((maxRegistrations * tick) / 3)}
                        </span>
                        <div className="h-px flex-1 border-t border-dashed border-[#1a2c49]" />
                      </div>
                    ))}
                  </div>
                  <svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    className="absolute inset-0 h-[calc(100%-20px)] w-full overflow-visible"
                    role="img"
                    aria-label="График новых регистраций по дням"
                  >
                    <defs>
                      <linearGradient
                        id="registration-fill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="0%" stopColor={COLORS.blue} stopOpacity=".35" />
                        <stop offset="100%" stopColor={COLORS.blue} stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {areaPath && <path d={areaPath} fill="url(#registration-fill)" />}
                    {linePath && (
                      <path
                        d={linePath}
                        fill="none"
                        stroke={COLORS.blue}
                        strokeWidth=".8"
                        vectorEffect="non-scaling-stroke"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                    {chartPoints.map((point) => (
                      <circle
                        key={point.day}
                        cx={point.x}
                        cy={point.y}
                        r=".9"
                        fill={COLORS.blue}
                        stroke="#d9e9ff"
                        strokeWidth=".25"
                        vectorEffect="non-scaling-stroke"
                      >
                        <title>
                          {point.day}: {point.count} регистраций
                        </title>
                      </circle>
                    ))}
                  </svg>
                  <div className="absolute inset-x-7 bottom-0 flex justify-between gap-1 overflow-hidden">
                    {registrations
                      .filter((_, index) => {
                        const step = Math.max(1, Math.ceil(registrations.length / 7));
                        return index % step === 0 || index === registrations.length - 1;
                      })
                      .map((item) => (
                        <span
                          key={item.day}
                          className="text-[10px] text-[#8098bb]"
                        >
                          {formatDay(item.day)}
                        </span>
                      ))}
                  </div>
                </div>
              ) : (
                <div className="flex h-64 items-end gap-2 overflow-x-auto border-b border-[#1b2d49] px-1 pb-0 pt-4">
                  {registrations.map((item) => (
                    <div
                      key={item.day}
                      title={`${item.day}: ${item.count} регистраций`}
                      className="flex h-full min-w-5 flex-1 flex-col items-center justify-end gap-2"
                    >
                      <span className="text-[10px] text-[#9eb5d6]">
                        {item.count}
                      </span>
                      <div
                        className="w-full max-w-10 rounded-t-md bg-gradient-to-t from-blue-700 to-blue-400 transition-all duration-500"
                        style={{
                          height: `${Math.max(
                            2,
                            (item.count / maxRegistrations) * 75,
                          )}%`,
                        }}
                      />
                      <span className="pb-1 text-[9px] text-[#8098bb]">
                        {formatDay(item.day)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-4 text-xs text-[#7189ac]">
                Всего регистраций в отображаемом ряду:{" "}
                <span className="font-semibold text-white">
                  {registrations.reduce((sum, item) => sum + item.count, 0)}
                </span>
              </p>
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <SectionTitle
                icon={Activity}
                title="Активность"
                subtitle="По данным профилей"
                color={COLORS.green}
              />
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
            </div>
            <div className="mt-5 rounded-xl border border-[#173b39] bg-[#08211f] p-4">
              <p className="text-xs text-[#8eb8b0]">Активны за 24 часа</p>
              <p className="mt-2 text-4xl font-semibold text-white">
                {totals?.active24h ?? 0}
              </p>
              <p className="mt-1 text-xs text-emerald-300">
                Пользователи с недавней активностью
              </p>
            </div>
            <div className="mt-5">
              <p className="mb-3 text-sm font-medium text-white">
                События за выбранный период
              </p>
              <div className="space-y-3">
                {activityItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className="flex items-center gap-3"
                    >
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-xl"
                        style={{
                          color: item.color,
                          backgroundColor: `${item.color}18`,
                        }}
                      >
                        <Icon size={17} />
                      </span>
                      <span className="flex-1 text-xs text-[#9aafcd]">
                        {item.label}
                      </span>
                      <span className="text-sm font-semibold text-white">
                        {item.value.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Panel>

          <Panel className="p-4 sm:p-5">
            <SectionTitle
              icon={Radio}
              title="Каналы и группы"
              subtitle="Количество в базе"
              color={COLORS.purple}
            />
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-[#1b3152] bg-[#0a1930] p-3">
                <Radio size={17} className="text-purple-400" />
                <p className="mt-3 text-xs text-[#91a8c8]">Каналы</p>
                <p className="mt-1 text-2xl font-semibold">
                  {data.content.channels}
                </p>
              </div>
              <div className="rounded-xl border border-[#1b3152] bg-[#0a1930] p-3">
                <MessageCircle size={17} className="text-blue-400" />
                <p className="mt-3 text-xs text-[#91a8c8]">Группы</p>
                <p className="mt-1 text-2xl font-semibold">
                  {data.content.groups}
                </p>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <Panel className="p-4">
          <SectionTitle
            icon={Play}
            title="Просмотры видео"
            color={COLORS.cyan}
          />
          <p className="mt-4 text-3xl font-semibold">
            {eventCount("view").toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-[#8098bb]">
            События за выбранный период
          </p>
        </Panel>
        <Panel className="p-4">
          <SectionTitle
            icon={Heart}
            title="Лайки"
            color={COLORS.pink}
          />
          <p className="mt-4 text-3xl font-semibold">
            {eventCount("like").toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-[#8098bb]">
            Зарегистрированные события
          </p>
        </Panel>
        <Panel className="p-4">
          <SectionTitle
            icon={UserPlus}
            title="Подписки"
            color={COLORS.orange}
          />
          <p className="mt-4 text-3xl font-semibold">
            {eventCount("follow").toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-[#8098bb]">
            События подписки за период
          </p>
        </Panel>
      </section>

      <Panel className="p-4 sm:p-5">
        <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
          <SectionTitle
            icon={Video}
            title="Время просмотра видео"
            subtitle="Сумма watchMs из зарегистрированных событий"
            color={COLORS.blue}
          />
          <div>
            <p className="text-3xl font-semibold text-white">
              {Math.floor(watchMs / 60000)} мин.
            </p>
            <p className="mt-1 text-xs text-[#8098bb]">
              За выбранный период
            </p>
          </div>
        </div>
      </Panel>

      <footer className="flex flex-wrap items-start justify-between gap-3 border-t border-[#192b47] pt-4 text-xs text-[#7188a8]">
        <div className="flex items-start gap-2">
          <Info size={15} className="mt-0.5 shrink-0" />
          <p className="max-w-3xl leading-5">
            Активность определяется по lastSeenAt. Посещения страниц и
            анонимные посетители отдельно пока не учитываются. Просмотры
            и лайки основаны на уже зарегистрированных событиях.
          </p>
        </div>
        <p>
          Обновлено:{" "}
          {new Date(data.generatedAt).toLocaleString()}
        </p>
      </footer>
    </div>
  );
}
