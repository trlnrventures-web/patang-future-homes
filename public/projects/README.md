# Project Images

Drop your project photos into the matching folder — one folder per project (named by the project slug).

## Naming convention

Each project page and gallery reads up to 3 images named:

| File | Where it appears |
|------|------------------|
| `1.jpg` | First image (hero slide / gallery) |
| `2.jpg` | Second image |
| `3.jpg` | Third image |

Supported formats: `.jpg`, `.jpeg`, `.png`, `.webp` (use whichever you drop in — just name them consistently and keep the arrays in `data/projects.json` in sync).

> Standard size: **1000 × 900 px** for all project photos (cards and hero galleries look consistent at this ratio). Resize before uploading.

## Example

```text
public/projects/
  pearl-gardens/
    1.jpg
    2.jpg
    3.jpg
```

After adding files, refresh the page — the dev server serves them automatically.

> Floor plan images are still configured separately per configuration in `data/projects.json`.