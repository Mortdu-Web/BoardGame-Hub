# game-hub — hub de jeux de société

## Lancer en local (sans authentification)
```bash
pip install -r requirements.txt      # sans auth-client
cp .env.example .env                 # AUTH_ENABLED=false et URL_PREFIX= (vide)
flask --app wsgi run --debug --port 5000
```
Accueil : `http://localhost:5000/` (ou `http://localhost:5000<URL_PREFIX>/` si un préfixe est défini).

## Production (avec authentification)
```bash
pip install -r requirements-auth.txt   # ajoute auth-client
# .env : AUTH_ENABLED=true + variables AUTH_* + URL_PREFIX=/game-hub
```

## Structure
```
wsgi.py                  point d'entrée (gunicorn / flask)
app/
  __init__.py            create_app : préfixe d'URL, proxy, base de données, enregistrement des jeux
  config.py              lecture du .env
  helpers.py             login_required (auth_client si AUTH_ENABLED) + make_blueprint
  db.py                  SQLite : joueurs, parties, scores (seul fichier à adapter pour une autre base)
  registry.py            découverte des jeux (games/<slug>/card.json + routes.py)
  routes.py              blueprint « jeux » : hub, /players, /joueurs/nouveau
  templates/             base.html, hub.html, jeux/{baseJeux,baseScore,newPlayer}.html
  static/                site.css (variables), base.css, jeux.css, hub.css, base.js (GameScore), hub.js
  games/<slug>/          un dossier par jeu (voir ci-dessous)
```

## Routes
- `<URL_PREFIX>/` : hub (recherche + filtre par nombre de joueurs)
- `<URL_PREFIX>/<slug>/` : présentation du jeu
- `<URL_PREFIX>/<slug>/game` : tableau des scores (ohanami, skyjo, trainMexicain, tresFute)
- `<URL_PREFIX>/<slug>/submit` : enregistrement des scores (POST JSON)

## Ajouter un jeu
Créer `app/games/<slug>/` avec :
- `__init__.py` (vide) ;
- `card.json` : `title`, `players`, `duree`, `age_mini`, `resume` ;
- `routes.py` : un blueprint nommé comme le dossier, avec une vue `page` (présentation) ;
- `templates/<slug>/` (les pages étendent `jeux/baseJeux.html` ou `jeux/baseScore.html`) et `static/` si besoin.

Pour proposer un compteur de points, définir `{% set game_link = url_for('<slug>.<vue_game>') %}` dans la page de
présentation. Le jeu apparaît seul sur le hub au redémarrage. Copier `ohanami/` (ou `ptitBac/` pour une simple
présentation) comme modèle.

## Données
Les joueurs, parties et scores sont stockés dans une base **PostgreSQL hébergée sur une autre machine**.
Renseigner dans le `.env` : `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.
Les tables sont créées automatiquement au démarrage si elles n'existent pas. Le serveur PostgreSQL doit accepter
les connexions depuis la machine qui héberge le conteneur (`listen_addresses`, `pg_hba.conf`, pare-feu).

## Docker
```bash
cp .env.example .env                 # renseigner PORT, SECRET_KEY et DB_*
docker network create web            # une seule fois (réseau partagé avec le reverse proxy / l'auth)
docker compose up -d --build
```
En production (auth activée) : `WITH_AUTH=true docker compose up -d --build` avec `AUTH_ENABLED=true` dans le `.env`.

## Jeu en ligne
Ajouter des routes sur le blueprint du jeu. Attention : gunicorn lance plusieurs workers, l'état d'une partie en cours
ne doit pas rester en mémoire Python (Redis/DB, ou `--workers 1` pour un prototype).
