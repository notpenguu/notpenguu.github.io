(function () {
  'use strict';

  var tocEl = document.getElementById('toc');
  if (!tocEl) return;

  var body = document.querySelector('.post-body');
  if (!body) return;

  var headings = body.querySelectorAll('h2, h3');
  if (!headings.length) return;

  function slugify(text) {
    return String(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  function idFor(el) {
    if (el.id) return el.id;
    var base = slugify(el.textContent) || 'section';
    var id = base;
    var n = 1;
    while (document.getElementById(id)) {
      n += 1;
      id = base + '-' + n;
    }
    el.id = id;
    return id;
  }

  var items = [];
  Array.prototype.forEach.call(headings, function (h) {
    items.push({ level: h.tagName === 'H2' ? 2 : 3, text: h.textContent, id: idFor(h) });
  });

  var list = document.createElement('ul');
  var h2Item = null;

  items.forEach(function (item) {
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = '#' + item.id;
    a.textContent = item.text;
    li.appendChild(a);

    if (item.level === 2) {
      li.className = 'toc-h2';
      list.appendChild(li);
      h2Item = li;
    } else if (h2Item) {
      li.className = 'toc-h3';
      var sub = h2Item.querySelector('ul');
      if (!sub) {
        sub = document.createElement('ul');
        h2Item.appendChild(sub);
      }
      sub.appendChild(li);
    } else {
      li.className = 'toc-h2';
      list.appendChild(li);
    }
  });

  var title = document.createElement('p');
  title.className = 'toc-title';
  title.textContent = 'Table of Contents';

  tocEl.appendChild(title);
  tocEl.appendChild(list);
  tocEl.hidden = false;
})();
