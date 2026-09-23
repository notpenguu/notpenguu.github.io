(function () {
  'use strict';

  var dataEl = document.getElementById('posts-data');
  var input = document.getElementById('search-input');
  var status = document.getElementById('search-status');
  var list = document.getElementById('post-list');

  if (!dataEl || !input || !status || !list) return;

  var posts = JSON.parse(dataEl.textContent);

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function render(items) {
    list.innerHTML = items.map(function (p) {
      var tags = (p.tags && p.tags.length)
        ? '<p class="post-list-tags">' + escapeHtml(p.tags.join(' · ')) + '</p>'
        : '';
      return '<li>' +
        '<span class="post-list-date">' + escapeHtml(p.date) + '</span>' +
        '<a class="post-list-link" href="' + escapeHtml(p.url) + '">' + escapeHtml(p.title) + '</a>' +
        tags +
        '</li>';
    }).join('');
  }

  function update() {
    var query = input.value;

    if (!query) {
      status.hidden = true;
      render(posts);
      return;
    }

    var re;
    try {
      re = new RegExp(query, 'i');
    } catch (e) {
      status.hidden = false;
      status.textContent = 'Invalid search: ' + e.message;
      return;
    }

    var matches = posts.filter(function (p) {
      return re.test(p.title) || re.test((p.tags || []).join(' ')) || re.test(p.excerpt || '');
    });

    status.hidden = false;
    if (matches.length === 0) {
      status.textContent = 'No posts match.';
    } else {
      status.textContent = 'Found ' + matches.length + (matches.length === 1 ? ' matching post.' : ' matching posts.');
    }
    render(matches);
  }

  input.addEventListener('input', update);
})();
