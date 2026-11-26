/* Onglet « Documents » : espace partagé de la promo.
   Les fichiers sont gardés dans un dossier Google Drive (mini-serveur Apps Script, voir apps-script/Code.gs,
   même adresse que les sondages). Tout le monde peut les voir et les télécharger ; pour en déposer,
   il faut le code de la promo. Seul l'appareil qui a déposé un fichier peut le retirer. */
(() => {
  const html = document.documentElement;
  const tx = (fr, en) => (html.lang === 'en' ? en : fr);
  const mem = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } },
  };
  const lireJSON = (k, def) => { try { return JSON.parse(mem.get(k) || '') ?? def; } catch { return def; } };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CLE_SECRET = 'planning-cnam-btp:cle-sondages', CLE_MIENS = 'planning-cnam-btp:mes-docs', CLE_CODE = 'planning-cnam-btp:code-docs';
  const MAX_DEFAUT = 20 * 1024 * 1024;
  const EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'txt', 'csv', 'md',
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'py', 'm', 'ipynb', 'mat', 'dwg', 'dxf', 'step', 'stp'];
  let serveur = '', docs, actif = false, max = MAX_DEFAUT, chargement = null, formOuvert = false, filtre = '';
  let miens = lireJSON(CLE_MIENS, []) || [];

  const ICONE_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  const ICONE_DL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/></svg>';
  const ICONE_OEIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';

  // code de l'appareil (le même que pour les sondages) : il prouve qui a déposé un fichier
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

  const extension = (nom) => (String(nom).match(/\.([a-z0-9]{1,5})$/i) || [])[1]?.toLowerCase() || '';
  const FAMILLES = {
    pdf: ['PDF', '#d93025'], doc: ['W', '#2b579a'], docx: ['W', '#2b579a'], odt: ['W', '#2b579a'], rtf: ['W', '#2b579a'],
    xls: ['X', '#1e7145'], xlsx: ['X', '#1e7145'], xlsm: ['X', '#1e7145'], ods: ['X', '#1e7145'], csv: ['X', '#1e7145'],
    ppt: ['P', '#c43e1c'], pptx: ['P', '#c43e1c'], odp: ['P', '#c43e1c'],
    png: ['IMG', '#7b3fa0'], jpg: ['IMG', '#7b3fa0'], jpeg: ['IMG', '#7b3fa0'], gif: ['IMG', '#7b3fa0'], webp: ['IMG', '#7b3fa0'], heic: ['IMG', '#7b3fa0'],
    zip: ['ZIP', '#6b6570'], '7z': ['ZIP', '#6b6570'], rar: ['ZIP', '#6b6570'],
  };
  const pastille = (nom) => {
    const e = extension(nom), [t, c] = FAMILLES[e] || [(e || '?').toUpperCase().slice(0, 4), '#6b6570'];
    return `<span class="dcico" style="--c:${c}">${esc(t)}</span>`;
  };
  const taille = (o) => {
    const n = Number(o) || 0, fr = html.lang !== 'en';
    const f = (v, u) => `${v.toLocaleString(fr ? 'fr-FR' : 'en-GB', { maximumFractionDigits: 1 })} ${u}`;
    if (n < 1024) return f(n, fr ? 'o' : 'B');
    if (n < 1024 * 1024) return f(n / 1024, fr ? 'Ko' : 'KB');
    return f(n / 1024 / 1024, fr ? 'Mo' : 'MB');
  };
  const quand = (iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString(html.lang === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
  };

  /* ---------- échanges avec le serveur */
  function lister() {
    if (!serveur) return Promise.resolve();
    if (chargement) return chargement;
    chargement = fetch(`${serveur}?docs=1&t=${Date.now()}`).then((r) => r.json()).then((r) => {
      if (!r || !r.ok || !Array.isArray(r.documents)) throw new Error('réponse');
      docs = r.documents.filter((d) => d && d.id && d.nom);
      actif = !!r.actif;
      max = Number(r.max) || MAX_DEFAUT;
      miens = miens.filter((id) => docs.some((d) => d.id === id));
      mem.set(CLE_MIENS, JSON.stringify(miens));
    }).catch(() => { if (docs === undefined) docs = null; }).finally(() => { chargement = null; rendreSiOuvert(); });
    return chargement;
  }

  // envoi en texte brut, comme les sondages : une requête « simple », sans vérification préalable
  // (le suivi de progression de l'envoi en déclencherait une, que le serveur Google refuse)
  function envoyer(donnees) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const minuteur = ctl ? setTimeout(() => ctl.abort(), 180000) : 0;
    return fetch(serveur, { method: 'POST', body: JSON.stringify(donnees), signal: ctl ? ctl.signal : undefined })
      .then((r) => r.json()).finally(() => clearTimeout(minuteur));
  }

  const lireBase64 = (fichier) => new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => ko(r.error);
    r.readAsDataURL(fichier);
  });

  const ERREURS = {
    code: ['Code de la promo incorrect.', 'Wrong class code.'],
    type: ['Ce type de fichier n\'est pas accepté (PDF, Word, Excel, PowerPoint, images…).', 'This file type is not accepted (PDF, Word, Excel, PowerPoint, images…).'],
    taille: ['Fichier trop lourd : 20 Mo maximum.', 'File too large: 20 MB maximum.'],
    vite: ['Trop de dépôts en peu de temps, réessaie dans une heure.', 'Too many uploads recently, try again in an hour.'],
    plein: ['L\'espace est plein, contacte Amine.', 'The space is full, contact Amine.'],
    ferme: ['Le dépôt n\'est pas encore ouvert.', 'Uploads are not open yet.'],
    fichier: ['Fichier illisible, réessaie.', 'Could not read the file, try again.'],
    vide: ['Choisis au moins un fichier.', 'Pick at least one file.'],
    reseau: ['Impossible de joindre le serveur, réessaie.', 'Could not reach the server, try again.'],
  };
  const erreur = (c) => { const e = ERREURS[c] || ERREURS.reseau; return tx(e[0], e[1]); };

  /* ---------- formulaire de dépôt */
  function formulaire() {
    return `<form class="sdf dcf" novalidate>
      <h3>${tx('Déposer des fichiers', 'Upload files')}</h3>
      <label class="dcf-zone"><input type="file" name="fichiers" multiple accept="${EXT.map((e) => '.' + e).join(',')}">
        <span class="dcf-choix">${ICONE_PLUS}<b>${tx('Choisir des fichiers', 'Choose files')}</b><small>${tx('PDF, Word, Excel, PowerPoint, images… · 20 Mo max par fichier', 'PDF, Word, Excel, PowerPoint, images… · 20 MB max per file')}</small></span></label>
      <ul class="dcf-liste"></ul>
      <div class="sdf-ligne">
        <label>${tx('Code de la promo', 'Class code')}<input name="codepromo" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="${tx('Demande-le à Amine', 'Ask Amine')}"></label>
        <label>${tx('Ton prénom (facultatif)', 'Your first name (optional)')}<input name="auteur" maxlength="30" autocomplete="given-name"></label>
      </div>
      <p class="sdf-info">${tx('Visible par toute personne qui a le lien de la page. Toi seul pourras retirer tes fichiers, depuis ce téléphone. Pas de documents personnels.', 'Visible to anyone with the page link. Only you can remove your files, from this phone. No personal documents.')}</p>
      <p class="sdf-err" role="alert"></p>
      <div class="sdf-actions"><button type="button" class="btn ghost sdf-annuler">${tx('Annuler', 'Cancel')}</button><button type="submit" class="btn sdf-ok">${tx('Déposer', 'Upload')}</button></div>
    </form>`;
  }

  function brancherFormulaire(zone) {
    const f = zone.querySelector('.dcf');
    const err = f.querySelector('.sdf-err'), listeF = f.querySelector('.dcf-liste'), bouton = f.querySelector('.sdf-ok');
    let choisis = [];
    const afficher = () => {
      listeF.innerHTML = choisis.map((x, i) => `<li data-i="${i}" class="${x.etat || ''}">${pastille(x.f.name)}<span class="dcf-nom">${esc(x.f.name)}</span><span class="dcf-et">${x.texte || taille(x.f.size)}</span></li>`).join('');
    };
    f.fichiers.onchange = () => {
      err.textContent = '';
      choisis = [...f.fichiers.files].map((fi) => {
        if (!EXT.includes(extension(fi.name))) return { f: fi, bloque: true, etat: 'ko', texte: tx('type refusé', 'type not allowed') };
        if (fi.size > max) return { f: fi, bloque: true, etat: 'ko', texte: tx('trop lourd (20 Mo max)', 'too large (20 MB max)') };
        if (!fi.size) return { f: fi, bloque: true, etat: 'ko', texte: tx('fichier vide', 'empty file') };
        return { f: fi };
      });
      afficher();
    };
    f.querySelector('.sdf-annuler').onclick = () => { formOuvert = false; zone.innerHTML = ''; majBouton(); };
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const code = f.codepromo.value.trim();
      // fichiers à (r)envoyer : ni refusés d'office, ni déjà déposés
      const aEnvoyer = choisis.filter((x) => !x.bloque && x.etat !== 'ok');
      if (!aEnvoyer.length) { err.textContent = erreur('vide'); return; }
      aEnvoyer.forEach((x) => { x.etat = ''; x.texte = ''; });
      afficher();
      if (!code) { err.textContent = erreur('code'); f.codepromo.focus(); return; }
      bouton.disabled = true; err.textContent = '';
      const auteur = f.auteur.value.trim();
      if (auteur) mem.set('planning-cnam-btp:prenom', auteur);
      let reussis = 0;
      for (const x of aEnvoyer) {
        x.etat = 'en'; x.texte = tx('préparation…', 'preparing…'); afficher();
        try {
          const b64 = await lireBase64(x.f);
          x.texte = tx('envoi…', 'uploading…'); afficher();
          const r = await envoyer({ a: 'deposer', code, nom: x.f.name, type: x.f.type, b64, auteur, cle: secret() });
          if (!r || !r.ok) {
            x.etat = 'ko'; x.texte = erreur(r && r.erreur);
            if (r && r.erreur === 'code') { err.textContent = erreur('code'); afficher(); break; }
          } else {
            x.etat = 'ok'; x.texte = tx('déposé ✓', 'uploaded ✓'); reussis++;
            miens.push(r.id); mem.set(CLE_MIENS, JSON.stringify(miens));
            mem.set(CLE_CODE, code);
          }
        } catch { x.etat = 'ko'; x.texte = erreur('reseau'); }
        afficher();
      }
      bouton.disabled = false;
      if (reussis) await lister();
      if (reussis === aEnvoyer.length) setTimeout(() => { if (zone.contains(f)) { formOuvert = false; zone.innerHTML = ''; majBouton(); } }, 1200);
    };
    f.codepromo.value = mem.get(CLE_CODE) || '';
    const prenom = mem.get('planning-cnam-btp:prenom');
    if (prenom) f.auteur.value = prenom;
  }
  function majBouton() {
    const b = document.querySelector('.dcg-deposer');
    if (b) b.hidden = !serveur || !actif || formOuvert;
  }

  async function retirer(id) {
    const d = (docs || []).find((x) => x.id === id);
    if (!d || !window.confirm(tx(`Retirer « ${d.nom} » de l'espace partagé ?`, `Remove “${d.nom}” from the shared space?`))) return;
    try {
      const r = await envoyer({ a: 'retirer', id, cle: secret() });
      if (!r || !r.ok) { window.alert(r && r.erreur === 'interdit' ? tx('Seule la personne qui a déposé ce fichier peut le retirer.', 'Only the person who uploaded this file can remove it.') : erreur('reseau')); return; }
      miens = miens.filter((x) => x !== id); mem.set(CLE_MIENS, JSON.stringify(miens));
      docs = docs.filter((x) => x.id !== id); rendreSiOuvert();
    } catch { window.alert(erreur('reseau')); }
  }

  /* ---------- affichage de l'onglet */
  function carte(d) {
    const ouvrir = d.lien || `https://drive.google.com/file/d/${encodeURIComponent(d.id)}/view`;
    const dl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(d.id)}`;
    const meta = [extension(d.nom).toUpperCase(), taille(d.taille), quand(d.date), d.auteur ? `${tx('par', 'by')} ${d.auteur}` : ''].filter(Boolean).join(' · ');
    const mien = miens.includes(d.id);
    return `<article class="dcc">${pastille(d.nom)}
      <div class="dcc-t"><a class="dcc-nom" href="${esc(ouvrir)}" target="_blank" rel="noopener">${esc(d.nom)}</a><p class="dcc-meta">${esc(meta)}</p></div>
      <div class="dcc-a">
        <a class="dcb" href="${esc(ouvrir)}" target="_blank" rel="noopener" title="${tx('Ouvrir', 'Open')}" aria-label="${tx('Ouvrir', 'Open')} ${esc(d.nom)}">${ICONE_OEIL}</a>
        <a class="dcb" href="${esc(dl)}" target="_blank" rel="noopener" title="${tx('Télécharger', 'Download')}" aria-label="${tx('Télécharger', 'Download')} ${esc(d.nom)}">${ICONE_DL}</a>
        ${mien ? `<button type="button" class="ssup" data-ret="${esc(d.id)}">${tx('Retirer', 'Remove')}</button>` : ''}
      </div></article>`;
  }

  function vueDocs(el) {
    document.getElementById('weeknav').style.display = 'none';
    if (!el.querySelector(':scope > .dcg') || el.dataset.langue !== html.lang) {
      el.dataset.langue = html.lang;
      formOuvert = false;
      el.innerHTML = `<div class="dcg" data-notr><div class="sdg-haut"><p class="sdg-note">${tx('Documents partagés par la promo · visibles par toute personne ayant le lien', 'Files shared by the class · visible to anyone with the link')}</p>
        <button type="button" class="btn sdg-creer dcg-deposer" hidden>${ICONE_PLUS}${tx('Déposer un fichier', 'Upload a file')}</button></div>
        <div class="sdg-form dcg-form"></div><input class="dcg-filtre" type="search" placeholder="${tx('Filtrer les fichiers…', 'Filter files…')}" hidden><div class="dcg-liste"></div></div>`;
      el.querySelector('.dcg-deposer').onclick = () => {
        formOuvert = true;
        const zone = el.querySelector('.dcg-form');
        zone.innerHTML = formulaire();
        brancherFormulaire(zone);
        majBouton();
        zone.querySelector('input[type=file]').click();
      };
      const champ = el.querySelector('.dcg-filtre');
      champ.value = filtre;
      champ.oninput = () => { filtre = champ.value; dessinerListe(el); };
    }
    majBouton();
    dessinerListe(el);
  }

  function dessinerListe(el) {
    const liste = el.querySelector('.dcg-liste'), champ = el.querySelector('.dcg-filtre');
    if (!serveur || docs === undefined) { liste.innerHTML = `<div class="placeholder"><h3>${tx('Chargement…', 'Loading…')}</h3></div>`; return; }
    if (docs === null) { liste.innerHTML = `<div class="placeholder"><h3>${tx('Espace indisponible', 'Space unavailable')}</h3><p>${erreur('reseau')}</p></div>`; return; }
    champ.hidden = docs.length < 6;
    if (!docs.length) {
      liste.innerHTML = `<div class="placeholder"><h3>${tx('Aucun document pour l\'instant', 'No files yet')}</h3><p>${actif ? tx('Dépose le premier avec le bouton « Déposer un fichier ».', 'Upload the first one with the “Upload a file” button.') : tx('Les documents de la promo apparaîtront ici.', 'Class files will show up here.')}</p></div>`;
      return;
    }
    const f = filtre.trim().toLowerCase();
    const vus = f ? docs.filter((d) => `${d.nom} ${d.auteur || ''}`.toLowerCase().includes(f)) : docs;
    liste.innerHTML = vus.length ? `<div class="dcgs">${vus.map(carte).join('')}</div>` : `<div class="placeholder"><h3>${tx('Aucun fichier ne correspond', 'No matching files')}</h3></div>`;
    liste.querySelectorAll('[data-ret]').forEach((b) => (b.onclick = () => retirer(b.dataset.ret)));
  }

  const ouvert = () => S.tab === 'docs' && !S.q;
  const rendreSiOuvert = () => { if (ouvert()) vueDocs(document.getElementById('view')); };

  /* ---------- branchement dans la page */
  const rendreVueBase = rendreVue;
  rendreVue = function () {   // eslint-disable-line no-global-assign
    if (ouvert()) { vueDocs(document.getElementById('view')); lister(); return; }
    rendreVueBase.apply(this, arguments);
  };
  const rendreChipsBase = rendreChips;
  rendreChips = function () {   // eslint-disable-line no-global-assign
    if (ouvert()) { document.getElementById('chips').innerHTML = ''; return; }
    rendreChipsBase.apply(this, arguments);
  };
  new MutationObserver(rendreSiOuvert).observe(html, { attributes: true, attributeFilter: ['lang'] });
  setInterval(() => { if (ouvert() && !document.hidden && !formOuvert) lister(); }, 60000);

  // adresse du mini-serveur : la même que pour les sondages
  fetch(`data/sondages.json?t=${Date.now()}`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((j) => {
    const api = j && typeof j.api === 'string' ? j.api : '';
    if (/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(api)) serveur = api;
    if (serveur) lister(); else { docs = null; rendreSiOuvert(); }
  });
})();
