#!/bin/bash

# Script allowing to execute one or more linters.
# Runs from the project root directory.
# It is assumed that the HTML pages are already built and are located in $SRC_DIR.

# Copyright 2017 The Exonum Team
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

set -e

# Root directory of the project
ROOT_DIR=.
# Directory for source Markdown files
SRC_DIR="$ROOT_DIR/src"
# Directory with the site files generated by mkdocs
SITE_DIR="$ROOT_DIR/site"
# Directory with linter configurations
CFG_DIR="$ROOT_DIR/misc"

kill_server () {
  ps -e --format pid,command | grep 'mkdocs' | grep -v 'grep' | awk '{ print $1 }' | xargs -r kill -KILL;
}

lint_md () {
  $ROOT_DIR/node_modules/.bin/markdownlint --config=$CFG_DIR/markdownlint.json "$ROOT_DIR/src/**/*.md"
}

lint_html () {
  html5validator --root "$SITE_DIR" --show-warnings --ignore-re \
    'Illegal character in query: "\|" is not allowed' \
    '"(autocorrect|autocapitalize)" not allowed on element "input"' \
    '"autocomplete" is only allowed when the input type is' \
    '"align" attribute on the "(td|th)" element is obsolete' \
    'Document uses.* Unicode Private Use Area' \
    '"main" role is unnecessary for element "main"' \
    'Consider using "lang=' \
    'An "img" element must have an "alt" attribute, except under certain conditions';
}

lint_links () {
  npm run links
}

spellcheck () {
  $ROOT_DIR/node_modules/.bin/cspell --config=$CFG_DIR/cspell.json "$ROOT_DIR/src/**/*.md"
}

case "$1" in
  kill )
    kill_server;;
  md )
    lint_md;;
  html )
    lint_html;;
  links )
    lint_links;;
  cspell )
    spellcheck;;
  all )
    lint_md;
    lint_html;
    lint_links;
    spellcheck;;
  * )
    echo "Unknown option: $1";
    exit 1;;
esac
