"""Stockage local (SQLite) des joueurs, parties et scores.

Remplace l'ancien `app.core.db.backend.*` du site principal. Si tu utilises une autre base,
c'est le seul fichier à adapter : les routes n'appellent que les fonctions ci-dessous.
"""
import os
import sqlite3

from flask import current_app, g

SCHEMA = """
CREATE TABLE IF NOT EXISTS joueurs (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    prenom TEXT NOT NULL,
    nom    TEXT NOT NULL,
    UNIQUE (prenom COLLATE NOCASE, nom COLLATE NOCASE)
);
CREATE TABLE IF NOT EXISTS parties (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    jeu        TEXT NOT NULL,
    nb_joueurs INTEGER NOT NULL CHECK (nb_joueurs >= 1),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS joueur_partie (
    joueur_id INTEGER NOT NULL REFERENCES joueurs(id),
    partie_id INTEGER NOT NULL REFERENCES parties(id),
    score     INTEGER NOT NULL,
    PRIMARY KEY (joueur_id, partie_id)
);
"""


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(current_app.config["DATABASE"])
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def _close_db(_exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_app(app) -> None:
    path = app.config.get("DATABASE_PATH") or os.path.join(app.instance_path, "gamehub.sqlite3")
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    app.config["DATABASE"] = path
    app.teardown_appcontext(_close_db)
    with app.app_context():
        get_db().executescript(SCHEMA)


# ── Joueurs ──────────────────────────────────────────────────────────────────

def get_all_joueurs() -> list[dict]:
    rows = get_db().execute("SELECT id, prenom, nom FROM joueurs ORDER BY nom, prenom").fetchall()
    return [dict(r) for r in rows]


def joueur_exists(prenom: str, nom: str) -> bool:
    row = get_db().execute(
        "SELECT 1 FROM joueurs WHERE prenom = ? COLLATE NOCASE AND nom = ? COLLATE NOCASE",
        (prenom, nom),
    ).fetchone()
    return row is not None


def create_joueur(prenom: str, nom: str) -> int:
    db = get_db()
    cur = db.execute("INSERT INTO joueurs (prenom, nom) VALUES (?, ?)", (prenom, nom))
    db.commit()
    return cur.lastrowid


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
    cur = db.execute("INSERT INTO parties (jeu, nb_joueurs) VALUES (?, ?)", (jeu, nb_joueurs))
    db.commit()
    return cur.lastrowid


def create_partie(data: dict) -> int:
    """data = {"jeu": str, "nb_joueurs": int, "scores": {joueur_id: score}}"""
    scores = data.get("scores", {})
    if any(jid is None for jid in scores):
        raise ValueError("Sélectionnez un joueur dans chaque colonne avant d'envoyer.")
    if len(scores) != data.get("nb_joueurs"):
        raise ValueError("Le même joueur est sélectionné dans plusieurs colonnes.")

    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO parties (jeu, nb_joueurs) VALUES (?, ?)", (data["jeu"], data["nb_joueurs"])
        )
        partie_id = cur.lastrowid
        db.executemany(
            "INSERT INTO joueur_partie (joueur_id, partie_id, score) VALUES (?, ?, ?)",
            [(jid, partie_id, int(score)) for jid, score in scores.items()],
        )
        db.commit()
    except sqlite3.IntegrityError as exc:
        db.rollback()
        raise ValueError("Joueur inconnu ou doublon dans la partie.") from exc
    return partie_id


def get_parties_by_jeu(jeu: str) -> list[dict]:
    rows = get_db().execute(
        """SELECT p.id, p.nb_joueurs, COUNT(jp.joueur_id) AS nb_scores
           FROM parties p LEFT JOIN joueur_partie jp ON jp.partie_id = p.id
           WHERE p.jeu = ? GROUP BY p.id ORDER BY p.id DESC""",
        (jeu,),
    ).fetchall()
    return [dict(r) for r in rows]


def insert_joueur_partie(joueur_id: int, partie_id: int, score: int) -> None:
    db = get_db()
    partie = db.execute("SELECT nb_joueurs FROM parties WHERE id = ?", (partie_id,)).fetchone()
    if partie is None:
        raise ValueError("Partie introuvable.")
    deja = db.execute(
        "SELECT 1 FROM joueur_partie WHERE joueur_id = ? AND partie_id = ?", (joueur_id, partie_id)
    ).fetchone()
    if deja is None:
        nb = db.execute(
            "SELECT COUNT(*) FROM joueur_partie WHERE partie_id = ?", (partie_id,)
        ).fetchone()[0]
        if nb >= partie["nb_joueurs"]:
            raise ValueError("Cette partie a déjà tous ses scores.")
    try:
        db.execute(
            "INSERT OR REPLACE INTO joueur_partie (joueur_id, partie_id, score) VALUES (?, ?, ?)",
            (joueur_id, partie_id, score),
        )
        db.commit()
    except sqlite3.IntegrityError as exc:
        db.rollback()
        raise ValueError("Joueur introuvable.") from exc
