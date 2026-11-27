/* ================================================================ outils */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOISC = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const PALETTE = ['#0e8a7d', '#5b4fe0', '#c27803', '#9b3fd1', '#1f6feb', '#3f8f2f', '#c2417a', '#4a6a82', '#d0612a', '#0f8fb8'];

const dISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monday = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -((x.getDay() + 6) % 7)); };
const startOf = (e) => new Date(`${e.date}T${e.start}:00`);
const endOf = (e) => new Date(`${e.date}T${e.end}:00`);
const isoWeek = (d) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y) / 864e5 + 1) / 7); };
const dateLongue = (s) => { const d = parseISO(s); return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`; };
const dateCourte = (s) => { const d = parseISO(s); return `${JOURS[d.getDay()].slice(0, 3)}. ${d.getDate()} ${MOISC[d.getMonth()]}`; };
const duree = (e) => { const m = (endOf(e) - startOf(e)) / 6e4; const h = Math.floor(m / 60), r = m % 60; return h ? `${h}h${r ? String(r).padStart(2, '0') : ''}` : `${r} min`; };
const nom = (e) => e.title || e.code;
const matiere = (e) => `${e.code}|${e.title}`;
function relatif(date) {
  const s = Math.round((Date.now() - date) / 1000);
  if (s < 60) return "à l'instant";
  const m = Math.round(s / 60); if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60); if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24); return `il y a ${j} jour${j > 1 ? 's' : ''}`;
}
function compteARebours(ms) {
  const m = Math.max(0, Math.round(ms / 6e4));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 24) return `${h} h ${String(r).padStart(2, '0')}`;
  const j = Math.floor(h / 24); return `${j} j ${h % 24} h`;
}
const icon = {
  room: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

/* ================================================================ état */
const S = { data: null, changes: [], tab: 'week', week: monday(new Date()), month: new Date(new Date().getFullYear(), new Date().getMonth(), 1), q: '', semaines: [], off: new Set(JSON.parse(localStorageGet('off') || '[]')), colors: new Map(), recent: new Map(), ghosts: [] };
function localStorageGet(k) { try { return localStorage.getItem('planning-cnam-btp:' + k); } catch { return null; } }
function localStorageSet(k, v) { try { localStorage.setItem('planning-cnam-btp:' + k, v); } catch {} }
const couleur = (e) => S.colors.get(matiere(e)) || '#888';
const visible = (e) => !S.off.has(matiere(e));

/* ================================================================ chargement */
async function charger() {
  const t = Date.now();
  const [p, c] = await Promise.all([
    fetch(`data/planning.json?t=${t}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch(`data/changes.json?t=${t}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
  ]);
  S.data = p; S.changes = Array.isArray(c) ? c : [];
  if (p) preparer();
  rendreTout();
  statutGithub();
}

function preparer() {
  const ev = S.data.events;
  // couleurs stables par matière (ordre alphabétique)
  [...new Set(ev.map(matiere))].sort().forEach((m, i) => S.colors.set(m, PALETTE[i % PALETTE.length]));
  // modifications des 14 derniers jours -> badges + cours supprimés en filigrane
  S.recent.clear(); S.ghosts = [];
  const limite = Date.now() - 14 * 864e5;
  for (const b of [...S.changes].reverse()) {
    if (Date.parse(b.at) < limite) continue;
    for (const c of b.changes) {
      if (c.after) S.recent.set(c.after.id, c.kind);
      if (c.kind === 'removed' || c.kind === 'moved') S.ghosts.push({ ...c.before, _ghost: c.kind, _to: c.after });
    }
  }
  const ids = new Set(ev.map((e) => e.id));
  S.ghosts = S.ghosts.filter((g) => !ids.has(g.id));
  calculerSemaines();
  indexerRecherche();
  const g = ev.find((e) => e.group)?.group;
  if (g) $('#subtitle').textContent = `Grand Est · ${g.replace(/\s+(Annuel|Premier semestre|Second semestre)$/i, '')}`;
}

/* ================================================================ rendu */
function rendreTout() {
  rendreStatut(); rendreAlerte(); rendreHero(); rendreFrise(); rendreChips(); rendreVue();
}

function rendreStatut(gh) {
  const el = $('#status');
  if (gh) {
    const ok = gh.conclusion === 'success' || gh.status !== 'completed';
    el.innerHTML = `<span class="dot ${ok ? 'ok' : 'ko'}"></span><span>${ok ? 'Vérifié' : 'Échec de la vérification'} ${relatif(new Date(gh.updated_at))}</span>`;
    el.title = `Dernière vérification automatique : ${new Date(gh.updated_at).toLocaleString('fr-FR')}`;
    return;
  }
  if (!S.data) { el.innerHTML = '<span class="dot"></span><span>En attente de la 1re vérification</span>'; return; }
  el.innerHTML = `<span class="dot ok"></span><span>Mis à jour ${relatif(new Date(S.data.updatedAt))}</span>`;
}

async function statutGithub() {
  const h = location.hostname;
  if (!h.endsWith('.github.io')) return;
  const owner = h.split('.')[0];
  const repo = location.pathname.split('/').filter(Boolean)[0] || `${owner}.github.io`;
  try {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/planning.yml/runs?per_page=1`);
    if (!r.ok) return;
    const run = (await r.json()).workflow_runs?.[0];
    if (run) rendreStatut(run);
  } catch {}
}

