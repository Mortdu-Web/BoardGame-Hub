"""Stockage (PostgreSQL) des joueurs, parties et scores : schéma `games` + personnes `core.persons`.

REMPLACANT DIRECT de l'ancien fichier : mêmes fonctions, mêmes paramètres, mêmes retours (clés `prenom` / `nom`),
même init_app(app). Fichier autonome (psycopg, psycopg_pool, Flask).

Modèle : un compte Keycloak personnel = une personne « soi-même » ; le compte partagé prédéfini (« jeux » par
défaut) gère tous les joueurs invités. Les identifiants de joueurs / parties / jeux sont ceux de l'ancienne base.

Nouveautés côté .env (toutes optionnelles) :
  DB_USER              : rôle PROPRE à ce service (svc_games, voir sql/003_login_roles.sql)
  DB_SSLMODE           : « require » par défaut ; « verify-full » + DB_SSLROOTCERT en production
  DB_LINK_LEGACY       : « true » seulement pendant la bascule (rattachement par prénom / nom)
  GAMES_SHARED_ACCOUNT : nom du compte Keycloak partagé qui gère les invités (défaut « jeux »)
Plus de DB_AUTO_CREATE : les tables sont créées par sql/001_schema.sql, avec le propriétaire.

Qui est l'auteur d'une partie ? Les fonctions n'ont pas de paramètre « utilisateur » (compatibilité) : l'auteur
est `g.account_id` si vos routes le posent via set_current_account(user_id), sinon le compte partagé.
Poser set_current_account() dans un before_request permet d'attribuer chaque partie à son vrai auteur ;
seul cet auteur pourra alors corriger un score déjà saisi.
"""
import atexit
import re
from contextlib import contextmanager

import psycopg
from flask import current_app, g
from psycopg.conninfo import make_conninfo
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

_EXT_KEY = "hub_db_pool"
_GUEST_KEY = "hub_guest_account_id"
_REQUIRED = ("games.games", "games.matches", "games.scores", "core.persons", "core.accounts")
_BAD_INPUT = (psycopg.errors.UniqueViolation, psycopg.errors.InvalidTextRepresentation,
              psycopg.errors.InvalidParameterValue)


# ── Connexion / pool ─────────────────────────────────────────────────────────

def init_app(app) -> None:
    """Ouvre le pool, vérifie la base et le compte partagé. Lève RuntimeError au moindre problème.

    Un pool par worker gunicorn, créé ici : ne pas lancer gunicorn avec --preload.
    """
    cfg = app.config
    missing = [k for k in ("DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD") if not cfg.get(k)]
    if missing:
        raise RuntimeError(f"Variables manquantes dans le .env : {', '.join(missing)}")

    conninfo = make_conninfo(
        host=cfg["DB_HOST"],
        port=cfg.get("DB_PORT") or 5432,
        dbname=cfg["DB_NAME"],
        user=cfg["DB_USER"],
        password=cfg["DB_PASSWORD"],
        connect_timeout=10,
        client_encoding="UTF8",
        sslmode=cfg.get("DB_SSLMODE") or "require",
        sslrootcert=cfg.get("DB_SSLROOTCERT") or None,
        options="-c statement_timeout=10000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=15000",
    )
    try:
        psycopg.connect(conninfo).close()
    except psycopg.Error as exc:
        raise RuntimeError(
            f"[DB] Connexion impossible à {cfg['DB_HOST']}:{cfg.get('DB_PORT') or 5432} "
            f"(base « {cfg['DB_NAME']} », utilisateur « {cfg['DB_USER']} ») : {exc}"
        ) from exc

    pool = ConnectionPool(
        conninfo,
        min_size=cfg.get("DB_POOL_MIN") or 1,
        max_size=cfg.get("DB_POOL_MAX") or 5,
        kwargs={"row_factory": dict_row},
        check=ConnectionPool.check_connection,
        timeout=10,
        name="hub-games",
        open=True,
    )
    try:
        problems = []
        with pool.connection() as conn:
            for t in _REQUIRED:
                row = conn.execute(
                    "SELECT to_regclass(%s) IS NOT NULL AS ok, "
                    "COALESCE(has_table_privilege(to_regclass(%s), 'SELECT'), false) AS can_read", (t, t)
                ).fetchone()
                if not row["ok"]:
                    problems.append(f"table {t} introuvable (sql/001_schema.sql appliqué ?)")
                elif not row["can_read"]:
                    problems.append(f"pas de droit SELECT sur {t} (DB_USER rattaché à app_games ?)")
            shared = cfg.get("GAMES_SHARED_ACCOUNT") or "jeux"
            guest = conn.execute(
                "SELECT id FROM core.accounts WHERE lower(username) = lower(%s) AND kind = 'shared' AND is_active",
                (shared,),
            ).fetchone() if not problems else None
            if not problems and guest is None:
                problems.append(f"compte partagé « {shared} » introuvable (kind = 'shared', voir 002_migrate_legacy.sql)")
        if problems:
            raise RuntimeError("[DB] Base non prête : " + " ; ".join(problems))
    except Exception:
        pool.close()
        raise
    app.extensions[_EXT_KEY] = pool
    app.extensions[_GUEST_KEY] = guest["id"]
    atexit.register(pool.close)


