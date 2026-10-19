from flask import render_template

from app.helpers import make_blueprint, require_auth

bp = make_blueprint("ptitBac", __name__, __file__)


@bp.route("/")
@require_auth()
def page():
    return render_template(bp.get_templates_path("ptitBac.html"))
