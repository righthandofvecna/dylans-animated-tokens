
ver:
	echo "export const VERSION = \""$$(jq -r ".version" module.json)"\";" > js/version.mjs

release: ver
	npx esbuild js/main.mjs --bundle --minify --outfile=dylans-animated-tokens.js
	zip module.zip -r lang templates dylans-animated-tokens.js module.json
	rm dylans-animated-tokens.js
	echo "import * as main from './js/main.mjs';" > dylans-animated-tokens.js

nextver:
  # switch to main branch and pull latest changes
	git checkout main
	git pull
  # increment the version number in module.json
	jq '.version |= (split(".") | .[2] = ((.[2] | tonumber) + 1 | tostring) | join(".")) | .download = "https://github.com/righthandofvecna/dylans-animated-tokens/releases/download/v\(.version)/module.zip"'  module.json > module.tmp.json && mv module.tmp.json module.json
	echo "export const VERSION = \""$$(jq -r ".version" module.json)"\";" > js/version.mjs
  # create new branch with version name
	git checkout -b v$$(jq -r ".version" module.json)-branch