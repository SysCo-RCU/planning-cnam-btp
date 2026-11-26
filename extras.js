/* Recherche, semaines école / entreprise, vue mois, avancement des UE */
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const heures = (h) => String(Math.round(h * 10) / 10).replace('.', ',') + ' h';
const jSemaine = (d) => `${JOURS[d.getDay()].slice(0, 3)}. ${d.getDate()} ${MOISC[d.getMonth()]}`;
// un même cours donné dans plusieurs salles en parallèle ne compte qu'une fois
const uniques = (liste) => { const vus = new Set(); return liste.filter((e) => { const k = `${e.date}|${e.start}|${matiere(e)}`; return !vus.has(k) && vus.add(k); }); };
const TYPES = { ecole: ['🎓', 'Cnam'], entreprise: ['🏭', 'Entreprise'] };

/* ================================================================ calendrier officiel */
// data/calendrier.json : calendrier prévisionnel du Cnam (jour → cnam / ent / ferie)
fetch(`data/calendrier.json?t=${Date.now()}`).then((r) => (r.ok ? r.json() : null)).then((c) => {
  if (!c?.jours) return;
  S.cal = c.jours; S.calSource = c.source || '';
  if (S.data) { calculerSemaines(); rendreTout(); }
}).catch(() => {});
// calendrier.pdf : le PDF officiel ; le lien n'apparaît que si le fichier est présent
fetch('calendrier.pdf', { method: 'HEAD', cache: 'no-store' }).then((r) => {
  if (!r.ok) return;
  S.calPdf = 'calendrier.pdf';
  if (S.data && S.semaines) rendreFrise();
}).catch(() => {});

// statut d'un jour : 'cnam' | 'ent' | 'ferie' | null (inconnu)
function statutJour(iso) {
  if (S.cal?.[iso]) return S.cal[iso];
  const d = parseISO(iso).getDay();
  if (S.cal || d === 0 || d === 6 || iso > S.data.windowEnd) return null;
  return S.data.events.some((e) => e.date === iso) ? 'cnam' : 'ent';
}

/* ================================================================ semaines école / entreprise */
function calculerSemaines() {
  const ev = S.data.events;
  S.semaines = [];
  if (!ev.length) return;
  const premier = ev.reduce((m, e) => (e.date < m ? e.date : m), ev[0].date);
  let debut = monday(parseISO(premier)), fin = monday(parseISO(S.data.windowEnd));
  if (S.cal) {
    // toute l'année de formation en cours (de la rentrée au dernier jour au Cnam)
    const auj = new Date(), y = auj.getMonth() >= 8 ? auj.getFullYear() : auj.getFullYear() - 1;
    const cnam = Object.keys(S.cal).filter((d) => S.cal[d] === 'cnam' && d >= `${y}-09-01` && d <= `${y + 1}-08-31`).sort();
    if (cnam.length) {
      debut = monday(parseISO(cnam[0]));
      const f = monday(parseISO(cnam[cnam.length - 1]));
      if (f > fin) fin = f;
    }
  }
  const connu = monday(parseISO(S.data.windowEnd));
  for (let lun = debut; lun <= fin; lun = addDays(lun, 7)) {
    const a = dISO(lun), b = dISO(addDays(lun, 6));
    const n = new Set(ev.filter((e) => e.date >= a && e.date <= b).map((e) => e.date)).size;
    // semaine Cnam s'il y a au moins un jour au Cnam (calendrier officiel, sinon cours publiés)
    const offi = [0, 1, 2, 3, 4].map((i) => S.cal?.[dISO(addDays(lun, i))]).filter((v) => v && v !== 'ferie');
    const type = offi.length ? (offi.includes('cnam') ? 'ecole' : 'entreprise') : n ? 'ecole' : 'entreprise';
    S.semaines.push({ lun, iso: a, jours: n, type, prev: lun > connu });
  }
}
const infoSemaine = (lun) => (S.semaines || []).find((s) => s.iso === dISO(lun));
// premier jour au Cnam après une date (calendrier officiel, sinon premier cours publié)
function retourCnam(apres) {
  const cours = S.data.events.find((e) => startOf(e) > apres);
  if (!S.cal) return cours ? { date: cours.date, cours } : null;
  const iso = dISO(apres);
  const d = Object.keys(S.cal).filter((k) => k >= iso && S.cal[k] === 'cnam').sort()[0];
  if (!d) return cours ? { date: cours.date, cours } : null;
  return { date: d, cours: cours && cours.date === d ? cours : null };
}

