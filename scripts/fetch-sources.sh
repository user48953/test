#!/bin/sh
# Downloads the four research sources into sources/raw/ (or the folder given as
# the first argument). Run `npm run build-data` afterwards to rebuild
# src/research-data.js from them.
set -eu

OUT="${1:-sources/raw}"
mkdir -p "$OUT"
UA="Mozilla/5.0 (X11; Linux x86_64) last-z-research-sim data build"

get() {
  curl -fsSL --retry 3 --max-time 60 -A "$UA" -o "$OUT/$1" "$2"
  echo "fetched $1"
}

# lastz.fandom.com: the page sits behind a bot check, the MediaWiki API doesn't.
get fandom-technologies.json "https://lastz.fandom.com/api.php?action=parse&page=Technologies&format=json&prop=wikitext"

# ztools.co.uk: every badge tree is embedded in the page as JSON.
get ztools-research.html "https://ztools.co.uk/tools/research/"

# gamides.com: one page per badge tree.
for t in hero_training military_strategies alliance_recognition siege_to_seize peace_shield \
  fully_armed_alliance field army_building unit_special_training; do
  get "gamides-$t.html" "https://gamides.com/research/$t/"
done

# lastz.gg: calculator data lives in hashed JS chunks, named in the main bundle.
get lastzgg-page.html "https://lastz.gg/basics/technologies"
main=$(grep -o '/assets/index-[A-Za-z0-9_-]*\.js' "$OUT/lastzgg-page.html" | head -n 1)
get lastzgg-index.js "https://lastz.gg$main"
for c in ShooterTrainingCalculator AssaulterTrainingCalculator RiderTrainingCalculator T10Calculator; do
  chunk=$(grep -o "$c-[A-Za-z0-9_-]*\.js" "$OUT/lastzgg-index.js" | head -n 1)
  get "lastzgg-$c.js" "https://lastz.gg/assets/$chunk"
done