function rendreAlerte() {
  const el = $('#alert');
  const b = S.changes[0];
  if (!b || Date.now() - Date.parse(b.at) > 7 * 864e5) { el.innerHTML = ''; return; }
  const n = b.changes.length;
  const d = new Date(b.at);
  el.innerHTML = `<div class="alert" role="button" tabindex="0">⚠️ <span><b>${n} modification${n > 1 ? 's' : ''}</b> du planning détectée${n > 1 ? 's' : ''} le ${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span><span class="go">Voir le détail</span></div>`;
  el.firstChild.onclick = () => choisirOnglet('changes');
}

function rendreHero() {
  const el = $('#hero');
  if (!S.data) { el.innerHTML = ''; return; }
  const now = new Date();
  const ev = S.data.events;
  const futurs = ev.filter((e) => endOf(e) > now);
  const enCours = futurs.find((e) => startOf(e) <= now);
  const prochain = enCours || futurs[0];
  const exam = ev.find((e) => e.exam && endOf(e) > now);
  const nbSemaine = ev.filter((e) => { const d = parseISO(e.date); return d >= monday(now) && d < addDays(monday(now), 7); });
  const heures = nbSemaine.reduce((s, e) => s + (endOf(e) - startOf(e)) / 36e5, 0);

  let html = '';
  if (prochain) {
    const c = couleur(prochain);
    const quand = enCours
      ? `<span class="pill-live"><i></i>En cours · fin dans ${compteARebours(endOf(prochain) - now)}</span>`
      : `Dans ${compteARebours(startOf(prochain) - now)}`;
    html += `<div class="tile next" style="cursor:pointer" data-id="${esc(prochain.id)}"><span class="bar" style="background:${c}"></span>
      <div class="k">${enCours ? 'Cours actuel' : 'Prochain cours'}</div>
      <div class="big">${esc(nom(prochain))}${prochain.exam ? ' · ' + esc(prochain.type) : ''}</div>
      <div class="meta"><span>${esc(dateLongue(prochain.date))}, ${prochain.start} – ${prochain.end}</span><span>${esc(prochain.room)}</span>${prochain.teacher ? `<span>${esc(prochain.teacher)}</span>` : ''}</div>
      <div class="count">${quand}</div></div>`;
  } else {
    html += `<div class="tile next"><div class="k">Prochain cours</div><div class="big">Aucun cours à venir</div><div class="meta">sur la période connue</div></div>`;
  }
  if (exam) {
    const j = Math.round((parseISO(exam.date) - parseISO(dISO(now))) / 864e5);
    html += `<div class="tile exam" style="cursor:pointer" data-id="${esc(exam.id)}"><div class="k">Prochain examen</div>
      <div class="big">${esc(nom(exam))}</div><div class="meta"><span>${esc(dateCourte(exam.date))} · ${exam.start}</span><span>${esc(exam.room)}</span></div>
      <div class="count"><span class="days-left">${j <= 0 ? "Aujourd'hui" : j === 1 ? 'Demain' : 'J-' + j}</span></div></div>`;
  } else {
    html += `<div class="tile"><div class="k">Prochain examen</div><div class="big">Aucun examen prévu</div><div class="meta">sur les semaines connues</div></div>`;
  }
  const retour = !nbSemaine.length && S.data.events.find((e) => parseISO(e.date) >= addDays(monday(now), 7));
  html += `<div class="tile"><div class="k">Cette semaine</div>${nbSemaine.length
    ? `<div class="big">${nbSemaine.length} créneau${nbSemaine.length > 1 ? 'x' : ''}</div><div class="meta"><span>${String(Math.round(heures * 10) / 10).replace('.', ',')} h de cours</span></div>`
    : `<div class="big">🏭 En entreprise</div><div class="meta">${retour ? `<span>Retour au Cnam : ${esc(dateCourte(retour.date))}</span>` : '<span>Aucun cours au Cnam</span>'}</div>`}
    <div class="count" style="color:var(--ink3);font-family:var(--font);font-weight:500">Planning connu jusqu'au ${esc(dateCourte(S.data.windowEnd))}</div></div>`;
  el.innerHTML = html;
  el.querySelectorAll('[data-id]').forEach((t) => (t.onclick = () => ouvrir(t.dataset.id)));
}

