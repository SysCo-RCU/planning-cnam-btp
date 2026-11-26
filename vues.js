function vueSemaine(el) {
  const lun = S.week, dim = addDays(lun, 6);
  const fin = addDays(lun, 7);
  $('#weeklbl').innerHTML = `<small>Semaine ${isoWeek(lun)}</small>${lun.getDate()}${lun.getMonth() !== dim.getMonth() ? ' ' + MOISC[lun.getMonth()] : ''} – ${dim.getDate()} ${MOISC[dim.getMonth()]} ${dim.getFullYear()}`;
  const tous = [...S.data.events, ...S.ghosts].filter(visible);
  const semaine = tous.filter((e) => { const d = parseISO(e.date); return d >= lun && d < fin; });
  const nbJours = semaine.some((e) => parseISO(e.date).getDay() === 0) ? 7 : semaine.some((e) => parseISO(e.date).getDay() === 6) ? 6 : 5;
  const auj = dISO(new Date());
  let html = `<div class="grid" style="--cols:${nbJours}">`;
  for (let i = 0; i < nbJours; i++) {
    const d = addDays(lun, i), iso = dISO(d);
    const jour = semaine.filter((e) => e.date === iso).sort((a, b) => a.start.localeCompare(b.start) || (a._ghost ? 1 : -1));
    // jour sans cours : entreprise ou férié d'après le calendrier officiel
    const st = jour.length || S.data.events.some((e) => e.date === iso) ? 'cnam' : statutJour(iso);
    const lib = !jour.length && LIB_JOUR[st];
    const cls = ['day', iso === auj && 'today', iso < auj && 'past', !jour.length && !lib && 'empty-mobile'].filter(Boolean).join(' ');
    html += `<div class="${cls}"><div class="dh"><span class="dn">${d.getDate()}</span><span class="dw">${JOURS[d.getDay()]}</span>${iso === auj ? '<span class="today-tag">Aujourd\'hui</span>' : ''}</div>
      ${jour.length ? jour.map((e) => carte(e)).join('') : lib ? `<div class="empty-day ${st}">${lib}</div>` : '<div class="empty-day">Pas de cours</div>'}</div>`;
  }
  html += '</div>';
  const connu = parseISO(S.data.windowEnd);
  const reels = S.data.events.filter((e) => { const d = parseISO(e.date); return d >= lun && d < fin; });
  const info = infoSemaine(lun);
  if (!reels.length && info?.type === 'entreprise') html = semaineEntreprise(lun);
  else if (!reels.length && info) html = semaineCnamVide(lun, lun > connu);
  else if (lun > connu) html = `<div class="placeholder"><h3>Semaine pas encore publiée</h3><p>Le planning est connu jusqu'au ${esc(dateLongue(S.data.windowEnd))}.</p></div>`;
  else if (!reels.length) html = semaineEntreprise(lun);
  else if (!semaine.length) html += `<p style="text-align:center;color:var(--ink3);margin-top:16px">Aucun cours cette semaine 🎉</p>`;
  el.innerHTML = html;
}

function vueListe(el) {
  const now = new Date();
  const ev = S.data.events.filter((e) => endOf(e) > now && visible(e));
  if (!ev.length) { el.innerHTML = '<div class="placeholder"><h3>Rien à venir</h3></div>'; return; }
  const jours = new Map();
  ev.forEach((e) => (jours.get(e.date) || jours.set(e.date, []).get(e.date)).push(e));
  let html = '<div class="list">', sem = null, lunPrec = null;
  for (const [d, liste] of jours) {
    const w = isoWeek(parseISO(d));
    const lun = dISO(monday(parseISO(d)));
    if (w !== sem) {
      if (lunPrec) html += separateurEntreprise(lunPrec, lun);
      sem = w; lunPrec = lun; html += `<div class="weeksep">Semaine ${w}</div>`;
    }
    const total = liste.reduce((s, e) => s + (endOf(e) - startOf(e)) / 36e5, 0);
    html += `<div class="lday"><h3>${esc(dateLongue(d))}<span>${liste.length} créneau${liste.length > 1 ? 'x' : ''} · ${String(total).replace('.', ',')} h</span></h3><div class="items">${liste.map((e) => carte(e)).join('')}</div></div>`;
  }
  el.innerHTML = html + '</div>';
}

