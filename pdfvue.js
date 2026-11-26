/* Visionneuse du calendrier PDF dans la page (avec un bouton « Fermer »)
   Ouvrir le PDF directement laissait bloqué sur iPhone, surtout depuis l'écran d'accueil :
   pas de bouton pour revenir. Ici le PDF s'affiche dans une fenêtre de la page.
   Le rendu utilise PDF.js (Mozilla), chargé seulement à la première ouverture. */
(() => {
  const CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174';
  const SRI = 'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e';
  const ZOOMS = [1, 1.5, 2, 3];

  const dlg = document.createElement('dialog');
  dlg.className = 'pdfv';
  dlg.innerHTML = `
    <div class="pdfv-bar">
      <b class="pdfv-t">📄 Calendrier officiel</b>
      <div class="pdfv-act">
        <button class="ib pdfv-moins" aria-label="Dézoomer">−</button>
        <button class="ib pdfv-plus" aria-label="Zoomer">+</button>
        <a class="btn ghost pdfv-dl" download="calendrier-cnam-ING7400A.pdf">Télécharger</a>
        <button class="btn pdfv-x">✕ Fermer</button>
      </div>
    </div>
    <div class="pdfv-pages"><p class="pdfv-msg">Chargement du calendrier…</p></div>`;
  document.body.appendChild(dlg);
  const pages = dlg.querySelector('.pdfv-pages');
  let zoom = 0, charge = null, url = '';

  const appliquerZoom = () => {
    pages.style.setProperty('--z', ZOOMS[zoom]);
    dlg.querySelector('.pdfv-moins').disabled = zoom === 0;
    dlg.querySelector('.pdfv-plus').disabled = zoom === ZOOMS.length - 1;
  };
  dlg.querySelector('.pdfv-moins').onclick = () => { zoom = Math.max(0, zoom - 1); appliquerZoom(); };
  dlg.querySelector('.pdfv-plus').onclick = () => { zoom = Math.min(ZOOMS.length - 1, zoom + 1); appliquerZoom(); };
  appliquerZoom();

  function script(src, integrity) {
    return new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.crossOrigin = 'anonymous';
      if (integrity) s.integrity = integrity;
      s.onload = ok; s.onerror = () => ko(new Error('PDF.js indisponible'));
      document.head.appendChild(s);
    });
  }

  async function rendre() {
    if (!window.pdfjsLib) await script(`${CDN}/build/pdf.min.js`, SRI);
    const lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = `${CDN}/build/pdf.worker.min.js`;
    const doc = await lib.getDocument({
      url, cMapUrl: `${CDN}/cmaps/`, cMapPacked: true, standardFontDataUrl: `${CDN}/standard_fonts/`,
    }).promise;
    pages.innerHTML = '';
    // assez de détails pour zoomer ×3 sur téléphone sans flou
    const largeur = Math.min(2600, Math.max(1600, pages.clientWidth * (window.devicePixelRatio || 1) * 2));
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const vp0 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: largeur / vp0.width });
      const c = document.createElement('canvas');
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      c.setAttribute('aria-label', `Page ${i} sur ${doc.numPages}`);
      pages.appendChild(c);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    }
  }

  function ouvrir(href) {
    url = href;
    dlg.querySelector('.pdfv-dl').href = href;
    if (!dlg.open) dlg.showModal();
    // le bouton « retour » du téléphone ferme la visionneuse au lieu de quitter la page
    try { history.pushState({ pdfv: 1 }, ''); } catch { /* sans historique */ }
    if (!charge) {
      charge = rendre().catch(() => {
        charge = null;
        pages.innerHTML = `<p class="pdfv-msg">Impossible d'afficher le calendrier ici.<br>
          <a href="${href}" download>Télécharger le PDF</a></p>`;
      });
    }
  }
  function fermer() {
    if (history.state && history.state.pdfv) history.back(); // déclenche popstate → fermeture
    else if (dlg.open) dlg.close();
  }
  dlg.querySelector('.pdfv-x').onclick = fermer;
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); fermer(); }); // touche Échap
  dlg.addEventListener('click', (e) => { if (e.target === dlg) fermer(); }); // clic à côté
  window.addEventListener('popstate', () => { if (dlg.open) dlg.close(); });

  // tous les liens vers un PDF de la page s'ouvrent dans la visionneuse
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href$=".pdf"]');
    if (!a || dlg.contains(a) || e.metaKey || e.ctrlKey || e.shiftKey || !window.HTMLDialogElement) return;
    e.preventDefault();
    ouvrir(a.getAttribute('href'));
  });
})();
