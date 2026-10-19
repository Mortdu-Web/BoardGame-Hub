from flask import render_template, request, jsonify
from app import users
from app.helpers import make_blueprint, require_auth

from app.db import (
    create_joueur,
    create_partie_simple,
    get_parties_by_jeu,
    joueur_exists,
)

from .backend.submit import submit_score

bp = make_blueprint("tresFute", __name__, __file__)

# Nom du jeu tel qu'enregistré dans la table `parties` (colonne `jeu`).
NOM_JEU = "Très Futé"


@bp.route("/")
@require_auth()
def page():
    return render_template(bp.get_templates_path("tresFute.html"))


@bp.route("/game")
@require_auth()
def tresFute_game():
    return render_template(bp.get_templates_path("tresFuteGame.html"))


# ═══════════════════════════════════════════════════════════════
#  API : joueurs (pour le formulaire d'envoi de score)
# ═══════════════════════════════════════════════════════════════

@bp.route("/api/joueurs", methods=["GET"])
@require_auth()
def api_get_joueurs():
    """Retourne la liste des joueurs existants."""
    return jsonify(users.list_players())


@bp.route("/api/joueur-courant", methods=["GET"])
@require_auth()
def api_joueur_courant():
    """Joueur correspondant a l'utilisateur connecte ({} si aucun)."""
    return jsonify(users.current_joueur() or {})


@bp.route("/api/joueurs", methods=["POST"])
@require_auth()
def api_create_joueur():
    """Crée un nouveau joueur. Attend { "prenom": str, "nom": str }."""
    data = request.get_json(silent=True) or {}
    prenom = (data.get("prenom") or "").strip()
    nom = (data.get("nom") or "").strip()

    if not prenom or not nom:
        return jsonify({"error": "Le prénom et le nom sont requis."}), 400

    if joueur_exists(prenom, nom):
        return jsonify({"error": "Ce joueur existe déjà."}), 409

    joueur_id = create_joueur(prenom, nom)
    return jsonify({"id": joueur_id, "prenom": prenom, "nom": nom}), 201


# ═══════════════════════════════════════════════════════════════
#  API : parties (pour le formulaire d'envoi de score)
# ═══════════════════════════════════════════════════════════════

@bp.route("/api/parties", methods=["GET"])
@require_auth()
def api_get_parties():
    """Retourne la liste des parties existantes pour ce jeu."""
    return jsonify(get_parties_by_jeu(NOM_JEU))


@bp.route("/api/parties", methods=["POST"])
@require_auth()
def api_create_partie():
    """Crée une nouvelle partie (vide). Attend { "nb_joueurs": int }."""
    data = request.get_json(silent=True) or {}
    nb_joueurs = data.get("nb_joueurs")

    if not isinstance(nb_joueurs, int) or nb_joueurs < 1:
        return jsonify({"error": "Le nombre de joueurs doit être un entier positif."}), 400

    try:
        partie_id = create_partie_simple(NOM_JEU, nb_joueurs)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({"id": partie_id, "nb_joueurs": nb_joueurs}), 201


# ═══════════════════════════════════════════════════════════════
#  Soumission du score d'un joueur pour une partie
# ═══════════════════════════════════════════════════════════════

@bp.route("/submit", methods=["POST"])
@require_auth()
def tresFute_submit():
    """
    Enregistre le score d'un joueur pour une partie.
    Attend en JSON : { "joueur_id": int, "partie_id": int, "score": int }
    """
    data = request.get_json(silent=True) or {}
    joueur_id = data.get("joueur_id")
    partie_id = data.get("partie_id")
    score = data.get("score")

    if not isinstance(joueur_id, int) or not isinstance(partie_id, int) or not isinstance(score, int):
        return jsonify({"error": "joueur_id, partie_id et score (entiers) sont requis."}), 400

    try:
        submit_score(joueur_id, partie_id, score)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": f"Échec de l'enregistrement du score : {exc}"}), 500

    return jsonify({"ok": True})