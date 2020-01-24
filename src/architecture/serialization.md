# Serialization in Exonum

Exonum uses [Protocol Buffers][protobuf] (aka Protobuf) as its serialization format
for communication among full nodes, cryptographic operations on
[light clients](../architecture/clients.md)
and storage of data. Protobuf is the industry accepted language-neutral and
platform-neutral automated mechanism for serializing data.

## Usage

### Communication Among Full Nodes

Full nodes can both serialize messages for sending and
deserialize messages when they are received. All the information that passes in
the network between nodes turns into messages.

### Communication with Light Clients

Light clients form [messages](transactions.md) which include
transactions serialized in protobuf, sign them and send to the network.

### Storage of Data

[The storage](../architecture/merkledb.md) is used to place
blocks, configurations, data specific for services. Data obtained from the
storage is not validated, since it is assumed to be validated earlier.

## Using Protobuf from Rust

To apply protobuf serialization to structures in Exonum, users are required to
describe the structures in a file with `.proto` extension, using the
[protobuf interface description language][language].  All the `.proto` files
are then combined into a single module which is used to generate files with
`.rs` extension. The `.rs` files handle the serialization of structures
described in them. And that is it, the described structures can then be
serialized and deserialized in Exonum.  

For example, a simple `Timestamp` structure will have following description
in a `.proto` file:

```protobuf
message Timestamp {
  int64 seconds = 1;
  int32 nanos = 2;
}
```

The same structure will have the following representation in an `.rs`
protobuf-generated file:

```rust
pub struct Timestamp {
    // message fields
    pub seconds: i64,
    pub nanos: i32,
    // special fields skipped...
}
```

Besides the description of structures, the `.rs` files also contain additional
code and functions required for protobuf serialization and deserialization.

For convenience, the [protobuf descriptions][proto-files] of the typical
structures used in Exonum are already included in the framework.

## Building Exonum with Protobuf Serialization

Exonum includes the [`exonum-build`][build]
crate which lets users add the `protobuf_generate` function to their
`build.rs`. This function automatically generates the `.rs` files for all the
`.proto` files during the build process. `exonum-build` needs to be added to
the project as a build dependency. To use `protobuf_generate`, add
the following code to your build script (`build.rs`) indicating the folder
which contains the `.proto` files:

```rust
use exonum_build::{ProtoSources, ProtobufGenerator};

fn main() {
    ProtobufGenerator::with_mod_name("protobuf_mod.rs")
        .with_input_dir("src/proto")
        // The exact list of included files may differ depending on
        // what Protobuf messages defined in Exonum you need to use.
        .with_includes(&[
            "src/proto".into(),
            ProtoSources::Exonum,
            ProtoSources::Crypto,
        ])
        .generate();
}
```

To use Protobuf-generated Rust structures, you first need to create a module
which will include the Protobuf-generated files:

```rust
include!(concat!(env!("OUT_DIR"), "/example_mod.rs"));

// If you use types from `exonum` .proto files.
use exonum::proto::schema::*;
```

For example, the generated `Wallet` structure from the
`cryptocurrency.proto` file, which resides in the [`proto`][module] module,
will be available using `proto::cryptocurrency::Wallet`.

!!! tip
    An example of this workflow can be found in the
    [cryptocurrency example service][cryptocurrency].

## Additional Validation for Protobuf-Generated Structures

Protobuf is a versatile and flexible tool, which presents not only
opportunities but also certain complications for the Exonum framework. For
example, fields in protobuf cannot be fixed-size arrays, however, fixed-size
arrays are required in Exonum (e.g. for hashes). It is possible to implement
additional validations using the `.rs` protobuf-generated files. However, if
users work with protobuf-generated structures, field validation would need to
be performed every time they are used.

To have validation performed only once for the whole structure, Exonum
provides the conversion mechanism using the `ProtobufConvert` trait. This trait
lets users automatically map
their structures and the structures generated from `.proto` descriptions,
providing a mechanism for validating protobuf-generated data. The structures
for `ProtobufConvert` should have the same fields as the structures in
`.proto` files, but can contain additional validation.

The [`exonum-derive`][derive]
crate provides the ability to use structures typical for Exonum with all
the required validations. So when using these structures users only need to
implement `#[derive(ProtobufConvert)]` for them. If required, users can
implement the [`ProtobufConvert`][convert] trait for any other structure they
need to add that cannot be described using Protobuf IDL.

For example, the protobuf description of the `SignedMessage` in
Exonum is as follows:

```protobuf
message SignedMessage {
  bytes payload = 1;
  exonum.crypto.PublicKey author = 2;
  exonum.crypto.Signature signature = 3;
}
```

The corresponding `SignedMessage` structure with `ProtobufConvert` has
the following representation:

```rust
use crate::proto::schema::messages;

#[derive(Clone, PartialEq, Eq, Ord, PartialOrd, Debug)]
#[derive(ProtobufConvert, BinaryValue, ObjectHash)]
#[protobuf_convert(source = "messages::SignedMessage")]
pub struct SignedMessage {
    pub payload: Vec<u8>,
    pub author: PublicKey,
    pub signature: Signature,
}
```

Note that it is required to indicate the protobuf structure to which the
current structure refers, in the case above `messages::SignedMessage`.

[protobuf]: https://developers.google.com/protocol-buffers/docs/overview
[proto-files]: https://github.com/exonum/exonum/tree/master/exonum/src/proto/schema/exonum
[language]: https://developers.google.com/protocol-buffers/docs/reference/proto3-spec
[cryptocurrency]: https://github.com/exonum/exonum/blob/master/examples/cryptocurrency/src/proto/cryptocurrency.proto
[convert]: https://github.com/exonum/exonum/blob/master/exonum/src/proto/mod.rs
[module]:https://github.com/exonum/exonum/tree/master/examples/cryptocurrency/src/proto
[derive]: https://crates.io/crates/exonum-derive
[build]: https://crates.io/crates/exonum-build
[anchoring-rs]: https://github.com/exonum/exonum-btc-anchoring/commit/40ab8246926780e61c45f0cb58e85dd28052a4b7#diff-bd54eeb91f53aed3cdb8f077921cae50
[anchoring-proto]: https://github.com/exonum/exonum-btc-anchoring/commit/40ab8246926780e61c45f0cb58e85dd28052a4b7#diff-ca4fef992e1e3385019634379fabdb6c
