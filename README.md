# Exonum Documentation

This is the documentation repo for the Exonum platform. It contains source files
used to build the documentation displayed on the [Exonum
website](http://exonum.com/).

The Exonum documentation is written in [Markdown](https://en.wikipedia.org/wiki/Markdown),
and uses [mkdocs](http://www.mkdocs.org/) to generate HTML from sources.
You can read about Markdown [here](https://guides.github.com/features/mastering-markdown/)
or [other](https://github.com/adam-p/markdown-here/wiki/Markdown-Cheatsheet)
[places](http://www.mkdocs.org/user-guide/writing-your-docs/).

## Contributing

In order to contribute, fork this repository, make some changes, and then submit
them as a pull request. Simple!

Notice that the repository uses a set of [linters][wiki:lint] to check possible
problems with the contributed documents:

- [markdownlint][mdl] is used to lint Markdown files. Please see
  [the rules list][mdl-rules] to fix possible problems with this linter
- [html5validator][html5validator] is used for checking problems with the
  generated HTML pages
- [linkchecker][linkchecker] is used to find missing links

You can set up these tools locally (see the `install` step in [the Travis config](.travis.yml)
for more details) and run them using the `./misc/lint.sh` script with `md`, `html`,
`links`, or `all` arguments.

## Build Instructions

It is a good idea to preview your changes locally before sending a pull request. 

### Installation

First, you need to install [Python](http://python.org/) and [python-pip](https://pip.readthedocs.io/en/stable/installing/).
Then, install the `mkdocs` theme together with its dependencies:

```
pip install mkdocs pygments pygments-github-lexers mkdocs-material
```

Alternatively, you may use

```
pip install -r requirements.txt
```

This will install the theme with all dependencies and the linters, except
for `markdownlint` (which is written in Ruby and uses `gem` as the package manager).

### Viewing Documents Locally

In order to run a local web server serving docs, use:

```
mkdocs serve
```

The web server will be available on [127.0.0.1:8000](http://127.0.0.1:8000/).

To generate HTML files from the Markdown source files, use:

```
mkdocs build
```

The generated pages will be available in the **site/** directory.

## License

Copyright 2016, Bitfury Group

Exonum Documentation is licensed under the Apache License (Version 2.0). See
[LICENSE](LICENSE) for details.

[wiki:lint]: https://en.wikipedia.org/wiki/Lint_(software)
[mdl]: https://github.com/mivok/markdownlint
[mdl-rules]: https://github.com/mivok/markdownlint/blob/master/docs/RULES.md
[html5validator]: https://github.com/svenkreiss/html5validator
[linkchecker]: https://github.com/wummel/linkchecker
