# Exonum Documentation

This is the documentation repo for the Exonum platform. It contains source files
used to build the documentation displayed on the [Exonum
website](http://exonum.com/).

## Build Instructions

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

To generate HTML files from the markdown source files, use:
```
mkdocs build
```
The generated pages will be available in the **site/** directory.

## License

Copyright 2016, Bitfury Group

Exonum Documentation is licensed under the Apache License (Version 2.0). See
[LICENSE](LICENSE) for details.
