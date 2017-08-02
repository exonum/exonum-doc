# Installation Guide

[Exonum core][exonum] and most [other Exonum repositories][exonum-org] use
[the Rust programming language][rust] and the corresponding toolchain.
This document details how to setup development environment for contributing
to these projects, testing them, and developing using Exonum.

!!! note
    As of version 0.1, you need to compile the core locally for every application
    that depends on it. [Cargo][cargo] (the Rust package manager) takes care
    of most things, but you still need to have dependencies
    installed locally as described below for the core to compile.

    In future releases, Exonum will become more modular and will work as
    a standalone application. See [the roadmap](../roadmap.md) for more details.

## Dependencies

Exonum depends on the following third-party system libraries:

- [LevelDB][leveldb] (persistent storage)
- [libsodium][libsodium] (cryptography engine)

You can find instructions how to install them on the various environments
below.

### MacOS

Install the necessary libraries using [Homebrew][homebrew]:

```shell
brew install libsodium leveldb pkg-config
```

### Linux

For distributives with `deb`-based package managers (such as Debian or Ubuntu),
use

```shell
apt-get install build-essential libsodium-dev \
    libleveldb-dev pkg-config
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
by using the [rustup](https://www.rustup.rs) program:

```shell
curl https://sh.rustup.rs -sSf | sh -s -- --default-toolchain stable
```

The toolchain includes the Rust compiler (`rustc`) and several utilities,
of which the most important one is [Cargo][cargo], the Rust package manager.

### Clippy

A separate nightly Rust toolchain is required if you want to run
the [clippy][clippy] linter locally. Clippy is used
in CI builds of Exonum and other repositories to detect common Rust anti-patterns.
In general, clippy supports the latest nightly version of Rust. It can be installed
with

```shell
rustup toolchain install <nightly-rust-version>
```

where `<nightly-rust-version>` is the nightly Rust version supported by clippy
(e.g., `nightly-2017-05-10` for clippy version 0.0.131).
Consult the clippy installation guide for more details.

After installing nightly Rust, clippy checks can be run with

```shell
cargo +<nightly-rust-version> clippy
```

### Rustfmt

[`rustfmt`][rustfmt] is used to perform automatic code formatting and code
style checks in CI builds. Note that Exonum repositories pin the version
of `rustfmt` in order to get consistent formatting.

You can install `rustfmt` locally with

```shell
cargo install rustfmt --vers <rustfmt-version> --force
```

where `<rustfmt-version>` is the supported version of the formatter.
You may find the supported version in
[the Travis configuration of Exonum core repository][core-travis].

After installing the formatter, its checks can be run with

```shell
cargo fmt --write-mode=diff
```

Consult the `rustfmt` readme for more details.

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

## Developing with Exonum

[The cryptocurrency tutorial](create-service.md) provides a step-by-step
guide on how to develop applications on top of the Exonum framework.

[exonum]: https://github.com/exonum/exonum/
[exonum-org]: http://github.com/exonum/
[rust]: http://rust-lang.org/
[leveldb]: http://leveldb.org/
[libsodium]: https://download.libsodium.org/doc/
[openssl]: http://openssl.org/
[homebrew]: https://brew.sh/
[clippy]: https://github.com/Manishearth/rust-clippy
[rustfmt]: https://github.com/rust-lang-nursery/rustfmt
[core-travis]: https://github.com/exonum/exonum/blob/master/.travis.yml
[cargo]: http://doc.crates.io/guide.html
[exonum-client]: https://github.com/exonum/exonum-client
[nodejs]: http://nodejs.org/
[npm]: http://npmjs.com/
[mocha]: http://mochajs.org/
[chai]: http://chaijs.com/
[karma]: http://karma-runner.github.io/1.0/index.html
[istanbul]: https://istanbul.js.org/
[babel]: http://babeljs.io/
