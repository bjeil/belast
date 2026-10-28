import { useEffect, useMemo, useState } from 'react';
import type { DayEntry } from '../lib/types';
import { getAllEntries } from '../lib/db';
import {
  computeWindowStats,
  dailyLoadSeries,
  consecutiveHighPainDays,
  loadChangePercent,
  acwrZone,
  ACWR_ZONE_LABELS,
  computeACWR
} from '../lib/stats';
import { currentStreak, longestStreak, formatDayShort, todayISO } from '../lib/dates';
import { Card, CardTitle, StatCard, EmptyState, loadLabel } from '../components/ui';
import { chartTheme, chartTooltipStyle } from '../lib/theme';
import { Area, Bar, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Tab = 'home' | 'log' | 'stats' | 'settings';

export default function Home({
  onNavigate,
  playerName
}: {
  onNavigate: (t: Tab) => void;
  playerName: string;
}) {
  const [entries, setEntries] = useState<DayEntry[]>([]);
  const ct = useMemo(() => chartTheme(), []);

  useEffect(() => {
    getAllEntries().then(setEntries);
  }, []);

  const stats7 = computeWindowStats(entries, 7);
  const stats30 = computeWindowStats(entries, 30);
  const streak = currentStreak(entries);
  const best = longestStreak(entries);
  const series = dailyLoadSeries(entries, 14).map((d) => ({ ...d, label: formatDayShort(d.date) }));
  const acwr = computeACWR(entries);
  const zone = acwrZone(acwr.ratio);
  const change = loadChangePercent(entries, 7);
  const highPainStreak = consecutiveHighPainDays(entries);
  const today = entries.find((e) => e.date === todayISO());

  const maxDuration = useMemo(
    () => Math.max(30, ...series.map((d) => d.durationMin)),
    [series]
  );

  const zoneColor =
    zone === 'sweet'
      ? 'text-emerald-500 dark:text-emerald-400'
      : zone === 'low'
        ? 'text-sky-500 dark:text-sky-400'
        : zone === 'high'
          ? 'text-amber-500 dark:text-amber-400'
          : zone === 'danger'
            ? 'text-app-pain-soft'
            : 'text-app-text/60';

  return (
    <div className="space-y-4">
      <div className="card relative overflow-hidden p-5">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-app-gold/10" />
        <p className="text-xs font-semibold uppercase tracking-widest text-app-gold">
          {playerName ? `Heia, ${playerName}!` : 'Velkommen!'}
        </p>
        <h2 className="mt-1 font-display text-xl text-app-text">
          {today ? (today.pains.length > 0 ? 'Dag registrert – følg med på smertene' : 'Bra jobbet i dag!') : 'Klar for dagens økt?'}
        </h2>
        <p className="mt-1 text-sm text-app-text/65">
          {entries.length === 0
            ? 'Ingen dager loggført ennå. Trykk på Loggfør for å komme i gang.'
            : `${entries.length} dager loggført`}
        </p>
        <button onClick={() => onNavigate('log')} className="btn-primary mt-4">
          {today ? 'Se dagens registrering' : 'Loggfør dagens økt'}
        </button>
      </div>

      {entries.length === 0 ? (
        <EmptyState>
          Statistikk vises når første dag er registrert. Gå til <strong>Loggfør</strong>.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Økter siste 7 dager"
              value={stats7.totalSessions}
              sub={`${stats7.activeDays} aktive dager`}
            />
            <StatCard
              label="Belastning 7 dager"
              value={stats7.totalLoad}
              sub={`Snitt ${stats7.avgLoad.toFixed(1)} / økt`}
            />
            <StatCard
              label="Treningstid 7 dager"
              value={stats7.totalDurationMin > 0 ? `${Math.round(stats7.totalDurationMin / 60)} t` : '–'}
              sub={stats7.totalDurationMin > 0 ? `${stats7.totalDurationMin} min totalt` : 'ikke ført'}
            />
            <StatCard
              label="Smerte 7 dager"
              value={stats7.totalPain}
              sub={`${stats7.daysWithPain} dager med smerte`}
              accent={stats7.highPainDays > 0 ? 'red' : stats7.daysWithPain > 0 ? 'white' : 'green'}
            />
            <StatCard
              label="Registreringsstreak"
              value={`${streak} ${streak === 1 ? 'dag' : 'dager'}`}
              sub={`Rekord: ${best} dager`}
              accent="gold"
            />
            <StatCard
              label="ACWR (7 vs 28 dgr)"
              value={acwr.ratio === null ? '–' : acwr.ratio.toFixed(2)}
              sub={<span className={zoneColor}>{ACWR_ZONE_LABELS[zone]}</span>}
              accent={zone === 'danger' ? 'red' : zone === 'high' ? 'white' : 'green'}
            />
          </div>

          {highPainStreak >= 2 && (
            <div className="rounded-2xl border border-app-pain-soft/40 bg-app-pain-soft/15 p-4">
              <p className="text-sm font-semibold text-app-pain-light">
                ⚠️ Smertevarsel</p>
              <p className="mt-1 text-sm text-app-text/80">
                Smerte på nivå 6 eller mer {highPainStreak} dager på rad. Vurder å ta en prat
                med trener eller fysioterapeut, og vurder en roligere periode.
              </p>
            </div>
          )}

          <Card>
            <CardTitle>Belastning og tid – siste 14 dager</CardTitle>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={series} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="loadFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ct.gold} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={ct.gold} stopOpacity={0} />
                    </linearGradient>
                  </defs>
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
                    labelFormatter={(l) => l}
                    formatter={(v: number, name: string) => {
                      if (name === 'Tid (min)') return [`${v} min`, name];
                      return [`${v} / 10 · ${loadLabel(v)}`, 'Belastning'];
                    }}
                  />
                  <Bar yAxisId="right" dataKey="durationMin" fill={ct.loadMid} fillOpacity={0.35} name="Tid (min)" radius={[4, 4, 0, 0]} />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="load"
                    stroke={ct.gold}
                    strokeWidth={2}
                    fill="url(#loadFill)"
                    name="Belastning"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-[11px] text-app-text/50">
              Venstre akse: belastning 0–10 (gull). Høyre akse: treningstid i minutter (blå søyler).
            </p>
          </Card>

          <h2 className="mb-2 mt-6 font-display text-base uppercase tracking-widest text-app-text">
            Flere detaljer
          </h2>
          <button onClick={() => onNavigate('stats')} className="btn-ghost w-full">
            Åpne full statistikk 📊
          </button>
        </>
      )}
    </div>
  );
}
