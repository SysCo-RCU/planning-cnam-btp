/* Bouton « PDF » : crée un vrai fichier PDF de l'onglet affiché (semaine, mois, à venir,
   examens, avancement, modifications, sondages), sans passer par l'impression du navigateur
   (qui ne s'ouvre pas dans l'app écran d'accueil d'iPhone / iPad ni dans certaines apps).
   Ordinateur : téléchargement direct. iPhone / iPad : fenêtre « Enregistrer / partager ».
   Seul le contenu de l'onglet est exporté, avec un titre, en clair même en thème sombre. */
(() => {
  const html = document.documentElement;
  const tx = (fr, en) => (html.lang === 'en' ? en : fr);
  const TITRE = document.title;
  // lancé depuis l'icône de l'écran d'accueil (pas d'impression ni d'ouverture de lien possible)
  const APPLI = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

  const style = document.createElement('style');
  style.textContent = `
#pdfBtn{min-height:36px;white-space:nowrap}
#weeknav[style*="none"] ~ #pdfBtn{margin-left:auto}
#printhead{display:none}
@media (max-width:560px){#pdfBtn{margin-left:auto}}
@media print{
  html,html[data-theme][data-theme]{--bg:#fff;--bg2:#f1eeea;--card:#fff;--ink:#17151a;--ink2:#4a4550;--ink3:#6b6570;--line:#d9d3cc;--shadow:none;color-scheme:light}
  html[data-theme][data-theme]{--ok:#0f7b46;--ok-soft:#e5f5ec;--warn:#9a5b00;--warn-soft:#fff2db;--blue:#1d4ed8;--blue-soft:#e8eefc}
  body{background:#fff!important;font-size:12px;zoom:1!important}
  body::before{display:none!important}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact;box-shadow:none!important;animation:none!important;transition:none!important}
  .wrap{max-width:none;padding:0}
  header,#alert,#hero,#frise,.bar,#chips,footer,dialog,.vbasc,.sdg-haut,.sdg-form,.ssup,#notifBtn{display:none!important}
  #printhead{display:flex;justify-content:space-between;align-items:baseline;gap:16px;border-bottom:2px solid #17151a;padding-bottom:6px;margin-bottom:12px}
  #printhead h1{font-family:var(--display);font-size:20px;font-weight:800}
  #printhead p{font-size:11px;color:#4a4550;text-align:right}
  .ev,.batch,.chg,.uecard,.sdc,.row,.lday,.exams>*{break-inside:avoid}
  .day{min-height:0;opacity:1!important}
  .day.past{opacity:1!important}
  .sopt{border:1px solid #d9d3cc!important}
  a{text-decoration:none;color:inherit}
}
html.pdfx,html.pdfx[data-theme][data-theme]{--bg:#fff;--bg2:#f1eeea;--card:#fff;--ink:#17151a;--ink2:#4a4550;--ink3:#6b6570;--line:#d9d3cc;--shadow:none;color-scheme:light}
html.pdfx[data-theme][data-theme]{--ok:#0f7b46;--ok-soft:#e5f5ec;--warn:#9a5b00;--warn-soft:#fff2db;--blue:#1d4ed8;--blue-soft:#e8eefc}
html.pdfx body{background:#fff!important;font-size:12px;zoom:1!important}
html.pdfx body::before{display:none!important}
html.pdfx *{-webkit-print-color-adjust:exact;print-color-adjust:exact;box-shadow:none!important;animation:none!important;transition:none!important}
html.pdfx .wrap{max-width:none;padding:0}
html.pdfx header,html.pdfx #alert,html.pdfx #hero,html.pdfx #frise,html.pdfx .bar,html.pdfx #chips,html.pdfx footer,html.pdfx dialog,html.pdfx .vbasc,html.pdfx .sdg-haut,html.pdfx .sdg-form,html.pdfx .ssup,html.pdfx #notifBtn{display:none!important}
html.pdfx #printhead{display:flex;justify-content:space-between;align-items:baseline;gap:16px;border-bottom:2px solid #17151a;padding-bottom:6px;margin-bottom:12px}
html.pdfx #printhead h1{font-family:var(--display);font-size:20px;font-weight:800}
html.pdfx #printhead p{font-size:11px;color:#4a4550;text-align:right}
html.pdfx .ev,html.pdfx .batch,html.pdfx .chg,html.pdfx .uecard,html.pdfx .sdc,html.pdfx .row,html.pdfx .lday,html.pdfx .exams>*{break-inside:avoid}
html.pdfx .day{min-height:0;opacity:1!important}
html.pdfx .day.past{opacity:1!important}
html.pdfx .sopt{border:1px solid #d9d3cc!important}
html.pdfx a{text-decoration:none;color:inherit}
#pdfOverlay{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:20px}
#pdfOverlay .pdfbox{background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:16px;padding:18px;max-width:360px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3)}
#pdfOverlay .pdft{font-weight:800;font-size:17px;margin:0 0 4px}
#pdfOverlay .pdfn{font-size:12.5px;color:var(--ink2);margin:0 0 14px;word-break:break-word}
#pdfOverlay .pdfa{display:flex;flex-wrap:wrap;gap:8px}
#pdfOverlay .pdfa .btn{flex:1 1 auto;justify-content:center;min-height:40px;cursor:pointer}
#pdfBtn:disabled{opacity:.6;cursor:progress}
html.pdfx .mnote{display:none}
`;
  document.head.appendChild(style);
  // format de page selon l'onglet : paysage pour la semaine et le mois, portrait sinon
  const page = document.createElement('style');
  document.head.appendChild(page);

  // titre imprimé en haut du PDF
  const tete = document.createElement('div');
  tete.id = 'printhead';
  tete.dataset.notr = '';
  const vue = document.getElementById('view');
  vue.parentNode.insertBefore(tete, vue);

  const ICONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/></svg>';
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.id = 'pdfBtn';
  bouton.className = 'btn ghost';
  bouton.dataset.notr = '';
  document.getElementById('tabs').parentNode.appendChild(bouton);

  const NOMS = {
    week: ['Semaine', 'Week'], month: ['Mois', 'Month'], list: ['À venir', 'Upcoming'], exams: ['Examens', 'Exams'],
    ue: ['Avancement', 'Progress'], changes: ['Modifications', 'Changes'], sondages: ['Sondages', 'Polls'], docs: ['Documents', 'Documents'],
  };
  const nomOnglet = () => {
    if (S.q) return `${tx('Recherche', 'Search')} « ${S.q} »`;
    const n = NOMS[S.tab];
    return n ? tx(n[0], n[1]) : '';
  };
  function majBouton() {
    bouton.innerHTML = `${ICONE}<span>PDF</span>`;
    const l = tx(`Exporter l'onglet « ${nomOnglet()} » en PDF`, `Export the “${nomOnglet()}” tab as PDF`);
    bouton.title = l;
    bouton.setAttribute('aria-label', l);
  }

  // bibliothèques chargées seulement au premier export
  const LIBS = [
    'https://cdn.jsdelivr.net/npm/html2canvas-pro@2.5.0/dist/html2canvas-pro.min.js',
    'https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js',
  ];
  const charges = {};
  const charger = (src) => charges[src] || (charges[src] = new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = src; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = ok;
    s.onerror = () => { delete charges[src]; ko(new Error('chargement ' + src)); };
    document.head.appendChild(s);
  }));

  // prépare le titre, le format et le nom du fichier
  function preparer() {
    const onglet = nomOnglet();
    const lbl = document.getElementById('weeklbl');
    let periode = '';
    if (!S.q && ['week', 'month'].includes(S.tab) && lbl) {
      const petit = lbl.querySelector('small');
      const haut = petit ? petit.textContent.trim() : '';
      const reste = lbl.textContent.replace(haut, '').replace(/\s+/g, ' ').trim();
      periode = S.tab === 'week' && haut ? `${haut} (${reste})` : reste;
    }
    const sous = (document.getElementById('subtitle') || {}).textContent || '';
    const maintenant = new Date().toLocaleString(html.lang === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'long', timeStyle: 'short' });
    tete.innerHTML = '';
    const h = document.createElement('h1');
    h.textContent = `Planning Cnam BTP — ${onglet}${periode ? ` · ${periode}` : ''}`;
    const p = document.createElement('p');
    p.textContent = `${sous}\n${tx('Exporté le', 'Exported on')} ${maintenant}`;
    p.style.whiteSpace = 'pre-line';
    tete.append(h, p);
    const paysage = !S.q && ['week', 'month'].includes(S.tab);
    page.textContent = `@page{size:A4 ${paysage ? 'landscape' : 'portrait'};margin:10mm}`;
    const nom = `Planning Cnam BTP - ${onglet}${periode ? ` - ${periode}` : ''}`.replace(/[\\/:*?"<>|«»“”.]/g, '').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
    return { paysage, nom };
  }

  // découpe en pages sans couper un cours ou une carte en deux
  function coupures(doc, cible, hPage) {
    const r0 = cible.getBoundingClientRect();
    const total = r0.height;
    const blocs = [];
    cible.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.height < hPage * 0.35) blocs.push([r.top - r0.top, r.bottom - r0.top]);
    });
    const pages = [];
    let debut = 0;
    while (debut < total - 2 && pages.length < 60) {
      let fin = debut + hPage;
      if (fin >= total) { pages.push([debut, total]); break; }
      // remonte la coupure au-dessus de la ligne (cours, modification…) qu'elle traverserait
      for (let i = 0; i < 30; i++) {
        let haut = -1;
        for (const [t, b] of blocs) if (t < fin - 2 && b > fin + 2 && t > debut + hPage * 0.3 && t > haut) haut = t;
        if (haut < 0) break;
        fin = haut;
      }
      pages.push([debut, fin]);
      debut = fin;
    }
    return pages;
  }

  async function fabriquer() {
    const { paysage, nom } = preparer();
    await Promise.all(LIBS.map(charger));
    const largeur = paysage ? 1200 : 820;            // largeur de mise en page (px CSS)
    const mm = paysage ? [277, 190] : [190, 277];    // zone utile A4 avec 10 mm de marge
    const hPage = largeur * mm[1] / mm[0];
    let pages = [];
    // Safari (iPhone / iPad) refuse les images de plus de ~16 millions de pixels :
    // on baisse la netteté pour les onglets très longs (estimation large de la hauteur)
    const wrap = document.querySelector('.wrap');
    const hEst = wrap.scrollHeight * Math.max(1, wrap.clientWidth / largeur) + 200;
    const echelle = Math.max(0.6, Math.min(2, Math.sqrt(14e6 / (largeur * hEst))));
    const canvas = await window.html2canvas(wrap, {
      scale: echelle, backgroundColor: '#ffffff', logging: false, useCORS: true,
      windowWidth: largeur, windowHeight: Math.round(hPage), scrollX: 0, scrollY: 0,
      ignoreElements: (el) => el.tagName === 'DIALOG' || el.id === 'pdfOverlay',
      onclone: (doc) => {
        doc.documentElement.classList.add('pdfx');
        const c = doc.querySelector('.wrap');
        pages = coupures(doc, c, hPage);
      },
    });
    const k = canvas.width / largeur;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: paysage ? 'landscape' : 'portrait', unit: 'mm', format: 'a4', compress: true });
    pdf.setProperties({ title: nom, creator: 'Planning Cnam BTP' });
    if (!pages.length) pages = [[0, canvas.height / k]];
    pages.forEach(([a, b], i) => {
      const y = Math.round(a * k), h = Math.min(Math.round((b - a) * k), canvas.height - y);
      if (h <= 0) return;
      const part = document.createElement('canvas');
      part.width = canvas.width; part.height = h;
      const ctx = part.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, part.width, h);
      ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      if (i) pdf.addPage();
      pdf.addImage(part.toDataURL('image/jpeg', 0.9), 'JPEG', 10, 10, mm[0], mm[0] * h / canvas.width);
      if (pages.length > 1) {
        pdf.setFontSize(8); pdf.setTextColor(120);
        pdf.text(`${i + 1} / ${pages.length}`, 10 + mm[0], 10 + mm[1] + 6, { align: 'right' });
      }
    });
    return new File([pdf.output('blob')], `${nom}.pdf`, { type: 'application/pdf' });
  }

  // fenêtre « PDF prêt » (iPhone / iPad) : un vrai geste est nécessaire pour partager
  function proposer(fichier) {
    const url = URL.createObjectURL(fichier);
    const fond = document.createElement('div');
    fond.id = 'pdfOverlay';
    fond.dataset.notr = '';
    const boite = document.createElement('div');
    boite.className = 'pdfbox';
    const t = document.createElement('p');
    t.className = 'pdft';
    t.textContent = tx('PDF prêt', 'PDF ready');
    const n = document.createElement('p');
    n.className = 'pdfn';
    n.textContent = fichier.name;
    const actions = document.createElement('div');
    actions.className = 'pdfa';
    const fermer = () => { fond.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); };
    const partage = !!(navigator.canShare && navigator.canShare({ files: [fichier] }));
    if (partage) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn';
      b.textContent = tx('Enregistrer / partager', 'Save / share');
      b.onclick = () => navigator.share({ files: [fichier], title: fichier.name }).then(fermer).catch(() => {});
      actions.appendChild(b);
    }
    // l'app de l'écran d'accueil (iPhone / iPad) ne sait pas ouvrir un lien vers le fichier :
    // on y passe uniquement par « Enregistrer / partager » (Fichiers, Mail, WhatsApp…)
    if (!(APPLI && partage)) {
      const a = document.createElement('a');
      a.className = 'btn ghost'; a.href = url; a.download = fichier.name; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = tx('Ouvrir le PDF', 'Open PDF');
      a.onclick = () => setTimeout(fermer, 500);
      actions.appendChild(a);
    }
    const fin = [];
    if (APPLI && partage) {
      const aide = document.createElement('p');
      aide.className = 'pdfn';
      aide.style.margin = '12px 0 0';
      aide.textContent = tx('Puis « Enregistrer dans Fichiers », ou choisis une appli (Mail, WhatsApp…).', 'Then “Save to Files”, or pick an app (Mail, WhatsApp…).');
      fin.push(aide);
    }
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'btn ghost';
    x.textContent = tx('Fermer', 'Close');
    x.onclick = fermer;
    actions.append(x);
    boite.append(t, n, actions, ...fin);
    fond.appendChild(boite);
    fond.onclick = (e) => { if (e.target === fond) fermer(); };
    document.body.appendChild(fond);
  }

  function telecharger(fichier) {
    const url = URL.createObjectURL(fichier);
    const a = document.createElement('a');
    a.href = url; a.download = fichier.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  let enCours = false;
  bouton.onclick = async () => {
    if (enCours) return;
    enCours = true;
    bouton.disabled = true;
    bouton.querySelector('span').textContent = tx('PDF…', 'PDF…');
    try {
      const fichier = await fabriquer();
      window.__pdfDernier = fichier;   // pour les tests
      const tactile = matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints > 1;
      if (tactile) proposer(fichier); else telecharger(fichier);
    } catch (e) {
      console.error(e);
      if (APPLI) {
        alert(tx('Impossible de créer le PDF (connexion internet ?). Réessaie dans un instant.', 'Could not create the PDF (internet connection?). Please try again.'));
      } else {
        alert(tx('Impossible de créer le PDF (connexion internet ?). La fenêtre d\'impression va s\'ouvrir à la place.', 'Could not create the PDF (internet connection?). The print dialog will open instead.'));
        try { window.print(); } catch (e2) { /* rien */ }
      }
    } finally {
      enCours = false;
      bouton.disabled = false;
      majBouton();
    }
  };

  // libellé du bouton à jour selon l'onglet et la langue
  const rendreVueBase = rendreVue;
  rendreVue = function () {   // eslint-disable-line no-global-assign
    rendreVueBase.apply(this, arguments);
    majBouton();
  };
  new MutationObserver(majBouton).observe(html, { attributes: true, attributeFilter: ['lang'] });
  majBouton();
})();
