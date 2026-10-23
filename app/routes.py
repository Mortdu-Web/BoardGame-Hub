"""Blueprint « jeux » : hub, liste des joueurs et ressources statiques communes."""
from flask import Blueprint, current_app, jsonify, render_template, request

from . import users
from .helpers import require_auth
from .registry import discover

bp = Blueprint("jeux", __name__, static_folder="static", static_url_path="/static")


@bp.route("/")
@require_auth("BoardGames-Access")
def hub():
    games = [g for g in discover().values() if g["slug"] in current_app.blueprints]
    max_players = max((g["players_max"] for g in games), default=1)
    return render_template("hub.html", games=games, max_players=max_players)


@bp.route("/players")
@require_auth("BoardGames-Access")
def players():
    """Utilisateurs Keycloak + entree `generic` pour le compte « jeux » (ses joueurs : /players/guests)."""
    return jsonify(users.list_players())


@bp.route("/players/me")
@require_auth("BoardGames-Access")
def players_me():
    """{generic, joueur} : le compte connecte est-il « jeux », et sinon son joueur."""
    return jsonify(users.current_account())


@bp.route("/players/guests", methods=["GET"])
@require_auth("BoardGames-Access")
def guests():
    """Joueurs rattaches au compte « jeux »."""
    return jsonify(users.list_guests())


@bp.route("/players/guests", methods=["POST"])
@require_auth("BoardGames-Access")
def create_guest():
    """Cree un joueur de « jeux ». Attend { "prenom": str, "nom": str }."""
    data = request.get_json(silent=True) or {}
    joueur, error = users.create_guest(data.get("prenom"), data.get("nom"))
    if joueur is None:
        return jsonify({"error": error}), 409 if "existe" in (error or "") else 400
    return jsonify(joueur), 201
