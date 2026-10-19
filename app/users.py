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


def list_players() -> list[dict]:
    """[{id, prenom, nom}] : utilisateurs Keycloak si l'auth est active, sinon table joueurs (dev local)."""
    if not Config.AUTH_ENABLED:
        return db.get_all_joueurs()
    try:
        kc_users = _fetch_keycloak_users()
    except (requests.RequestException, ValueError, KeyError):
        current_app.logger.exception("Liste Keycloak indisponible : repli sur les joueurs deja rattaches")
        return db.get_all_joueurs(keycloak_only=True)

    return db.sync_keycloak_users(
        [
            {
                "keycloak_id": u.get("id"),
                "prenom": u.get("firstName") or u.get("username") or "",
                "nom": u.get("lastName") or "",
            }
            for u in kc_users
        ]
    )


def current_joueur() -> dict | None:
    """Joueur correspondant a l'utilisateur connecte (g.user, pose par require_auth), cree si besoin."""
    user = getattr(g, "user", None)
    if not Config.AUTH_ENABLED or not user or not user.get("sub"):
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
