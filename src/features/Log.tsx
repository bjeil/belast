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
  REST_DAY,
  REST_DAY_LABEL,
  type ActivityType,
  type BodyPart,
  type Category,
  type DayEntry,
  type PainEntry
} from '../lib/types';
import { getAllCategories } from '../lib/categories';
import { deleteEntry, getAllEntries, getEntry, saveEntry } from '../lib/db';
import { syncManager } from '../lib/sync';
import { formatDayLong, isFuture, isToday, toISODate, WEEKDAY_LABELS } from '../lib/dates';
import { Card, CardTitle, Slider, loadLabel, painLabel, loadColorClass } from '../components/ui';

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

const DURATION_PRESETS = [30, 60, 90];

export default function Log({ onSaved }: LogProps) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => toISODate(new Date()));
  const [entries, setEntries] = useState<DayEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [draft, setDraft] = useState<DayEntry | null>(null);
  const [editing, setEditing] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadEntries = async () => setEntries(await getAllEntries());
  const loadCategories = async () => setCategories(await getAllCategories());

  useEffect(() => {
    loadEntries();
    loadCategories();
  }, []);

  const activityCategories = useMemo(
    () => categories.filter((c) => c.kind === 'activity' && c.active).sort((a, b) => a.sortOrder - b.sortOrder),
    [categories]
  );
  const bodyPartCategories = useMemo(
    () => categories.filter((c) => c.kind === 'body_part' && c.active).sort((a, b) => a.sortOrder - b.sortOrder),
    [categories]
  );
  const defaultBodyPart = bodyPartCategories[0]?.key ?? 'annet';

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
    if (draft.activities.includes(a)) {
      // Avhuking: fjern valget
      setDraft({ ...draft, activities: draft.activities.filter((x) => x !== a) });
      return;
    }
    // Påhuking: «hviledag» er eksklusivt, andre kan kombineres
    let activities: ActivityType[];
    if (a === REST_DAY) {
      activities = [REST_DAY];
    } else {
      activities = [...draft.activities.filter((x) => x !== REST_DAY), a];
    }
    setDraft({ ...draft, activities });
  };

  const addPain = () => {
    if (!draft) return;
    setDraft({
      ...draft,
      pains: [...draft.pains, { bodyPart: defaultBodyPart, level: 3 }]
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
      (draft.activities.length === 1 && draft.activities[0] === REST_DAY));

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
    const selected = iso === selectedDate ? 'ring-2 ring-app-gold' : '';
    const painRing = !selected && e && e.pains.length > 0 ? 'ring-2 ring-app-pain-soft' : '';
    const today = isToday(iso) ? 'font-bold text-app-gold' : 'text-app-text/85';
    const future = isFuture(iso) ? 'opacity-40' : '';
    if (!e) return `${base} ${selected} ${painRing} ${today} ${future} hover:bg-app-hover/10`;
    const rest =
      e.activities.length === 0 ||
      (e.activities.length === 1 && e.activities[0] === REST_DAY);
    const loadColor = rest ? loadColorClass(0) : loadColorClass(e.load);
    return `${base} ${selected} ${painRing} ${loadColor}`;
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <button className="btn-ghost px-3 py-1.5" onClick={() => setMonth((m) => addMonths(m, -1))}>
            ←
          </button>
          <span className="font-display text-sm uppercase tracking-widest text-app-text">
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
        <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-app-text/50">
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
                  <span className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-app-pain-soft" />
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-app-text/55">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-app-gold" /> Hard belastning
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-load-mid" /> Trening
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-rest/60" /> Hvile
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-app-pain-soft" /> Smerte
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
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-app-text/60">
              Type trening
            </p>
            <div className="flex flex-wrap gap-2">
              {activityCategories.map((c) => {
                const active = draft.activities.includes(c.key);
                return (
                  <button
                    key={c.key}
                    onClick={() => toggleActivity(c.key)}
                    aria-pressed={active}
                    className={`chip ${
                      active
                        ? 'border-app-gold bg-app-gold/20 text-app-gold'
                        : 'border-app-border/20 text-app-text/70 hover:border-app-border/40'
                    }`}
                  >
                    {active ? '✓ ' : ''}
                    {c.label}
                  </button>
                );
              })}
              <button
                onClick={() => toggleActivity(REST_DAY)}
                aria-pressed={draft.activities.includes(REST_DAY)}
                className={`chip ${
                  draft.activities.includes(REST_DAY)
                    ? 'border-app-border/40 bg-app-hover/15 text-app-text'
                    : 'border-app-border/20 text-app-text/70 hover:border-app-border/40'
                }`}
              >
                {draft.activities.includes(REST_DAY) ? '✓ ' : ''}
                {REST_DAY_LABEL}
              </button>
            </div>
          </div>

          {!isRest && (
            <>
              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-app-text/60">
                    Opplevd belastning
                  </p>
                  <span className="font-display text-lg text-app-gold">
                    {draft.load} <span className="text-xs font-body text-app-text/60">· {loadLabel(draft.load)}</span>
                  </span>
                </div>
                <Slider
                  value={draft.load}
                  onChange={(v) => setDraft({ ...draft, load: v })}
                  ariaLabel="Opplevd belastning"
                />
                <div className="mt-1 flex justify-between text-[10px] text-app-text/40">
                  <span>1</span>
                  <span>10</span>
                </div>
              </div>

              <div className="mb-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-app-text/60">
                  Varighet (valgfritt)
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {DURATION_PRESETS.map((min) => {
                    const active = draft.durationMin === min;
                    return (
                      <button
                        key={min}
                        onClick={() =>
                          setDraft({ ...draft, durationMin: active ? undefined : min })
                        }
                        aria-pressed={active}
                        className={`chip ${
                          active
                            ? 'border-app-gold bg-app-gold/20 text-app-gold'
                            : 'border-app-border/20 text-app-text/70 hover:border-app-border/40'
                        }`}
                      >
                        {min} min
                      </button>
                    );
                  })}
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
                    className="w-28 rounded-xl border border-app-border/20 bg-app-surface-deep px-4 py-2.5 text-app-text outline-none focus:border-app-gold"
                  />
                  <span className="text-sm text-app-text/60">min</span>
                </div>
              </div>
            </>
          )}

          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-app-text/60">
                Skader og vondter
              </p>
              <button onClick={addPain} className="text-xs font-semibold text-app-gold hover:underline">
                + Legg til
              </button>
            </div>
            {draft.pains.length === 0 && (
              <p className="text-sm text-app-text/50">Ingen smerter registrert.</p>
            )}
            <div className="space-y-3">
              {draft.pains.map((p, idx) => (
                <div key={idx} className="rounded-xl border border-app-border/15 bg-app-surface-deep/60 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <select
                      value={p.bodyPart}
                      onChange={(e) => updatePain(idx, { bodyPart: e.target.value as BodyPart })}
                      className="flex-1 rounded-lg border border-app-border/20 bg-app-surface-2 px-3 py-2 text-sm text-app-text outline-none focus:border-app-gold"
                      aria-label="Kroppsdel"
                    >
                      {bodyPartCategories.map((b) => (
                        <option key={b.key} value={b.key}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => removePain(idx)}
                      className="rounded-lg px-2 py-2 text-sm text-app-pain-soft hover:bg-app-pain-soft/15"
                      aria-label="Fjern vondt"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs text-app-text/60">Smertenivå</span>
                    <span className="font-display text-base text-app-pain-soft">
                      {p.level} <span className="text-[11px] font-body text-app-text/60">· {painLabel(p.level)}</span>
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
                    className="mt-2 w-full rounded-lg border border-app-border/15 bg-app-surface-2 px-3 py-2 text-sm text-app-text outline-none placeholder:text-app-text/35 focus:border-app-gold"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="mb-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-app-text/60">
              Kommentar (valgfritt)
            </p>
            <textarea
              rows={2}
              placeholder="F.eks. hvordan føltes økten?"
              value={draft.note ?? ''}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              className="w-full rounded-xl border border-app-border/20 bg-app-surface-deep px-4 py-2.5 text-sm text-app-text outline-none placeholder:text-app-text/35 focus:border-app-gold"
            />
          </div>

          {savedMsg && (
            <p className="mb-3 text-center text-sm font-medium text-app-gold">{savedMsg}</p>
          )}

          <div className="flex gap-2">
            <button onClick={save} className="btn-primary flex-1">
              Lagre dag
            </button>
            {editing && (
              <>
                {confirmDelete ? (
                  <button onClick={remove} className="btn-ghost border-app-pain-soft/50 text-app-pain-soft">
                    Bekreft sletting
                  </button>
                ) : (
                  <button onClick={() => setConfirmDelete(true)} className="btn-ghost text-app-pain-soft">
                    Slett
                  </button>
                )}
              </>
            )}
          </div>
          {editing && draft.updatedAt && (
            <p className="mt-3 text-center text-[11px] text-app-text/40">
              Sist endret {new Date(draft.updatedAt).toLocaleString('nb-NO')}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
