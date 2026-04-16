-- Table activites
CREATE TABLE IF NOT EXISTS activites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  departement  TEXT NOT NULL,
  numero       TEXT NOT NULL,
  type_dept    TEXT,
  responsable  TEXT,
  rubrique     TEXT,
  activite     TEXT,
  statut       TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER activites_updated_at
  BEFORE UPDATE ON activites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE activites ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all ON activites FOR ALL USING (true) WITH CHECK (true);

-- Index utiles
CREATE INDEX IF NOT EXISTS idx_activites_departement ON activites(departement);
CREATE INDEX IF NOT EXISTS idx_activites_responsable ON activites(responsable);
CREATE INDEX IF NOT EXISTS idx_activites_statut ON activites(statut);

-- ─────────────────────────────────────────
-- Table commentaires
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commentaires (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activite_id UUID NOT NULL REFERENCES activites(id) ON DELETE CASCADE,
  auteur      TEXT NOT NULL,
  contenu     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE commentaires ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all_commentaires ON commentaires FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_commentaires_activite ON commentaires(activite_id);