function rendreFrise() {
  const el = $('#frise');
  if (!S.data || !S.semaines?.length) { el.innerHTML = ''; return; }
  const cur = dISO(monday(new Date()));
  let moisPrec = -1;
  const cases = S.semaines.map((s) => {
    const jeudi = addDays(s.lun, 3);
    const m = jeudi.getMonth() !== moisPrec ? MOISC[jeudi.getMonth()] : '';
    moisPrec = jeudi.getMonth();
    const lib = (s.type === 'entreprise' ? 'en entreprise' : 'au Cnam') + (s.prev ? ' (prévisionnel, cours pas encore publiés)' : '');
    return `<button class="wk ${s.type}${s.iso === cur ? ' cur' : ''}${s.iso < cur ? ' past' : ''}${s.prev ? ' prev' : ''}" data-w="${s.iso}" title="Semaine ${isoWeek(s.lun)} (${jSemaine(s.lun)}) : ${lib}">
      <span class="m">${m}</span><span class="b">${s.type === 'entreprise' ? '🏭' : ''}</span><span class="n">${isoWeek(s.lun)}</span></button>`;
  }).join('');

  // résumé : où j'en suis et prochaine bascule
  const i = S.semaines.findIndex((s) => s.iso === cur);
  const ici = S.semaines[i];
  const morceaux = [];
  if (ici) {
    morceaux.push(ici.type === 'entreprise' ? 'Cette semaine : <b>🏭 en entreprise</b>' : 'Cette semaine : <b>🎓 au Cnam</b>');
    if (ici.type === 'entreprise') {
      const r = retourCnam(new Date());
      if (r) morceaux.push(`Retour au Cnam : <b>${esc(dateLongue(r.date))}</b>`);
    } else {
      const j = S.semaines.findIndex((s, k) => k > i && s.type === 'entreprise');
      if (j > 0) {
        let k = j; while (k + 1 < S.semaines.length && S.semaines[k + 1].type === 'entreprise') k++;
        const n = k - j + 1, finConnue = k === S.semaines.length - 1;
        const du = jSemaine(S.semaines[j].lun), au = jSemaine(addDays(S.semaines[k].lun, 4));
        morceaux.push(`Prochaine période en entreprise : <b>${finConnue ? `à partir du ${du}` : `du ${du} au ${au}`}</b> (${n} sem.${finConnue ? ' au moins' : ''})`);
      }
    }
  }
  const aVenir = S.semaines.filter((s) => s.iso >= cur);
  const nb = (t) => aVenir.filter((s) => s.type === t).length;
  const der = S.semaines[S.semaines.length - 1];
  morceaux.push(`D'ici au ${esc(jSemaine(addDays(der.lun, 4)))} : ${nb('ecole')} sem. au Cnam · ${nb('entreprise')} sem. en entreprise`);

  el.innerHTML = `<div class="frise-card"><div class="fh"><div><div class="k">Rythme d'alternance</div><div class="fs">${morceaux.map((m) => `<span>${m}</span>`).join('')}</div></div>
    <div class="legend"><span><i class="ecole"></i>Cnam</span><span><i class="entreprise"></i>Entreprise</span><span><i class="prev"></i>Prévisionnel</span></div></div>
    <div class="wks">${cases}</div>
    <div class="fsrc">${S.cal ? `Source : ${S.calPdf ? `<a href="${S.calPdf}" target="_blank" rel="noopener">📄 ${esc(S.calSource || 'calendrier du Cnam')} (PDF)</a>` : esc(S.calSource || 'calendrier du Cnam')} · les semaines « prévisionnelles » n'ont pas encore de cours publiés` : 'Déduit des cours publiés (calendrier officiel non chargé)'}</div></div>`;
  el.querySelectorAll('.wk').forEach((b) => (b.onclick = () => { S.week = parseISO(b.dataset.w); choisirOnglet('week'); }));
  const c = el.querySelector('.wk.cur');
  if (c) { const w = el.querySelector('.wks'); w.scrollLeft = Math.max(0, c.offsetLeft - w.offsetLeft - 40); }
}