@contextmanager
def _session(account_id: int | None = None, *, readonly: bool = False):
    """Curseur dans une transaction (commit / rollback / retour au pool automatiques).

    `account_id` est posé pour la durée de la transaction : c'est lui que la RLS utilise pour filtrer.
    """
    with current_app.extensions[_EXT_KEY].connection() as conn:
        with conn.cursor() as cur:
            if readonly:
                cur.execute("SET TRANSACTION READ ONLY")  # doit être la première instruction
            cur.execute("SELECT set_config('app.account_id', %s, true)",
                        ("" if account_id is None else str(int(account_id)),))
            yield cur


def set_current_account(user_id: int | None) -> None:
    """Optionnel : à appeler dans un before_request une fois l'utilisateur identifié (voir l'en-tête)."""
    g.account_id = user_id


def _guest_account() -> int:
    return current_app.extensions[_GUEST_KEY]


def _actor() -> int:
    return g.get("account_id") or _guest_account()


# ── Joueurs ──────────────────────────────────────────────────────────────────

def get_all_joueurs(keycloak_only: bool = False) -> list[dict]:
    """[{id, prenom, nom}]. keycloak_only : uniquement les joueurs liés à un compte (pas les invités)."""
    where = "WHERE is_self" if keycloak_only else ""
    with _session(g.get("account_id"), readonly=True) as cur:
        cur.execute(f"SELECT id, first_name AS prenom, last_name AS nom FROM core.persons {where} "
                    "ORDER BY last_name, first_name")
        return cur.fetchall()


def get_guest_joueurs() -> list[dict]:
    """Joueurs sans compte Keycloak (invités, gérés par le compte partagé)."""
    with _session(g.get("account_id"), readonly=True) as cur:
        cur.execute("SELECT id, first_name AS prenom, last_name AS nom FROM core.persons "
                    "WHERE NOT is_self ORDER BY last_name, first_name")
        return cur.fetchall()


def get_joueur_by_keycloak_id(keycloak_id: str) -> dict | None:
    try:
        with _session(readonly=True) as cur:
            cur.execute(
                """SELECT p.id, p.first_name AS prenom, p.last_name AS nom
                   FROM core.persons p
                   WHERE p.is_self AND p.account_id = core.account_id_by_sub(%s::uuid)""",
                (keycloak_id,),
            )
            return cur.fetchone()
    except psycopg.errors.InvalidTextRepresentation:  # pas un UUID
        return None


