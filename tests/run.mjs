/* Lanceur de tests. Aucune dépendance de test : Node suffit.
   Usage : npm test  */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { sourceModule, racine, extraireScript } from './charger.mjs';

const resultats = [];
const ok = (nom, condition) => resultats.push([nom, condition === true]);

/* ---------- 1. Le fichier est syntaxiquement valide ---------- */
// le module généré doit rester dans le dépôt pour pouvoir résoudre linkedom
const dossier = join(racine, 'tests', '.build');
mkdirSync(dossier, { recursive: true });
const fichierBrut = join(dossier, 'app.mjs');
writeFileSync(fichierBrut, extraireScript());
try {
  execFileSync(process.execPath, ['--check', fichierBrut], { stdio: 'pipe' });
  ok('syntaxe JavaScript valide', true);
} catch (e) {
  ok('syntaxe JavaScript valide', false);
  console.error(String(e.stderr || e));
}

/* ---------- Chargement de l'application ---------- */
const A_TESTER = [
  'renderPrintView', 'renderPvPrint', 'renderQuoteEditor', 'renderSettings',
  'choisirBornes', 'prochainNumero', 'newDoc', 'echeancesDevis', 'pctAcompte', 'db',
];
const fichierModule = join(dossier, 'module.mjs');
writeFileSync(fichierModule, sourceModule(A_TESTER));

let app;
try {
  app = await import('file://' + fichierModule);
  ok("l'application se charge sans erreur", true);
} catch (e) {
  ok("l'application se charge sans erreur", false);
  console.error(e);
  rendreCompte();
  process.exit(1);
}

const {
  renderPrintView, renderPvPrint, renderQuoteEditor, renderSettings,
  choisirBornes, prochainNumero, newDoc, echeancesDevis,
} = app;

/* ---------- Jeu de données de démonstration ----------
   On modifie l'objet db de l'application sur place : le remplacer ne suffirait pas,
   le code de l'application garde sa propre référence. */
const AN = new Date().getFullYear();
const db = app.db;
Object.assign(db, {
  company: {
    name: 'YAS', legalForm: 'EI', city: 'Thaon', siret: '888', tvaRegime: 'franchise',
    cgv: 'Intro.\n\n**1 - UN**\nTexte.', quotePrefix: 'DEV', invoicePrefix: 'FAC',
    nextQuoteNum: 1, nextInvoiceNum: 1,
  },
  clients: [{ id: 'c1', type: 'individual', civility: 'M.', lastName: 'TEST', city: 'Velle' }],
  quotes: [
    { id: 'q1', number: 'DEV-1', date: '2026-01-01', clientId: 'c1', status: 'accepted',
      deposit: 0, endDate: '2026-07-01', lines: [{ quantity: 1, unitPrice: 200, tva: 0, description: 'Travaux' }] },
    { id: 'q2', number: 'DEV-2', date: '2026-02-01', clientId: 'c1', status: 'accepted',
      deposit: 30, attachPv: true, lines: [{ quantity: 1, unitPrice: 500, tva: 0, description: 'Travaux' }] },
  ],
  invoices: [], materials: [], serviceItems: [], attachments: [],
});
const feuilles = () => [...document.getElementById('print').querySelectorAll('.sheet')];
const htmlFeuilles = () => feuilles().map(s => s.innerHTML).join('');

/* ---------- 2. Composition du devis imprimé ---------- */
renderPrintView(db.quotes[0], 'quote');
ok('devis imprimé = 2 pages (devis + CGV)', feuilles().length === 2);
ok('le PV n\'est jamais joint au devis', !feuilles().some(s => s.textContent.includes('Procès-verbal')));

renderPrintView(db.quotes[1], 'quote');
ok('un ancien réglage attachPv reste sans effet',
  feuilles().length === 2 && !feuilles().some(s => s.textContent.includes('Procès-verbal')));

