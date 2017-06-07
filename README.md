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

- [markdownlint][mdl] is used to lint Markdown files
- [html5validator][html5validator] is used for checking problems with the
  generated HTML pages
- [linkchecker][linkchecker] is used to find missing links

You can set up these tools locally (see the `install` step in [the Travis config](.travis.yml)
for more details) and run them using the `./misc/lint.sh` script with `md`, `html`,
`links`, or `all` arguments.

## SEO optimization

To make article more SEO-optimised and to make it possible to paste beautiful links into a Slack/Skype/Twitter/Facebook add `description` field into the beginning of the document:

```markdown
description: A brief description of my article

# Some title

Some content begins here...
```

Description should contain a one to two sentence description of the article.
Place it at the very beginning of the document.

Note, it should be blank line between description section and beginning of document.

## Build Instructions

It is a good idea to preview your changes locally before sending a pull request. 
First, you need to install [Python](http://python.org/) and [python-pip](https://pip.readthedocs.io/en/stable/installing/).
Then, install `mkdocs` and the `bootswatch` theme:
```
pip install mkdocs mkdocs-bootswatch
```

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
[html5validator]: https://github.com/svenkreiss/html5validator
[linkchecker]: https://github.com/wummel/linkchecker
