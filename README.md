# My Blog

A minimal, dark-themed blog for GitHub Pages, powered by Jekyll. Write articles in
Markdown — they appear on the home page automatically, newest first.

## Folder structure

```
.
├── _config.yml          # Site title, description, settings
├── index.html           # Home page (lists all posts)
├── about.md             # About page
├── _layouts/
│   ├── default.html     # Page shell: header, nav, footer
│   └── post.html        # Layout for a single article
├── _posts/              # Your articles go here
│   ├── 2026-07-09-welcome.md
│   └── 2026-07-08-second-article.md
└── assets/
    └── style.css        # Dark theme
```

## Publish to GitHub Pages

1. Create a repo. For a site at `https://<username>.github.io`, name the repo
   `<username>.github.io`. For a project site at
   `https://<username>.github.io/<repo>`, use any name and set
   `baseurl: "/<repo>"` in `_config.yml`.
2. Commit and push all these files to the `main` branch.
3. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a
   branch**, pick `main` / `root`, save.
4. Wait a minute, then visit your URL. GitHub builds the Jekyll site for you — no
   local setup needed.

## Add a new article

Create a file in `_posts/` named `YYYY-MM-DD-title.md` with this header:

```
---
layout: post
title: "Your Title Here"
date: 2026-07-10
tags: [tag1, tag2]
---

Write your article in Markdown below the dashes.
```

Commit and push — it shows up on the home page automatically. Delete the two sample
posts once you've added your own.

## Customize the look

Edit the colors at the top of `assets/style.css`:

```
--bg:      #0d1117;   /* page background   */
--surface: #161b22;   /* code blocks, etc. */
--text:    #c9d1d9;   /* body text         */
--accent:  #58a6ff;   /* links             */
```

## Preview locally (optional)

You don't need this to publish, but if you want to preview before pushing:

```
gem install bundler jekyll
jekyll serve
```

Then open `http://localhost:4000`.
