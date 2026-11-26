// Fonctions utilitaires : dates, analyse du détail, comparaison, calendrier .ics, e-mail
import crypto from 'node:crypto';

// ---------------------------------------------------------------- dates
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

export function sansAccents(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function moisFr(txt) {
  const m = sansAccents(txt).toLowerCase().replace(/\./g, '');
  if (m.startsWith('ja')) return 1;
  if (m.startsWith('fe')) return 2;
  if (m.startsWith('mar')) return 3;
  if (m.startsWith('av')) return 4;
  if (m.startsWith('mai')) return 5;
  if (m.startsWith('juin')) return 6;
  if (m.startsWith('juil')) return 7;
  if (m.startsWith('ao')) return 8;
  if (m.startsWith('se')) return 9;
  if (m.startsWith('oc')) return 10;
  if (m.startsWith('no')) return 11;
  if (m.startsWith('de')) return 12;
  return null;
}

export const iso = (d) => d.toISOString().slice(0, 10);
export const ajouterJours = (d, n) => new Date(d.getTime() + n * 86400000);

/** "Planning du 28 déc. 2026 au 3 janv. 2027" -> date de fin (UTC minuit) */
export function finDeSemaine(range) {
  const m = (range || '').match(/au\s+(\d{1,2})\s+([^\s\d]+)\s+(\d{4})/i);
  if (!m) return null;
  const mois = moisFr(m[2]);
  if (!mois) return null;
  return new Date(Date.UTC(+m[3], mois - 1, +m[1]));
}

/** "lundi 16" + date de fin de semaine -> "2026-11-16" */
export function dateDuJour(labelJour, fin) {
  const m = sansAccents(labelJour || '').toLowerCase().match(/([a-z]+)\s+(\d{1,2})/);
  if (!m || !fin) return null;
  const jour = JOURS.indexOf(m[1]);
  const num = +m[2];
  for (let i = 0; i < 14; i++) {
    const d = ajouterJours(fin, -i);
    if (d.getUTCDate() === num && (jour < 0 || d.getUTCDay() === jour)) return iso(d);
  }
  return null;
}

export const heure = (h) => {
  const m = (h || '').match(/(\d{1,2})[:h](\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
};

// ---------------------------------------------------------------- ligne du planning
export function analyserLigne(row, fin) {
  const t = (row.time || '').match(/(\d{1,2}[:h]\d{2})\s*à\s*(\d{1,2}[:h]\d{2})/);
  const lien = (row.linkText || '').trim();
  let code = lien, titre = '';
  const sep = lien.match(/^(\S+)\s+-\s+(.+)$/);
  if (sep) { code = sep[1]; titre = sep[2].trim(); }
  const type = (row.typeText || '').replace(/^\(|\)$/g, '').trim() || 'Cours';
  return {
    date: dateDuJour(row.day, fin),
    start: t ? heure(t[1]) : '',
    end: t ? heure(t[2]) : '',
    code,
    title: titre,
    type,
    exam: /examen|contr[oô]le|partiel|soutenance/i.test(type),
    room: (row.room || '').trim(),
    _evt: row.evt,
  };
}

// ---------------------------------------------------------------- page de détail
export function analyserDetail(lignes, entete = []) {
  const L = lignes.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = {};
  const reDate = /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+(\d{1,2})\s+(\S+)\s+(\d{4})\s+de\s+(\d{1,2}[:h]\d{2})\s+à\s+(\d{1,2}[:h]\d{2})/i;
  const iDate = L.findIndex((l) => reDate.test(l));
  if (iDate < 0) return null;
  const m = L[iDate].match(reDate);
  const mois = moisFr(m[3]);
  if (mois) out.date = `${m[4]}-${String(mois).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  out.start = heure(m[5]);
  out.end = heure(m[6]);

  const iGroupe = L.findIndex((l) => /\d{4}\/\d{4}/.test(l));
  if (iGroupe >= 0) {
    const g = L[iGroupe].match(/^(\S+)\s+(.+)$/);
    out.group = g ? g[2] : L[iGroupe];
  }
  // Catégorie (Cours, Contrôle continu, ...) : ligne juste avant la date
  if (iDate > 0 && iDate - 1 !== iGroupe && !/cnam/i.test(L[iDate - 1])) out.category = L[iDate - 1];

  const notes = [];
  for (let i = iDate + 1; i < L.length; i++) {
    const l = L[i];
    if (/^S[ée]ance\s*n/i.test(l) || /^Prochaines s[ée]ances/i.test(l) || /^Assistance$/i.test(l)) break;
    let mm;
    if ((mm = l.match(/^Salle\s+(.+)$/i))) {
      const salle = mm[1];
      const c = salle.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
      out.roomFull = (c ? c[1] : salle).trim();
      if (c) out.centre = c[2].trim();
    } else if ((mm = l.match(/^Enseignants?\s*:\s*(.+)$/i))) {
      out.teacher = mm[1].trim();
    } else {
      notes.push(l);
    }
  }
  if (notes.length) out.notes = notes.join(' · ');
  const s = L.join(' ').match(/S[ée]ance\s*n\s*°?\s*(\d+)\s*\/\s*(\d+)/i);
  if (s) { out.session = +s[1]; out.sessions = +s[2]; }
  const e = entete.map((x) => x.trim()).filter(Boolean);
  if (e.length > 1) out.ue = e.slice(0, -1).join(' · ');
  return out;
}

// ---------------------------------------------------------------- identifiants
export function attribuerIds(events) {
  const vus = new Map();
  for (const e of events) {
    const base = `${e.date}T${e.start}|${e.code}|${e.title}`;
    const n = (vus.get(base) || 0) + 1;
    vus.set(base, n);
    e.id = n > 1 ? `${base}#${n}` : base;
  }
  return events;
}

// ---------------------------------------------------------------- comparaison
const CHAMPS = [
  // [clé, libellé, strict] : strict = un champ vide d'un côté compte comme un changement
  ['end', 'Heure de fin', true],
  ['room', 'Salle', true],
  ['type', 'Type', true],
  ['teacher', 'Enseignant', false],
  ['centre', 'Centre', false],
  ['notes', 'Remarque', false],
];

const resume = (e) => e && ({
  id: e.id, date: e.date, start: e.start, end: e.end, code: e.code, title: e.title,
  type: e.type, room: e.room, teacher: e.teacher || '', exam: !!e.exam,
});

function champsModifies(a, b) {
  const f = [];
  for (const [k, label, strict] of CHAMPS) {
    const va = (a[k] || '').toString(), vb = (b[k] || '').toString();
    if (va === vb) continue;
    if (!strict && (!va || !vb)) continue;
    f.push({ field: k, label, old: va, new: vb });
  }
  return f;
}

/**
 * Compare deux listes d'évènements sur la période [from, to].
 * Renvoie une liste de changements : added / removed / moved / modified.
 */
export function comparer(anciens, nouveaux, from, to) {
  const dans = (e) => e.date >= from && e.date <= to;
  const A = anciens.filter(dans), N = nouveaux.filter(dans);
  const mA = new Map(A.map((e) => [e.id, e]));
  const mN = new Map(N.map((e) => [e.id, e]));
  const changes = [];

  for (const [id, n] of mN) {
    const a = mA.get(id);
    if (!a) continue;
    const f = champsModifies(a, n);
    if (f.length) changes.push({ kind: 'modified', before: resume(a), after: resume(n), fields: f });
  }

  const supprimes = A.filter((e) => !mN.has(e.id));
  const ajoutes = N.filter((e) => !mA.has(e.id));

  // Un cours supprimé + un cours ajouté de la même matière = un déplacement
  const matiere = (e) => `${e.code}|${e.title}|${e.exam}`;
  const ecart = (x, y) => Math.abs(Date.parse(`${x.date}T${x.start}`) - Date.parse(`${y.date}T${y.start}`));
  for (const s of supprimes) {
    const candidats = ajoutes.filter((a) => matiere(a) === matiere(s)).sort((x, y) => ecart(x, s) - ecart(y, s));
    if (!candidats.length) { changes.push({ kind: 'removed', before: resume(s) }); continue; }
    const a = candidats[0];
    ajoutes.splice(ajoutes.indexOf(a), 1);
    const f = [];
    if (a.date !== s.date) f.push({ field: 'date', label: 'Date', old: dateLisible(s.date), new: dateLisible(a.date) });
    if (a.start !== s.start) f.push({ field: 'start', label: 'Heure de début', old: s.start, new: a.start });
    f.push(...champsModifies(s, a));
    changes.push({ kind: 'moved', before: resume(s), after: resume(a), fields: f });
  }
  for (const a of ajoutes) changes.push({ kind: 'added', after: resume(a) });

  const cle = (c) => (c.after || c.before).date + (c.after || c.before).start;
  return changes.sort((x, y) => cle(x).localeCompare(cle(y)));
}

// Un cours annoncé « supprimé » ces 7 derniers jours qui réapparaît à l'identique : c'était une
// lecture ratée du site. On efface la fausse suppression de l'historique au lieu d'annoncer un « ajout ».
export function annulerFaussesSuppressions(changes, historique, maintenant = Date.now()) {
  const limite = maintenant - 7 * 86400000;
  const pareil = (x, y) => ['date', 'start', 'end', 'code', 'title', 'room'].every((k) => (x[k] ?? '') === (y[k] ?? ''));
  const hist = historique.map((h) => ({ ...h, changes: [...h.changes] }));
  let corriges = 0;
  const restants = changes.filter((c) => {
    if (c.kind !== 'added') return true;
    for (const h of hist) {
      if (Date.parse(h.at) < limite) break;   // historique rangé du plus récent au plus ancien
      const i = h.changes.findIndex((x) => x.kind === 'removed' && pareil(x.before, c.after));
      if (i >= 0) { h.changes.splice(i, 1); corriges++; return false; }
    }
    return true;
  });
  return { changes: restants, historique: corriges ? hist.filter((h) => h.changes.length) : historique, corriges };
}

// ---------------------------------------------------------------- calendrier .ics
const VTIMEZONE = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/Paris',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST',
  'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET',
  'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE',
];

const echapper = (s) => (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

function plier(ligne) {
  const out = [];
  let buf = Buffer.from(ligne, 'utf8');
  let premier = true;
  while (buf.length > (premier ? 75 : 74)) {
    let n = premier ? 75 : 74;
    while ((buf[n] & 0xc0) === 0x80) n--; // ne pas couper un caractère UTF-8
    out.push((premier ? '' : ' ') + buf.subarray(0, n).toString('utf8'));
    buf = buf.subarray(n);
    premier = false;
  }
  out.push((premier ? '' : ' ') + buf.toString('utf8'));
  return out.join('\r\n');
}

export function genererIcs(events) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//planning-cnam//FR', 'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH', 'X-WR-CALNAME:Planning Cnam BTP', 'X-WR-TIMEZONE:Europe/Paris',
    'REFRESH-INTERVAL;VALUE=DURATION:PT2H', ...VTIMEZONE];
  for (const e of events) {
    const d = e.date.replace(/-/g, '');
    const uid = crypto.createHash('sha1').update(e.id).digest('hex').slice(0, 20);
    const titre = `${e.exam ? '📝 ' : ''}${e.code}${e.title ? ' – ' + e.title : ''}${e.exam ? ' (' + e.type + ')' : ''}`;
    const desc = [
      `Type : ${e.type}`,
      e.teacher && `Enseignant : ${e.teacher}`,
      e.session && `Séance ${e.session}/${e.sessions}`,
      e.ue && `UE : ${e.ue}`,
      e.notes && e.notes,
    ].filter(Boolean).join('\n');
    L.push('BEGIN:VEVENT', `UID:${uid}@planning-cnam-btp`, `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Europe/Paris:${d}T${e.start.replace(':', '')}00`,
      `DTEND;TZID=Europe/Paris:${d}T${e.end.replace(':', '')}00`,
      `SUMMARY:${echapper(titre)}`,
      `LOCATION:${echapper([e.room, e.centre].filter(Boolean).join(' – '))}`,
      `DESCRIPTION:${echapper(desc)}`,
      'END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(plier).join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------- e-mail
const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export function dateLisible(isoDate) {
  const d = new Date(isoDate + 'T00:00:00Z');
  return `${JOURS_COURTS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS_COURTS[d.getUTCMonth()]}`;
}

const esc = (s) => (s || '').toString().replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nomCours = (e) => `${e.code}${e.title ? ' – ' + e.title : ''}${e.exam ? ' (' + e.type + ')' : ''}`;
const quand = (e) => `${dateLisible(e.date)} · ${e.start}–${e.end}`;

const STYLE = {
  added: ['#0f7b46', '#e7f6ee', 'Ajouté'],
  removed: ['#b42318', '#fdecea', 'Supprimé'],
  moved: ['#9a5b00', '#fff4e0', 'Déplacé'],
  modified: ['#1d4ed8', '#e8efff', 'Modifié'],
};

export function emailChangements(changes, pageUrl) {
  const lignes = changes.map((c) => {
    const [col, bg, lib] = STYLE[c.kind];
    const e = c.after || c.before;
    let detail = '';
    if (c.kind === 'added') detail = `${esc(quand(e))} · ${esc(e.room)}`;
    if (c.kind === 'removed') detail = `<s>${esc(quand(e))} · ${esc(e.room)}</s>`;
    if (c.kind === 'moved') detail = `<s style="color:#8a8a8a">${esc(quand(c.before))} · ${esc(c.before.room)}</s><br>➜ <b>${esc(quand(c.after))} · ${esc(c.after.room)}</b>`;
    if (c.kind === 'modified') detail = `${esc(quand(e))}<br>` + c.fields.map((f) =>
      `${esc(f.label)} : <s style="color:#8a8a8a">${esc(f.old || '—')}</s> ➜ <b>${esc(f.new || '—')}</b>`).join('<br>');
    return `<tr><td style="padding:12px 14px;border-bottom:1px solid #eee;vertical-align:top;width:92px">
      <span style="display:inline-block;padding:3px 9px;border-radius:99px;background:${bg};color:${col};font-size:12px;font-weight:700">${lib}</span></td>
      <td style="padding:12px 14px;border-bottom:1px solid #eee;font-size:14px;line-height:1.5;color:#1d1d1f">
      <div style="font-weight:700">${esc(nomCours(e))}</div><div style="color:#444">${detail}</div></td></tr>`;
  }).join('');
  const n = changes.length;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f5f5f7;padding:24px">
  <div style="max-width:620px;margin:auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e5e5ea">
    <div style="background:#c1002a;color:#fff;padding:18px 22px">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.85">Planning Cnam BTP</div>
      <div style="font-size:20px;font-weight:700;margin-top:4px">${n} modification${n > 1 ? 's' : ''} détectée${n > 1 ? 's' : ''}</div>
    </div>
    <table style="width:100%;border-collapse:collapse">${lignes}</table>
    ${pageUrl ? `<div style="padding:18px 22px"><a href="${esc(pageUrl)}" style="display:inline-block;background:#1d1d1f;color:#fff;text-decoration:none;padding:10px 16px;border-radius:9px;font-weight:600;font-size:14px">Voir mon planning</a></div>` : ''}
  </div></div>`;
  const texte = changes.map((c) => {
    const e = c.after || c.before;
    const lib = STYLE[c.kind][2].toUpperCase();
    if (c.kind === 'moved') return `${lib} : ${nomCours(e)} — ${quand(c.before)} (${c.before.room}) -> ${quand(c.after)} (${c.after.room})`;
    if (c.kind === 'modified') return `${lib} : ${nomCours(e)} — ${quand(e)} — ` + c.fields.map((f) => `${f.label} : ${f.old || '—'} -> ${f.new || '—'}`).join(' ; ');
    return `${lib} : ${nomCours(e)} — ${quand(e)} (${e.room})`;
  }).join('\n') + (pageUrl ? `\n\nVoir le planning : ${pageUrl}` : '');
  const premier = changes[0].after || changes[0].before;
  const sujet = `📅 Planning Cnam BTP : ${n} modification${n > 1 ? 's' : ''} (${premier.code} ${dateLisible(premier.date)}${n > 1 ? '…' : ''})`;
  return { sujet, html, texte };
}

export async function envoyerMail({ sujet, html, texte }) {
  const { SMTP_USER, SMTP_PASS, MAIL_TO, SMTP_HOST, SMTP_PORT } = process.env;
  if (!SMTP_USER || !SMTP_PASS) {
    console.warn('⚠️  SMTP_USER / SMTP_PASS absents : e-mail non envoyé.');
    return false;
  }
  const nodemailer = (await import('nodemailer')).default;
  const transport = nodemailer.createTransport({
    host: SMTP_HOST || 'smtp.gmail.com',
    port: +(SMTP_PORT || 465),
    secure: +(SMTP_PORT || 465) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  // Destinataire visible : l'expéditeur lui-même. Tous les autres sont en copie cachée (Cci),
  // pour que personne ne voie les adresses des autres.
  const moi = SMTP_USER.toLowerCase();
  const cci = [...new Set((MAIL_TO || '').split(/[,;\s]+/).map((a) => a.trim().toLowerCase()).filter(Boolean))]
    .filter((a) => a !== moi);
  await transport.sendMail({
    from: `"Planning Cnam BTP (ne pas répondre)" <${SMTP_USER}>`,
    to: SMTP_USER,
    bcc: cci,
    subject: sujet, html, text: texte,
  });
  // Les journaux du dépôt public sont visibles par tous : on n'y écrit pas les adresses.
  console.log(`✉️  E-mail envoyé (1 destinataire + ${cci.length} en copie cachée)`);
  return true;
}
