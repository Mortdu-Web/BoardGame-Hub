from flask import jsonify, render_template, request

from app import db
from app.helpers import make_blueprint, require_auth

bp = make_blueprint("skyjo", __name__, __file__)


def _int(val, default=0):
    try:
        return int(val)
    except (TypeError, ValueError):
        return default


@bp.route("/")
@require_auth()
def page():
    return render_template(bp.get_templates_path("skyjo.html"))


@bp.route("/game")
@require_auth()
def skyjo_game():
    return render_template(bp.get_templates_path("skyjoGame.html"))


@bp.route("/submit", methods=["POST"])
@require_auth()
def skyjo_submit():
    data = request.get_json(silent=True) or {}
    joueurs = data.get("joueurs", [])

    # {id_joueur: score}. Un id manquant (None) est refusé par create_partie.
    scores = {j.get("id"): _int(j.get("score")) for j in joueurs}

    try:
        partie_id = db.create_partie(
            {"jeu": "skyjo", "nb_joueurs": _int(data.get("nb_joueurs"), len(joueurs)), "scores": scores}
        )
    except ValueError as exc:
        return jsonify({"message": str(exc)}), 400
    return jsonify({"ok": True, "partie_id": partie_id})
