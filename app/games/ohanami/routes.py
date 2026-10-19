from flask import jsonify, render_template, request

from app import db
from app.helpers import login_required, make_blueprint

bp = make_blueprint("ohanami", __name__, __file__)

# Barème des cartes roses : index = nombre de cartes (0 à 15)
SAKURA_TAB = [0, 1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66, 78, 91, 105, 120]
POINTS_PAR_CARTE = {"eau": 3, "herbe": 4, "pierre": 7}


def _int(val, default=0):
    try:
        return int(val)
    except (TypeError, ValueError):
        return default


@bp.route("/")
@login_required
def page():
    return render_template(bp.get_templates_path("oanami.html"))


@bp.route("/game")
@login_required
def oanami_game():
    return render_template(bp.get_templates_path("oanamiGame.html"))


@bp.route("/submit", methods=["POST"])
@login_required
def oanami_submit():
    data = request.get_json(silent=True) or {}
    joueurs = data.get("joueurs", [])

    scores = {}
    for joueur in joueurs:
        total = 0
        for ligne in data.get("scores", []):
            valeur = _int(ligne.get("joueurs", {}).get(f"joueur{joueur.get('joueur', 0)}"))
            type_ = ligne.get("type")
            if type_ == "sakura":
                total += SAKURA_TAB[max(0, min(valeur, 15))]
            else:
                total += max(valeur, 0) * POINTS_PAR_CARTE.get(type_, 0)
        scores[joueur.get("id")] = total

    try:
        partie_id = db.create_partie({"jeu": "ohanami", "nb_joueurs": len(joueurs), "scores": scores})
    except ValueError as exc:
        return jsonify({"message": str(exc)}), 400
    return jsonify({"ok": True, "partie_id": partie_id})
