"""Joueurs = utilisateurs Keycloak (via le service d'auth), rattaches a la table `joueurs`."""
import requests
from flask import current_app, g, request

from . import db
from .config import Config


def _fetch_keycloak_users() -> list[dict]:
    """Interroge GET <AUTH_INTERNAL_URL>/api/users en transmettant la session de l'utilisateur."""
    headers = {h: request.headers[h] for h in ("Cookie", "Authorization") if request.headers.get(h)}
    resp = requests.get(f"{Config.AUTH_INTERNAL_URL}/api/users", headers=headers, timeout=5)
    resp.raise_for_status()
    return resp.json()["users"]


def _is_generic(username: str | None) -> bool:
    return bool(Config.AUTH_GENERIC_USERNAME) and (username or "").strip().lower() == Config.AUTH_GENERIC_USERNAME


def _generic_entry(kc_users: list[dict] | None = None) -> dict | None:
    """Entree du compte generique dans la liste : id None + generic True.

    Selectionner cette entree ouvre le choix d'un joueur parmi ceux de « jeux ».
    """
    if not Config.AUTH_GENERIC_USERNAME:
        return None
    for u in kc_users or []:
        if _is_generic(u.get("username")):
            prenom = u.get("firstName") or u.get("username") or Config.AUTH_GENERIC_USERNAME
            return {"id": None, "generic": True, "prenom": prenom, "nom": u.get("lastName") or ""}
    return {"id": None, "generic": True, "prenom": Config.AUTH_GENERIC_USERNAME.capitalize(), "nom": ""}


def list_players() -> list[dict]:
    """Liste des comptes proposes dans les selects de joueurs.

    [{id, prenom, nom}] pour chaque utilisateur Keycloak, plus une entree {id: None, generic: True, ...}
    pour le compte generique « jeux » (ses joueurs sont obtenus via list_guests()).

    Sans auth (dev local) ou si Keycloak est injoignable : joueurs deja rattaches a un compte Keycloak en base.
    """
    kc_users: list[dict] | None = None
    comptes: list[dict]
    if Config.AUTH_ENABLED:
        try:
            kc_users = _fetch_keycloak_users()
        except (requests.RequestException, ValueError, KeyError):
            current_app.logger.exception("Liste Keycloak indisponible : repli sur les comptes deja connus en base")

    if kc_users is None:
        comptes = db.get_all_joueurs(keycloak_only=True)
    else:
        comptes = db.sync_keycloak_users(
            [
                {
                    "keycloak_id": u.get("id"),
                    "prenom": u.get("firstName") or u.get("username") or "",
                    "nom": u.get("lastName") or "",
                }
                for u in kc_users
                if not _is_generic(u.get("username"))
            ]
        )
    comptes = sorted(comptes, key=lambda j: ((j["nom"] or "").lower(), (j["prenom"] or "").lower()))
    generic = _generic_entry(kc_users)
    return comptes + ([generic] if generic else [])


def list_guests() -> list[dict]:
    """Joueurs du compte generique « jeux » (sans compte Keycloak propre)."""
    return db.get_guest_joueurs()


def create_guest(prenom: str, nom: str) -> tuple[dict | None, str | None]:
    return db.add_guest_player(prenom, nom)


def current_account() -> dict:
    """{generic: bool, joueur: {id, prenom, nom} | None} pour l'utilisateur connecte.

    generic=True : compte « jeux », qui choisit/cree ses joueurs a la main (joueur = None).
    """
    user = getattr(g, "user", None)
    generic = bool(Config.AUTH_ENABLED and user and _is_generic(user.get("username")))
    return {"generic": generic, "joueur": None if generic else current_joueur()}


def current_joueur() -> dict | None:
    """Joueur correspondant a l'utilisateur connecte (g.user, pose par require_auth), cree si besoin."""
    user = getattr(g, "user", None)
    if not Config.AUTH_ENABLED or not user or not user.get("sub"):
        return None
    if _is_generic(user.get("username")):  # compte partage : le joueur est choisi a la main
        return None

    joueur = db.get_joueur_by_keycloak_id(user["sub"])
    if joueur:
        return joueur

    prenom, nom = user.get("given_name"), user.get("family_name")
    if not (prenom or nom):  # sessions ouvertes avant l'ajout de given_name/family_name
        parts = (user.get("name") or "").split(None, 1)
        prenom = parts[0] if parts else (user.get("username") or "")
        nom = parts[1] if len(parts) > 1 else ""
    res = db.sync_keycloak_users([{"keycloak_id": user["sub"], "prenom": prenom or "", "nom": nom or ""}])
    return res[0] if res else None
