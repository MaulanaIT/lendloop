(function () {
  if (customElements.get('lucide-icon')) return;
  var SRC = 'https://unpkg.com/lucide@0.468.0/dist/umd/lucide.min.js';
  var NS = 'http://www.w3.org/2000/svg';
  var waiting = [];
  function ready() { return window.lucide && window.lucide.icons; }
  if (!ready() && !document.querySelector('script[data-lucide-umd]')) {
    var s = document.createElement('script');
    s.src = SRC; s.async = true; s.setAttribute('data-lucide-umd', '');
    s.onload = function () { var w = waiting; waiting = []; w.forEach(function (el) { el.render(); }); };
    document.head.appendChild(s);
  }
  function pascal(n) { return n.replace(/(^|-)([a-z0-9])/g, function (_, __, c) { return c.toUpperCase(); }); }
  class LucideIcon extends HTMLElement {
    static get observedAttributes() { return ['name', 'size', 'stroke-width']; }
    connectedCallback() { this.render(); }
    attributeChangedCallback() { if (this.isConnected) this.render(); }
    render() {
      var size = this.getAttribute('size') || '16';
      if (!this._root) this._root = this.shadowRoot || this.attachShadow({ mode: 'open' });
      var css = document.createElement('style');
      css.textContent = ':host{display:inline-flex;flex-shrink:0;width:' + size + 'px;height:' + size + 'px}svg{display:block}';
      if (!ready()) { this._root.replaceChildren(css); if (waiting.indexOf(this) < 0) waiting.push(this); return; }
      var name = this.getAttribute('name') || '';
      var node = window.lucide.icons[pascal(name)];
      if (!node) { this._root.replaceChildren(css); return; }
      var kids = (Array.isArray(node) && node[0] === 'svg') ? node[2] : node;
      var svg = document.createElementNS(NS, 'svg');
      var a = { 'aria-hidden': 'true', width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        'stroke-width': this.getAttribute('stroke-width') || '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
      for (var k in a) svg.setAttribute(k, a[k]);
      (kids || []).forEach(function (c) {
        var el = document.createElementNS(NS, c[0]);
        var at = c[1] || {};
        for (var key in at) if (key !== 'key') el.setAttribute(key, at[key]);
        svg.appendChild(el);
      });
      this._root.replaceChildren(css, svg);
    }
  }
  customElements.define('lucide-icon', LucideIcon);
})();
