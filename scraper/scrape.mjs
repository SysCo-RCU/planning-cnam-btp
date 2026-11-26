// Récupère le planning Cnam (site gescicca), le compare à la version précédente,
// met à jour data/*.json + planning.ics et prépare une notification GitHub en cas de changement.
//
// Variables d'environnement :
//   PLANNING_URL   lien du QR code du planning (obligatoire)
//   WEEKS_AHEAD    nombre de semaines à lire (défaut 20)
//   FETCH_DETAILS  "false" pour ne pas ouvrir le détail de chaque cours (enseignant, centre…)
//   SMTP_USER / SMTP_PASS / MAIL_TO / SMTP_HOST / SMTP_PORT   e-mail SMTP (facultatif)
//   PAGE_URL       adresse de la page GitHub Pages (lien dans l'e-mail)
//   TEST_EMAIL     "true" pour envoyer une notification de test
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyserLigne, analyserDetail, attribuerIds, comparer, genererIcs,
  emailChangements, envoyerMail, finDeSemaine, iso, ajouterJours, dateLisible,
  annulerFaussesSuppressions,
} from './lib.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(RACINE, 'data');
const DEBUG = path.join(RACINE, 'debug');
const URL_PLANNING = process.env.PLANNING_URL;
const SEMAINES = parseInt(process.env.WEEKS_AHEAD || '20', 10);
const DETAILS = process.env.FETCH_DETAILS !== 'false';
const PAGE_URL = process.env.PAGE_URL || '';

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------ fonctions exécutées dans la page
function lireSemaine() {
  const txt = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const corps = txt(document.body.innerText);
  const range = (corps.match(/Planning du\s+(.*?\bau\s+\d{1,2}\s+\S+\s+\d{4})/i) || [])[1] || null;
  const num = (corps.match(/Semaine\s+(\d{1,2})/i) || [])[1] || null;
  const reJour = /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+\d{1,2}$/i;
  const reHeure = /^\d{1,2}[:h]\d{2}\s*à\s*\d{1,2}[:h]\d{2}/;
  const rows = [];
  let jour = null;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = w.currentNode; n; n = w.nextNode()) {
    if (n.nodeType === 3) {
      const t = txt(n.nodeValue);
      if (reJour.test(t)) jour = t;
      continue;
    }
    if (n.tagName !== 'TR') continue;
    const tds = [...n.children].filter((c) => c.tagName === 'TD');
    if (tds.length < 3 || !reHeure.test(txt(tds[0].textContent))) continue;
    const a = tds[1].querySelector('a');
    const lien = txt(a ? a.textContent : tds[1].textContent);
    const tout = txt(tds[1].textContent);
    const href = a ? a.getAttribute('href') || '' : '';
    rows.push({
      day: jour,
      time: txt(tds[0].textContent),
      linkText: lien,
      typeText: txt(tout.startsWith(lien) ? tout.slice(lien.length) : tout.replace(lien, '')),
      room: txt(tds[2].textContent),
      evt: (href.match(/ViewEvt\((\d+)\)/) || [])[1] ?? null,
    });
  }
  return { range, num, rows };
}

function lireDetail() {
  const txt = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const lignes = document.body.innerText.split(/[\n\t]+/).map(txt).filter(Boolean);
  let entete = [];
  const btn = [...document.querySelectorAll('input,button,a')]
    .find((b) => /Revenir sur le planning/i.test(b.value || b.textContent || b.title || b.alt || ''));
  const tr = btn && btn.closest('tr');
  if (tr) {
    const cells = [...tr.children].filter((c) => c.tagName === 'TD');
    if (cells[1]) entete = cells[1].innerText.split('\n').map(txt).filter(Boolean);
  }
  return { lignes, entete };
}

// ------------------------------------------------------------ navigation
async function attendre(page, condition, delai = 30000) {
  const fin = Date.now() + delai;
  while (Date.now() < fin) {
    try {
      if (await condition()) return true;
    } catch { /* page en cours de rechargement */ }
    await pause(250);
  }
  throw new Error('Délai dépassé en attendant la page');
}

