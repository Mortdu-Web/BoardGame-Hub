"""Stockage (PostgreSQL, sur une machine distante) des joueurs, parties et scores.

Connexion configurée via le .env : DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD.
Les routes n'appellent que les fonctions ci-dessous : c'est le seul fichier à adapter pour une autre base.
"""
import psycopg
from flask import current_app, g
from psycopg.rows import dict_row

SCHEMA = """
SELECT pg_advisory_xact_lock(727001);  -- evite les courses entre workers gunicorn au demarrage

CREATE TABLE IF NOT EXISTS jeux (
    id                 SERIAL PRIMARY KEY,
    name               VARCHAR(50),
    victoire_score_max BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS joueurs (
    id          SERIAL PRIMARY KEY,
    prenom      VARCHAR(100) NOT NULL,
    nom         VARCHAR(100) NOT NULL,
    keycloak_id TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS parties (
    id         SERIAL PRIMARY KEY,
    jeu_id     INTEGER NOT NULL REFERENCES jeux(id) ON DELETE CASCADE,
    date       DATE NOT NULL DEFAULT CURRENT_DATE,
    nb_joueurs INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS joueurs_partie (
    id        SERIAL PRIMARY KEY,
    joueur_id INTEGER NOT NULL REFERENCES joueurs(id) ON DELETE CASCADE,
    partie_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    score     INTEGER NOT NULL
);
"""


def _connect() -> psycopg.Connection:
    cfg = current_app.config
    return psycopg.connect(
        host=cfg["DB_HOST"],
        port=cfg["DB_PORT"],
        dbname=cfg["DB_NAME"],
        user=cfg["DB_USER"],
        password=cfg["DB_PASSWORD"],
        row_factory=dict_row,
        connect_timeout=10,
        client_encoding="UTF8",
    )


def get_db() -> psycopg.Connection:
    if "db" not in g:
        g.db = _connect()
    return g.db


