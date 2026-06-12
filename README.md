# Tolworth Broadway Food Map

A static GitHub Pages-ready restaurant guide built from `Tolworth_Broadway_Food_Outlets.xlsx`.

## Features

- Interactive Tolworth Broadway restaurant map.
- Interactive world origin map for cuisine countries.
- Review blog with starter images.
- Add-review form with ratings, dish notes, visit date, and image upload.
- Reviews are saved in browser local storage, so the site can run from GitHub Pages without a backend.

## Run locally

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Publish on GitHub Pages

1. Create a new GitHub repository.
2. Push this folder to the repository.
3. In GitHub, go to **Settings → Pages**.
4. Set **Source** to `Deploy from a branch`.
5. Choose the `main` branch and `/ (root)`.
6. Save, then open the GitHub Pages URL when the deployment finishes.

## Data notes

The file `data/restaurants.json` is generated from the spreadsheet and enriched for the website. Two addresses, 54 and 60 Tolworth Broadway, were geocoded directly; the other pins are estimated along Tolworth Broadway and should be manually refined after checking exact shopfront positions.
