#!/usr/bin/env node
// Usage: node scripts/seed_from_xlsx.js path/to/fichier.xlsx

const path = require('path');
const fs = require('fs');

// Lire .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  });
}

const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Variables NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY manquantes');
  process.exit(1);
}

const xlsxPath = process.argv[2];
if (!xlsxPath) {
  console.error('Usage: node scripts/seed_from_xlsx.js chemin/vers/fichier.xlsx');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function normalizeStatut(v) {
  if (!v || v === 'null' || v.toLowerCase() === 'nan') return null;
  const u = v.trim().toLowerCase();
  if (u === 'clos' || u === 'clôturé') return 'Clos';
  if (u.includes('cours')) return 'En cours';
  if (u === 'ouvert') return 'Ouvert';
  if ((u.includes('non') && u.includes('démarré')) || u.includes('demarre')) return 'Non démarré';
  if (v.length > 30) return null;
  return v.trim();
}

async function main() {
  console.log(`\n📂 Lecture de ${xlsxPath}…`);
  const wb = XLSX.readFile(xlsxPath);
  const allRows = [];
  const summary = {};

  wb.SheetNames.forEach(sheetName => {
    const ws = wb.Sheets[sheetName];
    const rawArr = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    let headerRow = -1;
    for (let i = 0; i < rawArr.length; i++) {
      if (rawArr[i]?.some(c => String(c || '').trim() === 'N°')) { headerRow = i; break; }
    }
    if (headerRow < 0) { console.log(`  ⚠️  Feuille "${sheetName}" : en-tête N° non trouvé, ignorée`); return; }

    const headers = rawArr[headerRow].map(h => String(h || '').trim());
    let lastDept = '', lastResp = '';
    let count = 0;

    for (let i = headerRow + 1; i < rawArr.length; i++) {
      const row = rawArr[i]; if (!row) continue;
      const obj = {}; headers.forEach((h, idx) => { obj[h] = row[idx] != null ? String(row[idx]) : null; });
      const n = String(obj['N°'] || '').trim(); if (!n || n === 'nan') continue;
      const dept = String(obj['CT / DEPARTEMENT / SERVICE'] || '').trim();
      const resp = String(obj['RESPONSABLE'] || '').trim();
      if (dept && dept !== 'nan') lastDept = dept;
      if (resp && resp !== 'nan') lastResp = resp;
      allRows.push({
        id: require('crypto').randomUUID(),
        departement: sheetName,
        numero: n,
        type_dept: lastDept,
        responsable: lastResp,
        rubrique: String(obj['RUBRIQUE'] || '').trim(),
        activite: String(obj['ACTIVITES'] || '').trim(),
        statut: normalizeStatut(String(obj['STATUT'] || '')),
      });
      count++;
    }
    summary[sheetName] = count;
  });

  console.log('\n📊 Résumé du parsing :');
  Object.entries(summary).forEach(([k, v]) => console.log(`   ${k}: ${v} lignes`));
  console.log(`   Total: ${allRows.length} lignes\n`);

  // Vider la table
  console.log('🗑️  Vidage de la table activites…');
  const { error: delErr } = await supabase.from('activites').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delErr) { console.error('❌ Erreur suppression :', delErr.message); process.exit(1); }

  // Insérer par batch
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < allRows.length; i += BATCH) {
    const batch = allRows.slice(i, i + BATCH);
    const { error } = await supabase.from('activites').insert(batch);
    if (error) { console.error(`❌ Erreur insertion batch ${i}-${i+BATCH} :`, error.message); process.exit(1); }
    inserted += batch.length;
    process.stdout.write(`\r✓ ${inserted}/${allRows.length} lignes insérées…`);
  }
  console.log(`\n\n✅ Import terminé — ${inserted} activités dans Supabase\n`);
}

main().catch(err => { console.error('❌ Erreur fatale :', err); process.exit(1); });
