import { useEffect, useMemo, useState } from 'react';
import type { Category, PlannedDay, PlannedSession, WeekPlan } from '../lib/types';
import { getAllCategories } from '../lib/categories';
import {
  createPlan,
  deletePlan,
  emptyWeekDays,
  getAllPlans,
  planDayLabel,
  savePlan,
  summarizePlan
} from '../lib/plans';
import { syncManager } from '../lib/sync';
import { Card, CardTitle, EmptyState, loadColorClass, loadLabel } from '../components/ui';

type View = { kind: 'list' } | { kind: 'edit'; planId: string };

export default function Plans() {
  const [plans, setPlans] = useState<WeekPlan[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [msg, setMsg] = useState('');

  const refresh = async () => {
    setPlans(await getAllPlans());
    setCategories(await getAllCategories());
  };

  useEffect(() => {
    void refresh();
  }, []);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 2500);
  };

  const activityCategories = useMemo(
    () => categories.filter((c) => c.kind === 'activity' && c.active).sort((a, b) => a.sortOrder - b.sortOrder),
    [categories]
  );

  const editingPlan = useMemo(
    () => (view.kind === 'edit' ? plans.find((p) => p.id === view.planId) : undefined),
    [view, plans]
  );

  const startNew = async () => {
    const plan = createPlan('Ny ukeplan');
    await savePlan(plan);
    await refresh();
    setView({ kind: 'edit', planId: plan.id });
  };

  const toggleFavorite = async (plan: WeekPlan) => {
    await savePlan({ ...plan, favorite: !plan.favorite });
    await refresh();
    void syncManager.sync();
  };

  const removePlan = async (plan: WeekPlan) => {
    await deletePlan(plan.id);
    await refresh();
    void syncManager.sync();
    flash(`«${plan.name}» er slettet`);
  };

  if (view.kind === 'edit' && editingPlan) {
    return (
      <PlanEditor
        plan={editingPlan}
        activityCategories={activityCategories}
        onBack={async () => {
          await refresh();
          setView({ kind: 'list' });
        }}
        onSaved={async () => {
          await refresh();
          flash('Plan lagret ✔');
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base uppercase tracking-widest text-app-text">Ukeplaner</h2>
        <button onClick={startNew} className="btn-primary px-4 py-2 text-sm">
          + Ny plan
        </button>
      </div>

      {plans.length === 0 ? (
        <EmptyState>
          Ingen ukeplaner ennå. Lag en plan for å strukturere treningsuken
          (mandag–søndag) med planlagt belastning og tid.
        </EmptyState>
      ) : (
        plans.map((plan) => {
          const sum = summarizePlan(plan);
          return (
            <Card key={plan.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleFavorite(plan)}
                      aria-label={plan.favorite ? 'Fjern fra favoritter' : 'Merk som favoritt'}
                      aria-pressed={plan.favorite}
                      className={`text-lg leading-none ${plan.favorite ? 'text-app-gold' : 'text-app-text/30 hover:text-app-text/60'}`}
                    >
                      {plan.favorite ? '★' : '☆'}
                    </button>
                    <h3 className="truncate font-display text-base text-app-text">{plan.name}</h3>
                  </div>
                  <p className="mt-1 text-xs text-app-text/55">
                    {sum.sessions} økter · {sum.activeDays} dager · {sum.totalDurationMin} min · belastning {sum.totalLoad}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => setView({ kind: 'edit', planId: plan.id })} className="btn-ghost px-3 py-1.5 text-xs">
                    Rediger
                  </button>
                  <DeletePlanButton plan={plan} onDelete={removePlan} />
                </div>
              </div>
            </Card>
          );
        })
      )}

      {msg && <p className="pb-2 text-center text-sm font-medium text-app-gold">{msg}</p>}
    </div>
  );
}

function DeletePlanButton({ plan, onDelete }: { plan: WeekPlan; onDelete: (p: WeekPlan) => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  if (confirm) {
    return (
      <button
        onClick={() => onDelete(plan)}
        className="btn-ghost border-app-pain-soft/50 px-3 py-1.5 text-xs text-app-pain-soft"
      >
        Bekreft sletting
      </button>
    );
  }
  return (
    <button onClick={() => setConfirm(true)} className="btn-ghost px-3 py-1.5 text-xs text-app-pain-soft">
      Slett
    </button>
  );
}

function PlanEditor({
  plan,
  activityCategories,
  onBack,
  onSaved
}: {
  plan: WeekPlan;
  activityCategories: Category[];
  onBack: () => Promise<void>;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<WeekPlan>(() => ({
    ...plan,
    days: plan.days.length === 7 ? plan.days : emptyWeekDays()
  }));
  const [msg, setMsg] = useState('');

  const summary = useMemo(() => summarizePlan(draft), [draft]);

  const updateDay = (weekday: number, updater: (d: PlannedDay) => PlannedDay) => {
    setDraft({
      ...draft,
      days: draft.days.map((d) => (d.weekday === weekday ? updater(d) : d))
    });
  };

  const addSession = (weekday: number) => {
    updateDay(weekday, (d) => ({
      ...d,
      sessions: [
        ...d.sessions,
        { activity: activityCategories[0]?.key ?? 'annet', load: 5, durationMin: 60, note: '' }
      ]
    }));
  };

  const updateSession = (weekday: number, idx: number, patch: Partial<PlannedSession>) => {
    updateDay(weekday, (d) => ({
      ...d,
      sessions: d.sessions.map((s, i) => (i === idx ? { ...s, ...patch } : s))
    }));
  };

  const removeSession = (weekday: number, idx: number) => {
    updateDay(weekday, (d) => ({ ...d, sessions: d.sessions.filter((_, i) => i !== idx) }));
  };

  const save = async () => {
    if (!draft.name.trim()) {
      setMsg('Gi planen et navn.');
      return;
    }
    await savePlan({ ...draft, name: draft.name.trim() });
    await onSaved();
    void syncManager.sync();
    await onBack();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="btn-ghost px-3 py-1.5 text-sm">
          ← Tilbake
        </button>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Navn på plan (f.eks. «Uke 24 – sesongstart»)"
          aria-label="Navn på plan"
          className="min-w-0 flex-1 rounded-xl border border-app-border/20 bg-app-surface-deep px-4 py-2.5 text-sm text-app-text outline-none placeholder:text-app-text/35 focus:border-app-gold"
        />
        <button
          onClick={() => setDraft({ ...draft, favorite: !draft.favorite })}
          aria-label={draft.favorite ? 'Fjern fra favoritter' : 'Merk som favoritt'}
          aria-pressed={draft.favorite}
          className={`shrink-0 text-xl leading-none ${draft.favorite ? 'text-app-gold' : 'text-app-text/30 hover:text-app-text/60'}`}
        >
          {draft.favorite ? '★' : '☆'}
        </button>
      </div>

      <Card>
        <CardTitle>Oppsummering (planlagt)</CardTitle>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-app-border/15 bg-app-surface-deep/60 p-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-app-text/55">Økter</span>
            <p className="font-display text-xl text-app-gold">{summary.sessions}</p>
          </div>
          <div className="rounded-xl border border-app-border/15 bg-app-surface-deep/60 p-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-app-text/55">Aktivitetsdager</span>
            <p className="font-display text-xl text-app-gold">{summary.activeDays} / 7</p>
          </div>
          <div className="rounded-xl border border-app-border/15 bg-app-surface-deep/60 p-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-app-text/55">Total tid</span>
            <p className="font-display text-xl text-app-gold">
              {summary.totalDurationMin > 0 ? `${Math.round(summary.totalDurationMin / 60)} t` : '–'}
            </p>
            <p className="text-xs text-app-text/60">{summary.totalDurationMin} min totalt</p>
          </div>
          <div className="rounded-xl border border-app-border/15 bg-app-surface-deep/60 p-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-app-text/55">Total belastning</span>
            <p className="font-display text-xl text-app-gold">{summary.totalLoad}</p>
            <p className="text-xs text-app-text/60">
              snitt {summary.sessions > 0 ? (summary.totalLoad / summary.sessions).toFixed(1) : '–'} / økt
            </p>
          </div>
        </div>
      </Card>

      {draft.days.map((day) => (
        <Card key={day.weekday}>
          <div className="mb-3 flex items-center justify-between">
            <CardTitle className="mb-0">{planDayLabel(day.weekday)}</CardTitle>
            <button onClick={() => addSession(day.weekday)} className="text-xs font-semibold text-app-gold hover:underline">
              + Legg til økt
            </button>
          </div>
          {day.sessions.length === 0 ? (
            <p className="text-sm text-app-text/45">Ingen planlagte økter.</p>
          ) : (
            <div className="space-y-3">
              {day.sessions.map((s, idx) => (
                <div key={idx} className="rounded-xl border border-app-border/15 bg-app-surface-deep/60 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <select
                      value={s.activity}
                      onChange={(e) => updateSession(day.weekday, idx, { activity: e.target.value })}
                      className="min-w-0 flex-1 rounded-lg border border-app-border/20 bg-app-surface-2 px-3 py-2 text-sm text-app-text outline-none focus:border-app-gold"
                      aria-label="Type trening"
                    >
                      {activityCategories.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeSession(day.weekday, idx)}
                      className="shrink-0 rounded-lg px-2 py-2 text-sm text-app-pain-soft hover:bg-app-pain-soft/15"
                      aria-label="Fjern økt"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={s.load}
                      onChange={(e) => updateSession(day.weekday, idx, { load: Number(e.target.value) })}
                      className={`rounded-lg border border-app-border/20 px-3 py-2 text-sm outline-none focus:border-app-gold ${loadColorClass(s.load)}`}
                      aria-label="Planlagt belastning"
                    >
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
                        <option key={v} value={v} className="bg-app-surface-deep text-app-text">
                          {v} · {loadLabel(v)}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      max={300}
                      inputMode="numeric"
                      value={s.durationMin}
                      onChange={(e) =>
                        updateSession(day.weekday, idx, { durationMin: Math.max(0, Number(e.target.value) || 0) })
                      }
                      className="w-20 rounded-lg border border-app-border/20 bg-app-surface-2 px-3 py-2 text-sm text-app-text outline-none focus:border-app-gold"
                      aria-label="Planlagt tid i minutter"
                    />
                    <span className="text-sm text-app-text/60">min</span>
                  </div>
                  <input
                    type="text"
                    placeholder="Kommentar (valgfritt, f.eks. «lett intensitet»)"
                    value={s.note ?? ''}
                    onChange={(e) => updateSession(day.weekday, idx, { note: e.target.value })}
                    className="mt-2 w-full rounded-lg border border-app-border/15 bg-app-surface-2 px-3 py-2 text-xs text-app-text outline-none placeholder:text-app-text/35 focus:border-app-gold"
                    aria-label="Kommentar til økt"
                  />
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}

      {msg && <p className="text-center text-sm font-medium text-app-pain-soft">{msg}</p>}

      <button onClick={save} className="btn-primary w-full">
        Lagre plan
      </button>
    </div>
  );
}
