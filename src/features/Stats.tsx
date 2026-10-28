import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Scatter,
  ScatterChart,
  ZAxis
} from 'recharts';
import type { Category, DayEntry, StatsWindow } from '../lib/types';
import { categoryLabel } from '../lib/categories';
import { getAllCategories } from '../lib/categories';
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
import { chartTheme, chartTooltipStyle } from '../lib/theme';
import { Card, CardTitle, StatCard, EmptyState, loadColorBgClass } from '../components/ui';

const WINDOWS: { id: StatsWindow; label: string }[] = [
  { id: 7, label: '7 d' },
  { id: 30, label: '30 d' },
  { id: 90, label: '90 d' },
  { id: 'all', label: 'Alle' }
];

export default function Stats() {
  const [entries, setEntries] = useState<DayEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [window, setWindow] = useState<StatsWindow>(30);
  const ct = useMemo(() => chartTheme(), []);

  useEffect(() => {
    getAllEntries().then(setEntries);
    getAllCategories().then(setCategories);
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

  const byTypeData = useMemo(() => {
    return Object.entries(stats.byType)
      .map(([key, value]) => ({ type: categoryLabel(categories, 'activity', key).label, value }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [stats, categories]);

  const painByPartData = useMemo(
    () =>
      Object.entries(stats.painByBodyPart)
        .map(([part, v]) => ({
          part: categoryLabel(categories, 'body_part', part).label,
          count: v.count,
          avg: v.count > 0 ? v.totalLevel / v.count : 0,
          max: v.maxLevel
        }))
        .filter((d) => d.count > 0),
    [stats, categories]
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

  const maxDuration = useMemo(
    () => Math.max(30, ...trend.map((d) => d.durationMin)),
    [trend]
  );

  const zoneTextColor =
    zone === 'danger'
      ? 'text-app-pain-soft'
      : zone === 'high'
        ? 'text-amber-500 dark:text-amber-400'
        : zone === 'sweet'
          ? 'text-emerald-500 dark:text-emerald-400'
          : 'text-app-text/60';

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
                ? 'border-app-gold bg-app-gold/20 text-app-gold'
                : 'border-app-border/20 text-app-text/70'
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>

      <h2 className="mb-2 font-display text-base uppercase tracking-widest text-app-text">Nøkkeltall</h2>
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
          sub={<span className={zoneTextColor}>{ACWR_ZONE_LABELS[zone]}</span>}
          accent={zone === 'danger' ? 'red' : zone === 'high' ? 'white' : 'green'}
        />
      </div>

      {acwr.ratio !== null && (
        <Card>
          <CardTitle>Akutt : kronisk belastning (ACWR)</CardTitle>
          <p className="text-sm text-app-text/70">
            Snitt daglig belastning siste 7 dager: <strong className="text-app-gold">{acwr.acute.toFixed(1)}</strong>
            {' · '}snitt dagene før det (28 dager): <strong className="text-app-text">{acwr.chronic.toFixed(1)}</strong>
          </p>
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-app-hover/15">
            <div
              className={`h-full ${
                zone === 'danger' ? 'bg-app-pain-soft' : zone === 'high' ? 'bg-amber-400' : zone === 'sweet' ? 'bg-emerald-400' : 'bg-sky-400'
              }`}
              style={{ width: `${Math.min(100, (acwr.ratio / 2) * 100)}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-app-text/45">
            <span>0</span>
            <span className="text-emerald-500 dark:text-emerald-400">0,8–1,3 grønn</span>
            <span>2,0</span>
          </div>
          <p className="mt-2 text-xs text-app-text/55">
            ACWR brukes i idretten for å følge med på belastning over tid. Over 1,5 regnes som økt risiko –
            dette er en pekepinn, ikke medisinsk råd.
          </p>
        </Card>
      )}

      <Card>
        <CardTitle>Økter per type trening</CardTitle>
        {byTypeData.length === 0 ? (
          <p className="text-sm text-app-text/55">Ingen økter i dette vinduet.</p>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byTypeData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} strokeOpacity={0.12} vertical={false} />
                <XAxis dataKey="type" tick={{ fill: ct.tick, fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} tick={{ fill: ct.tick, fontSize: 11 }} />
                <Tooltip contentStyle={chartTooltipStyle()} />
                <Bar dataKey="value" fill={ct.gold} radius={[6, 6, 0, 0]} name="Økter" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>Belastning, smerte og tid – trend</CardTitle>
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} strokeOpacity={0.12} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: ct.tick, fontSize: 10 }} minTickGap={24} />
              <YAxis yAxisId="left" domain={[0, 10]} tick={{ fill: ct.tick, fontSize: 11 }} />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, maxDuration]}
                tick={{ fill: ct.tick, fontSize: 11 }}
                tickFormatter={(v: number) => (v > 0 ? `${v}` : '')}
              />
              <Tooltip
                contentStyle={chartTooltipStyle()}
                formatter={(v: number, name: string) => {
                  if (name === 'Tid (min)') return [`${v} min`, name];
                  if (name === 'Belastning') return [`${v} / 10`, name];
                  return [`${v}`, name];
                }}
              />
              <Bar yAxisId="right" dataKey="durationMin" fill={ct.loadMid} fillOpacity={0.35} name="Tid (min)" radius={[4, 4, 0, 0]} />
              <Line yAxisId="left" type="monotone" dataKey="load" stroke={ct.gold} strokeWidth={2} dot={false} name="Belastning" />
              <Line yAxisId="left" type="monotone" dataKey="pain" stroke={ct.pain} strokeWidth={2} dot={false} name="Smerte (sum)" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-[11px] text-app-text/50">
          Venstre akse: belastning (gull) og smerte (rød), 0–10. Høyre akse: treningstid i minutter (blå søyler).
        </p>
      </Card>

      <Card>
        <CardTitle>Belastning per uke</CardTitle>
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekly} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} strokeOpacity={0.12} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: ct.tick, fontSize: 10 }} minTickGap={20} />
              <YAxis tick={{ fill: ct.tick, fontSize: 11 }} />
              <Tooltip
                contentStyle={chartTooltipStyle()}
                formatter={(v: number, name: string) =>
                  name === 'totalLoad' ? [`${v} (belastning)`, 'Uke'] : [`${v} økter`, 'Uke']
                }
              />
              <Bar dataKey="totalLoad" fill={ct.loadMid} fillOpacity={0.7} stroke={ct.gold} strokeWidth={1} radius={[6, 6, 0, 0]} name="totalLoad" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <CardTitle>Kalender – belastning</CardTitle>
        <div className="flex gap-1">
          <div className="flex w-7 flex-col gap-1 pt-5">
            {WEEKDAY_LABELS.map((d, i) => (
              <div key={d} className="flex h-3.5 items-center text-[9px] text-app-text/45">
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
                      className={`h-3.5 w-3.5 rounded-sm ${loadColorBgClass(cell.load)} ${
                        cell.hasPain ? 'ring-1 ring-app-pain-soft' : ''
                      }`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 text-[10px] text-app-text/50">
          <span>Mindre</span>
          <span className="h-3 w-3 rounded-sm bg-rest/40" />
          <span className="h-3 w-3 rounded-sm bg-load-low" />
          <span className="h-3 w-3 rounded-sm bg-load-mid" />
          <span className="h-3 w-3 rounded-sm bg-app-gold" />
          <span>Mer</span>
          <span className="ml-2 flex items-center gap-1">
            <span className="h-3 w-3 rounded-sm bg-load-mid ring-1 ring-app-pain-soft" /> smerte
          </span>
        </div>
      </Card>

      {painByPartData.length > 0 && (
        <Card>
          <CardTitle>Smerte per kroppsdel</CardTitle>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={painByPartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} strokeOpacity={0.12} horizontal={false} />
                <XAxis type="number" tick={{ fill: ct.tick, fontSize: 11 }} />
                <YAxis type="category" dataKey="part" tick={{ fill: ct.tick, fontSize: 11 }} width={50} />
                <Tooltip
                  contentStyle={chartTooltipStyle()}
                  formatter={(v: number, name: string) =>
                    name === 'count' ? [`${v} ganger`, 'Antall'] : [`${v.toFixed(1)} / 10`, 'Snitt nivå']
                  }
                />
                <Bar dataKey="count" fill={ct.pain} radius={[0, 6, 6, 0]} name="count" />
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
                <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} strokeOpacity={0.12} />
                <XAxis type="number" dataKey="load" name="Belastning" domain={[0, 10]} tick={{ fill: ct.tick, fontSize: 11 }} />
                <YAxis type="number" dataKey="pain" name="Smerte" domain={[0, 'auto']} tick={{ fill: ct.tick, fontSize: 11 }} />
                <ZAxis range={[60, 60]} />
                <Tooltip
                  contentStyle={chartTooltipStyle()}
                  formatter={(v: number, name: string) => [v, name === 'load' ? 'Belastning' : 'Smerte (sum)']}
                  labelFormatter={() => ''}
                />
                <Scatter data={scatter} fill={ct.gold} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-xs text-app-text/55">
            Hver prikk er én dag. Øverst til høyre = høy belastning med smerte – dager å følge ekstra med på.
          </p>
        </Card>
      )}
    </div>
  );
}
