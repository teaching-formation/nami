# Dashboard Cabinet DG · ANSUT

Tableau de bord de suivi des activités — Next.js + Supabase.

## Installation

### 1. Installer les dépendances
```bash
cd ansut-cabinet-dg
npm install
```

### 2. Créer le projet Supabase et exécuter le schéma
1. Aller sur [supabase.com](https://supabase.com) → créer un projet
2. Dans **SQL Editor**, copier-coller et exécuter le contenu de `supabase/schema.sql`

### 3. Configurer les variables d'environnement
Les clés Supabase sont déjà configurées dans `.env.local`. Si vous utilisez un autre projet, remplacez :
```
NEXT_PUBLIC_SUPABASE_URL=votre_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre_clé_anon
```

### 4. Lancer le dashboard
```bash
npm run dev
```
Ouvrir [http://localhost:3000](http://localhost:3000)

### 5. Importer les données Excel
- Dans le dashboard, cliquer sur **↑ Import Excel**
- Charger le fichier `Tableau_de_bord_du_Cabinet_DG_ANSUT.xlsx`
- Les données sont importées dans Supabase

> Alternativement : `node scripts/seed_from_xlsx.js chemin/vers/fichier.xlsx`

## Fonctionnalités
- 4 onglets département (CTs & Experts, PMO, Audit interne, CIQ)
- KPIs, donut chart, barres par responsable
- Filtres statut / responsable
- CRUD complet (ajouter ✏️ / modifier / supprimer 🗑️)
- Import Excel one-shot
- Indicateur de connexion Supabase
