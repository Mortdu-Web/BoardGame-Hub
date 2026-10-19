"""Blueprint « jeux » : hub, liste des joueurs et ressources statiques communes."""
from urllib.parse import urlparse

from flask import Blueprint, current_app, jsonify, redirect, render_template, request, url_for

from . import db
from .helpers import login_required
from .registry import discover

bp = Blueprint("jeux", __name__, static_folder="static", static_url_path="/static")


@bp.route("/")
@login_required
def hub():
    games = [g for g in discover().values() if g["slug"] in current_app.blueprints]
    max_players = max((g["players_max"] for g in games), default=1)
    return render_template("hub.html", games=games, max_players=max_players)


@bp.route("/players")
@login_required
def players():
    return jsonify(db.get_all_joueurs())


def _safe_next(url: str | None) -> str:
    """N'autorise que les redirections vers ce site."""
    default = url_for("jeux.hub")
    if not url:
        return default
    parts = urlparse(url)
    if parts.scheme in ("http", "https") and parts.netloc == request.host:
        return url
    if not parts.scheme and not parts.netloc and url.startswith("/") and not url.startswith("//"):
        return url
    return default


@bp.route("/joueurs/nouveau", methods=["GET", "POST"])
@login_required
def nouveau_joueur():
    next_url = _safe_next(request.args.get("next") or request.form.get("next"))
    error = None

    if request.method == "POST":
        success, error = db.add_new_player(
            request.form.get("nom", ""), request.form.get("prenom", "")
        )
        if success:
            return redirect(next_url)

    return render_template("jeux/newPlayer.html", next_url=next_url, error=error)