// bandeau affiché à la place de la grille pour une semaine sans cours
function semaineEntreprise(lun) {
  const r = retourCnam(addDays(lun, 7));
  return `<div class="placeholder ent"><div class="ico">🏭</div><h3>Semaine en entreprise</h3>
    <p>Pas de Cnam du ${esc(jSemaine(lun))} au ${esc(jSemaine(addDays(lun, 4)))}</p>
    ${r ? `<p class="ret">Retour au Cnam : <b>${esc(dateLongue(r.date))}</b>${r.cours ? ` à ${r.cours.start} · ${esc(nom(r.cours))}` : ''}</p>` : ''}</div>`;
}

// semaine au Cnam (d'après le calendrier) mais sans cours publiés
function semaineCnamVide(lun, futur) {
  return `<div class="placeholder"><div class="ico">🎓</div><h3>Semaine au Cnam</h3>
    <p>${futur ? 'Les cours de cette semaine ne sont pas encore publiés.' : 'Aucun cours publié pour cette semaine au Cnam.'}</p>
    <p class="ret">Calendrier prévisionnel : du ${esc(jSemaine(lun))} au ${esc(jSemaine(addDays(lun, 4)))}</p></div>`;
}

const LIB_JOUR = { ent: '🏭 Entreprise', ferie: '🎉 Férié' };

// séparateur « semaines en entreprise » entre deux jours de la liste
function separateurEntreprise(avant, apres) {
  const ent = (S.semaines || []).filter((s) => s.type === 'entreprise' && s.iso > avant && s.iso < apres);
  if (!ent.length) return '';
  const a = ent[0], b = ent[ent.length - 1];
  const sem = ent.length > 1 ? `Semaines ${isoWeek(a.lun)} à ${isoWeek(b.lun)}` : `Semaine ${isoWeek(a.lun)}`;
  return `<div class="entsep">🏭 <b>${sem} en entreprise</b><span>du ${esc(jSemaine(a.lun))} au ${esc(jSemaine(addDays(b.lun, 4)))}</span></div>`;
}

/* ================================================================ vue mois */
function vueMois(el) {
  const y = S.month.getFullYear(), m = S.month.getMonth();
  $('#weeklbl').innerHTML = `<small>Mois</small>${MOIS[m][0].toUpperCase() + MOIS[m].slice(1)} ${y}`;
  const premier = new Date(y, m, 1), dernier = new Date(y, m + 1, 0);
  const auj = dISO(new Date()), connu = S.data.windowEnd;
  const tous = S.data.events.filter(visible);
  const dansMois = (e) => { const d = parseISO(e.date); return d.getMonth() === m && d.getFullYear() === y; };
  const nbJ = tous.some((e) => dansMois(e) && [0, 6].includes(parseISO(e.date).getDay())) ? 7 : 5;
  const noms = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].slice(0, nbJ);
  let html = `<div class="month" style="--cols:${nbJ}"><div class="mhd"></div>${noms.map((n) => `<div class="mhd">${n}</div>`).join('')}`;
  for (let lun = monday(premier); lun <= dernier; lun = addDays(lun, 7)) {
    const s = infoSemaine(lun);
    html += `<button class="mw ${s ? s.type : ''}" data-w="${dISO(lun)}" title="Voir la semaine ${isoWeek(lun)}"><b>S${isoWeek(lun)}</b><span>${s ? TYPES[s.type][0] : ''}</span></button>`;
    for (let i = 0; i < nbJ; i++) {
      const d = addDays(lun, i), iso = dISO(d);
      const jour = uniques(tous.filter((e) => e.date === iso));
      const st = jour.length ? 'cnam' : statutJour(iso);
      const cls = ['md', d.getMonth() !== m && 'out', iso === auj && 'today', iso < auj && 'past', st === 'ent' && 'ent', st === 'ferie' && 'fer', iso > connu && 'unk'].filter(Boolean).join(' ');
      const lab = !jour.length && st ? (st === 'cnam' ? (iso > connu ? '🎓<span> Cnam</span>' : '') : LIB_JOUR[st].replace(' ', '<span> ') + '</span>') : '';
      const items = jour.slice(0, 4).map((e) => `<span class="mi${e.exam ? ' exam' : ''}" style="--c:${e.exam ? 'var(--red)' : couleur(e)}" data-id="${esc(e.id)}" title="${esc(`${e.start}–${e.end} ${nom(e)} · ${e.room}`)}"><i></i><em>${e.start}</em><span class="mt">${e.exam ? '📝 ' : ''}${esc(nom(e))}</span></span>`).join('');
      const plus = jour.length > 4 ? `<span class="more">+${jour.length - 4}</span>` : '';
      html += `<div class="${cls}" data-day="${iso}"><div class="mdn">${d.getDate()}</div><div class="mis">${items}${plus}</div>${lab ? `<span class="entl ${st}">${lab}</span>` : ''}</div>`;
    }
  }
  el.innerHTML = html + '</div><p class="mnote">Clique sur un jour ou une semaine pour l\'ouvrir en détail.</p>';
  const versSemaine = (iso) => { S.week = monday(parseISO(iso)); choisirOnglet('week'); };
  el.querySelectorAll('.md').forEach((c) => (c.onclick = () => versSemaine(c.dataset.day)));
  el.querySelectorAll('.mw').forEach((c) => (c.onclick = () => versSemaine(c.dataset.w)));
}

