import os

try:  # chargement optionnel du .env en local (en Docker, c'est compose qui injecte les variables)
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass


def _bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).lower() in ("1", "true", "yes", "on")


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-change-me")

    # Route racine derrière le reverse proxy (ex. /game-hub). Vide = à la racine.
    URL_PREFIX = os.getenv("URL_PREFIX", "").rstrip("/")
    PUBLIC_URL = os.getenv("PUBLIC_URL", "http://localhost:5000").rstrip("/")
    BEHIND_PROXY = _bool("BEHIND_PROXY", False)

    # Base SQLite (joueurs, parties, scores). Par défaut : <instance>/gamehub.sqlite3.
    # En Docker, monter un volume sur ce dossier pour conserver les données.
    DATABASE_PATH = os.getenv("DATABASE_PATH") or None

    # Authentification via le paquet auth_client (service d'auth séparé).
    # Désactivée par défaut pour pouvoir développer en local sans le service.
    AUTH_ENABLED = _bool("AUTH_ENABLED", False)
    AUTH_INTERNAL_URL = os.getenv("AUTH_INTERNAL_URL", "")
    AUTH_PUBLIC_URL = os.getenv("AUTH_PUBLIC_URL", "")

    SESSION_COOKIE_NAME = "site_session"
    SESSION_COOKIE_DOMAIN = os.getenv("SESSION_COOKIE_DOMAIN") or None
    SESSION_COOKIE_SECURE = _bool("SESSION_COOKIE_SECURE", False)
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    PERMANENT_SESSION_LIFETIME = int(os.getenv("SESSION_LIFETIME_MINUTES", "480")) * 60
