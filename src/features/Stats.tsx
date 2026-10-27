import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Scatter,
  ScatterChart,
  ZAxis
} from 'recharts';
import type { DayEntry, StatsWindow } from '../lib/types';
import { ACTIVITY_LABELS, BODY_PART_LABELS, type ActivityType } from '../lib/types';
import { getAllEntries } from '../lib/db';
import {
  computeWindowStats,
  computeACWR,
  acwrZone,
  ACWR_ZONE_LABELS,
  dailyLoadSeries,
  weeklyLoadSeries,
  heatmapData,
  loadVsPain,
  loadChangePercent
} from '../lib/stats';
import { formatDayShort, WEEKDAY_LABELS, parseDay, toISODate, windowDays } from '../lib/dates';
import { Card, CardTitle, StatCard, EmptyState } from '../components/ui';

const WINDOWS: { id: StatsWindow; label: string }[] = [
  { id: 7, label: '7 d' },
  { id: 30, label: '30 d' },
  { id: 90, label: '90 d' },
  { id: 'all', label: 'Alle' }
];

const chartTooltipStyle = {
  background: '#1d3a54',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 12,
  color: '#fff'
} as const;

export default function Stats() {
  const [entries, setEntries] = useState<DayEntry[]>([]);
  const [window, setWindow] = useState<StatsWindow>(30);

  useEffect(() => {
    getAllEntries().then(setEntries);
  }, []);

  const stats = useMemo(() => computeWindowStats(entries, window), [entries, window]);
  const acwr = useMemo(() => computeACWR(entries), [entries]);
  const zone = acwrZone(acwr.ratio);
  const change = useMemo(() => loadChangePercent(entries, window === 'all' ? 30 : window), [entries, window]);

  const trendDays = window === 'all' ? 90 : window;
  const trend = useMemo(
    () =>
      dailyLoadSeries(entries, trendDays).map((d) => ({
        ...d,
        label: formatDayShort(d.date)
      })),
    [entries, trendDays]
  );

  const weekly = useMemo(() => {
    const weeks = window === 'all' ? 12 : Math.ceil(trendDays / 7);
    return weeklyLoadSeries(entries, weeks).map((w) => ({
      ...w,
      label: formatDayShort(w.weekStart)
    }));
  }, [entries, window, trendDays]);

  const heat = useMemo(() => heatmapData(entries, window), [entries, window]);

  const byTypeData = useMemo(
    () =>
      (Object.keys(ACTIVITY_LABELS) as ActivityType[])
        .map((t) => ({ type: ACTIVITY_LABELS[t], value: stats.byType[t] }))
        .filter((d) => d.value > 0),
    [stats]
  );

  const painByPartData = useMemo(
    () =>
      Object.entries(stats.painByBodyPart)
        .map(([part, v]) => ({
          part: BODY_PART_LABELS[part as keyof typeof BODY_PART_LABELS],
          count: v.count,
          avg: v.count > 0 ? v.totalLevel / v.count : 0,
          max: v.maxLevel
        }))
        .filter((d) => d.count > 0),
    [stats]
  );

  const scatter = useMemo(() => loadVsPain(entries, trendDays), [entries, trendDays]);

  const heatWeeks = useMemo(() => {
    const cells = heat.map((h) => ({ ...h, dow: (parseDay(h.date).getDay() + 6) % 7 }));
    const weeksMap = new Map<number, typeof cells>();
    for (const c of cells) {
      const monday = toISODate(parseDay(c.date).getDay() === 0 ? parseDay(c.date) : new Date(parseDay(c.date).getTime() - ((parseDay(c.date).getDay() + 6) % 7) * 86400000));
      const key = parseDay(monday).getTime();
      if (!weeksMap.has(key)) weeksMap.set(key, []);
      weeksMap.get(key)!.push(c);
    }
    return Array.from(weeksMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, days]) => days);
  }, [heat]);

  const loadColor = (v: number) =>
    v === 0
      ? 'bg-white/5'
      : v >= 8
        ? 'bg-viking-gold'
        : v >= 5
          ? 'bg-viking-blue-light'
          : 'bg-viking-blue/70';

  if (entries.length === 0) {
    return (
      <EmptyState>
        Ingen data ennå. Registrer dager under <strong>Loggfør</strong>, så dukker statistikken opp her.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {WINDOWS.map((w) => (
          <button
            key={w.id}
            onClick={() => setWindow(w.id)}
            className={`chip flex-1 justify-center ${
              window === w.id
                ? 'border-viking-gold bg-viking-gold/15 text-viking-gold'
                : 'border-white/15 text-viking-white/70'
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>

      <h2 className="mb-2 font-display text-base uppercase tracking-widest text-viking-white">Nøkkeltall</h2>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Økter" value={stats.totalSessions} sub={`${stats.activeDays} av ${stats.days} dager aktive`} />
        <StatCard label="Total belastning" value={stats.totalLoad} sub={`Snitt ${stats.avgLoad.toFixed(1)} / økt`} />
        <StatCard
          label="Maks belastning"
          value={stats.maxLoad || '–'}
          sub={stats.maxLoadDay ? formatDayShort(stats.maxLoadDay) : undefined}
        />
        <StatCard
          label="Varighet"
          value={stats.totalDurationMin > 0 ? `${Math.round(stats.totalDurationMin / 60)} t` : '–'}
          sub={stats.totalDurationMin > 0 ? `${stats.totalDurationMin} min totalt` : 'ikke ført'}
        />
        <StatCard
          label="Total smerte"
          value={stats.totalPain}
          sub={`Snitt ${stats.avgPainPerDay.toFixed(1)} / dag`}
          accent={stats.highPainDays > 0 ? 'red' : stats.daysWithPain > 0 ? 'white' : 'green'}
        />
        <StatCard
          label="Dager med smerte ≥ 6"
          value={stats.highPainDays}
          sub={`${stats.daysWithPain} dager med smerte totalt`}
          accent={stats.highPainDays > 0 ? 'red' : 'green'}
        />
        <StatCard
          label="Belastningsendring"
          value={change === null ? '–' : `${change >= 0 ? '+' : ''}${change.toFixed(0)} %`}
          sub="vs forrige like lang periode"
          accent={change !== null && change > 50 ? 'red' : change !== null && change > 25 ? 'white' : 'green'}
        />
        <StatCard
          label="ACWR"
          value={acwr.ratio === null ? '–' : acwr.ratio.toFixed(2)}
          sub={<span className={zone === 'danger' ? 'text-[#E05A66]' : zone === 'high' ? 'text-amber-400' : zone === 'sweet' ? 'text-emerald-400' : 'text-viking-white/60'}>{ACWR_ZONE_LABELS[zone]}</span>}
          accent={zone === 'danger' ? 'red' : zone === 'high' ? 'white' : 'green'}
        />
      </div>

      {acwr.ratio !== null && (
        <Card>
          <CardTitle>Akutt : kronisk belastning (ACWR)</CardTitle>
          <p className="text-sm text-viking-white/70">
            Snitt daglig belastning siste 7 dager: <strong className="text-viking-gold">{acwr.acute.toFixed(1)}</strong>
            {' · '}snitt dagene før det (28 dager): <strong className="text-viking-white">{acwr.chronic.toFixed(1)}</strong>
          </p>
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full ${
                zone === 'danger' ? 'bg-[#E05A66]' : zone === 'high' ? 'bg-amber-400' : zone === 'sweet' ? 'bg-emerald-400' : 'bg-sky-400'
              }`}
              style={{ width: `${Math.min(100, (acwr.ratio / 2) * 100)}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-viking-white/45">
            <span>0</span>
            <span className="text-emerald-400">0,8–1,3 grønn</span>
            <span>2,0</span>
          </div>
          <p className="mt-2 text-xs text-viking-white/55">
            ACWR brukes i idretten for å følge med på belastning over tid. Over 1,5 regnes som økt risiko –
            dette er en pekepinn, ikke medisinsk råd.
          </p>
        </Card>
      )}

      <Card>
        <CardTitle>Økter per type trening</CardTitle>
        {byTypeData.length === 0 ? (
          <p className="text-sm text-viking-white/55">Ingen økter i dette vinduet.</p>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byTypeData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="type" tick={{ fill: '#ffffffaa', fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} tick={{ fill: '#ffffff88', fontSize: 11 }} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="value" fill="#DBC067" radius={[6, 6, 0, 0]} name="Økter" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>Belastning og smerte – trend</CardTitle>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#ffffff88', fontSize: 10 }} minTickGap={24} />
              <YAxis domain={[0, 10]} tick={{ fill: '#ffffff88', fontSize: 11 }} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Line type="monotone" dataKey="load" stroke="#DBC067" strokeWidth={2} dot={false} name="Belastning" />
              <Line type="monotone" dataKey="pain" stroke="#E05A66" strokeWidth={2} dot={false} name="Smerte (sum)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <CardTitle>Belastning per uke</CardTitle>
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekly} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#ffffff88', fontSize: 10 }} minTickGap={20} />
              <YAxis tick={{ fill: '#ffffff88', fontSize: 11 }} />
              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(v: number, name: string) =>
                  name === 'totalLoad' ? [`${v} (belastning)`, 'Uke'] : [`${v} økter`, 'Uke']
                }
              />
              <Bar dataKey="totalLoad" fill="#1d3a54" stroke="#DBC067" strokeWidth={1} radius={[6, 6, 0, 0]} name="totalLoad" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <CardTitle>Kalender – belastning</CardTitle>
        <div className="flex gap-1">
          <div className="flex w-7 flex-col gap-1 pt-5">
            {WEEKDAY_LABELS.map((d, i) => (
              <div key={d} className="flex h-3.5 items-center text-[9px] text-viking-white/45">
                {i % 2 === 1 ? d : ''}
              </div>
            ))}
          </div>
          <div className="flex flex-1 gap-1 overflow-x-auto pb-1">
            {heatWeeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {Array.from({ length: 7 }, (_, dow) => {
                  const cell = week.find((c) => c.dow === dow);
                  if (!cell) return <div key={dow} className="h-3.5 w-3.5" />;
                  return (
                    <div
                      key={cell.date}
                      title={`${formatDayShort(cell.date)}: belastning ${cell.load}${cell.hasPain ? ' · smerte registrert' : ''}`}
                      className={`h-3.5 w-3.5 rounded-sm ${loadColor(cell.load)} ${
                        cell.hasPain ? 'ring-1 ring-[#E05A66]' : ''
                      }`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 text-[10px] text-viking-white/50">
          <span>Mindre</span>
          <span className="h-3 w-3 rounded-sm bg-white/5" />
          <span className="h-3 w-3 rounded-sm bg-viking-blue/70" />
          <span className="h-3 w-3 rounded-sm bg-viking-blue-light" />
          <span className="h-3 w-3 rounded-sm bg-viking-gold" />
          <span>Mer</span>
          <span className="ml-2 flex items-center gap-1">
            <span className="h-3 w-3 rounded-sm bg-viking-blue-light ring-1 ring-[#E05A66]" /> smerte
          </span>
        </div>
      </Card>

      {painByPartData.length > 0 && (
        <Card>
          <CardTitle>Smerte per kroppsdel</CardTitle>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={painByPartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#ffffff88', fontSize: 11 }} />
                <YAxis type="category" dataKey="part" tick={{ fill: '#ffffffaa', fontSize: 11 }} width={50} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(v: number, name: string) =>
                    name === 'count' ? [`${v} ganger`, 'Antall'] : [`${v.toFixed(1)} / 10`, 'Snitt nivå']
                  }
                />
                <Bar dataKey="count" fill="#E05A66" radius={[0, 6, 6, 0]} name="count" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {scatter.length > 0 && (
        <Card>
          <CardTitle>Belastning vs smerte</CardTitle>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis type="number" dataKey="load" name="Belastning" domain={[0, 10]} tick={{ fill: '#ffffff88', fontSize: 11 }} />
                <YAxis type="number" dataKey="pain" name="Smerte" domain={[0, 'auto']} tick={{ fill: '#ffffff88', fontSize: 11 }} />
                <ZAxis range={[60, 60]} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(v: number, name: string) => [v, name === 'load' ? 'Belastning' : 'Smerte (sum)']}
                  labelFormatter={() => ''}
                />
                <Scatter data={scatter} fill="#DBC067" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-xs text-viking-white/55">
            Hver prikk er én dag. Øverst til høyre = høy belastning med smerte – dager å følge ekstra med på.
          </p>
        </Card>
      )}
    </div>
  );
}