def _close_db(_exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_app(app) -> None:
    missing = [k for k in ("DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD") if not app.config.get(k)]
    if missing:
        raise RuntimeError(f"Variables manquantes dans le .env : {', '.join(missing)}")

    app.teardown_appcontext(_close_db)

    # Les tables existent deja sur le serveur : on ne les cree que si DB_AUTO_CREATE=true
    # (base vide). Cette operation exige les droits CREATE sur le schema public.
    if app.config.get("DB_AUTO_CREATE"):
        with app.app_context():
            db = get_db()
            db.execute(SCHEMA)
            db.commit()


# ── Joueurs ──────────────────────────────────────────────────────────────────

def get_all_joueurs(keycloak_only: bool = False) -> list[dict]:
    sql = "SELECT id, prenom, nom FROM joueurs"
    if keycloak_only:
        sql += " WHERE keycloak_id IS NOT NULL"
    return get_db().execute(sql + " ORDER BY nom, prenom").fetchall()


def get_joueur_by_keycloak_id(keycloak_id: str) -> dict | None:
    return get_db().execute(
        "SELECT id, prenom, nom FROM joueurs WHERE keycloak_id = %s", (keycloak_id,)
    ).fetchone()


def sync_keycloak_users(users: list[dict]) -> list[dict]:
    """users = [{"keycloak_id", "prenom", "nom"}].

    Retourne [{"id", "prenom", "nom"}] ou `id` est joueurs.id (les scores restent lies a cette table).
    Un utilisateur Keycloak inconnu est rattache au joueur existant de meme prenom/nom (sans compte lie),
    sinon un joueur est cree.
    """
    users = [u for u in users if u.get("keycloak_id")]
    if not users:
        return []
    ids = [u["keycloak_id"] for u in users]
    db = get_db()
    connus = {
        r["keycloak_id"]
        for r in db.execute("SELECT keycloak_id FROM joueurs WHERE keycloak_id = ANY(%s)", (ids,)).fetchall()
    }
    try:
        for u in users:
            if u["keycloak_id"] in connus:
                continue
            prenom, nom = (u.get("prenom") or "").strip(), (u.get("nom") or "").strip()
            rattache = db.execute(
                """UPDATE joueurs SET keycloak_id = %s
                   WHERE id = (SELECT id FROM joueurs
                               WHERE keycloak_id IS NULL
                                 AND LOWER(prenom) = LOWER(%s) AND LOWER(nom) = LOWER(%s)
                               ORDER BY id LIMIT 1)
                   RETURNING id""",
                (u["keycloak_id"], prenom, nom),
            ).fetchone()
            if rattache is None:
                db.execute(
                    "INSERT INTO joueurs (prenom, nom, keycloak_id) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                    (prenom, nom, u["keycloak_id"]),
                )
        db.commit()
    except psycopg.Error:
        db.rollback()
        raise
    return db.execute(
        "SELECT id, prenom, nom FROM joueurs WHERE keycloak_id = ANY(%s) ORDER BY nom, prenom", (ids,)
    ).fetchall()


def joueur_exists(prenom: str, nom: str) -> bool:
    row = get_db().execute(
        "SELECT 1 FROM joueurs WHERE LOWER(prenom) = LOWER(%s) AND LOWER(nom) = LOWER(%s)",
        (prenom, nom),
    ).fetchone()
    return row is not None


def create_joueur(prenom: str, nom: str) -> int:
    db = get_db()
    row = db.execute(
        "INSERT INTO joueurs (prenom, nom) VALUES (%s, %s) RETURNING id", (prenom, nom)
    ).fetchone()
    db.commit()
    return row["id"]


def add_new_player(nom: str, prenom: str) -> tuple[bool, str | None]:
    """Utilisé par le formulaire « Nouveau joueur ». Retourne (succès, message d'erreur)."""
    prenom, nom = prenom.strip(), nom.strip()
    if not prenom or not nom:
        return False, "Le prénom et le nom sont requis."
    if joueur_exists(prenom, nom):
        return False, "Ce joueur existe déjà."
    create_joueur(prenom, nom)
    return True, None


# ── Parties & scores ─────────────────────────────────────────────────────────

def _jeu_id(jeu: str) -> int:
    """id dans `jeux` ; nom compare sans casse ni espaces ("trainMexicain" = "Train Mexicain")."""
    row = get_db().execute(
        """SELECT id FROM jeux
           WHERE LOWER(REPLACE(name, ' ', '')) = LOWER(REPLACE(%s, ' ', ''))
           ORDER BY id LIMIT 1""",
        (jeu,),
    ).fetchone()
    if row is None:
        raise ValueError(f"Jeu inconnu dans la base : {jeu!r}.")
    return row["id"]


def create_partie_simple(jeu: str, nb_joueurs: int) -> int:
    if nb_joueurs < 1:
        raise ValueError("Le nombre de joueurs doit être supérieur à 0.")
    db = get_db()
    row = db.execute(
        "INSERT INTO parties (jeu_id, nb_joueurs) VALUES (%s, %s) RETURNING id",
        (_jeu_id(jeu), nb_joueurs),
    ).fetchone()
    db.commit()
    return row["id"]


def create_partie(data: dict) -> int:
    """data = {"jeu": str, "nb_joueurs": int, "scores": {joueur_id: score}}"""
    scores = data.get("scores", {})
    if any(jid is None for jid in scores):
        raise ValueError("Sélectionnez un joueur dans chaque colonne avant d'envoyer.")
    if len(scores) != data.get("nb_joueurs"):
        raise ValueError("Le même joueur est sélectionné dans plusieurs colonnes.")
    try:
        lignes = [(int(jid), int(score)) for jid, score in scores.items()]
    except (TypeError, ValueError) as exc:
        raise ValueError("Identifiant de joueur ou score invalide.") from exc

    jeu_id = _jeu_id(data["jeu"])
    db = get_db()
    try:
        row = db.execute(
            "INSERT INTO parties (jeu_id, nb_joueurs) VALUES (%s, %s) RETURNING id",
            (jeu_id, data["nb_joueurs"]),
        ).fetchone()
        partie_id = row["id"]
        with db.cursor() as cur:
            cur.executemany(
                "INSERT INTO joueurs_partie (joueur_id, partie_id, score) VALUES (%s, %s, %s)",
                [(jid, partie_id, score) for jid, score in lignes],
            )
        db.commit()
    except psycopg.errors.IntegrityError as exc:
        db.rollback()
        raise ValueError("Joueur inconnu ou doublon dans la partie.") from exc
    return partie_id


def get_parties_by_jeu(jeu: str) -> list[dict]:
    return get_db().execute(
        """SELECT p.id, p.nb_joueurs, COUNT(jp.joueur_id) AS nb_scores
           FROM parties p
           JOIN jeux j ON j.id = p.jeu_id
           LEFT JOIN joueurs_partie jp ON jp.partie_id = p.id
           WHERE LOWER(REPLACE(j.name, ' ', '')) = LOWER(REPLACE(%s, ' ', ''))
           GROUP BY p.id ORDER BY p.id DESC""",
        (jeu,),
    ).fetchall()


def insert_joueur_partie(joueur_id: int, partie_id: int, score: int) -> None:
    db = get_db()
    partie = db.execute("SELECT nb_joueurs FROM parties WHERE id = %s", (partie_id,)).fetchone()
    if partie is None:
        raise ValueError("Partie introuvable.")
    deja = db.execute(
        "SELECT id FROM joueurs_partie WHERE joueur_id = %s AND partie_id = %s", (joueur_id, partie_id)
    ).fetchone()
    try:
        if deja is not None:  # pas de contrainte d'unicite en base : on met a jour la ligne existante
            db.execute("UPDATE joueurs_partie SET score = %s WHERE id = %s", (score, deja["id"]))
        else:
            nb = db.execute(
                "SELECT COUNT(*) AS n FROM joueurs_partie WHERE partie_id = %s", (partie_id,)
            ).fetchone()["n"]
            if nb >= partie["nb_joueurs"]:
                raise ValueError("Cette partie a déjà tous ses scores.")
            db.execute(
                "INSERT INTO joueurs_partie (joueur_id, partie_id, score) VALUES (%s, %s, %s)",
                (joueur_id, partie_id, score),
            )
        db.commit()
    except psycopg.errors.IntegrityError as exc:
        db.rollback()
        raise ValueError("Joueur introuvable.") from exc