def sync_keycloak_users(users: list[dict]) -> list[dict]:
    """users = [{"keycloak_id", "prenom", "nom", "username"?}] -> [{"id", "prenom", "nom"}] (id = joueurs.id).

    Un utilisateur Keycloak inconnu obtient un compte et sa personne « soi-même ». Passer si possible
    `username` (nom d'utilisateur Keycloak) : à défaut, « prenom.nom » en minuscules est utilisé.
    Un utilisateur dont le sub est invalide, ou dont le nom est déjà pris par un autre compte, est ignoré.
    """
    users = [u for u in users if u.get("keycloak_id")]
    if not users:
        return []
    link = bool(current_app.config.get("DB_LINK_LEGACY"))
    account_ids: list[int] = []
    for u in users:
        sub = u["keycloak_id"]
        prenom, nom = (u.get("prenom") or "").strip(), (u.get("nom") or "").strip()
        username = (u.get("username") or f"{prenom}.{nom}".replace(" ", "").lower()).strip()
        try:
            with _session() as cur:
                cur.execute("SELECT core.account_id_by_sub(%s::uuid) AS id", (sub,))
                aid = cur.fetchone()["id"]
                if aid is None:  # inconnu : création (les comptes connus ne sont pas retouchés)
                    cur.execute("SELECT core.sync_account(%s::uuid, %s, %s, %s, %s) AS id",
                                (sub, username, prenom, nom, link))
                    aid = cur.fetchone()["id"]
        except _BAD_INPUT:
            continue
        if aid is not None:
            account_ids.append(aid)
    if not account_ids:
        return []
    with _session(readonly=True) as cur:
        cur.execute(
            """SELECT id, first_name AS prenom, last_name AS nom FROM core.persons
               WHERE is_self AND account_id = ANY(%s) ORDER BY last_name, first_name""",
            (account_ids,),
        )
        return cur.fetchall()


def joueur_exists(prenom: str, nom: str) -> bool:
    with _session(g.get("account_id"), readonly=True) as cur:
        cur.execute("SELECT 1 FROM core.persons WHERE lower(first_name) = lower(%s) AND lower(last_name) = lower(%s)",
                    (prenom, nom))
        return cur.fetchone() is not None


def create_joueur(prenom: str, nom: str) -> int:
    """Crée un joueur invité géré par le compte partagé. ValueError s'il existe déjà ou si les noms sont invalides."""
    try:
        with _session(_guest_account()) as cur:
            cur.execute("INSERT INTO core.persons (account_id, first_name, last_name) VALUES (%s, %s, %s) RETURNING id",
                        (_guest_account(), prenom, nom))
            return cur.fetchone()["id"]
    except psycopg.errors.UniqueViolation as exc:
        raise ValueError("Ce joueur existe déjà.") from exc
    except psycopg.errors.CheckViolation as exc:
        raise ValueError("Prénom ou nom invalide (1 à 100 caractères).") from exc


def add_guest_player(prenom: str, nom: str) -> tuple[dict | None, str | None]:
    """Crée un joueur invité du compte partagé « jeux ».

    Retourne (joueur, None) en cas de succès, (None, message d'erreur) sinon.
    """
    prenom, nom = (prenom or "").strip(), (nom or "").strip()
    if not prenom or not nom:
        return None, "Le prénom et le nom sont requis."
    try:
        return {"id": create_joueur(prenom, nom), "prenom": prenom, "nom": nom}, None
    except ValueError as exc:
        return None, str(exc)


# ── Parties & scores ─────────────────────────────────────────────────────────

def _jeu_id(cur, jeu: str) -> int:
    """id dans `games.games` ; nom comparé sans casse ni caractères spéciaux (« trainMexicain » = « Train Mexicain »)."""
    cur.execute("SELECT id FROM games.games WHERE slug = %s AND is_active", (re.sub(r"[^a-z0-9]", "", (jeu or "").lower()),))
    row = cur.fetchone()
    if row is None:
        raise ValueError(f"Jeu inconnu dans la base : {jeu!r}.")
    return row["id"]


