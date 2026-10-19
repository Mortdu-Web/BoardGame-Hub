from flask import Flask, request
from werkzeug.middleware.proxy_fix import ProxyFix

from . import db
from .config import Config
from .registry import discover, register_games
from .routes import bp as jeux_bp


def create_app() -> Flask:
    # static_folder=None : les fichiers communs sont servis par le blueprint « jeux »,
    # et chaque jeu sert les siens (<slug>.static), tous sous URL_PREFIX.
    app = Flask(__name__, static_folder=None)
    app.config.from_object(Config)

    if Config.BEHIND_PROXY:
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

    db.init_app(app)
    app.register_blueprint(jeux_bp, url_prefix=Config.URL_PREFIX or None)
    register_games(app)

    @app.context_processor
    def inject_game():
        """Expose la fiche du jeu courant (`game`) aux gabarits de ce jeu."""
        return {"game": discover().get(request.blueprint)}

    return app
