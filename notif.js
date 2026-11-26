/* Cloche de notifications dans l'en-tête (remplace le bandeau jaune des modifications).
   La pastille affiche le nombre de modifications de la dernière vérification (moins de 7 jours),
   tant qu'elles n'ont pas été vues sur cet appareil. Un clic ouvre l'onglet « Modifications ». */
(() => {
  const html = document.documentElement;
  const tx = (fr, en) => (html.lang === 'en' ? en : fr);
  const CLE_VU = 'planning-cnam-btp:notif-vue';
  const mem = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } },
  };

  const style = document.createElement('style');
  style.textContent = `
#notifBtn{position:relative;min-height:36px;padding:8px 10px}
#notifBtn svg{width:18px;height:18px}
#notifBtn .pastille{position:absolute;top:-7px;right:-7px;min-width:20px;height:20px;padding:0 5px;box-sizing:border-box;border-radius:99px;background:var(--red);color:#fff;font-size:11.5px;font-weight:800;display:grid;place-items:center;border:2px solid var(--bg);line-height:1}
#notifBtn .pastille[hidden]{display:none}
#alert:empty{display:none}`;
  document.head.appendChild(style);

  const ICONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 20a1.9 1.9 0 0 0 3.4 0"/></svg>';
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.id = 'notifBtn';
  bouton.className = 'btn ghost';
  bouton.dataset.notr = '';
  bouton.innerHTML = `${ICONE}<span class="pastille" hidden></span>`;
  const reglages = document.getElementById('reglagesBtn');
  if (reglages) reglages.parentNode.insertBefore(bouton, reglages);

  function derniere() {
    const b = (S.changes || [])[0];
    if (!b || !Array.isArray(b.changes) || Date.now() - Date.parse(b.at) > 7 * 864e5) return null;
    return b;
  }

  function majCloche() {
    const b = derniere();
    const pastille = bouton.querySelector('.pastille');
    let label = tx('Modifications du planning', 'Timetable changes');
    if (b && mem.get(CLE_VU) !== b.at) {
      const n = b.changes.length, d = new Date(b.at);
      const loc = html.lang === 'en' ? 'en-GB' : 'fr-FR';
      const quand = `${d.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' })} ${tx('à', 'at')} ${d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })}`;
      label = html.lang === 'en'
        ? `${n} timetable change${n > 1 ? 's' : ''} detected on ${quand}`
        : `${n} modification${n > 1 ? 's' : ''} du planning détectée${n > 1 ? 's' : ''} le ${quand}`;
      pastille.textContent = n > 99 ? '99+' : String(n);
      pastille.hidden = false;
    } else {
      pastille.hidden = true;
    }
    bouton.setAttribute('aria-label', label);
    bouton.title = label;
  }

  bouton.onclick = () => {
    const b = derniere();
    if (b) mem.set(CLE_VU, b.at);
    majCloche();
    choisirOnglet('changes');
    const onglets = document.getElementById('tabs');
    if (onglets) onglets.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // le bandeau jaune n'est plus affiché : la cloche le remplace
  rendreAlerte = function () {   // eslint-disable-line no-global-assign
    const el = document.getElementById('alert');
    if (el) el.innerHTML = '';
    majCloche();
  };

  new MutationObserver(majCloche).observe(html, { attributes: true, attributeFilter: ['lang'] });
  majCloche();
})();