def create_partie_simple(jeu: str, nb_joueurs: int) -> int:
    if nb_joueurs < 1:
        raise ValueError("Le nombre de joueurs doit être supérieur à 0.")
    actor = _actor()
    try:
        with _session(actor) as cur:
            cur.execute("INSERT INTO games.matches (game_id, player_count, created_by) VALUES (%s, %s, %s) RETURNING id",
                        (_jeu_id(cur, jeu), nb_joueurs, actor))
            return cur.fetchone()["id"]
    except psycopg.errors.CheckViolation as exc:
        raise ValueError("Le nombre de joueurs doit être compris entre 1 et 20.") from exc


def create_partie(data: dict) -> int:
    """data = {"jeu": str, "nb_joueurs": int, "scores": {joueur_id: score}}. Tout ou rien (une transaction)."""
    scores = data.get("scores", {})
    if any(jid is None for jid in scores):
        raise ValueError("Sélectionnez un joueur dans chaque colonne avant d'envoyer.")
    if len(scores) != data.get("nb_joueurs"):
        raise ValueError("Le même joueur est sélectionné dans plusieurs colonnes.")
    try:
        lignes = [(int(jid), int(score)) for jid, score in scores.items()]
    except (TypeError, ValueError) as exc:
        raise ValueError("Identifiant de joueur ou score invalide.") from exc

    actor = _actor()
    try:
        with _session(actor) as cur:
            cur.execute("INSERT INTO games.matches (game_id, player_count, created_by) VALUES (%s, %s, %s) RETURNING id",
                        (_jeu_id(cur, data["jeu"]), data["nb_joueurs"], actor))
            partie_id = cur.fetchone()["id"]
            cur.executemany("INSERT INTO games.scores (match_id, person_id, score) VALUES (%s, %s, %s)",
                            [(partie_id, jid, score) for jid, score in lignes])
    except psycopg.errors.IntegrityError as exc:  # joueur inconnu, doublon, nombre de joueurs invalide
        raise ValueError("Joueur inconnu ou doublon dans la partie.") from exc
    return partie_id


def get_parties_by_jeu(jeu: str, incompletes_only: bool = False) -> list[dict]:
    """Parties d'un jeu. incompletes_only=True : exclut celles qui ont déjà tous leurs scores (3/3, 2/2...)."""
    having = "HAVING COUNT(s.person_id) < m.player_count" if incompletes_only else ""
    with _session(g.get("account_id"), readonly=True) as cur:
        cur.execute(
            f"""SELECT m.id, m.player_count AS nb_joueurs, COUNT(s.person_id) AS nb_scores
                FROM games.matches m
                JOIN games.games gm ON gm.id = m.game_id
                LEFT JOIN games.scores s ON s.match_id = m.id
                WHERE gm.slug = %s
                GROUP BY m.id {having}
                ORDER BY m.id DESC""",
            (re.sub(r"[^a-z0-9]", "", (jeu or "").lower()),),
        )
        return cur.fetchall()


def insert_joueur_partie(joueur_id: int, partie_id: int, score: int) -> None:
    """Ajoute le score d'un joueur, ou le corrige s'il existe déjà (créateur de la partie uniquement)."""
    actor = _actor()
    try:
        with _session(actor) as cur:
            cur.execute("SELECT 1 FROM games.matches WHERE id = %s", (partie_id,))
            if cur.fetchone() is None:
                raise ValueError("Partie introuvable.")
            cur.execute(
                """INSERT INTO games.scores (match_id, person_id, score) VALUES (%s, %s, %s)
                   ON CONFLICT (match_id, person_id) DO UPDATE SET score = EXCLUDED.score""",
                (partie_id, joueur_id, int(score)),
            )
    except psycopg.errors.InsufficientPrivilege as exc:
        raise ValueError("Seul le créateur de la partie peut modifier un score existant.") from exc
    except psycopg.errors.CheckViolation as exc:
        raise ValueError("Cette partie a déjà tous ses scores.") from exc
    except psycopg.errors.ForeignKeyViolation as exc:
        raise ValueError("Joueur introuvable.") from exc
