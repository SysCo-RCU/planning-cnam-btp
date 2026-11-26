// Mini-serveur de la page Planning Cnam (Google Apps Script, déployé en « Application Web »).
//
// SONDAGES
// - Liste les sondages (GET).
// - Crée un sondage (POST {a:'creer', question, detail, options[], fin, auteur, cle}).
// - Supprime un sondage (POST {a:'supprimer', id, cle}) : SEUL l'appareil qui l'a créé
//   peut le supprimer. La « cle » est un code aléatoire gardé sur le téléphone du créateur ;
//   le serveur n'en garde que l'empreinte (SHA-256) et la vérifie avant de supprimer.
// Les sondages sont gardés dans les « Propriétés du script » (Paramètres du projet).
// Les sondages terminés depuis plus de 7 jours sont effacés automatiquement.
//
// DOCUMENTS DE LA PROMO
// - Liste les documents (GET ?docs=1) : fichiers du dossier Drive « Planning Cnam BTP – Documents de la promo ».
// - Dépose un document (POST {a:'deposer', code, nom, type, b64, auteur, cle}) : il faut le code
//   de la promo. Seule son empreinte est gardée, dans la propriété du script « docs_code ».
// - Retire un document (POST {a:'retirer', id, cle}) : seul l'appareil qui l'a déposé
//   (il est mis à la corbeille du Drive, récupérable 30 jours).
// Pour changer le code : remplacer « docs_code » par l'empreinte SHA-256 du nouveau code (en minuscules).
// Pour retirer un document à la main : le supprimer directement dans le dossier Drive.
// Limites : 20 Mo par fichier, 300 fichiers et 2 Go au total. Pas de macros (.xlsm) ni d'archives (.zip, .rar, .7z).
// Accès Drive limité aux fichiers créés par ce script (autorisation « drive.file », voir appsscript.json).
const PREFIXE = 'p_';
const MAX_OUVERTS = 30;          // sondages ouverts en même temps, au total
const MAX_PAR_PERSONNE = 5;      // sondages ouverts par appareil
const MAX_CREATIONS_HEURE = 5;   // créations par appareil et par heure

const DOCS_DOSSIER = 'Planning Cnam BTP – Documents de la promo';
const DOCS_MAX_OCTETS = 20 * 1024 * 1024;   // 20 Mo par fichier
const DOCS_MAX_FICHIERS = 300;              // fichiers dans le dossier, au total
const DOCS_MAX_TOTAL = 2 * 1024 * 1024 * 1024; // 2 Go au total dans le dossier
const DOCS_MAX_HEURE = 15;                  // dépôts par appareil et par heure
const DOCS_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'txt', 'csv', 'md',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'py', 'm', 'ipynb', 'mat', 'dwg', 'dxf', 'step', 'stp'];

function doGet(e) {
  if (e && e.parameter && e.parameter.docs) return repondre(listerDocs());
  return repondre(lister());
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return repondre({ ok: false, erreur: 'json' }); }
  const verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  try {
    if (d.a === 'creer') return repondre(creer(d));
    if (d.a === 'supprimer') return repondre(supprimer(d));
    if (d.a === 'deposer') return repondre(deposer(d));
    if (d.a === 'retirer') return repondre(retirer(d));
    return repondre({ ok: false, erreur: 'action' });
  } finally {
    verrou.releaseLock();
  }
}

function repondre(objet) {
  return ContentService.createTextOutput(JSON.stringify(objet)).setMimeType(ContentService.MimeType.JSON);
}

function empreinte(texte) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texte, Utilities.Charset.UTF_8)
    .map(function (b) { return ((b + 256) % 256).toString(16).padStart(2, '0'); }).join('');
}

function texte(v, max) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}

// ---------------------------------------------------------------- sondages
function tous() {
  const p = PropertiesService.getScriptProperties().getProperties();
  return Object.keys(p).filter(function (k) { return k.indexOf(PREFIXE) === 0; }).map(function (k) {
    try { return JSON.parse(p[k]); } catch (err) { return null; }
  }).filter(Boolean);
}

