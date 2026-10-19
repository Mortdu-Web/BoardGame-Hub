from app.db import insert_joueur_partie

def submit_score(joueur_id: int, partie_id: int, score: int) -> None:
    """
    Soumet le score d'un joueur pour une partie donnée.

    Args:
        joueur_id (int): L'identifiant du joueur.
        partie_id (int): L'identifiant de la partie.
        score (int): Le score à soumettre.
    """
    insert_joueur_partie(joueur_id, partie_id, score)

