/* Vue « Grille » de la semaine (emploi du temps heure par heure, sur ordinateur et tablette)
   et onglet « Sondages » de la classe (création depuis la page, suppression par le créateur seul).
   Les votes sont comptés par le même service gratuit que le compteur de vues (CountAPI) :
   anonymes, un vote par téléphone. Les sondages créés depuis la page sont gardés par un
   mini-serveur Google Apps Script (voir apps-script/Code.gs). */
(() => {
  const html = document.documentElement;
  const tx = (fr, en) => (html.lang === 'en' ? en : fr);
  const mem = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } },
  };
  const ecranLarge = window.matchMedia('(min-width: 761px)');

  /* ============================================================ vue grille */
  const PX = 56;   // hauteur d'une heure, en pixels
  let mode = mem.get('planning-cnam-btp:vueSemaine') === 'grille' ? 'grille' : 'cartes';
  const ICONES = {
    cartes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="4" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    grille: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>',
  };

  // interrupteur « Cartes | Grille » au début de la navigation de semaine
  const nav = document.getElementById('weeknav');
  const bascule = document.createElement('div');
  bascule.className = 'vbasc';
  bascule.dataset.notr = '';
  bascule.setAttribute('role', 'radiogroup');
  nav.insertBefore(bascule, nav.firstChild);
  function majBascule() {
    bascule.hidden = !(S.tab === 'week' && !S.q);
    bascule.setAttribute('aria-label', tx('Affichage de la semaine', 'Week layout'));
    bascule.innerHTML = [['cartes', tx('Cartes', 'Cards')], ['grille', tx('Grille', 'Grid')]].map(([v, l]) =>
      `<button type="button" role="radio" aria-checked="${mode === v}" data-v="${v}">${ICONES[v]}<span>${l}</span></button>`).join('');
    bascule.querySelectorAll('button').forEach((b) => (b.onclick = () => {
      mode = b.dataset.v;
      mem.set('planning-cnam-btp:vueSemaine', mode);
      rendreVue();
    }));
  }

  const minutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

  // cours qui se chevauchent : côte à côte, une colonne par cours simultané
  function placer(jour) {
    const res = [];
    let groupe = [], finGroupe = -1;
    const vider = () => {
      const n = Math.max(...groupe.map((g) => g.col)) + 1;
      groupe.forEach((g) => { g.ncol = n; res.push(g); });
      groupe = [];
    };
    for (const e of jour) {
      const s = minutes(e.start), f = minutes(e.end);
      if (groupe.length && s >= finGroupe) vider();
      const prises = groupe.filter((g) => minutes(g.e.end) > s).map((g) => g.col);
      let col = 0;
      while (prises.includes(col)) col++;
      groupe.push({ e, col });
      finGroupe = Math.max(finGroupe, f);
    }
    if (groupe.length) vider();
    return res;
  }

  function grille(lun) {
    const fin = addDays(lun, 7);
    const sem = [...S.data.events, ...S.ghosts].filter(visible)
      .filter((e) => { const d = parseISO(e.date); return d >= lun && d < fin; });
    const nbJours = sem.some((e) => parseISO(e.date).getDay() === 0) ? 7 : sem.some((e) => parseISO(e.date).getDay() === 6) ? 6 : 5;
    let h0 = 8, h1 = 18;
    for (const e of sem) { h0 = Math.min(h0, Math.floor(minutes(e.start) / 60)); h1 = Math.max(h1, Math.ceil(minutes(e.end) / 60)); }
    const y = (m) => ((m - h0 * 60) / 60) * PX;
    const auj = dISO(new Date());
    let lignes = '', heures = '';
    for (let h = h0; h <= h1; h++) {
      lignes += `<i style="top:${(h - h0) * PX}px"></i>`;
      heures += `<span style="top:${(h - h0) * PX}px">${String(h).padStart(2, '0')}:00</span>`;
    }
    let tetes = '', colonnes = '';
    for (let i = 0; i < nbJours; i++) {
      const d = addDays(lun, i), iso = dISO(d);
      const jour = sem.filter((e) => e.date === iso).sort((a, b) => a.start.localeCompare(b.start) || (a._ghost ? 1 : -1));
      tetes += `<div class="gh${iso === auj ? ' today' : ''}"><span class="dn">${d.getDate()}</span><span class="dw">${JOURS[d.getDay()]}</span>${iso === auj ? '<span class="today-tag">Aujourd\'hui</span>' : ''}</div>`;
      let contenu = placer(jour).map(({ e, col, ncol }) => {
        const haut = y(minutes(e.start)), h = Math.max(30, y(minutes(e.end)) - haut);
        return `<div class="gc" style="top:${haut + 2}px;height:${h - 4}px;left:calc(${(col * 100) / ncol}% + 3px);width:calc(${100 / ncol}% - 6px)">${carte(e)}</div>`;
      }).join('');
      if (!jour.length) {
        const st = S.data.events.some((e) => e.date === iso) ? 'cnam' : statutJour(iso);
        contenu = `<div class="gvide ${st || ''}">${LIB_JOUR[st] || 'Pas de cours'}</div>`;
      }
      if (iso === auj) {
        const n = new Date(), m = n.getHours() * 60 + n.getMinutes();
        if (m >= h0 * 60 && m <= h1 * 60) contenu += `<div class="gnow" style="top:${y(m)}px"></div>`;
      }
      colonnes += `<div class="gcol${iso === auj ? ' today' : ''}">${contenu}</div>`;
    }
    return `<div class="gwrap" style="--cols:${nbJours}"><div class="ghead"><div></div>${tetes}</div>
      <div class="gbody" style="height:${(h1 - h0) * PX + 14}px"><div class="glignes">${lignes}</div><div class="gheures">${heures}</div>${colonnes}</div></div>`;
  }

  const vueSemaineCartes = vueSemaine;
  vueSemaine = function (el) {   // eslint-disable-line no-global-assign
    vueSemaineCartes(el);   // titre de la semaine + cas « entreprise » / « pas encore publiée »
    if (mode !== 'grille' || !ecranLarge.matches) return;
    const lun = S.week, fin = addDays(lun, 7);
    const reels = S.data.events.some((e) => { const d = parseISO(e.date); return d >= lun && d < fin; });
    if (!reels || lun > parseISO(S.data.windowEnd)) return;
    el.innerHTML = grille(lun);
  };
  ecranLarge.addEventListener?.('change', () => { if (S.data) rendreVue(); });

  /* ============================================================ sondages */
  // Deux sources : data/sondages.json (sondages publiés dans le dépôt) et le mini-serveur
  // Google Apps Script dont l'adresse est dans ce même fichier (« api ») : sondages créés
  // depuis la page. Seul l'appareil qui a créé un sondage peut le supprimer (vérifié par le serveur).
  const API = 'https://countapi.mileshilliard.com/api/v1', P = 'sysco-rcu-planning-cnam-btp-sondage-';
  const CLE_VOTES = 'planning-cnam-btp:votes', CLE_ATTENTE = 'planning-cnam-btp:votes-attente';
  const CLE_SECRET = 'planning-cnam-btp:cle-sondages', CLE_MIENS = 'planning-cnam-btp:mes-sondages';
  const lireJSON = (k, def) => { try { return JSON.parse(mem.get(k) || '') ?? def; } catch { return def; } };
  let votes = lireJSON(CLE_VOTES, {}) || {}, attente = lireJSON(CLE_ATTENTE, []) || [], miens = lireJSON(CLE_MIENS, []) || [];
  const comptes = {};
  let fixes = [], distants = [], serveur = '';
  const cle = (id, i) => `${id}-${i}`;
  const ouvert = (s) => !s.fin || Date.parse(s.fin) > Date.now();
  const ICONE_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const ICONE_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

  // code secret de cet appareil (créé une fois, gardé sur le téléphone) : il prouve qui a créé un sondage
  function secret() {
    let s = mem.get(CLE_SECRET);
    if (!/^[0-9a-f]{32,64}$/.test(s || '')) {
      const t = new Uint8Array(24);
      crypto.getRandomValues(t);
      s = [...t].map((b) => b.toString(16).padStart(2, '0')).join('');
      mem.set(CLE_SECRET, s);
    }
    return s;
  }

  function appel(route, k) {
    const ctl = window.AbortController ? new AbortController() : null;
    const minuteur = ctl ? setTimeout(() => ctl.abort(), 6000) : null;
    return fetch(`${API}/${route}/${P}${k}?t=${Date.now()}`, ctl ? { signal: ctl.signal } : undefined)
      .then((r) => { if (r.ok) return r.json(); if (r.status === 404) return { value: 0 }; throw new Error(`HTTP ${r.status}`); })
      .then((j) => Math.max(0, Number(j.value) || 0))
      .finally(() => clearTimeout(minuteur));
  }

  // mini-serveur Apps Script : GET pour lire, POST en texte brut (pas de requête préalable CORS)
  function serveurGet() {
    return fetch(`${serveur}?t=${Date.now()}`).then((r) => r.json());
  }
  function serveurPost(donnees) {
    return fetch(serveur, { method: 'POST', body: JSON.stringify(donnees) }).then((r) => r.json());
  }

  const propre = (s) => s && s.id && s.question && Array.isArray(s.options) && s.options.length >= 2;
  const nettoyer = (s, origine) => ({
    ...s, origine,
    id: String(s.id).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60),
    question: String(s.question).slice(0, 160), detail: s.detail ? String(s.detail).slice(0, 140) : '',
    auteur: s.auteur ? String(s.auteur).slice(0, 40) : '',
    options: s.options.map(String).slice(0, 8),
  });
  function majListe() {
    const ids = new Set();
    S.sondages = [...fixes, ...distants].filter((s) => s.id && !ids.has(s.id) && ids.add(s.id));
  }

  // onglet « Sondages » : libellé + pastille du nombre de sondages ouverts sans vote
  const onglet = document.querySelector('.tab[data-tab="sondages"]');
  if (onglet) onglet.dataset.notr = '';
  function majOnglet() {
    if (!onglet) return;
    const n = (S.sondages || []).filter((s) => ouvert(s) && votes[s.id] === undefined).length;
    onglet.innerHTML = `<span>${tx('Sondages', 'Polls')}</span>${n ? `<span class="n">${n}</span>` : ''}`;
  }

  const dateFin = (iso) => new Date(iso).toLocaleString(html.lang === 'en' ? 'en-GB' : 'fr-FR',
    { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  function carteSondage(s) {
    const moi = votes[s.id], ouv = ouvert(s), vu = moi !== undefined || !ouv;
    const c = comptes[s.id], total = c ? c.reduce((a, b) => a + b, 0) : null;
    const options = s.options.map((o, i) => {
      const pct = total ? Math.round((c[i] / total) * 100) : 0;
      const montrer = vu && total != null;
      const actif = ouv && moi === undefined;
      return `<button type="button" class="sopt${moi === i ? ' moi' : ''}" ${actif ? `data-s="${esc(s.id)}" data-i="${i}"` : 'disabled'} aria-pressed="${moi === i}">
        <span class="sbar" style="width:${montrer ? pct : 0}%"></span><span class="sl">${esc(o)}</span>${montrer ? `<span class="sp">${pct} %</span>` : ''}${moi === i ? `<span class="sv">${ICONE_OK}</span>` : ''}</button>`;
    }).join('');
    const etat = !ouv ? tx('Terminé', 'Closed') : s.fin ? `${tx('Fin', 'Ends')} : ${dateFin(s.fin)}` : '';
    let pied = total == null ? tx('Chargement des votes…', 'Loading votes…') : `${total} vote${total > 1 ? 's' : ''}`;
    if (total != null && moi !== undefined) pied += ` · ${tx('tu as voté', 'you voted')}`;
    else if (total != null && ouv) pied += ` · ${tx('touche une réponse pour voter', 'tap an answer to vote')}`;
    const mien = s.origine === 'serveur' && miens.includes(s.id);
    const tag = s.tag || (s.auteur ? `${tx('Par', 'By')} ${s.auteur}` : tx('Sondage', 'Poll'));
    return `<article class="sdc${ouv ? '' : ' fini'}"><div class="sdh"><span class="stag">${esc(tag)}</span><span class="sfin">${esc(etat)}</span></div>
      <h3>${esc(s.question)}</h3>${s.detail ? `<p class="sdet">${esc(s.detail)}</p>` : ''}<div class="sopts">${options}</div>
      <div class="sbas"><p class="spied">${pied}</p>${mien ? `<button type="button" class="ssup" data-sup="${esc(s.id)}">${tx('Supprimer', 'Delete')}</button>` : ''}</div></article>`;
  }

  /* ---------- formulaire de création */
  let formOuvert = false;
  function formulaire() {
    const choix = (n) => `<label class="sdf-c">${tx('Choix', 'Option')} ${n}<input name="o" maxlength="60" autocomplete="off"></label>`;
    return `<form class="sdf" novalidate>
      <h3>${tx('Nouveau sondage', 'New poll')}</h3>
      <label>${tx('Question', 'Question')}<input name="question" maxlength="140" autocomplete="off" placeholder="${tx('Ex. : Qui mange au RU à midi ?', 'E.g. Who is having lunch at the canteen?')}"></label>
      <label>${tx('Précision (facultatif)', 'Details (optional)')}<input name="detail" maxlength="120" autocomplete="off" placeholder="${tx('Ex. : mardi 24 nov.', 'E.g. Tue 24 Nov')}"></label>
      <div class="sdf-opts">${choix(1)}${choix(2)}</div>
      <button type="button" class="sdf-plus">${ICONE_PLUS}${tx('Ajouter un choix', 'Add an option')}</button>
      <div class="sdf-ligne">
        <label>${tx('Fin du sondage', 'Poll ends')}<select name="duree">
          <option value="1">${tx('Dans 1 jour', 'In 1 day')}</option><option value="2" selected>${tx('Dans 2 jours', 'In 2 days')}</option>
          <option value="3">${tx('Dans 3 jours', 'In 3 days')}</option><option value="7">${tx('Dans 1 semaine', 'In 1 week')}</option></select></label>
        <label>${tx('Ton prénom (facultatif)', 'Your first name (optional)')}<input name="auteur" maxlength="30" autocomplete="given-name"></label>
      </div>
      <p class="sdf-info">${tx('Toi seul pourras supprimer ce sondage, depuis ce téléphone.', 'Only you can delete this poll, from this phone.')}</p>
      <p class="sdf-err" role="alert"></p>
      <div class="sdf-actions"><button type="button" class="btn ghost sdf-annuler">${tx('Annuler', 'Cancel')}</button><button type="submit" class="btn sdf-ok">${tx('Publier', 'Publish')}</button></div>
    </form>`;
  }
  const ERREURS = {
    question: ['Écris une question (3 caractères minimum).', 'Write a question (at least 3 characters).'],
    options: ['Il faut au moins 2 choix différents.', 'You need at least 2 different options.'],
    fin: ['Date de fin invalide.', 'Invalid end date.'],
    plein: ['Trop de sondages en cours, réessaie plus tard.', 'Too many polls running, try again later.'],
    trop: ['Tu as déjà 5 sondages en cours : supprimes-en un d\'abord.', 'You already have 5 polls running: delete one first.'],
    vite: ['Trop de sondages créés en peu de temps, réessaie dans une heure.', 'Too many polls created recently, try again in an hour.'],
    reseau: ['Impossible de joindre le serveur, réessaie.', 'Could not reach the server, try again.'],
  };
  const erreur = (code) => { const e = ERREURS[code] || ERREURS.reseau; return tx(e[0], e[1]); };

  function brancherFormulaire(zone) {
    const f = zone.querySelector('.sdf');
    if (!f) return;
    const err = f.querySelector('.sdf-err');
    f.querySelector('.sdf-annuler').onclick = () => { formOuvert = false; zone.innerHTML = ''; majBoutonCreer(); };
    f.querySelector('.sdf-plus').onclick = () => {
      const opts = f.querySelector('.sdf-opts'), n = opts.children.length;
      if (n >= 6) return;
      opts.insertAdjacentHTML('beforeend', `<label class="sdf-c">${tx('Choix', 'Option')} ${n + 1}<input name="o" maxlength="60" autocomplete="off"></label>`);
      opts.lastElementChild.querySelector('input').focus();
      if (n + 1 >= 6) f.querySelector('.sdf-plus').hidden = true;
    };
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const question = f.question.value.trim();
      const options = [...f.querySelectorAll('input[name=o]')].map((i) => i.value.trim()).filter(Boolean);
      if (question.length < 3) { err.textContent = erreur('question'); f.question.focus(); return; }
      if (options.length < 2 || new Set(options.map((o) => o.toLowerCase())).size !== options.length) { err.textContent = erreur('options'); return; }
      const fin = new Date(Date.now() + Number(f.duree.value) * 864e5).toISOString();
      const bouton = f.querySelector('.sdf-ok');
      bouton.disabled = true; err.textContent = '';
      try {
        const r = await serveurPost({ a: 'creer', question, detail: f.detail.value.trim(), options, fin, auteur: f.auteur.value.trim(), cle: secret() });
        if (!r || !r.ok) { err.textContent = erreur(r && r.erreur); bouton.disabled = false; return; }
        miens.push(r.id); mem.set(CLE_MIENS, JSON.stringify(miens));
        if (f.auteur.value.trim()) mem.set('planning-cnam-btp:prenom', f.auteur.value.trim());
        formOuvert = false; zone.innerHTML = ''; majBoutonCreer();
        await chargerDistants();
        rafraichir(true);
      } catch { err.textContent = erreur('reseau'); bouton.disabled = false; }
    };
    const prenom = mem.get('planning-cnam-btp:prenom');
    if (prenom) f.auteur.value = prenom;
    f.question.focus();
  }
  function majBoutonCreer() {
    const b = document.querySelector('.sdg-creer');
    if (b) b.hidden = !serveur || formOuvert;
  }

  async function supprimerSondage(id) {
    const s = (S.sondages || []).find((x) => x.id === id);
    if (!s || !window.confirm(tx(`Supprimer le sondage « ${s.question} » ? Les votes seront perdus.`, `Delete the poll “${s.question}”? Votes will be lost.`))) return;
    try {
      const r = await serveurPost({ a: 'supprimer', id, cle: secret() });
      if (!r || !r.ok) { window.alert(r && r.erreur === 'interdit' ? tx('Seul le créateur peut supprimer ce sondage.', 'Only the creator can delete this poll.') : erreur('reseau')); return; }
      miens = miens.filter((x) => x !== id); mem.set(CLE_MIENS, JSON.stringify(miens));
      distants = distants.filter((x) => x.id !== id); majListe(); majOnglet(); rendreSiOuvert();
    } catch { window.alert(erreur('reseau')); }
  }

  /* ---------- affichage de l'onglet */
  function vueSondages(el) {
    $('#weeknav').style.display = 'none';
    // squelette (gardé tant qu'on reste sur l'onglet : le formulaire en cours n'est pas effacé)
    if (!el.querySelector(':scope > .sdg') || el.dataset.langue !== html.lang) {
      el.dataset.langue = html.lang;
      formOuvert = false;
      el.innerHTML = `<div class="sdg" data-notr><div class="sdg-haut"><p class="sdg-note">${tx('Anonymes · un vote par téléphone', 'Anonymous · one vote per phone')}</p>
        <button type="button" class="btn sdg-creer" hidden>${ICONE_PLUS}${tx('Créer un sondage', 'Create a poll')}</button></div>
        <div class="sdg-form"></div><div class="sdg-liste"></div></div>`;
      el.querySelector('.sdg-creer').onclick = () => {
        formOuvert = true;
        const zone = el.querySelector('.sdg-form');
        zone.innerHTML = formulaire();
        brancherFormulaire(zone);
        majBoutonCreer();
      };
    }
    majBoutonCreer();
    const liste = el.querySelector('.sdg-liste');
    if (S.sondages === undefined) { liste.innerHTML = `<div class="placeholder"><h3>${tx('Chargement…', 'Loading…')}</h3></div>`; return; }
    if (!S.sondages.length) {
      liste.innerHTML = `<div class="placeholder"><h3>${tx('Aucun sondage pour l\'instant', 'No polls yet')}</h3><p>${serveur ? tx('Crée le premier avec le bouton « Créer un sondage ».', 'Create the first one with the “Create a poll” button.') : tx('Les sondages de la classe apparaîtront ici.', 'Class polls will show up here.')}</p></div>`;
    } else {
      const tri = [...S.sondages].sort((a, b) => ouvert(b) - ouvert(a) || String(b.cree || '').localeCompare(String(a.cree || '')));
      liste.innerHTML = `<div class="sdgs">${tri.map(carteSondage).join('')}</div>`;
      liste.querySelectorAll('.sopt[data-s]').forEach((b) => (b.onclick = () => voter(b.dataset.s, Number(b.dataset.i))));
      liste.querySelectorAll('.ssup[data-sup]').forEach((b) => (b.onclick = () => supprimerSondage(b.dataset.sup)));
    }
    rafraichir();
  }
  const rendreSiOuvert = () => { if (S.tab === 'sondages' && !S.q) vueSondages($('#view')); };

  async function chargerDistants() {
    if (!serveur) return;
    try {
      const r = await serveurGet();
      if (r && r.ok && Array.isArray(r.sondages)) {
        distants = r.sondages.filter(propre).map((s) => nettoyer(s, 'serveur'));
        // sondages supprimés ailleurs : on les retire de la liste « mes sondages »
        miens = miens.filter((id) => distants.some((s) => s.id === id));
        mem.set(CLE_MIENS, JSON.stringify(miens));
        majListe(); majOnglet();
      }
    } catch { /* serveur injoignable : on garde la dernière liste */ }
  }

  let derniere = 0, enCours = false;
  async function rafraichir(force) {
    if (enCours || !S.sondages || (!force && Date.now() - derniere < 15000)) return;
    enCours = true;
    try {
      if (serveur) await chargerDistants();
      for (const s of S.sondages) {
        try { comptes[s.id] = await Promise.all(s.options.map((o, i) => appel('get', cle(s.id, i)))); } catch { /* service injoignable : on garde l'affichage */ }
      }
      derniere = Date.now();
    } finally { enCours = false; }
    // un vote envoyé à l'instant peut ne pas encore être lu : on le garde au minimum à 1
    for (const [id, i] of Object.entries(votes)) if (comptes[id] && comptes[id][i] < 1) comptes[id][i] = 1;
    rendreSiOuvert();
  }

  async function envoyer(id, i) {
    try {
      const v = await appel('hit', cle(id, i));
      attente = attente.filter(([a]) => a !== id);
      mem.set(CLE_ATTENTE, JSON.stringify(attente));
      if (comptes[id]) comptes[id][i] = Math.max(comptes[id][i], v);
      return true;
    } catch { return false; }   // le vote reste en attente, renvoyé à la prochaine ouverture
  }

  async function voter(id, i) {
    const s = (S.sondages || []).find((x) => x.id === id);
    if (!s || !ouvert(s) || votes[id] !== undefined || !(i >= 0 && i < s.options.length)) return;
    votes[id] = i;
    mem.set(CLE_VOTES, JSON.stringify(votes));
    attente.push([id, i]);
    mem.set(CLE_ATTENTE, JSON.stringify(attente));
    if (comptes[id]) comptes[id][i]++;
    majOnglet();
    rendreSiOuvert();
    await envoyer(id, i);
    rendreSiOuvert();
  }

  // chargement : data/sondages.json (liste + adresse du mini-serveur), puis le serveur
  fetch(`data/sondages.json?t=${Date.now()}`).then((r) => (r.ok ? r.json() : [])).catch(() => []).then(async (j) => {
    const brut = Array.isArray(j) ? j : Array.isArray(j?.sondages) ? j.sondages : [];
    serveur = !Array.isArray(j) && /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(j?.api || '') ? j.api : '';
    fixes = brut.filter(propre).map((s) => nettoyer(s, 'fichier'));
    majListe(); majOnglet(); rendreSiOuvert();
    await chargerDistants();
    rendreSiOuvert();
    // votes pas encore arrivés au service (réseau coupé au moment du vote)
    attente.filter(([id]) => S.sondages.some((s) => s.id === id)).forEach(([id, i]) => envoyer(id, i));
  });
  setInterval(() => { if (S.tab === 'sondages' && !document.hidden) rafraichir(); }, 15000);

  /* ============================================================ branchement dans la page */
  const rendreVueBase = rendreVue;
  rendreVue = function () {   // eslint-disable-line no-global-assign
    majBascule();
    if (S.tab === 'sondages' && !S.q) { vueSondages($('#view')); return; }
    rendreVueBase();
  };
  const rendreChipsBase = rendreChips;
  rendreChips = function () {   // eslint-disable-line no-global-assign
    if (S.tab === 'sondages' && !S.q) { $('#chips').innerHTML = ''; return; }
    rendreChipsBase();
  };
  // changement de langue dans les Paramètres
  new MutationObserver(() => { majOnglet(); majBascule(); rendreSiOuvert(); })
    .observe(html, { attributes: true, attributeFilter: ['lang'] });

  majBascule();
  majOnglet();
})();
