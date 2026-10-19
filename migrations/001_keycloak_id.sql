-- A lancer UNE fois, avec un compte proprietaire de la table `joueurs` (ou superutilisateur).
ALTER TABLE joueurs ADD COLUMN IF NOT EXISTS keycloak_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS joueurs_keycloak_id_uniq ON joueurs (keycloak_id);