function vueExamens(el) {
  const now = new Date();
  const ex = S.data.events.filter((e) => e.exam && visible(e));
  if (!ex.length) { el.innerHTML = '<div class="placeholder"><h3>Aucun examen dans le planning</h3><p>Ils apparaîtront ici dès leur publication.</p></div>'; return; }
  const aujourdHui = parseISO(dISO(now));
  el.innerHTML = '<div class="exams">' + ex.map((e) => {
    const j = Math.round((parseISO(e.date) - aujourdHui) / 864e5);
    const passe = endOf(e) < now;
    const cd = passe ? '✓<small>passé</small>' : j <= 0 ? '<span style="font-size:15px">Auj.</span>' : `${j}<small>jour${j > 1 ? 's' : ''}</small>`;
    return `<button class="excard ${passe ? 'past' : ''}" data-id="${esc(e.id)}"><div class="cd">${cd}</div><div>
      <h4>${esc(nom(e))}</h4><p>${esc(dateLongue(e.date))} · ${e.start} – ${e.end}</p><p>${esc(e.room)}${e.notes ? ' · ' + esc(e.notes) : ''}</p></div></button>`;
  }).join('') + '</div>';
}

function vueModifs(el) {
  if (!S.changes.length) {
    el.innerHTML = '<div class="placeholder"><h3>Aucune modification détectée pour l\'instant</h3><p>Chaque changement (ajout, suppression, déplacement, salle…) apparaîtra ici et te sera envoyé par e-mail.</p></div>';
    return;
  }
  const lib = { added: 'Ajouté', removed: 'Supprimé', moved: 'Déplacé', modified: 'Modifié' };
  const q = (e) => `${dateCourte(e.date)} · ${e.start}–${e.end}`;
  el.innerHTML = '<div class="timeline">' + S.changes.map((b) => {
    const d = new Date(b.at);
    return `<div class="batch"><header>📅 ${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}<span>à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · ${b.changes.length} changement${b.changes.length > 1 ? 's' : ''}</span></header>` +
      b.changes.map((c) => {
        const e = c.after || c.before;
        let w = '';
        if (c.kind === 'added') w = `${esc(q(e))} · ${esc(e.room)}`;
        if (c.kind === 'removed') w = `<s>${esc(q(e))} · ${esc(e.room)}</s>`;
        if (c.kind === 'moved') w = `<s>${esc(q(c.before))} · ${esc(c.before.room)}</s><span class="arrow">→</span><b>${esc(q(c.after))} · ${esc(c.after.room)}</b>`;
        if (c.kind === 'modified') w = `${esc(q(e))} — ` + c.fields.map((f) => `${esc(f.label)} : <s>${esc(f.old || '—')}</s><span class="arrow">→</span><b>${esc(f.new || '—')}</b>`).join(' · ');
        return `<div class="chg"><span class="kind ${c.kind}">${lib[c.kind]}</span><div><b>${esc(e.code)}${e.title ? ' – ' + esc(e.title) : ''}${e.exam ? ' (' + esc(e.type) + ')' : ''}</b><div class="w">${w}</div></div></div>`;
      }).join('') + '</div>';
  }).join('') + '</div>';
}

