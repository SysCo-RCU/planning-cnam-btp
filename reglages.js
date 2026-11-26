/* Paramètres de la page : langue, thème, couleur, taille du texte, onglet d'ouverture, affichage.
   Tout est enregistré sur l'appareil (localStorage), rien n'est envoyé. */
(() => {
  const CLE = 'planning-cnam-btp:reglages';
  const DEFAUT = {
    langue: 'fr', theme: 'auto', accent: 'cnam', taille: 'normal', onglet: 'week',
    frise: true, fantomes: true, weekend: true, compact: false, animations: true,
  };
  const R = { ...DEFAUT };
  try { Object.assign(R, JSON.parse(localStorage.getItem(CLE) || '{}')); } catch {}
  const sauver = () => { try { localStorage.setItem(CLE, JSON.stringify(R)); } catch {} };
  const html = document.documentElement;
  const aDonnees = () => typeof S !== 'undefined' && S.data;

  /* ============================================================ textes de la fenêtre */
  const T = {
    fr: {
      titre: 'Paramètres', fermer: 'Fermer', langue: 'Langue', theme: 'Thème',
      themes: { auto: 'Automatique', light: 'Clair', dark: 'Sombre' },
      accent: 'Couleur principale',
      accents: { cnam: 'Rouge Cnam', bleu: 'Bleu', vert: 'Vert', violet: 'Violet', orange: 'Orange' },
      taille: 'Taille du texte', tailles: { petit: 'Petite', normal: 'Normale', grand: 'Grande', tresgrand: 'Très grande' },
      onglet: "Onglet à l'ouverture",
      onglets: { week: 'Semaine', month: 'Mois', list: 'À venir', exams: 'Examens', ue: 'Avancement', changes: 'Modifications' },
      affichage: 'Affichage',
      opts: {
        frise: ["Frise d'alternance", 'Les semaines Cnam / entreprise en haut de la page'],
        fantomes: ['Cours supprimés ou déplacés', 'Les garder en filigrane dans la semaine'],
        weekend: ['Le week-end, ouvrir la semaine suivante', 'Sinon, la semaine en cours reste affichée'],
        compact: ['Affichage compact', 'Cartes plus serrées, plus de cours à l\'écran'],
        animations: ['Animations', 'Effets au survol et transitions'],
      },
      matieres: 'Matières', masquees: (n) => `${n} matière${n > 1 ? 's' : ''} masquée${n > 1 ? 's' : ''} (en cliquant sur leur pastille).`,
      aucune: 'Toutes les matières sont affichées. Clique sur une pastille de matière pour la masquer.',
      reafficher: 'Tout réafficher', reset: 'Réinitialiser', note: 'Enregistré sur cet appareil', btn: 'Paramètres',
    },
    en: {
      titre: 'Settings', fermer: 'Close', langue: 'Language', theme: 'Theme',
      themes: { auto: 'Automatic', light: 'Light', dark: 'Dark' },
      accent: 'Accent colour',
      accents: { cnam: 'Cnam red', bleu: 'Blue', vert: 'Green', violet: 'Purple', orange: 'Orange' },
      taille: 'Text size', tailles: { petit: 'Small', normal: 'Normal', grand: 'Large', tresgrand: 'Extra large' },
      onglet: 'Tab on opening',
      onglets: { week: 'Week', month: 'Month', list: 'Upcoming', exams: 'Exams', ue: 'Progress', changes: 'Changes' },
      affichage: 'Display',
      opts: {
        frise: ['Work-study timeline', 'Cnam / company weeks at the top of the page'],
        fantomes: ['Removed or moved classes', 'Keep them faded in the week view'],
        weekend: ['On weekends, open next week', 'Otherwise the current week stays on screen'],
        compact: ['Compact layout', 'Tighter cards, more classes on screen'],
        animations: ['Animations', 'Hover effects and transitions'],
      },
      matieres: 'Subjects', masquees: (n) => `${n} subject${n > 1 ? 's' : ''} hidden (by tapping their chip).`,
      aucune: 'All subjects are shown. Tap a subject chip to hide it.',
      reafficher: 'Show all again', reset: 'Reset', note: 'Saved on this device', btn: 'Settings',
    },
  };
  const COULEURS = { cnam: '#c1002a', bleu: '#1d4ed8', vert: '#0f7b46', violet: '#6d28d9', orange: '#c2410c' };
  const t = () => T[R.langue] || T.fr;

  /* ============================================================ traduction de la page (FR -> EN) */
  const EXACT = new Map(Object.entries({
    'Chargement…': 'Loading…', 'Agenda': 'Calendar',
    'Semaine': 'Week', 'Mois': 'Month', 'À venir': 'Upcoming', 'Examens': 'Exams', 'Avancement': 'Progress',
    'Modifications': 'Changes', 'Modifs': 'Changes',
    "Aujourd'hui": 'Today', 'Ce mois-ci': 'This month', 'Demain': 'Tomorrow', 'Auj.': 'Today',
    'Données issues du planning auditeur Cnam Grand Est · vérifiées automatiquement': 'Data from the Cnam Grand Est student timetable · checked automatically',
    'Abonnement agenda :': 'Calendar subscription:', 'Voir le détail': 'See details',
    'En attente de la 1re vérification': 'Waiting for the first check',
    'Cours actuel': 'Current class', 'Prochain cours': 'Next class', 'Aucun cours à venir': 'No upcoming classes',
    'sur la période connue': 'within the known period', 'Prochain examen': 'Next exam', 'Aucun examen prévu': 'No exam scheduled',
    'sur les semaines connues': 'in the known weeks', 'Cette semaine': 'This week', '🏭 En entreprise': '🏭 At the company',
    'Aucun cours au Cnam': 'No classes at Cnam',
    'Nouveau': 'New', 'Déplacé': 'Moved', 'Modifié': 'Changed', 'Supprimé': 'Removed', 'Ajouté': 'Added',
    'Cours': 'Class', 'Examen': 'Exam', 'Contrôle continu': 'Continuous assessment', 'Cours mutualisé': 'Shared class',
    'Cours Transition': 'Transition class', 'Sera affichée': 'To be announced', 'Composition en présentiel': 'In-person written exam',
    'Pas de cours': 'No classes', 'Semaine pas encore publiée': 'Week not yet published', 'Aucun cours cette semaine 🎉': 'No classes this week 🎉',
    'Rien à venir': 'Nothing upcoming', 'Aucun examen dans le planning': 'No exams in the timetable',
    'Ils apparaîtront ici dès leur publication.': 'They will appear here as soon as they are published.',
    'jours': 'days', 'jour': 'day', 'passé': 'done',
    "Aucune modification détectée pour l'instant": 'No changes detected yet',
    'Chaque changement (ajout, suppression, déplacement, salle…) apparaîtra ici et te sera envoyé par e-mail.': 'Every change (added, removed, moved, room…) will appear here and be sent to you by e-mail.',
    'Date': 'Date', 'Horaire': 'Time', 'Salle': 'Room', 'Enseignant': 'Teacher', 'Remarque': 'Note', 'UE': 'Course unit',
    'Groupe': 'Group', 'Supprimé du planning': 'Removed from the timetable', 'Heure de fin': 'End time', 'Heure de début': 'Start time',
    "Le planning n'a pas encore été récupéré": 'The timetable has not been fetched yet',
    "La première vérification automatique va remplir cette page (ou lance-la à la main dans l'onglet": 'The first automatic check will fill this page (or run it by hand in the',
    'du dépôt GitHub).': 'tab of the GitHub repository).',
    "Rythme d'alternance": 'Work-study rhythm', 'Entreprise': 'Company', 'Prévisionnel': 'Provisional',
    '🎓 au Cnam': '🎓 at Cnam', '🏭 en entreprise': '🏭 at the company', 'Cette semaine :': 'This week:',
    'Retour au Cnam :': 'Back at Cnam:', 'Prochaine période en entreprise :': 'Next period at the company:', 'Source :': 'Source:',
    'Semaine en entreprise': 'Week at the company', 'Semaine au Cnam': 'Week at Cnam',
    'Les cours de cette semaine ne sont pas encore publiés.': "This week's classes have not been published yet.",
    'Aucun cours publié pour cette semaine au Cnam.': 'No classes published for this week at Cnam.',
    '🏭 Entreprise': '🏭 Company', '🎉 Férié': '🎉 Holiday', 'Férié': 'Holiday',
    "Clique sur un jour ou une semaine pour l'ouvrir en détail.": 'Click a day or a week to open it.',
    'Calculé à partir des numéros de séance du Cnam (par exemple « séance 14/31 »).': 'Computed from the Cnam session numbers (e.g. “session 14/31”).',
    'Examen passé': 'Exam done', "Plus de cours avant l'examen : c'est le moment de réviser": 'No more classes before the exam: time to revise',
    'Plus rien au planning connu': 'Nothing more in the known timetable',
    'Effacer la recherche': 'Clear search', 'Aucun cours ne correspond': 'No matching class',
    'Essaie un code (USEG07), une matière (ACV), un enseignant, une salle, « Metz » ou « examen ».': 'Try a code (USEG07), a subject (ACV), a teacher, a room, “Metz” or “exam”.',
    'Déjà passés': 'Already past',
    'en ligne': 'online', 'vue': 'view', 'vues': 'views', 'personne': 'person', 'personnes': 'people',
    'Télécharger': 'Download', '✕ Fermer': '✕ Close', 'Chargement du calendrier…': 'Loading calendar…',
    "Impossible d'afficher le calendrier ici.": "Can't display the calendar here.", 'Télécharger le PDF': 'Download the PDF',
    'Rechercher un cours, un prof, une salle, « Metz »…': 'Search a class, a teacher, a room, “Metz”…', 'Rechercher': 'Search',
    'Semaine précédente': 'Previous week', 'Semaine suivante': 'Next week',
    'Ajouter à mon agenda (Google, Apple, Outlook)': 'Add to my calendar (Google, Apple, Outlook)',
    'Afficher / masquer': 'Show / hide', 'Fermer': 'Close', 'Dézoomer': 'Zoom out', 'Zoomer': 'Zoom in',
    'Vues de la page : total des ouvertures, appareils distincts et appareils ayant la page ouverte en ce moment': 'Page views: total opens, distinct devices and devices with the page open right now',
  }));
  const pl = (n, un, plusieurs) => `${n} ${+n > 1 ? plusieurs : un}`;
  const REGLES = [
    [/^Vérifié (.+)$/, 'Checked $1'],
    [/^Échec de la vérification (.+)$/, 'Check failed $1'],
    [/^Mis à jour (.+)$/, 'Updated $1'],
    [/^Dernière vérification automatique : /, 'Last automatic check: '],
    [/à l'instant/, 'just now'],
    [/il y a (\d+) min/, '$1 min ago'],
    [/il y a (\d+) h/, '$1 h ago'],
    [/il y a (\d+) jours?/, (m, n) => `${pl(n, 'day', 'days')} ago`],
    [/^(\d+) modifications?$/, (m, n) => pl(n, 'change', 'changes')],
    [/^du planning détectées? le (.+) à (\d\d:\d\d)$/, 'detected in the timetable on $1 at $2'],
    [/^En cours · fin dans (.+)$/, 'In progress · ends in $1'],
    [/^Dans (.+)$/, 'In $1'],
    [/(\d+) j (\d+) h/, '$1 d $2 h'],
    [/^J-(\d+)$/, 'D-$1'],
    [/(\d+) créneaux?/g, (m, n) => pl(n, 'slot', 'slots')],
    [/(\d),(\d) h\b/g, '$1.$2 h'],
    [/ h de cours$/, ' h of classes'],
    [/^Retour au Cnam : (.+)$/, 'Back at Cnam: $1'],
    [/^Planning connu jusqu'au (.+)$/, 'Timetable known until $1'],
    [/^Le planning est connu jusqu'au (.+)\.$/, 'The timetable is known until $1.'],
    [/^Déplacé au (.+)$/, 'Moved to $1'],
    [/(Heure de fin|Heure de début|Salle|Type|Enseignant|Centre|Remarque|Date) :(?= |$)/g, (m, l) => `${EXACT.get(l) || l}:`],
    [/(^|· )Salle (?=[^:])/g, '$1Room '],
    [/(^|· )Centre de (\S+)/g, '$1$2 centre'],
    [/(^|· )Thématique : /g, '$1Topic: '],
    [/^(M|Mme) EN COURS RECRUTEMENT ENSEIGNANT$/, 'Teacher being recruited'],
    [/^Vues de la page : total des ouvertures, appareils distincts et appareils ayant la page ouverte en ce moment/, 'Page views: total opens, distinct devices and devices with the page open right now'],
    [/ — mise à jour en cours$/, ' — updating'],
    [/^Semaines (\d+) à (\d+) en entreprise$/, 'Weeks $1 to $2 at the company'],
    [/^Semaine (\d+) en entreprise$/, 'Week $1 at the company'],
    [/^Semaine (\d+) \((.+)\) : (en entreprise|au Cnam)( \(prévisionnel, cours pas encore publiés\))?$/,
      (m, n, d, ou, prev) => `Week ${n} (${d}): ${ou === 'au Cnam' ? 'at Cnam' : 'at the company'}${prev ? ' (provisional, classes not yet published)' : ''}`],
    [/^Semaine (\d+)$/, 'Week $1'],
    [/^Voir la semaine (\d+)$/, 'See week $1'],
    [/^S(\d+)$/, 'W$1'],
    [/^Pas de Cnam du (.+) au (.+)$/, 'No Cnam from $1 to $2'],
    [/^Calendrier prévisionnel : du (.+) au (.+)$/, 'Provisional calendar: from $1 to $2'],
    [/^du (.+) au (.+)$/, 'from $1 to $2'],
    [/^à partir du (.+)$/, 'from $1 onwards'],
    [/^\((\d+) sem\.( au moins)?\)$/, (m, n, min) => `(${n} wk${min ? ' at least' : ''})`],
    [/^D'ici au (.+) : (\d+) sem\. au Cnam · (\d+) sem\. en entreprise$/, 'Until $1: $2 wk at Cnam · $3 wk at the company'],
    [/· les semaines « prévisionnelles » n'ont pas encore de cours publiés$/, '· “provisional” weeks have no published classes yet'],
    [/^Déduit des cours publiés \(calendrier officiel non chargé\)$/, 'Inferred from published classes (official calendar not loaded)'],
    [/^à (\d\d:\d\d) · (\d+) changements?$/, (m, h, n) => `at ${h} · ${pl(n, 'change', 'changes')}`],
    [/^Séance (\d+) \/ (\d+)$/, 'Session $1 / $2'],
    [/^Encore (\d+) cours \((.+?)\) avant l'examen/, (m, n, h) => `${pl(n, 'class', 'classes')} left (${h}) before the exam`],
    [/ · repère révisions \(J-14\) : /, ' · revision marker (D-14): '],
    [/ · à réviser dès maintenant$/, ' · revise now'],
    [/(\d+)\/(\d+) séances faites/, '$1/$2 sessions done'],
    [/^restantes?$/, 'left'],
    [/ déjà au planning /, ' already scheduled '],
    [/ · prochain : /, ' · next: '],
    [/^résultat(s?) pour « (.*) »(?: · (\d+) à venir)?$/, (m, s, q, n) => `result${s} for “${q}”${n ? ` · ${n} upcoming` : ''}`],
    [/^Page (\d+) sur (\d+)$/, 'Page $1 of $2'],
    [/(^| )à (\d\d:\d\d)/g, '$1at $2'],
  ];
  const JOURS_EN = { lundi: 'Monday', mardi: 'Tuesday', mercredi: 'Wednesday', jeudi: 'Thursday', vendredi: 'Friday', samedi: 'Saturday', dimanche: 'Sunday' };
  const JOURSC_EN = { lun: 'Mon', mar: 'Tue', mer: 'Wed', jeu: 'Thu', ven: 'Fri', sam: 'Sat', dim: 'Sun' };
  const MOIS_EN = { janvier: 'January', 'février': 'February', mars: 'March', avril: 'April', mai: 'May', juin: 'June', juillet: 'July', 'août': 'August', septembre: 'September', octobre: 'October', novembre: 'November', 'décembre': 'December' };
  const MOISC_EN = { janv: 'Jan', 'févr': 'Feb', avr: 'Apr', juil: 'Jul', sept: 'Sep', oct: 'Oct', nov: 'Nov', 'déc': 'Dec' };
  function dates(s) {
    return s
      .replace(/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/gi, (m) => JOURS_EN[m.toLowerCase()])
      .replace(/\b(lun|mar|mer|jeu|ven|sam|dim)\./gi, (m, j) => JOURSC_EN[j.toLowerCase()])
      .replace(/(^|[^\p{L}])(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)(?![\p{L}])/giu, (m, a, mo) => a + MOIS_EN[mo.toLowerCase()])
      .replace(/(^|[^\p{L}])(janv|févr|avr|juil|sept|oct|nov|déc)\./giu, (m, a, mo) => a + MOISC_EN[mo.toLowerCase()]);
  }
  function traduire(s) {
    const [, avant, coeur, apres] = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!coeur) return s;
    let r = EXACT.get(coeur);
    if (r == null) {
      r = coeur.includes(' · ') ? coeur.split(' · ').map((p) => EXACT.get(p) ?? p).join(' · ') : coeur;
      for (const [re, rep] of REGLES) r = r.replace(re, rep);
      r = dates(r);
    }
    return avant + r + apres;
  }

  // ce qui ne se traduit pas : noms des cours, codes, matières, champs de saisie, cette fenêtre
  const IGNORER = '[data-notr],.ti,.mt,.chip,.tag.code,.dlg-top h2,.excard h4,.uh h4,.uecard .sub,.chg>div>b,.uex b,.tile[data-id] .big,#subtitle,.brand,script,style,textarea';
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  const origTexte = new WeakMap(), posee = new WeakMap(), origAttr = new WeakMap();
  const ignore = (el) => !el || !!el.closest(IGNORER);

  function traduireTexte(n) {
    if (posee.get(n) === n.nodeValue || ignore(n.parentElement)) return;
    const v = n.nodeValue, nv = traduire(v);
    origTexte.set(n, v);
    if (nv !== v) n.nodeValue = nv;
    posee.set(n, n.nodeValue);
  }
  function traduireAttrs(el) {
    if (ignore(el) && !el.matches('.chip')) return;
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v == null) continue;
      const o = origAttr.get(el) || {};
      if (o['_' + a] === v) continue;   // déjà traduit par nous
      const nv = traduire(v);
      o[a] = v; o['_' + a] = nv; origAttr.set(el, o);
      if (nv !== v) el.setAttribute(a, nv);
    }
  }
  function parcourir(racine) {
    if (racine.nodeType === 3) { traduireTexte(racine); return; }
    if (racine.nodeType !== 1) return;
    traduireAttrs(racine);
    racine.querySelectorAll('[placeholder],[title],[aria-label]').forEach(traduireAttrs);
    const w = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) traduireTexte(n);
  }
  const obs = new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === 'childList') m.addedNodes.forEach(parcourir);
      else if (m.type === 'characterData') traduireTexte(m.target);
      else if (m.type === 'attributes') traduireAttrs(m.target);
    }
  });
  function anglais(oui) {
    html.lang = oui ? 'en' : 'fr';
    if (oui) {
      parcourir(document.body);
      obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
      return;
    }
    obs.disconnect();
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if (origTexte.has(n)) { n.nodeValue = origTexte.get(n); origTexte.delete(n); posee.delete(n); }
    document.body.querySelectorAll('[placeholder],[title],[aria-label]').forEach((el) => {
      const o = origAttr.get(el);
      if (!o) return;
      for (const a of ATTRS) if (a in o && el.getAttribute(a) === o['_' + a]) el.setAttribute(a, o[a]);
      origAttr.delete(el);
    });
    if (aDonnees()) rendreTout();
  }

  /* ============================================================ appliquer les réglages */
  function couleurBarre() {
    const m = document.querySelector('meta[name=theme-color]');
    if (m) m.content = getComputedStyle(html).getPropertyValue('--red').trim() || '#c1002a';
  }
  function appliquer(cle) {
    html.dataset.theme = R.theme;
    html.dataset.accent = R.accent;
    html.dataset.taille = R.taille;
    for (const k of ['frise', 'fantomes', 'animations']) html.classList.toggle('sans-' + k, !R[k]);
    html.classList.toggle('compact', !!R.compact);
    couleurBarre();
    if (cle === 'weekend' && typeof S !== 'undefined') {
      const lun = monday(new Date());
      S.week = !R.weekend || ![0, 6].includes(new Date().getDay()) ? lun : addDays(lun, 7);
      if (aDonnees() && S.tab === 'week') rendreVue();
    }
    if (cle === 'langue') { anglais(R.langue === 'en'); majBouton(); }
  }
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', couleurBarre);

  /* ============================================================ fenêtre */
  const ICONE_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const dlg = document.createElement('dialog');
  dlg.className = 'regl';
  dlg.dataset.notr = '';
  document.body.appendChild(dlg);

  const radios = (nom, valeurs, libelles, classe = '') =>
    `<div class="seg ${classe}" role="radiogroup">${valeurs.map((v) =>
      `<label><input type="radio" name="${nom}" value="${v}"${R[nom] === v ? ' checked' : ''}><span>${libelles[v]}</span></label>`).join('')}</div>`;

  function construire() {
    const x = t();
    const off = typeof S !== 'undefined' ? S.off.size : 0;
    dlg.setAttribute('aria-label', x.titre);
    dlg.innerHTML = `
      <div class="rg-top"><h2>${x.titre}</h2><button type="button" class="ib rg-x" aria-label="${x.fermer}">${ICONE_X}</button></div>
      <div class="rg-body">
        <section><h3>${x.langue}</h3>${radios('langue', ['fr', 'en'], { fr: 'Français', en: 'English' })}</section>
        <section><h3>${x.theme}</h3>${radios('theme', ['auto', 'light', 'dark'], x.themes)}</section>
        <section><h3>${x.accent}</h3><div class="swl" role="radiogroup">${Object.keys(COULEURS).map((c) =>
          `<label style="--s:${COULEURS[c]}"><input type="radio" name="accent" value="${c}"${R.accent === c ? ' checked' : ''}><span class="pas" aria-hidden="true"></span><span class="nm">${x.accents[c]}</span></label>`).join('')}</div></section>
        <section><h3>${x.taille}</h3>${radios('taille', ['petit', 'normal', 'grand', 'tresgrand'], x.tailles, 'taille')}</section>
        <section><h3>${x.onglet}</h3><select class="rg-sel" name="onglet" aria-label="${x.onglet}">${Object.keys(x.onglets).map((o) =>
          `<option value="${o}"${R.onglet === o ? ' selected' : ''}>${x.onglets[o]}</option>`).join('')}</select></section>
        <section><h3>${x.affichage}</h3>${Object.keys(x.opts).map((k) =>
          `<label class="tg"><span>${x.opts[k][0]}<small>${x.opts[k][1]}</small></span><input type="checkbox" role="switch" name="${k}"${R[k] ? ' checked' : ''}></label>`).join('')}</section>
        <section><h3>${x.matieres}</h3><p class="rg-note">${off ? x.masquees(off) : x.aucune}</p>
          <button type="button" class="btn ghost rg-off"${off ? '' : ' disabled'}>${x.reafficher}</button></section>
      </div>
      <div class="rg-foot"><button type="button" class="btn ghost rg-reset">${x.reset}</button><small>${x.note}</small><button type="button" class="btn rg-ok">${x.fermer}</button></div>`;
    dlg.querySelector('.rg-x').onclick = () => dlg.close();
    dlg.querySelector('.rg-ok').onclick = () => dlg.close();
    dlg.querySelector('.rg-reset').onclick = () => {
      const avant = R.langue;
      Object.assign(R, DEFAUT); sauver();
      appliquer('weekend');
      if (avant !== R.langue) appliquer('langue');
      construire();
    };
    dlg.querySelector('.rg-off').onclick = () => {
      if (typeof S === 'undefined') return;
      S.off.clear(); localStorageSet('off', '[]');
      if (aDonnees()) { rendreChips(); rendreVue(); }
      construire();
    };
  }
  dlg.addEventListener('change', (e) => {
    const el = e.target, k = el.name;
    if (!(k in DEFAUT)) return;
    R[k] = el.type === 'checkbox' ? el.checked : el.value;
    sauver();
    appliquer(k);
    if (k === 'langue') {
      const haut = dlg.querySelector('.rg-body')?.scrollTop || 0;
      construire();
      dlg.querySelector('.rg-body').scrollTop = haut;
      dlg.querySelector('input[name=langue]:checked')?.focus();
    }
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  // les flèches gauche / droite ne doivent pas changer de semaine derrière la fenêtre
  dlg.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === '/') e.stopPropagation(); });

  /* ============================================================ bouton de l'en-tête */
  const bouton = document.getElementById('reglagesBtn');
  function majBouton() {
    if (!bouton) return;
    bouton.setAttribute('aria-label', t().btn);
    bouton.title = t().btn;
    const s = bouton.querySelector('span');
    if (s) s.textContent = t().btn;
  }
  bouton?.setAttribute('data-notr', '');
  if (bouton) bouton.onclick = () => { construire(); dlg.showModal(); };

  /* ============================================================ au chargement */
  if (typeof S !== 'undefined') {
    // onglet à l'ouverture
    if (R.onglet !== 'week' && document.querySelector(`.tab[data-tab="${R.onglet}"]`)) {
      S.tab = R.onglet;
      document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === S.tab));
      if (aDonnees()) { rendreChips(); rendreVue(); }
    }
    // le week-end : semaine en cours si l'option est coupée
    if (!R.weekend && [0, 6].includes(new Date().getDay())) S.week = monday(new Date());
  }
  appliquer();
  majBouton();
  if (R.langue === 'en') anglais(true);
})();
