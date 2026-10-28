import { useEffect, useState } from 'react';
import type { Category, CategoryKind } from '../lib/types';
import {
  getAllCategories,
  addCategory,
  renameCategory,
  deactivateCategory,
  activateCategory
} from '../lib/categories';
import { syncManager } from '../lib/sync';
import { Card, CardTitle } from '../components/ui';

const KINDS: { kind: CategoryKind; title: string; hint: string }[] = [
  { kind: 'activity', title: 'Type trening', hint: 'Valgene i loggen, f.eks. «Kamp – akademi»' },
  { kind: 'body_part', title: 'Smertested', hint: 'Kroppsdeler i smerteregistrering, f.eks. «Kne»' }
];

export default function CategoriesEditor() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [newLabel, setNewLabel] = useState<Record<CategoryKind, string>>({ activity: '', body_part: '' });
  const [msg, setMsg] = useState('');

  const refresh = async () => setCategories(await getAllCategories());

  useEffect(() => {
    refresh();
  }, []);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 3000);
  };

  const handleAdd = async (kind: CategoryKind) => {
    const label = newLabel[kind].trim();
    if (!label) return;
    await addCategory(kind, label);
    setNewLabel({ ...newLabel, [kind]: '' });
    await refresh();
    void syncManager.sync();
    flash(`«${label}» lagt til ✔`);
  };

  const handleRename = async (kind: CategoryKind, key: string, label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    await renameCategory(kind, key, trimmed);
    await refresh();
    void syncManager.sync();
  };

  const handleToggleActive = async (c: Category) => {
    if (c.active) {
      await deactivateCategory(c.kind, c.key);
      flash(`«${c.label}» fjernet fra valgene (historikk beholdes)`);
    } else {
      await activateCategory(c.kind, c.key);
      flash(`«${c.label}» aktivert igjen ✔`);
    }
    await refresh();
    void syncManager.sync();
  };

  return (
    <Card>
      <CardTitle>Kategorier</CardTitle>
      <p className="mb-4 text-xs text-app-text/55">
        Legg til eller fjern verdier for «type trening» og «smertested». Fjerner du en kategori,
        beholdes historikken — gamle registreringer vises med etiketten merket «(utgått)».
      </p>
      <div className="space-y-5">
        {KINDS.map(({ kind, title, hint }) => {
          const cats = categories
            .filter((c) => c.kind === kind)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          const active = cats.filter((c) => c.active);
          const inactive = cats.filter((c) => !c.active);
          return (
            <div key={kind}>
              <p className="text-xs font-semibold uppercase tracking-wider text-app-text/60">{title}</p>
              <p className="mb-2 text-[11px] text-app-text/45">{hint}</p>
              <div className="space-y-1.5">
                {active.map((c) => (
                  <div key={c.key} className="flex items-center gap-2">
                    <input
                      type="text"
                      defaultValue={c.label}
                      aria-label={`Etikett for ${c.label}`}
                      onBlur={(e) => {
                        if (e.target.value.trim() && e.target.value !== c.label) {
                          void handleRename(c.kind, c.key, e.target.value);
                        }
                      }}
                      className="flex-1 rounded-lg border border-app-border/15 bg-app-surface-deep px-3 py-2 text-sm text-app-text outline-none focus:border-app-gold"
                    />
                    <button
                      onClick={() => handleToggleActive(c)}
                      className="rounded-lg px-2 py-2 text-sm text-app-pain-soft hover:bg-app-pain-soft/15"
                      aria-label={`Fjern ${c.label}`}
                      title="Fjern fra valgene (historikk beholdes)"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {inactive.length > 0 && (
                  <details className="text-xs text-app-text/50">
                    <summary className="cursor-pointer select-none">
                      {inactive.length} fjernet (vis)
                    </summary>
                    <div className="mt-1.5 space-y-1.5">
                      {inactive.map((c) => (
                        <div key={c.key} className="flex items-center gap-2 opacity-70">
                          <span className="flex-1 rounded-lg border border-dashed border-app-border/20 px-3 py-2">
                            {c.label} <span className="text-app-text/40">(utgått)</span>
                          </span>
                          <button
                            onClick={() => handleToggleActive(c)}
                            className="rounded-lg px-2 py-2 text-sm text-app-gold hover:bg-app-gold/10"
                            aria-label={`Aktiver ${c.label} igjen`}
                            title="Aktiver igjen"
                          >
                            ↩
                          </button>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={newLabel[kind]}
                  onChange={(e) => setNewLabel({ ...newLabel, [kind]: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleAdd(kind);
                  }}
                  placeholder={`Ny ${kind === 'activity' ? 'type trening' : 'smertested'}…`}
                  className="flex-1 rounded-lg border border-app-border/15 bg-app-surface-deep px-3 py-2 text-sm text-app-text outline-none placeholder:text-app-text/35 focus:border-app-gold"
                />
                <button onClick={() => handleAdd(kind)} className="btn-ghost px-3 py-2 text-sm">
                  + Legg til
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {msg && <p className="mt-3 text-sm font-medium text-app-gold">{msg}</p>}
    </Card>
  );
}
