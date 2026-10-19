(function () {
  const search = document.getElementById("search");
  const players = document.getElementById("players");
  const cards = Array.from(document.querySelectorAll("#games .game-card"));
  const empty = document.getElementById("empty");

  function apply() {
    const q = search.value.trim().toLowerCase();
    const n = parseInt(players.value, 10);
    let visible = 0;
    cards.forEach((card) => {
      const okTitle = !q || card.dataset.title.includes(q);
      const okPlayers = !n || (n >= +card.dataset.min && n <= +card.dataset.max);
      card.hidden = !(okTitle && okPlayers);
      if (!card.hidden) visible++;
    });
    empty.hidden = visible > 0 || cards.length === 0;
  }

  search.addEventListener("input", apply);
  players.addEventListener("change", apply);
})();
