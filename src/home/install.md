# Installation Guide

[Exonum Core][exonum-core] and most of [other Exonum repositories][exonum-org] use
[the Rust programming language][rust] and the corresponding toolchain.
This document details how to setup development environment for contributing
to these projects, testing them, and developing using Exonum.

!!! note
    As of version 0.1, you need to compile the core locally for every application
    that depends on it. [Cargo][cargo] (the Rust package manager) takes care
    of most things, but you still need to have dependencies
    installed locally as described below for the core to compile.

    In future releases, Exonum will become more modular and will work as
    a standalone application. See [the roadmap](../dev/roadmap.md) for more details.

## Dependencies

Exonum Core depends on the following third-party system libraries:

- [LevelDB][leveldb] (persistent storage)
- [libsodium][libsodium] (cryptography engine)
- [OpenSSL][openssl]

You can find instructions how to install them on the various environments
below.

### MacOS

Install the necessary libraries using [Homebrew][homebrew]:

```shell
brew install libsodium leveldb openssl
```

### Linux

For distributives with `deb`-based package managers (such as Debian or Ubuntu),
use

```shell
apt-get install build-essential libsodium-dev \
    libleveldb-dev libssl-dev pkg-config
```

libsodium is contained in a third-party PPA, so you may need to add it with

```shell
add-apt-repository ppa:chris-lea/libsodium
```

Package names and installation methods may differ in other Linux distributives;
use package manager tools to locate and install dependencies.

### Windows

Workability is not guaranteed yet.

## Rust Toolchain

Exonum repositories use the stable Rust toolchain that can be installed
by using the [rustup](https://www.rustup.rs) utility.

```shell
curl https://sh.rustup.rs -sSf | sh -s -- --default-toolchain stable
```

The toolchain includes the Rust compiler (`rustc`) and several utilities,
of which the most important one is [`cargo`][cargo], the Rust package manager.

A nightly (`2017-05-10`) Rust toolchain is used for the [clippy][clippy] linter.
Install it with the following command:

```shell
rustup toolchain install nightly-2017-05-10
```

Clippy checks can then be run as

```shell
cargo +nightly-2017-05-10 clippy
```

## Compiling Exonum Core

You can verify that you installed dependencies and the Rust toolchain correctly
by cloning the `exonum-core` repository and running its built-in unit test suite:

```shell
git clone https://github.com/exonum/exonum-core.git
cd exonum-core
cargo test --manifest-path exonum/Cargo.toml
```

You may also run the extended test suite located in the `sandbox` directory.

```shell
cargo test --manifest-path sandbox/Cargo.toml
```

## Non-Rust Components

### Light Client Library

[The light client library][exonum-client] uses an ordinary JavaScript
development toolchain:
[Node][nodejs] and [npm][npm], together with [Mocha][mocha] + [Chai][chai] for testing
(+ [Karma][karma] for browser testing),
[istanbul][istanbul] for measuring test coverage, and
[Babel][babel] for transpiling to ES5. Workability is tested on Node 4+.

!!! note
    The library itself can run both on Node and in browsers.

## Developing with Exonum

[The cryptocurrency tutorial](cryptocurrency/intro.md) provides a step-by-step
guide on how to develop applications on top of the Exonum framework.

[exonum-core]: https://github.com/exonum/exonum-core/
[exonum-org]: http://github.com/exonum/
[rust]: http://rust-lang.org/
[leveldb]: http://leveldb.org/
[libsodium]: https://download.libsodium.org/doc/
[openssl]: http://openssl.org/
[homebrew]: https://brew.sh/
[clippy]: https://github.com/Manishearth/rust-clippy
[cargo]: http://doc.crates.io/guide.html
[exonum-client]: https://github.com/exonum/exonum-client
[nodejs]: http://nodejs.org/
[npm]: http://npmjs.com/
[mocha]: http://mochajs.org/
[chai]: http://chaijs.com/
[karma]: http://karma-runner.github.io/1.0/index.html
[istanbul]: https://istanbul.js.org/
[babel]: http://babeljs.io/
