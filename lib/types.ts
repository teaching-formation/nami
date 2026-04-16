export interface Activite {
  id: string;
  departement: string;
  numero: string;
  type_dept: string;
  responsable: string;
  rubrique: string;
  activite: string;
  statut: string | null;
  created_at?: string;
  updated_at?: string;
}

export type StatutType = 'Clos' | 'En cours' | 'Ouvert' | 'Non démarré' | null;

export interface Commentaire {
  id: string;
  activite_id: string;
  auteur: string;
  contenu: string;
  created_at: string;
}