// La clé n'est lue que sur une page ENTIÈREMENT chargée : le site renvoie toute la page à chaque
// clic, et l'en-tête arrive avant le tableau des cours (sinon on lit une semaine à moitié affichée).
const cleSemaine = (page) => page.evaluate(() => {
  if (document.readyState !== 'complete') return null;
  const m = document.body.innerText.replace(/\s+/g, ' ').match(/Planning du\s+(.*?\bau\s+\d{1,2}\s+\S+\s+\d{4})/i);
  return m ? m[1] : null;
});
const btnSuivant = (page) => page.getByRole('button', { name: /Semaine suivante/i }).first();
const btnRetour = (page) => page.getByRole('button', { name: /Revenir sur le planning/i }).first();

// Masque dans les journaux GitHub l'adresse réelle du planning (après redirection)
const dejaMasque = new Set();
function masquer(url) {
  if (!process.env.GITHUB_ACTIONS || !url) return;
  const id = (url.match(/[?&]id=([^&#]+)/) || [])[1];
  const valeurs = [url];
  if (id) { valeurs.push(id); try { valeurs.push(decodeURIComponent(id)); } catch { /* ignore */ } }
  for (const v of valeurs) {
    if (v && !dejaMasque.has(v)) { dejaMasque.add(v); console.log(`::add-mask::${v}`); }
  }
}

// Attend que la page ne bouge plus : chargement terminé et nombre de lignes stable
async function pageStable(page) {
  await page.waitForLoadState('load').catch(() => {});
  let avant = -2;
  for (let i = 0; i < 20; i++) {
    const n = await page.evaluate(() => (document.readyState === 'complete'
      ? document.querySelectorAll('tr').length : -1)).catch(() => -1);
    if (n >= 0 && n === avant) return;
    avant = n;
    await pause(400);
  }
}

async function ouvrir(page) {
  await page.goto(URL_PLANNING, { waitUntil: 'load', timeout: 60000 });
  masquer(page.url());
  await attendre(page, async () => !!(await cleSemaine(page)));
  await pageStable(page);
}

async function semaineSuivante(page) {
  const avant = await cleSemaine(page);
  if (!(await btnSuivant(page).count())) return false;
  await btnSuivant(page).click();
  await attendre(page, async () => { const k = await cleSemaine(page); return k && k !== avant; });
  await pageStable(page);
  return true;
}

async function allerASemaine(page, k) {
  await ouvrir(page);
  for (let i = 0; i < k; i++) await semaineSuivante(page);
}

async function lireDetailEvt(page, evt, cle) {
  await page.locator(`a[href*="ViewEvt(${evt})"]`).first().click();
  await attendre(page, async () => (await page.evaluate(() => document.readyState === 'complete'))
    && (await btnRetour(page).count()) > 0, 20000);
  await pageStable(page);
  const d = await page.evaluate(lireDetail);
  await btnRetour(page).click();
  await attendre(page, async () => (await cleSemaine(page)) === cle, 20000);
  await pageStable(page);
  return d;
}

// ------------------------------------------------------------ lecture complète
let echecsDetailTotal = 0;   // au-delà de 8, on arrête d'ouvrir les détails (site trop lent)

// Lit la semaine affichée (la k-ième) avec le détail de chaque cours
async function lireUneSemaine(page, k) {
  const cle = await cleSemaine(page);
  const s = await page.evaluate(lireSemaine);
  const dFin = finDeSemaine(s.range);
  if (!dFin) throw new Error(`En-tête de semaine illisible : « ${s.range} »`);
  console.log(`Semaine ${s.num} (${s.range}) : ${s.rows.length} créneau(x)`);

  const evts = [];
  let echecs = 0;
  for (const row of s.rows) {
    const e = analyserLigne(row, dFin);
    if (!e.date) throw new Error(`Jour illisible : « ${row.day} » (${s.range})`);
    if (DETAILS && row.evt !== null && echecs === 0 && echecsDetailTotal < 8) {
      try {
        const { lignes, entete } = await lireDetailEvt(page, row.evt, cle);
        const d = analyserDetail(lignes, entete);
        // On ne garde le détail que s'il correspond bien au créneau
        if (d && d.date === e.date && d.start === e.start) {
          for (const k2 of ['teacher', 'centre', 'category', 'group', 'ue', 'session', 'sessions', 'notes']) {
            if (d[k2] !== undefined && d[k2] !== '') e[k2] = d[k2];
          }
        }
      } catch (err) {
        echecs++;
        echecsDetailTotal++;
        console.warn(`  ⚠️  détail ${row.evt} illisible (${err.message})`);
        await allerASemaine(page, k);
      }
    }
    delete e._evt;
    evts.push(e);
  }
  return { s, dFin, evts, echecs };
}

async function lirePlanning(page, anciens) {
  await ouvrir(page);
  const events = [];
  const incertaines = [];
  let debut = null, fin = null;

  for (let k = 0; k < SEMAINES; k++) {
    let lecture, lundi, dimanche, avant = 0;
    for (let essai = 1; ; essai++) {
      lecture = await lireUneSemaine(page, k);
      lundi = iso(ajouterJours(lecture.dFin, -6));
      dimanche = iso(lecture.dFin);
      // Une semaine qui perd d'un coup plus de la moitié de ses cours est relue pour confirmation
      avant = anciens.filter((e) => e.date >= lundi && e.date <= dimanche).length;
      const chute = avant >= 4 && lecture.evts.length < avant / 2;
      if ((!lecture.echecs && !chute) || essai >= 3) break;
      console.warn(`  ↻ semaine relue (${lecture.echecs ? 'détail illisible' : `${avant} → ${lecture.evts.length} créneaux`}), essai ${essai + 1}/3`);
      await pause(3000 * essai);
      await allerASemaine(page, k);
    }
    // Détail toujours illisible ET nombre de cours différent : lecture douteuse
    if (lecture.echecs && lecture.evts.length !== avant) incertaines.push({ from: lundi, to: dimanche });
    if (!debut) debut = lundi;
    fin = dimanche;
    events.push(...lecture.evts);
    if (k < SEMAINES - 1 && !(await semaineSuivante(page))) break;
  }
  events.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  return { events: attribuerIds(events), debut, fin, incertaines };
}

// ------------------------------------------------------------ fichiers
async function lireJson(fichier, defaut) {
  try { return JSON.parse(await fs.readFile(fichier, 'utf8')); } catch { return defaut; }
}
async function ecrireJson(fichier, obj) {
  await fs.writeFile(fichier, JSON.stringify(obj, null, 2) + '\n');
}

// ------------------------------------------------------------ notifications GitHub
// Chaque notification est écrite dans .notif/NN.md (1re ligne = titre). L'étape suivante du
// workflow en fait une « issue » GitHub : GitHub envoie alors l'e-mail tout seul.
const NOTIF = path.join(RACINE, '.notif');
let nbNotif = 0;
// Neutralise le Markdown et les @mentions dans les textes venant du site du Cnam
const md = (s) => String(s ?? '').replace(/[\\`*_{}[\]()#+!|<>~]/g, '\\$&').replace(/@/g, '@\u200b');

async function notifier(titre, lignes) {
  await fs.mkdir(NOTIF, { recursive: true });
  const proprio = process.env.GITHUB_REPOSITORY_OWNER;
  const corps = [proprio ? `@${proprio}` : '', '', ...lignes, '',
    PAGE_URL ? `[Voir mon planning](${PAGE_URL})` : ''].join('\n');
  nbNotif++;
  const fichier = path.join(NOTIF, `${String(nbNotif).padStart(2, '0')}.md`);
  await fs.writeFile(fichier, `${titre.replace(/[\r\n]+/g, ' ')}\n${corps}\n`);
}

const LIBELLES = { added: '🟢 **Ajouté**', removed: '🔴 **Supprimé**', moved: '🟠 **Déplacé**', modified: '🔵 **Modifié**' };
function lignesChangements(changes) {
  const quand = (e) => `${dateLisible(e.date)} ${e.start}–${e.end}`;
  const nom = (e) => md(`${e.code}${e.title ? ' – ' + e.title : ''}${e.exam ? ' (' + e.type + ')' : ''}`);
  return changes.map((c) => {
    const e = c.after || c.before;
    let d = '';
    if (c.kind === 'added') d = `${quand(e)} · ${md(e.room)}`;
    if (c.kind === 'removed') d = `~~${quand(e)} · ${md(e.room)}~~`;
    if (c.kind === 'moved') d = `~~${quand(c.before)} · ${md(c.before.room)}~~ → **${quand(c.after)} · ${md(c.after.room)}**`;
    if (c.kind === 'modified') d = `${quand(e)} — ` + c.fields.map((f) => `${md(f.label)} : ~~${md(f.old || '—')}~~ → **${md(f.new || '—')}**`).join(' ; ');
    return `- ${LIBELLES[c.kind]} — ${nom(e)} : ${d}`;
  });
}

// L'e-mail par SMTP est facultatif : s'il échoue, on continue (la notification GitHub suffit)
async function envoyerMailSiConfigure(message) {
  try { await envoyerMail(message); } catch (err) { console.warn(`⚠️  E-mail SMTP non envoyé : ${err.message}`); }
}

// ------------------------------------------------------------ programme principal
async function main() {
  if (!URL_PLANNING) throw new Error('Variable PLANNING_URL manquante (secret GitHub).');
  await fs.mkdir(DATA, { recursive: true });

  if (process.env.TEST_EMAIL === 'true') {
    await notifier('✅ Planning Cnam BTP : notification de test', [
      'Les notifications de ton planning Cnam fonctionnent.',
      'Tu recevras un message comme celui-ci dès qu’un cours est ajouté, supprimé, déplacé ou modifié.',
    ]);
    await envoyerMailSiConfigure({
      sujet: '✅ Planning Cnam BTP : e-mail de test',
      html: `<p>Les notifications de ton planning Cnam fonctionnent.</p>${PAGE_URL ? `<p><a href="${PAGE_URL}">Voir le planning</a></p>` : ''}`,
      texte: `Les notifications de ton planning Cnam fonctionnent.\n${PAGE_URL}`,
    });
  }

  const fPlanning = path.join(DATA, 'planning.json');
  const fChanges = path.join(DATA, 'changes.json');
  const ancien = await lireJson(fPlanning, null);
  let historique = await lireJson(fChanges, []);

  const navigateur = await chromium.launch();
  const page = await navigateur.newPage({ locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  let resultat;
  try {
    let derniereErreur;
    for (let essai = 1; essai <= 3 && !resultat; essai++) {
      try {
        resultat = await lirePlanning(page, ancien?.events || []);
      } catch (err) {
        derniereErreur = err;
        console.warn(`Essai ${essai} échoué : ${err.message}`);
        await pause(5000 * essai);
      }
    }
    if (!resultat) {
      // Seulement une capture d'écran : la page HTML pourrait contenir l'adresse privée du planning
      await fs.mkdir(DEBUG, { recursive: true });
      await page.screenshot({ path: path.join(DEBUG, 'page.png'), fullPage: true }).catch(() => {});
      throw derniereErreur;
    }
  } finally {
    await navigateur.close();
  }

  const { debut, fin, incertaines } = resultat;
  let { events } = resultat;
  console.log(`${events.length} créneaux lus du ${debut} au ${fin}`);

  // Semaine restée illisible après 3 essais : on garde la version précédente plutôt que
  // d'annoncer de fausses suppressions (elle sera relue au prochain passage)
  for (const w of incertaines) {
    const anciensSemaine = (ancien?.events || []).filter((e) => e.date >= w.from && e.date <= w.to);
    if (!anciensSemaine.length) continue;
    console.warn(`⚠️  Semaine du ${dateLisible(w.from)} mal lue : on garde la version précédente.`);
    events = events.filter((e) => e.date < w.from || e.date > w.to).concat(anciensSemaine);
  }
  events.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

  // Si le détail d'un cours n'a pas pu être lu, on reprend celui de la version précédente
  const parId = new Map((ancien?.events || []).map((e) => [e.id, e]));
  for (const e of events) {
    const a = parId.get(e.id);
    if (!a || e.teacher) continue;
    for (const k of ['teacher', 'centre', 'category', 'group', 'ue', 'session', 'sessions', 'notes']) {
      if (a[k] !== undefined && e[k] === undefined) e[k] = a[k];
    }
  }

  // Garde-fou : un planning soudain vide est plus probablement une panne du site
  const anciensFuturs = (ancien?.events || []).filter((e) => e.date >= debut && e.date <= fin);
  if (events.length === 0 && anciensFuturs.length > 3) {
    throw new Error('Planning lu vide alors qu’il contenait des cours : on ne touche à rien.');
  }

  // On conserve les cours passés (avant la semaine courante) pour l'historique
  const passes = (ancien?.events || []).filter((e) => e.date < debut);
  const ORDRE = ['id', 'date', 'start', 'end', 'code', 'title', 'type', 'exam', 'room', 'teacher',
    'centre', 'category', 'group', 'ue', 'session', 'sessions', 'notes'];
  const normaliser = (e) => Object.fromEntries(ORDRE.filter((k) => e[k] !== undefined).map((k) => [k, e[k]]));
  const tous = [...passes, ...events].map(normaliser);

  let changes = [];
  if (ancien) {
    const from = ancien.windowStart > debut ? ancien.windowStart : debut;
    const to = ancien.windowEnd < fin ? ancien.windowEnd : fin;
    changes = comparer(ancien.events || [], events, from, to);
  }

  // Un cours annoncé « supprimé » récemment qui réapparaît à l'identique = lecture ratée
  const correction = annulerFaussesSuppressions(changes, historique);
  changes = correction.changes;
  historique = correction.historique;
  const corriges = correction.corriges;
  if (corriges) console.log(`🧹 ${corriges} fausse(s) suppression(s) annulée(s) (cours revenus à l'identique).`);

  const maintenant = new Date().toISOString();
  const identique = ancien && JSON.stringify(ancien.events) === JSON.stringify(tous)
    && ancien.windowStart === debut && ancien.windowEnd === fin;

  if (corriges) await ecrireJson(fChanges, historique.slice(0, 200));

  if (identique) {
    console.log('Aucun changement.');
    return;
  }

  const planning = {
    source: 'Cnam Grand Est',
    updatedAt: maintenant,
    lastChangeAt: changes.length ? maintenant
      : corriges ? (historique[0]?.at || null) : (ancien?.lastChangeAt || null),
    windowStart: debut,
    windowEnd: fin,
    events: tous,
  };
  await ecrireJson(fPlanning, planning);
  await fs.writeFile(path.join(RACINE, 'planning.ics'), genererIcs(tous));

  if (changes.length) {
    historique.unshift({ at: maintenant, changes });
    await ecrireJson(fChanges, historique.slice(0, 200));
    console.log(`🔔 ${changes.length} changement(s) :`);
    for (const c of changes) {
      const e = c.after || c.before;
      console.log(`  - ${c.kind} ${e.code} ${e.title} ${dateLisible(e.date)} ${e.start}`);
    }
    const message = emailChangements(changes, PAGE_URL);
    const n = changes.length;
    await notifier(message.sujet, [`**${n} modification${n > 1 ? 's' : ''}** détectée${n > 1 ? 's' : ''} dans ton planning :`, '', ...lignesChangements(changes)]);
    await envoyerMailSiConfigure(message);
  } else if (!ancien) {
    await ecrireJson(fChanges, historique);
    const nbExamens = events.filter((e) => e.exam).length;
    await notifier('✅ Suivi du planning Cnam BTP activé', [`${events.length} créneaux lus (dont ${nbExamens} examens) du ${dateLisible(debut)} au ${dateLisible(fin)}.`]);
    await envoyerMailSiConfigure({
      sujet: '✅ Suivi du planning Cnam BTP activé',
      html: `<p>Le suivi de ton planning Cnam est en place : <b>${events.length}</b> créneaux lus (dont ${nbExamens} examens) du ${dateLisible(debut)} au ${dateLisible(fin)}.</p><p>Tu recevras un e-mail dès qu'un cours est ajouté, supprimé, déplacé ou modifié.</p>${PAGE_URL ? `<p><a href="${PAGE_URL}">Voir le planning</a></p>` : ''}`,
      texte: `Suivi du planning Cnam BTP activé : ${events.length} créneaux lus.\n${PAGE_URL}`,
    });
  } else {
    console.log(corriges ? 'Planning rétabli, rien à signaler.' : 'Nouvelles semaines ajoutées, pas de modification à signaler.');
  }
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
