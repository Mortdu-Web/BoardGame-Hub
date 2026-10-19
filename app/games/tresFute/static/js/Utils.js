// Injecte une feuille de style située dans ../css/ par rapport au module appelant
// (ex. Case.js dans static/js  ->  static/css/case.css). Une seule injection par id.
export function injectCSS(id, file, moduleUrl) {
  const linkId = `css-${id}`;
  if (document.getElementById(linkId)) return;
  const link = document.createElement('link');
  link.id = linkId;
  link.rel = 'stylesheet';
  link.href = new URL(`../css/${file}`, moduleUrl).href;
  document.head.appendChild(link);
}