/* ================================================================ avancement des UE */
function avancement() {
  const now = new Date();
  const parCode = new Map();
  for (const e of S.data.events) (parCode.get(e.code) || parCode.set(e.code, []).get(e.code)).push(e);
  const res = [];
  for (const [code, ev] of parCode) {
    const num = ev.filter((e) => e.session && e.sessions);
    const total = num.length ? Math.max(...num.map((e) => e.sessions)) : 0;
    const faits = num.filter((e) => endOf(e) <= now), futurs = num.filter((e) => endOf(e) > now);
    const fait = faits.length ? Math.max(...faits.map((e) => e.session)) : futurs.length ? Math.min(...futurs.map((e) => e.session)) - 1 : 0;
    const prevus = uniques(ev.filter((e) => startOf(e) > now));
    const exams = uniques(ev.filter((e) => e.exam)).map((x) => {
      const avant = uniques(ev.filter((e) => !e.exam && matiere(e) === matiere(x) && startOf(e) > now && startOf(e) < startOf(x)));
      return { e: x, j: Math.round((parseISO(x.date) - parseISO(dISO(now))) / 864e5), passe: endOf(x) <= now, nb: avant.length,
        h: avant.reduce((s, e) => s + (endOf(e) - startOf(e)) / 36e5, 0) };
    });
    res.push({ code, ev, total, fait: Math.max(0, Math.min(fait, total)), prevus, exams,
      ue: ev.find((e) => e.ue)?.ue || '', titres: [...new Set(ev.map((e) => e.title).filter(Boolean))],
      prochain: exams.filter((x) => !x.passe).sort((a, b) => a.j - b.j)[0] });
  }
  return res.sort((a, b) => (a.prochain ? a.prochain.j : 1e4) - (b.prochain ? b.prochain.j : 1e4) || a.code.localeCompare(b.code));
}

