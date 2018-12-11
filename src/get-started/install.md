---
title: Installation guide
---
# Installation Guide

<!-- cspell:ignore ppas -->

[Exonum core][exonum] and most [other Exonum repositories][exonum-org] use
[the Rust programming language][rust] and the corresponding toolchain.
This document details how to setup development environment for contributing
to these projects, testing them, and developing using Exonum.

!!! note
    As of version 0.3, you need to compile the core locally for every application
    that depends on it. [Cargo][cargo] (the Rust package manager) takes care
    of most things, but you still need to have dependencies
    installed locally as described below for the core to compile.

    In future releases, Exonum will become more modular and will work as
    a standalone application. See [the roadmap](../roadmap.md) for more details.

    > I guess we can update the version to the current one
    > or just not mention it at all ("Currently, you need to...")
    > I don't think it's good TV to say that
    > we have not improved something for seven versions. 

## Dependencies

Exonum depends on the following third-party system libraries:

- [RocksDB][rocksdb] (persistent storage)
- [libsodium][libsodium] (cryptography engine)

You can find instructions how to install dependencies in various environments
below.

### MacOS

Install the necessary libraries using [Homebrew][homebrew]:

```shell
brew install libsodium rocksdb pkg-config
```

### Linux

For distributives with `deb`-based package managers (such as Debian or Ubuntu),
use

```shell
apt-get install build-essential libsodium-dev libsnappy-dev \
    librocksdb-dev pkg-config
```

Package names and installation methods may differ in other Linux distributives;
use package manager tools to locate and install dependencies.

Depending on the version of your distributive, libsodium and RocksDB may not
be present in the default package lists. In this case you may need to install
these packages from third-party PPAs, or build them from sources.

### Windows

Install the latest version of the following packages:

- [Visual C++ Build Tools][build_tools]
- [PowerShell][powershell]

> Um... Are we sure that Exonum works on Windows?
> If so then we'd better provide some instruction too
> as I'm not sure that it will work without dependencies.
>
> Alternatively, we may not mention Windows support at all
> or say that it is upcoming and redirect the reader to the roadmap.
> I think it's better to be honest that we don't support it well
> rather than making an impression that Exonum will work without a hitch on Windows.

## Adding environment variables

If your OS contains pre-compiled `rocksdb` or `snappy` libraries,
you may setup `ROCKSDB_LIB_DIR` and/or `SNAPPY_LIB_DIR` environment variable
to point to a directory with these libraries.
This will significantly reduce compile time.

### MacOS

```shell
export ROCKSDB_LIB_DIR=/usr/local/lib
export SNAPPY_LIB_DIR=/usr/local/lib
```

### Linux

```shell
export ROCKSDB_LIB_DIR=/usr/lib/x86_64-linux-gnu
export SNAPPY_LIB_DIR=/usr/lib/x86_64-linux-gnu
```

## Rust Toolchain

Exonum repositories use the stable Rust toolchain that can be installed
by using the [rustup](https://www.rustup.rs) program:

```shell
curl https://sh.rustup.rs -sSf | sh -s -- --default-toolchain stable
```

For Windows, download and run `rustup-init.exe` from [the rustup website](https://www.rustup.rs/)
instead.

The Rust toolchain includes the Rust compiler (`rustc`) and several utilities,
of which the most important one is [Cargo][cargo], the Rust package manager.

!!! note
    Exonum is guaranteed to be compatible with
    the latest stable Rust toolchain, which can be obtained as specified above.
    Other recent toolchains may work too; see
    [the Exonum main repository readme][readme] to find out
    a precise range of supported Rust versions.
    Older toolchains (for example, those that come with Linux
    distributions) might cause Exonum compilation to fail, as Exonum uses
    some new language features. Please use rustup to install a compatible toolchain
    in this case.

## Compiling Exonum

You can verify that you installed dependencies and the Rust toolchain correctly
by cloning the `exonum` repository and running its built-in unit test suite:

```shell
git clone https://github.com/exonum/exonum.git
cd exonum
cargo test --manifest-path exonum/Cargo.toml
```

You may also run the extended test suite located in the `sandbox` directory:

```shell
cargo test --manifest-path sandbox/Cargo.toml
```

> It's kinda shameful to admit,
> but Exonum tests have quite high resource requirements
> and may make user system unresponsive in case of shortage.
> I guess it would be nice to clarify, for example, memory requirements.

## Non-Rust Components

### Light Client Library

[The light client library][exonum-client] uses a fairly standard JavaScript
development toolchain:
[Node][nodejs] and [npm][npm], together with [Mocha][mocha] + [Chai][chai] for testing
(and [Karma][karma] for browser testing),
[istanbul][istanbul] for measuring test coverage, and
[Babel][babel] for transpiling to ES5. Workability of the development environment
is tested on Node 4+.

!!! note
    The light client library itself can run both on Node and in browsers.

> Not an expert on light client
> but this section may need an update as well.

## Developing with Exonum

[The cryptocurrency tutorial](create-service.md) provides a step-by-step
guide on how to develop applications on top of the Exonum framework.

[exonum]: https://github.com/exonum/exonum/
[readme]: https://github.com/exonum/exonum/#readme
[exonum-org]: http://github.com/exonum/
[rust]: http://rust-lang.org/
[leveldb]: http://leveldb.org/
[rocksdb]: http://rocksdb.org/
[libsodium]: https://download.libsodium.org/doc/
[homebrew]: https://brew.sh/
[cargo]: http://doc.crates.io/guide.html
[exonum-client]: https://github.com/exonum/exonum-client
[nodejs]: http://nodejs.org/
[npm]: http://npmjs.com/
[mocha]: http://mochajs.org/
[chai]: http://chaijs.com/
[karma]: http://karma-runner.github.io/1.0/index.html
[istanbul]: https://istanbul.js.org/
[babel]: http://babeljs.io/
[rel0.3.0]: https://github.com/exonum/exonum/releases/tag/v0.3
[build_tools]: https://www.visualstudio.com/downloads/
[powershell]: https://docs.microsoft.com/en-us/powershell/scripting/setup/installing-windows-powershell?view=powershell-6
