import { useEffect, useState } from 'react';
import type { DayEntry, Profile } from '../lib/types';
import { getAllEntries, getProfile } from '../lib/db';
import {
  computeWindowStats,
  dailyLoadSeries,
  consecutiveHighPainDays,
  loadChangePercent,
  acwrZone,
  ACWR_ZONE_LABELS,
  computeACWR
} from '../lib/stats';
import { currentStreak, longestStreak, formatDayShort, todayISO } from '../lib/homeUtils';
import { Card, CardTitle, StatCard, EmptyState, loadLabel } from '../components/ui';
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts';

type Tab = 'home' | 'log' | 'stats' | 'settings';

export default function Home({ onNavigate }: { onNavigate: (t: Tab) => void }) {
  const [entries, setEntries] = useState<DayEntry[]>([]);
  const [profile, setProfile] = useState<Profile>({ playerName: '', team: '' });

  useEffect(() => {
    getAllEntries().then(setEntries);
    getProfile().then(setProfile);
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
  const team = profile.team || 'laget';

  const zoneColor =
    zone === 'sweet'
      ? 'text-emerald-400'
      : zone === 'low'
        ? 'text-sky-400'
        : zone === 'high'
          ? 'text-amber-400'
          : zone === 'danger'
            ? 'text-[#E05A66]'
            : 'text-viking-white/60';

  return (
    <div className="space-y-4">
      <div className="card relative overflow-hidden p-5">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-viking-gold/10" />
        <p className="text-xs font-semibold uppercase tracking-widest text-viking-gold">
          {profile.playerName ? `Heia, ${profile.playerName}!` : 'Velkommen!'}
        </p>
        <h2 className="mt-1 font-display text-xl text-viking-white">
          {today ? (today.pains.length > 0 ? 'Dag registrert – følg med på smertene' : 'Bra jobbet i dag!') : 'Klar for dagens økt?'}
        </h2>
        <p className="mt-1 text-sm text-viking-white/65">
          {entries.length === 0
            ? 'Ingen dager loggført ennå. Trykk på Loggfør for å komme i gang.'
            : `${entries.length} dager loggført · ${team}`}
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
              label="Belastning 30 dager"
              value={stats30.totalLoad}
              sub={
                change === null
                  ? `${stats30.activeDays} aktive dager`
                  : `${change >= 0 ? '+' : ''}${change.toFixed(0)} % vs forrige periode`
              }
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
            <div className="rounded-2xl border border-[#E05A66]/40 bg-viking-red/20 p-4">
              <p className="text-sm font-semibold text-[#ffb3ba]">⚠️ Smertevarsel</p>
              <p className="mt-1 text-sm text-viking-white/80">
                Smerte på nivå 6 eller mer {highPainStreak} dager på rad. Vurder å ta en prat
                med trener eller fysioterapeut, og vurder en roligere periode.
              </p>
            </div>
          )}

          <Card>
            <CardTitle>Belastning – siste 14 dager</CardTitle>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="loadFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#DBC067" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#DBC067" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis domain={[0, 10]} tick={{ fill: '#ffffff88', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: '#1d3a54',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 12,
                      color: '#fff'
                    }}
                    labelFormatter={(l) => l}
                    formatter={(v: number) => [`${v} / 10 · ${loadLabel(v)}`, 'Belastning']}
                  />
                  <Area
                    type="monotone"
                    dataKey="load"
                    stroke="#DBC067"
                    strokeWidth={2}
                    fill="url(#loadFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <h2 className="mb-2 mt-6 font-display text-base uppercase tracking-widest text-viking-white">
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