/* ---------- 3. Procès-verbal ---------- */
renderPvPrint(db.quotes[0], 'reception');
ok('PV imprimé seul sur une page',
  feuilles().length === 1 && feuilles()[0].textContent.includes('Procès-verbal de réception'));
ok('le PV porte la date de fin de chantier', feuilles()[0].textContent.includes('01/07/2026'));

/* ---------- 4. Éditeur ---------- */
renderQuoteEditor('q1', 'quote');
const editeur = document.getElementById('main').innerHTML;
ok('la case « joindre le PV » a bien disparu', !editeur.includes('doc-attach-pv'));
ok('l\'éditeur reste fonctionnel', editeur.includes('doc-status') && editeur.includes('doc-deposit'));

/* ---------- 5. Signature de l'entreprise ---------- */
const SIG = 'data:image/png;base64,AAAA';
db.company.signatureImg = SIG;
renderPrintView(db.quotes[0], 'quote');
let h = htmlFeuilles();
ok('signature imprimée sur le devis', h.includes('bp-sign-img') && h.includes(SIG));
ok('le cadre vide entreprise disparaît', (h.match(/bp-sign-space/g) || []).length === 1);
ok('le cadre client reste vide à signer', h.includes('bp-sign-space'));

renderPvPrint(db.quotes[0], 'reception');
h = htmlFeuilles();
ok('signature présente sur le PV de réception',
  h.includes('pv-sign-img') && (h.match(/pv-sign-space/g) || []).length === 1);

renderPvPrint(db.quotes[0], 'levee');
ok('signature présente sur la levée des réserves', htmlFeuilles().includes('pv-sign-img'));

db.company.signatureImg = '';
renderPrintView(db.quotes[0], 'quote');
h = htmlFeuilles();
ok('sans signature enregistrée : deux cadres vides',
  !h.includes('bp-sign-img') && (h.match(/bp-sign-space/g) || []).length === 2);

/* ---------- 6. Écran Paramètres ---------- */
db.company.signatureImg = SIG;
renderSettings();
let reglages = document.getElementById('main').innerHTML;
ok('champ de chargement de la signature présent', reglages.includes('co-sign-file'));
ok('bouton de retrait présent quand une signature existe', reglages.includes('co-sign-remove'));
db.company.signatureImg = '';
renderSettings();
reglages = document.getElementById('main').innerHTML;
ok('pas de bouton de retrait sans signature',
  reglages.includes('co-sign-file') && !reglages.includes('co-sign-remove'));

/* ---------- 7. Mise en page des désignations ---------- */
db.quotes[0].lines = [
  { quantity: 1, unit: 'forfait', unitPrice: 900, tva: 0,
    description: "1. Démolition d'un mur\nComprenant :\n• Démolition complète\n• Évacuation des gravats" },
  { quantity: 9.5, unit: 'm2', unitPrice: 55, tva: 0, description: "Réalisation d'une dalle béton." },
];
renderPrintView(db.quotes[0], 'quote');
const cellules = htmlFeuilles().match(/<td class="bp-desc">[\s\S]*?<\/td>/g).join('');
ok('les sauts de ligne de la désignation sont conservés',
  (cellules.match(/<br>/g) || []).length === 2);
ok('le titre est mis en avant', cellules.includes('bp-desc-t'));
ok('le détail est dans son propre bloc', cellules.includes('bp-desc-s'));
ok('la numérotation saisie est respectée',
  cellules.includes('1. Démolition') && !cellules.includes('1. 1. Démolition'));
ok('numérotation automatique si absente', cellules.includes("2. Réalisation d'une dalle"));
ok('plus de détails collés au titre par une virgule', !cellules.includes(', Comprenant'));