function lister() {
  const maintenant = Date.now();
  const props = PropertiesService.getScriptProperties();
  const liste = [];
  tous().forEach(function (s) {
    if (Date.parse(s.fin) < maintenant - 7 * 864e5) { props.deleteProperty(PREFIXE + s.id); return; }
    liste.push({ id: s.id, question: s.question, detail: s.detail || '', options: s.options, fin: s.fin, cree: s.cree, auteur: s.auteur || '' });
  });
  liste.sort(function (a, b) { return b.cree.localeCompare(a.cree); });
  return { ok: true, sondages: liste };
}

function creer(d) {
  const cle = String(d.cle || '');
  if (!/^[0-9a-f]{32,64}$/.test(cle)) return { ok: false, erreur: 'cle' };
  const question = texte(d.question, 140);
  if (question.length < 3) return { ok: false, erreur: 'question' };
  const options = (Array.isArray(d.options) ? d.options : []).map(function (o) { return texte(o, 60); }).filter(Boolean).slice(0, 6);
  const uniques = {};
  options.forEach(function (o) { uniques[o.toLowerCase()] = 1; });
  if (options.length < 2 || Object.keys(uniques).length !== options.length) return { ok: false, erreur: 'options' };
  const maintenant = Date.now(), fin = Date.parse(d.fin);
  if (!(fin > maintenant + 30 * 60e3 && fin < maintenant + 31 * 864e5)) return { ok: false, erreur: 'fin' };

  const h = empreinte(cle);
  const ouverts = tous().filter(function (s) { return Date.parse(s.fin) > maintenant; });
  if (ouverts.length >= MAX_OUVERTS) return { ok: false, erreur: 'plein' };
  if (ouverts.filter(function (s) { return s.proprio === h; }).length >= MAX_PAR_PERSONNE) return { ok: false, erreur: 'trop' };
  const cache = CacheService.getScriptCache(), cleCache = 'n_' + h.slice(0, 24);
  const n = Number(cache.get(cleCache) || 0);
  if (n >= MAX_CREATIONS_HEURE) return { ok: false, erreur: 'vite' };
  cache.put(cleCache, String(n + 1), 3600);

  const id = 'u' + maintenant.toString(36) + Math.random().toString(36).slice(2, 6);
  const sondage = {
    id: id, question: question, detail: texte(d.detail, 120), options: options,
    fin: new Date(fin).toISOString(), cree: new Date(maintenant).toISOString(),
    auteur: texte(d.auteur, 30), proprio: h,
  };
  PropertiesService.getScriptProperties().setProperty(PREFIXE + id, JSON.stringify(sondage));
  return { ok: true, id: id };
}

function supprimer(d) {
  const id = texte(d.id, 40);
  const props = PropertiesService.getScriptProperties();
  const brut = props.getProperty(PREFIXE + id);
  if (!brut) return { ok: true, deja: true };
  const s = JSON.parse(brut);
  if (empreinte(String(d.cle || '')) !== s.proprio) return { ok: false, erreur: 'interdit' };
  props.deleteProperty(PREFIXE + id);
  return { ok: true };
}

// ---------------------------------------------------------------- documents de la promo
// Service avancé « Drive » (API v3) : il fonctionne avec l'accès limité « drive.file »,
// c'est-à-dire aux seuls fichiers et dossiers créés par ce script.
function dossierDocs() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('docs_dossier');
  if (id) {
    try { const f = Drive.Files.get(id, { fields: 'id,trashed' }); if (!f.trashed) return f.id; } catch (err) { }  // dossier introuvable : recréé plus bas
  }
  const dossier = Drive.Files.create({ name: DOCS_DOSSIER, mimeType: 'application/vnd.google-apps.folder' }, null, { fields: 'id' });
  props.setProperty('docs_dossier', dossier.id);
  return dossier.id;
}

function metaDoc(description) {
  try { return JSON.parse(description || '{}') || {}; } catch (err) { return {}; }
}

// tous les fichiers (non supprimés) du dossier
function fichiersDocs(dossierId) {
  const liste = [];
  let page;
  do {
    const r = Drive.Files.list({
      q: "'" + dossierId + "' in parents and trashed = false",
      fields: 'nextPageToken,files(id,name,size,mimeType,createdTime,description,webViewLink)',
      pageSize: 1000, pageToken: page,
    });
    (r.files || []).forEach(function (f) { liste.push(f); });
    page = r.nextPageToken;
  } while (page);
  return liste;
}

