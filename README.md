# Exonum Documentation

This is the documentation repo for the Exonum platform. It contains source files
used to build the documentation displayed on the [Exonum
website](http://exonum.com/).

The Exonum documentation is written in [Markdown](https://en.wikipedia.org/wiki/Markdown),
and uses [mkdocs](http://www.mkdocs.org/) to generate HTML from sources.
You can read about Markdown [here](https://guides.github.com/features/mastering-markdown/) or [other](https://github.com/adam-p/markdown-here/wiki/Markdown-Cheatsheet) [places](http://www.mkdocs.org/user-guide/writing-your-docs/).

## Contributing

In order to contribute, fork this repository, make some changes, and then submit them as a pull request. Simple!

## Meta-tags

Add meta tags for OpenGraph and Twitter discovery into your articles. SEO optimization and ability to paste a link into a Slack channel (or Skype, or Twitter) and get responsive results are good things.

Meta-tags consists of a series of keywords and values defined at the beginning of a markdown document like this:

```markdown
description: A brief description of my document
image: img/preview.jpg
twitterSite: @username
twitterCreator: @username
```

Use the following properties:

| Property | Description | Required |
| --- | --- | --- |
| **description** | A one to two sentence description of your article. | Yes |
| **image** | Relative path to the image URL which should represent your article. | Yes |
| **twitterSite** | @username for the website. | *No* |
| **twitterCreator** | @username for the content creator / author. | *No* |

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
