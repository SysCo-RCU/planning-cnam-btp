/* Compteur de vues : vues totales, personnes (appareils) distinctes et personnes en ligne
   Service gratuit sans compte : CountAPI (https://countapi.mileshilliard.com), rapide et sans cache imposé.
   - « vues » : +1 à chaque ouverture de la page
   - « personnes » : +1 la première fois qu'un appareil ouvre la page
   - « en ligne » : chaque appareil qui a la page ouverte et visible se signale une fois
     toutes les 2 minutes ; on affiche le nombre d'appareils signalés sur les dernières minutes
     (15 cases tournantes, chacune contient « n° de tranche × 1000 + nombre d'appareils »)
   Affichage immédiat : les derniers chiffres connus (gardés sur l'appareil) s'affichent dès
   l'ouverture, puis sont remplacés par les chiffres à jour dès que le service répond.
   Ouvrir la page une fois avec ?moi à la fin de l'adresse : cet appareil n'est plus compté. */
(() => {
  const API = 'https://countapi.mileshilliard.com/api/v1', P = 'sysco-rcu-planning-cnam-btp-';
  const TRANCHE = 120000, CASES = 15; // tranches de 2 min, 15 cases réutilisées
  const DELAI = 4000; // une requête sans réponse au bout de 4 s est abandonnée puis relancée
  const RYTHME = 15000; // relecture toutes les 15 s tant que la page est à l'écran
  const el = document.getElementById('vues');
  if (!el || !window.fetch) return;

  const mem = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } },
    del: (k) => { try { localStorage.removeItem(k); } catch { /* stockage indisponible */ } },
  };
  const params = new URLSearchParams(location.search);
  if (params.has('moi')) mem.set('cnam-moi', '1');
  if (params.has('pasmoi')) mem.del('cnam-moi');
  const moi = mem.get('cnam-moi') === '1';
  const tranche = () => Math.floor(Date.now() / TRANCHE);

  // ---------- affichage immédiat avec les derniers chiffres connus
  const val = { vues: null, personnes: null, enligne: null };
  let frais = false;
  try {
    const c = JSON.parse(mem.get('cnam-btp-compteur2') || 'null');
    if (c) {
      val.vues = c.vues; val.personnes = c.personnes;
      if (Date.now() - c.ts < 2 * TRANCHE) val.enligne = c.enligne;
    }
  } catch { /* rien en mémoire */ }
  if (!moi) { val.vues = val.vues == null ? null : val.vues + 1; val.enligne = Math.max(val.enligne || 0, 1); }

  const n = (x) => Number(x).toLocaleString('fr-FR');
  function afficher() {
    const bouts = [];
    if (val.enligne != null) bouts.push(`<span class="vl"><i class="dot ok"></i><span><b>${n(val.enligne)}</b>&nbsp;en ligne</span></span>`);
    if (val.vues != null) bouts.push(`<span><b>${n(val.vues)}</b>&nbsp;vue${val.vues > 1 ? 's' : ''}</span>`);
    if (val.personnes != null) bouts.push(`<span><b>${n(val.personnes)}</b>&nbsp;personne${val.personnes > 1 ? 's' : ''}</span>`);
    if (!bouts.length) bouts.push('<span class="vl"><i class="dot"></i><span>Compteur…</span></span>');
    el.innerHTML = bouts.join('<span class="sep">·</span>');
    el.style.opacity = frais ? '' : '.65';
    el.title = 'Vues de la page : total des ouvertures, appareils distincts et appareils ayant la page ouverte en ce moment'
      + (moi ? ' (cet appareil n\'est pas compté)' : '') + (frais ? '' : ' — mise à jour en cours');
    el.hidden = false;
  }
  afficher();

  function aJour() {
    frais = true;
    mem.set('cnam-btp-compteur2', JSON.stringify({ vues: val.vues, personnes: val.personnes, enligne: val.enligne, ts: Date.now() }));
    afficher();
  }

  // ---------- requêtes au service
  // (pas d'option « cache » : sur iPhone elle ajoute des en-têtes ; ?t= suffit à éviter le cache)
  const erreurs = [];
  const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
  function lire(route, cle, extra = '') {
    const ctl = window.AbortController ? new AbortController() : null;
    const minuteur = ctl ? setTimeout(() => ctl.abort(), DELAI) : null;
    return fetch(`${API}/${route}/${P}${cle}?t=${Date.now()}${extra}`, ctl ? { signal: ctl.signal } : undefined)
      .then((r) => {
        if (r.ok) return r.json();
        if (r.status === 404) return { value: 0 }; // clé pas encore créée
        const e = new Error(`HTTP ${r.status}`); e.statut = r.status; throw e;
      })
      .then((j) => { clearTimeout(minuteur); return Math.max(0, Number(j.value) || 0); })
      .catch((e) => { clearTimeout(minuteur); erreurs.push(`${route} ${cle} : ${(e && e.message) || e}`); throw e; });
  }
  const get = (cle) => lire('get', cle);
  // relance rapide en cas d'échec : 0,5 s, 1 s, 2 s, 4 s
  async function essayer(fn, n = 4) {
    for (let i = 0, d = 500; ; i++, d *= 2) {
      try { return await fn(); } catch (e) { if (i >= n) throw e; await attendre(d); }
    }
  }
  // +1 sans risque de double comptage : on ne recompte que si le service a répondu « non compté »
  async function compter(cle, essais = 3) {
    try { return await lire('hit', cle); } catch (e) {
      if (e.statut && essais > 0) { await attendre(700); return compter(cle, essais - 1); }
      return essayer(() => get(cle)); // pas de réponse : peut-être compté, on se contente de lire
    }
  }
  const sur = (p) => p.catch(() => null);

  // ---------- vues et personnes
  (moi ? essayer(() => get('vues')) : compter('vues'))
    .then((v) => { val.vues = v; aJour(); }).catch(() => {});
  const nouveau = !moi && !mem.get('cnam-btp-visiteur');
  (nouveau ? compter('personnes').then((v) => { mem.set('cnam-btp-visiteur', String(Date.now())); return v; }) : essayer(() => get('personnes')))
    .then((v) => { val.personnes = v; aJour(); }).catch(() => {});

  // ---------- en ligne
  const caseDe = (t) => `enligne-${t % CASES}`;
  const nbDans = (v, t) => (Math.floor(v / 1000) === t ? v % 1000 : 0);
  async function signaler(t) {
    const v = await compter(caseDe(t), 1);
    if (Math.floor(v / 1000) === t) return v % 1000;
    // case encore occupée par une ancienne tranche : on la remet à « 1 appareil » pour cette tranche
    await lire('set', caseDe(t), `&value=${t * 1000 + 1}`);
    return 1;
  }
  let relance = 0, occupe = false;
  async function enLigne() {
    if (occupe) return; // une seule mise à jour à la fois (sinon l'appareil pourrait se compter deux fois)
    occupe = true;
    try { await majEnLigne(); } finally { occupe = false; }
  }
  async function majEnLigne() {
    const t = tranche();
    let cur;
    if (!moi && document.visibilityState === 'visible' && mem.get('cnam-btp-enligne2') !== String(t)) {
      mem.set('cnam-btp-enligne2', String(t)); // noté avant l'envoi : jamais deux signaux pour la même tranche
      cur = await sur(signaler(t));
    } else cur = await sur(get(caseDe(t)).then((v) => nbDans(v, t)));
    const prec = await sur(get(caseDe(t - 1)).then((v) => nbDans(v, t - 1)));
    if (cur == null && prec == null) { if (relance++ < 5) setTimeout(enLigne, 2000); return; }
    relance = 0;
    // la tranche en cours se remplit au fil des signaux : on garde la plus haute des deux
    val.enligne = Math.max(cur || 0, prec || 0, moi ? 0 : 1);
    aJour();
  }
  // relecture des totaux : les ouvertures faites ailleurs apparaissent sans recharger la page
  async function totaux() {
    const [v, p] = await Promise.all([sur(get('vues')), sur(get('personnes'))]);
    if (v != null) val.vues = Math.max(val.vues || 0, v);
    if (p != null) val.personnes = Math.max(val.personnes || 0, p);
    if (v != null || p != null) aJour();
  }
  enLigne();
  const rafraichir = () => { if (document.visibilityState === 'visible') { enLigne(); totaux(); } };
  setInterval(rafraichir, RYTHME);
  document.addEventListener('visibilitychange', rafraichir);

  // sans aucune réponse au bout de 15 s : on garde les derniers chiffres connus, sinon on masque
  setTimeout(() => {
    if (frais) return;
    if (params.has('debug')) { el.textContent = `Compteur indisponible — ${erreurs[0] || 'aucune réponse'}`; el.style.opacity = ''; return; }
    if (val.vues == null && val.personnes == null) el.hidden = true;
  }, 15000);
})();
