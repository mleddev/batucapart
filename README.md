# Batucapart

Prototype d'un lecteur pour travailler les morceaux d'une batucada : mute / solo / volume par instrument,
tempo ajustable sans changer la hauteur, métronome, boucle sur une section.

```bash
# Node 20.19 ou plus récent (par ex. `nvm use 22`)
npm install
npm run dev     # http://localhost:5173
npm run build   # produit dist/
```

Les morceaux sont décrits dans `src/songs/` et leurs pistes audio dans `public/songs/`.
Chaque push sur `main` est publié sur GitHub Pages par `.github/workflows/pages.yml`.
