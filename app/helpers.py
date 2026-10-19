from pathlib import Path

from flask import Blueprint

from .config import Config

# Remplace l'ancien `require_permission("showGame")` du site principal.
if Config.AUTH_ENABLED:
    from auth_client import require_auth as login_required
else:

    def login_required(view):
        return view


class GameBlueprint(Blueprint):
    def get_templates_path(self, filename: str) -> str:
        """Les gabarits d'un jeu vivent dans games/<slug>/templates/<slug>/."""
        return f"{self.name}/{filename}"


def make_blueprint(name: str, import_name: str, file: str) -> GameBlueprint:
    """Blueprint d'un jeu : templates/ et static/ du dossier du jeu, s'ils existent.
    Le préfixe d'URL (/<slug>) est appliqué à l'enregistrement, voir registry.py."""
    base = Path(file).parent
    return GameBlueprint(
        name,
        import_name,
        template_folder=str(base / "templates") if (base / "templates").is_dir() else None,
        static_folder=str(base / "static") if (base / "static").is_dir() else None,
        static_url_path="/static",
    )
