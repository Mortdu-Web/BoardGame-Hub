from flask import render_template

from app.helpers import login_required, make_blueprint

bp = make_blueprint("qwirkle", __name__, __file__)


@bp.route("/")
@login_required
def page():
    return render_template(bp.get_templates_path("qwirkle.html"))
