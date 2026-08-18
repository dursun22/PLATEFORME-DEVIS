/* Charge l'application dans un DOM simulé pour pouvoir la tester hors navigateur.
   On extrait le <script type="module"> de index.html, on retire ses imports Firebase
   et on les remplace par des doublures : aucun appel réseau, aucune donnée réelle. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseHTML } from 'linkedom';

const ici = dirname(fileURLToPath(import.meta.url));
export const racine = join(ici, '..');

export function extraireScript() {
  const html = readFileSync(join(racine, 'index.html'), 'utf8');
  const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  if (!m) throw new Error("Impossible de trouver le <script type=module> dans index.html");
  return m[1].replace(/^\s*import .*$/gm, '');
}

/* Doublures : le DOM de linkedom ne fait pas de mise en page (pas de hauteurs),
   ce qui suffit pour tester la logique, jamais le rendu visuel. */
const PRELUDE = `
import { parseHTML as __ph } from 'linkedom';
const { document: __doc } = __ph(
  '<!DOCTYPE html><html><body><div class="print-view" id="print"></div><main id="main"></main></body></html>');
globalThis.document = __doc;
globalThis.window = { addEventListener(){}, print(){}, location:{hash:''} };
__doc.addEventListener = () => {};
const __gbi = __doc.getElementById.bind(__doc);
__doc.getElementById = (id) => __gbi(id) || __doc.createElement('div');
globalThis.location = { hash:'#/devis' };
globalThis.Image = class { set src(v){} };
globalThis.URL = { createObjectURL:()=>'blob:x', revokeObjectURL(){} };
globalThis.initializeApp=()=>({}); globalThis.getAuth=()=>({}); globalThis.getFirestore=()=>({});
globalThis.onAuthStateChanged=()=>{};
globalThis.alert=()=>{}; globalThis.confirm=()=>true;
globalThis.setDoc=async()=>{}; globalThis.deleteDoc=async()=>{}; globalThis.doc=()=>({});
globalThis.dbFs={};
`;

/* Construit un module exécutable : prélude + code de l'app + export des fonctions à tester. */
export function sourceModule(exports) {
  const noms = exports.join(', ');
  return PRELUDE + extraireScript() + `\nexport { ${noms} };\n`;
}
