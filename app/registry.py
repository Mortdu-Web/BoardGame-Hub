"""Découverte des jeux : un dossier games/<slug>/ contenant card.json (fiche) et routes.py (blueprint `bp`)."""
import json
import re
from importlib import import_module
from pathlib import Path

from .config import Config

GAMES_DIR = Path(__file__).parent / "games"


def _range(raw) -> tuple[int, int]:
    nums = [int(n) for n in re.findall(r"\d+", str(raw))]
    return (min(nums), max(nums)) if nums else (1, 99)


def _load_card(folder: Path) -> dict:
    data = json.loads((folder / "card.json").read_text(encoding="utf-8"))
    slug = folder.name
    pmin, pmax = _range(data.get("players", ""))
    return {
        "slug": slug,
        "title": data.get("title") or data.get("name") or slug,
        "players": data.get("players", "?"),
        "players_min": pmin,
        "players_max": pmax,
        "duration": data.get("duree", data.get("durree", "?")),
        "min_age": data.get("age_mini", "?"),
        "summary": data.get("resume", ""),
    }


def discover() -> dict[str, dict]:
    """Fiches de tous les jeux, triées par titre."""
    cards = [_load_card(c.parent) for c in GAMES_DIR.glob("*/card.json")]
    return {c["slug"]: c for c in sorted(cards, key=lambda c: c["title"].lower())}


def register_games(app) -> None:
    for slug in discover():
        try:
            module = import_module(f"app.games.{slug}.routes")
        except ModuleNotFoundError as exc:
            if exc.name == f"app.games.{slug}.routes":
                app.logger.warning("Jeu %r ignoré : pas de routes.py", slug)
                continue
            raise
        if module.bp.name != slug:
            raise RuntimeError(f"Le blueprint de {slug!r} doit s'appeler {slug!r} (et non {module.bp.name!r})")
        app.register_blueprint(module.bp, url_prefix=f"{Config.URL_PREFIX}/{slug}")
