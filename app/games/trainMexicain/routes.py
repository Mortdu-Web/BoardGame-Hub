from flask import jsonify, render_template, request

from app import db
from app.helpers import make_blueprint, require_auth

bp = make_blueprint("trainMexicain", __name__, __file__)


def _int(val, default=0):
    try:
        return int(val)
    except (TypeError, ValueError):
        return default


@bp.route("/")
@require_auth()
def page():
    return render_template(bp.get_templates_path("trainMexicain.html"))


@bp.route("/game")
@require_auth()
def trainMexicain_game():
    return render_template(bp.get_templates_path("trainMexicainGame.html"))


@bp.route("/submit", methods=["POST"])
@require_auth()
def trainMexicain_submit():
    data = request.get_json(silent=True) or {}
    joueurs = data.get("joueurs", [])

    scores = {}
    for joueur in joueurs:
        cle = f"joueur{joueur.get('joueur', 0)}"
        scores[joueur.get("id")] = sum(
            _int(manche.get("joueurs", {}).get(cle)) for manche in data.get("scores", [])
        )

    try:
        partie_id = db.create_partie(
            {"jeu": "trainMexicain", "nb_joueurs": len(joueurs), "scores": scores}
        )
    except ValueError as exc:
        return jsonify({"message": str(exc)}), 400
    return jsonify({"ok": True, "partie_id": partie_id})
