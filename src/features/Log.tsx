import { useEffect, useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  endOfWeek
} from 'date-fns';
import { nb } from 'date-fns/locale';
import {
  ACTIVITY_TYPES,
  ACTIVITY_LABELS,
  BODY_PARTS,
  BODY_PART_LABELS,
  type ActivityType,
  type BodyPart,
  type DayEntry,
  type PainEntry
} from '../lib/types';
import { deleteEntry, getAllEntries, getEntry, saveEntry } from '../lib/db';
import { syncManager } from '../lib/sync';
import { formatDayLong, isFuture, isToday, toISODate, WEEKDAY_LABELS } from '../lib/dates';
import { Card, CardTitle, Slider, loadLabel, painLabel } from '../components/ui';

interface LogProps {
  onSaved: () => void;
}

const emptyDraft = (date: string): DayEntry => ({
  id: date,
  date,
  activities: [],
  load: 5,
  durationMin: undefined,
  pains: [],
  note: '',
  updatedAt: new Date().toISOString()
});

export default function Log({ onSaved }: LogProps) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => toISODate(new Date()));
  const [entries, setEntries] = useState<DayEntry[]>([]);
  const [draft, setDraft] = useState<DayEntry | null>(null);
  const [editing, setEditing] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadEntries = async () => setEntries(await getAllEntries());

  useEffect(() => {
    loadEntries();
  }, []);

  const byDate = useMemo(() => new Map(entries.map((e) => [e.date, e])), [entries]);

  const openDay = async (date: string) => {
    setSelectedDate(date);
    setConfirmDelete(false);
    setSavedMsg('');
    const existing = byDate.get(date) ?? (await getEntry(date));
    if (existing) {
      setDraft({ ...existing, pains: existing.pains.map((p) => ({ ...p })) });
      setEditing(true);
    } else {
      setDraft(emptyDraft(date));
      setEditing(false);
    }
  };

  useEffect(() => {
    openDay(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const toggleActivity = (a: ActivityType) => {
    if (!draft) return;
    let activities = draft.activities.filter((x) => x !== a);
    if (!activities.includes(a)) {
      if (a === 'hviledag') activities = ['hviledag'];
      else activities = [...activities.filter((x) => x !== 'hviledag'), a];
    }
    setDraft({ ...draft, activities });
  };

  const addPain = () => {
    if (!draft) return;
    setDraft({
      ...draft,
      pains: [...draft.pains, { bodyPart: 'kne', level: 3 }]
    });
  };

  const updatePain = (idx: number, patch: Partial<PainEntry>) => {
    if (!draft) return;
    const pains = draft.pains.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    setDraft({ ...draft, pains });
  };

  const removePain = (idx: number) => {
    if (!draft) return;
    setDraft({ ...draft, pains: draft.pains.filter((_, i) => i !== idx) });
  };

  const isRest =
    draft && (draft.activities.length === 0 ||
      (draft.activities.length === 1 && draft.activities[0] === 'hviledag'));

  const save = async () => {
    if (!draft) return;
    if (!isRest && draft.activities.length === 0) {
      setSavedMsg('Velg minst én type trening – eller merk dagen som hviledag.');
      return;
    }
    await saveEntry(draft);
    setSavedMsg('Lagret ✔');
    setEditing(true);
    await loadEntries();
    onSaved();
    void syncManager.sync(); // push til skyen i bakgrunnen
    setTimeout(() => setSavedMsg(''), 2500);
  };

  const remove = async () => {
    await deleteEntry(selectedDate);
    setDraft(emptyDraft(selectedDate));
    setEditing(false);
    setConfirmDelete(false);
    await loadEntries();
    onSaved();
    void syncManager.sync(); // push sletting til skyen
  };

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    const days: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
    return days;
  }, [month]);

  const dayCellClass = (iso: string): string => {
    const e = byDate.get(iso);
    const base =
      'relative flex h-11 items-center justify-center rounded-xl text-sm transition-colors';
    const selected = iso === selectedDate ? 'ring-2 ring-viking-gold' : '';
    const today = isToday(iso) ? 'font-bold text-viking-gold' : 'text-viking-white/85';
    const future = isFuture(iso) ? 'opacity-40' : '';
    if (!e) return `${base} ${selected} ${today} ${future} hover:bg-white/5`;
    const rest =
      e.activities.length === 0 ||
      (e.activities.length === 1 && e.activities[0] === 'hviledag');
    const loadColor = rest
      ? 'bg-white/5 text-viking-white/50'
      : e.load >= 8
        ? 'bg-viking-gold text-viking-blue-deep font-bold'
        : e.load >= 5
          ? 'bg-viking-blue-light text-viking-white'
          : 'bg-viking-blue/60 text-viking-white/80';
    return `${base} ${selected} ${loadColor}`;
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <button className="btn-ghost px-3 py-1.5" onClick={() => setMonth((m) => addMonths(m, -1))}>
            ←
          </button>
          <span className="font-display text-sm uppercase tracking-widest text-viking-white">
            {format(month, 'MMMM yyyy', { locale: nb })}
          </span>
          <button
            className="btn-ghost px-3 py-1.5"
            onClick={() => setMonth((m) => addMonths(m, 1))}
            disabled={isSameMonth(month, startOfMonth(new Date()))}
          >
            →
          </button>
        </div>
        <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-viking-white/50">
          {WEEKDAY_LABELS.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((d) => {
            const iso = toISODate(d);
            const e = byDate.get(iso);
            return (
              <button
                key={iso}
                onClick={() => openDay(iso)}
                className={dayCellClass(iso)}
                aria-label={formatDayLong(iso)}
              >
                {format(d, 'd')}
                {e && e.pains.length > 0 && (
                  <span className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-[#E05A66]" />
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-viking-white/55">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-viking-gold" /> Hard belastning
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-viking-blue-light" /> Trening
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-white/10" /> Hvile
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-[#E05A66]" /> Smerte
          </span>
        </div>
      </Card>

      {draft && (
        <Card>
          <CardTitle>
            {formatDayLong(selectedDate)}
            {editing ? ' – rediger' : ' – ny registrering'}
          </CardTitle>

          <div className="mb-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-viking-white/60">
              Type trening
            </p>
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_TYPES.map((a) => {
                const active = draft.activities.includes(a);
                return (
                  <button
                    key={a}
                    onClick={() => toggleActivity(a)}
                    className={`chip ${
                      active
                        ? a === 'hviledag'
                          ? 'border-white/30 bg-white/10 text-viking-white'
                          : 'border-viking-gold bg-viking-gold/15 text-viking-gold'
                        : 'border-white/15 text-viking-white/70 hover:border-white/30'
                    }`}
                  >
                    {active && a !== 'hviledag' ? '✓ ' : ''}
                    {ACTIVITY_LABELS[a]}
                  </button>
                );
              })}
            </div>
          </div>

          {!isRest && (
            <>
              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-viking-white/60">
                    Opplevd belastning
                  </p>
                  <span className="font-display text-lg text-viking-gold">
                    {draft.load} <span className="text-xs font-body text-viking-white/60">· {loadLabel(draft.load)}</span>
                  </span>
                </div>
                <Slider
                  value={draft.load}
                  onChange={(v) => setDraft({ ...draft, load: v })}
                  ariaLabel="Opplevd belastning"
                />
                <div className="mt-1 flex justify-between text-[10px] text-viking-white/40">
                  <span>1</span>
                  <span>10</span>
                </div>
              </div>

              <div className="mb-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-viking-white/60">
                  Varighet (valgfritt)
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={300}
                    inputMode="numeric"
                    placeholder="minutter"
                    value={draft.durationMin ?? ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        durationMin: e.target.value === '' ? undefined : Number(e.target.value)
                      })
                    }
                    className="w-32 rounded-xl border border-white/15 bg-viking-blue-deep px-4 py-2.5 text-viking-white outline-none focus:border-viking-gold"
                  />
                  <span className="text-sm text-viking-white/60">min</span>
                </div>
              </div>
            </>
          )}

          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-viking-white/60">
                Skader og vondter
              </p>
              <button onClick={addPain} className="text-xs font-semibold text-viking-gold hover:underline">
                + Legg til
              </button>
            </div>
            {draft.pains.length === 0 && (
              <p className="text-sm text-viking-white/50">Ingen smerter registrert.</p>
            )}
            <div className="space-y-3">
              {draft.pains.map((p, idx) => (
                <div key={idx} className="rounded-xl border border-white/10 bg-viking-blue-deep/60 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <select
                      value={p.bodyPart}
                      onChange={(e) => updatePain(idx, { bodyPart: e.target.value as BodyPart })}
                      className="flex-1 rounded-lg border border-white/15 bg-viking-blue px-3 py-2 text-sm text-viking-white outline-none focus:border-viking-gold"
                      aria-label="Kroppsdel"
                    >
                      {BODY_PARTS.map((b) => (
                        <option key={b} value={b}>
                          {BODY_PART_LABELS[b]}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => removePain(idx)}
                      className="rounded-lg px-2 py-2 text-sm text-[#E05A66] hover:bg-viking-red/20"
                      aria-label="Fjern vondt"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs text-viking-white/60">Smertenivå</span>
                    <span className="font-display text-base text-[#E05A66]">
                      {p.level} <span className="text-[11px] font-body text-viking-white/60">· {painLabel(p.level)}</span>
                    </span>
                  </div>
                  <Slider
                    value={p.level}
                    onChange={(v) => updatePain(idx, { level: v })}
                    variant="pain"
                    ariaLabel="Smertenivå"
                  />
                  <input
                    type="text"
                    placeholder="Kommentar (valgfritt)"
                    value={p.note ?? ''}
                    onChange={(e) => updatePain(idx, { note: e.target.value })}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-viking-blue px-3 py-2 text-sm text-viking-white outline-none placeholder:text-viking-white/35 focus:border-viking-gold"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="mb-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-viking-white/60">
              Kommentar (valgfritt)
            </p>
            <textarea
              rows={2}
              placeholder="F.eks. hvordan føltes økten?"
              value={draft.note ?? ''}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              className="w-full rounded-xl border border-white/15 bg-viking-blue-deep px-4 py-2.5 text-sm text-viking-white outline-none placeholder:text-viking-white/35 focus:border-viking-gold"
            />
          </div>

          {savedMsg && (
            <p className="mb-3 text-center text-sm font-medium text-viking-gold">{savedMsg}</p>
          )}

          <div className="flex gap-2">
            <button onClick={save} className="btn-primary flex-1">
              Lagre dag
            </button>
            {editing && (
              <>
                {confirmDelete ? (
                  <button onClick={remove} className="btn-ghost border-[#E05A66]/50 text-[#E05A66]">
                    Bekreft sletting
                  </button>
                ) : (
                  <button onClick={() => setConfirmDelete(true)} className="btn-ghost text-[#E05A66]">
                    Slett
                  </button>
                )}
              </>
            )}
          </div>
          {editing && draft.updatedAt && (
            <p className="mt-3 text-center text-[11px] text-viking-white/40">
              Sist endret {new Date(draft.updatedAt).toLocaleString('nb-NO')}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