/* ================================================================ détail */
function ouvrir(id, ghost) {
  const e = (ghost ? S.ghosts : S.data.events).find((x) => x.id === id);
  if (!e) return;
  const c = couleur(e);
  const lignes = [
    ['Date', `${dateLongue(e.date)}`],
    ['Horaire', `${e.start} – ${e.end} <span style="color:var(--ink3)">(${duree(e)})</span>`],
    ['Salle', esc([e.room, e.centre].filter(Boolean).join(' · ') || '—')],
    e.teacher && ['Enseignant', esc(e.teacher)],
    ['Type', esc([e.category, e.type].filter((v, i, a) => v && a.indexOf(v) === i).join(' · '))],
    e.notes && ['Remarque', esc(e.notes)],
    e.session && ['Avancement', `Séance ${e.session} / ${e.sessions}<div class="progress"><i style="width:${Math.min(100, (e.session / e.sessions) * 100)}%"></i></div>`],
    e.ue && ['UE', esc(e.ue)],
    e.group && ['Groupe', esc(e.group)],
  ].filter(Boolean);
  const dlg = $('#dlg');
  dlg.style.setProperty('--c', e.exam ? 'var(--red)' : c);
  dlg.innerHTML = `<div class="dlg-top"><button class="ib x" aria-label="Fermer">${icon.x}</button>
      <div class="ro" style="display:flex;gap:6px">${e.exam ? `<span class="tag exam">${esc(e.type)}</span>` : ''}<span class="tag code" style="--c:${c}">${esc(e.code)}</span>${e._ghost ? '<span class="tag">Supprimé du planning</span>' : ''}</div>
      <h2>${esc(nom(e))}</h2><p>${esc(dateLongue(e.date))}, ${e.start} – ${e.end}</p></div>
    <div class="rows">${lignes.map(([l, v]) => `<div class="row"><div class="l">${l}</div><div style="flex:1">${v}</div></div>`).join('')}</div>`;
  dlg.querySelector('.x').onclick = () => dlg.close();
  dlg.onclick = (ev) => { if (ev.target === dlg) dlg.close(); };
  dlg.showModal();
}

/* ================================================================ interactions */
function choisirOnglet(t) {
  S.tab = t;
  if (S.q) { S.q = ''; $('#q').value = ''; }
  document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === t));
  rendreChips(); rendreVue();
  window.scrollTo({ top: $('#tabs').offsetTop - 20, behavior: 'smooth' });
}
document.querySelectorAll('.tab').forEach((b) => (b.onclick = () => choisirOnglet(b.dataset.tab)));
const decaler = (n) => { if (S.tab === 'month') S.month = addMonths(S.month, n); else S.week = addDays(S.week, 7 * n); rendreVue(); };
$('#prev').onclick = () => decaler(-1);
$('#next').onclick = () => decaler(1);
$('#todayBtn').onclick = () => {
  const d = new Date();
  if (S.tab === 'month') S.month = new Date(d.getFullYear(), d.getMonth(), 1); else S.week = monday(d);
  rendreVue();
};
document.addEventListener('keydown', (e) => {
  if (!['week', 'month'].includes(S.tab) || S.q || $('#dlg').open || e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowLeft') $('#prev').click();
  if (e.key === 'ArrowRight') $('#next').click();
});
// le week-end, on affiche directement la semaine suivante
if ([0, 6].includes(new Date().getDay())) S.week = addDays(S.week, 7);

// lien d'abonnement agenda (webcal) + compteur d'onglet
const icsUrl = new URL('planning.ics', location.href);
$('#ics').href = location.protocol === 'https:' ? icsUrl.href.replace(/^https:/, 'webcal:') : icsUrl.href;
$('#foot').innerHTML = `Abonnement agenda : <a href="${esc(icsUrl.href)}">${esc(icsUrl.href)}</a>`;

setTimeout(charger);   // après le chargement de extras.js
setInterval(() => { rendreHero(); if (S.tab !== 'changes') rendreVue(); }, 60000);   // compte à rebours
setInterval(charger, 5 * 60000);                                                   // nouvelles données
document.addEventListener('visibilitychange', () => { if (!document.hidden) charger(); });
