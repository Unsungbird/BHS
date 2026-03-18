#!/bin/bash
cp data/wiki-data.json docs/data/wiki-data.json
git add docs/data/wiki-data.json
git commit -m "Update wiki entries - $(date '+%Y-%m-%d %H:%M')"
git push
echo "✅ Wiki updated and pushed to GitHub!"