/* ---------- 8. Découpe en pages (mesures réelles d'un devis à 6 lignes) ---------- */
const BLOCS = [
  { haut: 0, bas: 103 }, { haut: 181, bas: 282 }, { haut: 343, bas: 515 },
  { haut: 515, bas: 655 }, { haut: 655, bas: 764 }, { haut: 764, bas: 920 },
  { haut: 920, bas: 1029 }, { haut: 1029, bas: 1059 },
  { haut: 1068, bas: 1474 }, { haut: 1487, bas: 1638 },
];
const bornes = choisirBornes(BLOCS, 1640, 1010);
ok('la première page est remplie, pas de saut immédiat', bornes[1] >= 900);
ok('la coupure tombe sur une frontière de bloc',
  BLOCS.some(b => b.bas === bornes[1] || b.haut === bornes[1]));
ok('aucune coupure au milieu d\'un bloc',
  bornes.every(y => !BLOCS.some(b => y > b.haut + 2 && y < b.bas - 2)));
ok('deux pages suffisent pour ce devis', bornes.length === 3);
ok('la dernière borne va jusqu\'au bas du contenu', bornes[bornes.length - 1] === 1640);
ok('aucune page ne dépasse la hauteur utile',
  bornes.slice(1).every((y, k) => y - bornes[k] <= 1010));
ok('un petit devis tient sur une seule page',
  choisirBornes([{ haut: 0, bas: 400 }], 402, 1010).length === 2);
ok('un bloc plus haut qu\'une page ne bloque pas la découpe',
  choisirBornes([{ haut: 0, bas: 1500 }], 1502, 1010).length >= 3);

/* ---------- 9. Numérotation ---------- */
db.company.quotePrefix = 'DEV'; db.company.invoicePrefix = 'FAC';
db.company.nextQuoteNum = 6; db.company.nextInvoiceNum = 6;
db.quotes = [{ id: 'a', number: `DEV-${AN}-066` }, { id: 'b', number: `DEV-${AN}-068` },
             { id: 'c', number: `DEV-${AN}-067` }];
db.invoices = [{ id: 'i', number: `FAC-${AN}-005-ACOMPTE` }];
ok('le devis suit le plus haut numéro existant', prochainNumero('quote') === 69);
ok('la facture suit le plus haut numéro existant', prochainNumero('invoice') === 6);
ok('le nouveau devis porte le bon numéro', newDoc('quote').number === `DEV-${AN}-069`);
db.quotes = []; db.company.nextQuoteNum = 12;
ok('un compteur plus grand est respecté', prochainNumero('quote') === 12);
db.company.nextQuoteNum = 1;
ok('repart à 1 quand il n\'y a rien', prochainNumero('quote') === 1);
db.quotes = [{ id: 'x', number: 'DEV-2019-090' }];
ok('les années antérieures sont ignorées', prochainNumero('quote') === 1);

/* ---------- 10. Échéancier de facturation ---------- */
const total = (q) => echeancesDevis(q).reduce((s, e) => s + e.montant, 0);
const gros = { deposit: 30, lines: [{ quantity: 1, unitPrice: 10000, tva: 0 }] };
const petit = { deposit: 0, lines: [{ quantity: 1, unitPrice: 200, tva: 0 }] };
ok('sans acompte : une facture unique',
  echeancesDevis(petit).length === 1 && echeancesDevis(petit)[0].stage === 'full');
ok('avec acompte : plusieurs échéances', echeancesDevis(gros).length > 1);
ok('les échéances totalisent exactement le devis', Math.abs(total(gros) - 10000) < 0.005);
ok('la facture unique vaut le total du devis', Math.abs(total(petit) - 200) < 0.005);

/* ---------- Compte rendu ---------- */
function rendreCompte() {
  const echecs = resultats.filter(([, v]) => !v);
  for (const [nom, v] of resultats) console.log(`${v ? '  ok  ' : ' ÉCHEC'} │ ${nom}`);
  console.log('─'.repeat(60));
  console.log(`${resultats.length - echecs.length}/${resultats.length} tests réussis`);
  return echecs.length;
}
process.exit(rendreCompte() === 0 ? 0 : 1);
