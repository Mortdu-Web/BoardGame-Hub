"""Stockage (PostgreSQL, sur une machine distante) des joueurs, parties et scores.

Connexion configurée via le .env : DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD.
Les routes n'appellent que les fonctions ci-dessous : c'est le seul fichier à adapter pour une autre base.
"""
import psycopg
from flask import current_app, g
from psycopg.rows import dict_row

SCHEMA = """
SELECT pg_advisory_xact_lock(727001);  -- évite les courses entre workers gunicorn au démarrage

CREATE TABLE IF NOT EXISTS joueurs (
    id     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    prenom TEXT NOT NULL,
    nom    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS joueurs_nom_prenom_uniq ON joueurs (LOWER(prenom), LOWER(nom));

CREATE TABLE IF NOT EXISTS parties (
    id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    jeu        TEXT NOT NULL,
    nb_joueurs INTEGER NOT NULL CHECK (nb_joueurs >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS joueur_partie (
    joueur_id INTEGER NOT NULL REFERENCES joueurs(id),
    partie_id INTEGER NOT NULL REFERENCES parties(id),
    score     INTEGER NOT NULL,
    PRIMARY KEY (joueur_id, partie_id)
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
    with app.app_context():
        db = get_db()
        db.execute(SCHEMA)
        db.commit()


# ── Joueurs ──────────────────────────────────────────────────────────────────

def get_all_joueurs() -> list[dict]:
    return get_db().execute("SELECT id, prenom, nom FROM joueurs ORDER BY nom, prenom").fetchall()


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

def create_partie_simple(jeu: str, nb_joueurs: int) -> int:
    if nb_joueurs < 1:
        raise ValueError("Le nombre de joueurs doit être supérieur à 0.")
    db = get_db()
    row = db.execute(
        "INSERT INTO parties (jeu, nb_joueurs) VALUES (%s, %s) RETURNING id", (jeu, nb_joueurs)
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

    db = get_db()
    try:
        row = db.execute(
            "INSERT INTO parties (jeu, nb_joueurs) VALUES (%s, %s) RETURNING id",
            (data["jeu"], data["nb_joueurs"]),
        ).fetchone()
        partie_id = row["id"]
        with db.cursor() as cur:
            cur.executemany(
                "INSERT INTO joueur_partie (joueur_id, partie_id, score) VALUES (%s, %s, %s)",
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
           FROM parties p LEFT JOIN joueur_partie jp ON jp.partie_id = p.id
           WHERE p.jeu = %s GROUP BY p.id ORDER BY p.id DESC""",
        (jeu,),
    ).fetchall()


def insert_joueur_partie(joueur_id: int, partie_id: int, score: int) -> None:
    db = get_db()
    partie = db.execute("SELECT nb_joueurs FROM parties WHERE id = %s", (partie_id,)).fetchone()
    if partie is None:
        raise ValueError("Partie introuvable.")
    deja = db.execute(
        "SELECT 1 FROM joueur_partie WHERE joueur_id = %s AND partie_id = %s", (joueur_id, partie_id)
    ).fetchone()
    if deja is None:
        nb = db.execute(
            "SELECT COUNT(*) AS n FROM joueur_partie WHERE partie_id = %s", (partie_id,)
        ).fetchone()["n"]
        if nb >= partie["nb_joueurs"]:
            raise ValueError("Cette partie a déjà tous ses scores.")
    try:
        db.execute(
            """INSERT INTO joueur_partie (joueur_id, partie_id, score) VALUES (%s, %s, %s)
               ON CONFLICT (joueur_id, partie_id) DO UPDATE SET score = EXCLUDED.score""",
            (joueur_id, partie_id, score),
        )
        db.commit()
    except psycopg.errors.IntegrityError as exc:
        db.rollback()
        raise ValueError("Joueur introuvable.") from exc