function listerDocs() {
  const liste = fichiersDocs(dossierDocs()).map(function (f) {
    return {
      id: f.id, nom: f.name, taille: Number(f.size) || 0, type: f.mimeType,
      date: f.createdTime, auteur: metaDoc(f.description).auteur || '', lien: f.webViewLink,
    };
  });
  liste.sort(function (a, b) { return b.date.localeCompare(a.date); });
  const actif = !!PropertiesService.getScriptProperties().getProperty('docs_code');
  return { ok: true, actif: actif, max: DOCS_MAX_OCTETS, documents: liste };
}

function deposer(d) {
  const codeH = PropertiesService.getScriptProperties().getProperty('docs_code');
  if (!codeH) return { ok: false, erreur: 'ferme' };
  if (empreinte(String(d.code || '').trim().toLowerCase()) !== codeH) return { ok: false, erreur: 'code' };
  const cle = String(d.cle || '');
  if (!/^[0-9a-f]{32,64}$/.test(cle)) return { ok: false, erreur: 'cle' };
  const nom = texte(d.nom, 120).replace(/[\\/:*?"<>|]/g, '_');
  const m = nom.match(/\.([a-z0-9]{1,5})$/i);
  if (!m || DOCS_EXT.indexOf(m[1].toLowerCase()) < 0) return { ok: false, erreur: 'type' };
  const b64 = String(d.b64 || '');
  if (!b64 || b64.length > Math.ceil(DOCS_MAX_OCTETS / 3) * 4 + 8) return { ok: false, erreur: 'taille' };

  const h = empreinte(cle);
  const cache = CacheService.getScriptCache(), cleCache = 'd_' + h.slice(0, 24);
  const n = Number(cache.get(cleCache) || 0);
  if (n >= DOCS_MAX_HEURE) return { ok: false, erreur: 'vite' };
  const dossierId = dossierDocs();
  const existants = fichiersDocs(dossierId);
  const octetsTotal = existants.reduce(function (s, f) { return s + (Number(f.size) || 0); }, 0);
  const estimation = Math.floor(b64.length * 3 / 4);
  if (existants.length >= DOCS_MAX_FICHIERS || octetsTotal + estimation > DOCS_MAX_TOTAL) return { ok: false, erreur: 'plein' };

  let octets;
  try { octets = Utilities.base64Decode(b64); } catch (err) { return { ok: false, erreur: 'fichier' }; }
  if (!octets.length || octets.length > DOCS_MAX_OCTETS) return { ok: false, erreur: 'taille' };
  cache.put(cleCache, String(n + 1), 3600);

  const type = texte(d.type, 100) || 'application/octet-stream';
  const f = Drive.Files.create({
    name: nom, parents: [dossierId], mimeType: type,
    description: JSON.stringify({ proprio: h, auteur: texte(d.auteur, 30) }),
  }, Utilities.newBlob(octets, type, nom), { fields: 'id' });
  Drive.Permissions.create({ role: 'reader', type: 'anyone' }, f.id);
  return { ok: true, id: f.id };
}

function retirer(d) {
  const id = texte(d.id, 80);
  let f;
  try { f = Drive.Files.get(id, { fields: 'id,trashed,parents,description' }); } catch (err) { return { ok: true, deja: true }; }
  if (f.trashed) return { ok: true, deja: true };
  const dossierId = PropertiesService.getScriptProperties().getProperty('docs_dossier');
  if ((f.parents || []).indexOf(dossierId) < 0) return { ok: false, erreur: 'interdit' };
  const meta = metaDoc(f.description);
  if (!meta.proprio || empreinte(String(d.cle || '')) !== meta.proprio) return { ok: false, erreur: 'interdit' };
  Drive.Files.update({ trashed: true }, id);
  return { ok: true };
}

// À lancer une fois depuis l'éditeur (bouton « Exécuter ») : crée le dossier et demande l'autorisation Drive.
function preparerDocuments() {
  const id = dossierDocs();
  Logger.log('Dossier des documents : https://drive.google.com/drive/folders/' + id);
}