function rendreChips() {
  const el = $('#chips');
  if (!S.data || (!S.q && ['changes', 'ue'].includes(S.tab))) { el.innerHTML = ''; return; }
  const vus = new Map();
  for (const e of S.data.events) if (!vus.has(matiere(e))) vus.set(matiere(e), e);
  el.innerHTML = [...vus.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([m, e]) =>
    `<button class="chip ${S.off.has(m) ? 'off' : ''}" style="--c:${couleur(e)}" data-m="${esc(m)}" title="Afficher / masquer"><i></i>${esc(e.code)}${e.title ? ' · ' + esc(e.title) : ''}</button>`).join('');
  el.querySelectorAll('.chip').forEach((c) => (c.onclick = () => {
    const m = c.dataset.m;
    S.off.has(m) ? S.off.delete(m) : S.off.add(m);
    localStorageSet('off', JSON.stringify([...S.off]));
    rendreChips(); rendreVue();
  }));
}

function carte(e, opts = {}) {
  const now = new Date();
  const c = couleur(e);
  const kind = e._ghost ? null : S.recent.get(e.id);
  const flagTxt = { added: 'Nouveau', moved: 'Déplacé', modified: 'Modifié' }[kind];
  const cls = ['ev', e.exam && 'exam', e._ghost && 'ghost',
    !e._ghost && startOf(e) <= now && endOf(e) > now && 'now', !e._ghost && endOf(e) <= now && 'done'].filter(Boolean).join(' ');
  const ghostTxt = e._ghost === 'moved' && e._to ? `Déplacé au ${dateCourte(e._to.date)} ${e._to.start}` : 'Supprimé';
  return `<button class="${cls}" style="--c:${c}" data-id="${esc(e.id)}" ${e._ghost ? 'data-ghost="1"' : ''}>
    <div class="t">${opts.date ? esc(dateCourte(e.date)) + ' · ' : ''}${e.start} – ${e.end}<span class="dur">${duree(e)}</span>${flagTxt ? `<span class="flag ${kind}">${flagTxt}</span>` : ''}</div>
    <div class="ti">${esc(nom(e))}</div>
    <div class="ro">
      ${e._ghost ? `<span class="tag">${esc(ghostTxt)}</span>` : ''}
      ${e.exam ? `<span class="tag exam">${esc(e.type)}</span>` : ''}
      <span class="tag code">${esc(e.code)}</span>
      <span class="tag room">${icon.room}${esc(e.room || '—')}</span>
      ${!e.exam && e.type && e.type !== 'Cours' ? `<span class="tag">${esc(e.type)}</span>` : ''}
    </div></button>`;
}

function rendreVue() {
  const el = $('#view');
  $('#weeknav').style.display = !S.q && ['week', 'month'].includes(S.tab) ? '' : 'none';
  $('#todayBtn').textContent = S.tab === 'month' ? 'Ce mois-ci' : "Aujourd'hui";
  if (!S.data) {
    el.innerHTML = `<div class="placeholder"><h3>Le planning n'a pas encore été récupéré</h3><p>La première vérification automatique va remplir cette page (ou lance-la à la main dans l'onglet <b>Actions</b> du dépôt GitHub).</p></div>`;
    return;
  }
  if (S.q) vueRecherche(el);
  else ({ week: vueSemaine, month: vueMois, list: vueListe, exams: vueExamens, ue: vueUE, changes: vueModifs })[S.tab](el);
  el.querySelectorAll('[data-id]').forEach((b) => (b.onclick = (ev) => { ev.stopPropagation(); ouvrir(b.dataset.id, b.dataset.ghost); }));
}