function vueUE(el) {
  const ues = avancement();
  el.innerHTML = '<p class="uenote">Calculé à partir des numéros de séance du Cnam (par exemple « séance 14/31 »).</p><div class="ues">' + ues.map((u) => {
    const pct = u.total ? Math.round((u.fait / u.total) * 100) : 0;
    const c = couleur(u.ev[0]);
    const h = u.prevus.reduce((s, e) => s + (endOf(e) - startOf(e)) / 36e5, 0);
    const nx = u.prevus.find((e) => !e.exam);
    const exams = u.exams.map((x) => {
      const cd = x.passe ? '✓' : x.j <= 0 ? 'Auj.' : 'J-' + x.j;
      let conseil;
      if (x.passe) conseil = 'Examen passé';
      else if (!x.nb) conseil = 'Plus de cours avant l\'examen : c\'est le moment de réviser';
      else conseil = `Encore ${x.nb} cours (${heures(x.h)}) avant l'examen`;
      if (!x.passe && x.j > 14) conseil += ` · repère révisions (J-14) : ${esc(jSemaine(addDays(parseISO(x.e.date), -14)))}`;
      else if (!x.passe && x.nb) conseil += ' · à réviser dès maintenant';
      return `<button class="uex${x.passe ? ' past' : ''}${!x.passe && x.j <= 14 ? ' soon' : ''}" data-id="${esc(x.e.id)}"><span class="j">${cd}</span>
        <span><b>📝 ${esc(nom(x.e))}</b> · ${esc(dateCourte(x.e.date))} à ${x.e.start}<small>${conseil}</small></span></button>`;
    }).join('');
    return `<div class="uecard" style="--c:${c}">
      <div class="uh">${u.ue || u.titres[0] ? `<span class="tag code">${esc(u.code)}</span>` : ''}<h4>${esc(u.ue || u.titres[0] || u.code)}</h4></div>
      ${u.titres.length ? `<div class="sub">${u.titres.map(esc).join(' · ')}</div>` : ''}
      ${u.total ? `<div class="pbar"><i style="width:${pct}%"></i></div>
      <div class="nums"><b>${pct} %</b><span>${u.fait}/${u.total} séances faites</span><span><b>${u.total - u.fait}</b> restante${u.total - u.fait > 1 ? 's' : ''}</span></div>` : ''}
      <div class="nx">${u.prevus.length ? `${u.prevus.length} créneau${u.prevus.length > 1 ? 'x' : ''} déjà au planning (${heures(h)})` : 'Plus rien au planning connu'}${nx ? ` · prochain : ${esc(dateCourte(nx.date))} ${nx.start}` : ''}</div>
      ${exams ? `<div class="uexs">${exams}</div>` : ''}</div>`;
  }).join('') + '</div>';
}

/* ================================================================ recherche */
function indexerRecherche() {
  for (const e of S.data.events) {
    e._q = norm([e.code, e.title, e.teacher, e.room, e.centre, e.notes, e.type, e.category, e.ue,
      dateLongue(e.date), e.start, e.exam ? 'examen exam partiel controle' : 'cours'].join(' '));
  }
}

function vueRecherche(el) {
  const mots = norm(S.q).split(/\s+/).filter(Boolean);
  const res = S.data.events.filter((e) => mots.every((m) => e._q.includes(m)));
  const now = new Date();
  const aVenir = res.filter((e) => endOf(e) > now), passes = res.filter((e) => endOf(e) <= now).reverse();
  const bloc = (liste) => {
    const jours = new Map();
    liste.forEach((e) => (jours.get(e.date) || jours.set(e.date, []).get(e.date)).push(e));
    return [...jours].map(([d, l]) => `<div class="lday"><h3>${esc(dateLongue(d))}<span>${l.length} créneau${l.length > 1 ? 'x' : ''}</span></h3><div class="items">${l.map((e) => carte(e)).join('')}</div></div>`).join('');
  };
  let html = `<div class="sres"><span><b>${res.length}</b> résultat${res.length > 1 ? 's' : ''} pour « ${esc(S.q)} »${res.length ? ` · ${aVenir.length} à venir` : ''}</span><button class="btn ghost" id="qclear">Effacer la recherche</button></div>`;
  if (!res.length) html += '<div class="placeholder"><h3>Aucun cours ne correspond</h3><p>Essaie un code (USEG07), une matière (ACV), un enseignant, une salle, « Metz » ou « examen ».</p></div>';
  else html += `<div class="list">${bloc(aVenir)}${passes.length ? `<div class="weeksep">Déjà passés</div><div class="done-list">${bloc(passes)}</div>` : ''}</div>`;
  el.innerHTML = html;
  $('#qclear').onclick = () => { $('#q').value = ''; S.q = ''; rendreChips(); rendreVue(); };
}

(() => {
  const q = $('#q');
  let t;
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { S.q = q.value.trim(); rendreChips(); rendreVue(); }, 120); });
  q.addEventListener('keydown', (e) => { if (e.key === 'Escape') { q.value = ''; S.q = ''; rendreChips(); rendreVue(); q.blur(); } });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== q && !$('#dlg').open) { e.preventDefault(); q.focus(); }
  });
})();
