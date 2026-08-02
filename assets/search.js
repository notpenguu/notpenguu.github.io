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

  function truncateExcerpt(text) {
    var words = String(text).split(/\s+/).filter(Boolean);
    if (words.length <= 25) return String(text);
    return words.slice(0, 25).join(' ') + '…';
  }

  function render(items) {
    list.innerHTML = items.map(function (p) {
      var excerpt = p.excerpt
        ? '<p class="post-list-excerpt">' + escapeHtml(truncateExcerpt(p.excerpt)) + '</p>'
        : '';
      return '<li>' +
        '<span class="post-list-date">' + escapeHtml(p.date) + '</span>' +
        '<a class="post-list-link" href="' + escapeHtml(p.url) + '">' + escapeHtml(p.title) + '</a>' +
        excerpt +
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
      return re.test(p.title) || re.test(p.excerpt || '');
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
