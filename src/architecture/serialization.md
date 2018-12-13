# Serialization in Exonum

<!-- cspell:ignore cap'n -->

Exonum uses [protobuf][protobuf] as its serialization format for communication
among full nodes, cryptographic operations on
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

[The storage](../architecture/storage.md) is used to place
blocks, configurations, data specific for services. Data obtained from the
storage is not validated, since it is assumed to be validated earlier.

## Principles of Using Protobuf Serialization

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
    // special fields
    #[cfg_attr(feature = "with-serde", serde(skip))]
    pub unknown_fields: ::protobuf::UnknownFields,
    #[cfg_attr(feature = "with-serde", serde(skip))]
    pub cached_size: ::protobuf::CachedSize,
}
```

Besides the description of structures, the `.rs` files also contain additional
code and functions required for protobuf serialization and deserialization.

For convenience, the [protobuf descriptions][proto-files] of the typical
structures used in Exonum are already included in the framework.

## Building Exonum with Protobuf Serialization

Exonum includes the [`exonum_build`][build]
crate which lets users add the `protobuf_generate` function to their
`build.rs`. This function automatically generates the `.rs` files for all the
`.proto` files during the build process. `exonum_build` needs to be added to
the project as a build dependancy. To use `protobuf_generate`, add
the following code to `build.rs` indicating the folder which contains the
`.proto` files:

```rust
use exonum_build::protobuf_generate;

protobuf_generate("src/proto", &["src/proto"], "example_mod.rs")
```

To use protobuf-generated Rust structures, users first need to create a module
which will include the protobuf-generated files:

```rust
include!(concat!(env!("OUT_DIR"), "/example_mod.rs"));

// If you use types from `exonum` .proto files.
use exonum::proto::schema::*;
```

Then to access a structure from a protobuf-generated file, you need to indicate
the name of the module with the generated files and the name of the required
file and structure in it:

```rust
use module_name::proto_file_name::StructName;

fn deserialize(bytes: &[u8]) -> StructName {
    let mut pb = StructName::new();
    pb.merge_from_bytes(slice).unwrap();
    pb
}

fn serialize(pb: &StructName) -> Vec<u8> {
    pb.write_to_bytes().unwrap()
}
```

For example, the generated `Wallet` structure, included in the
`cryptocurrency.proto` file, which resides in the [`proto`][module] module,
will be available using `proto::cryptocurrency::Wallet`.

`exonum_build` also includes a function which returns the path to the `.proto`
files that come with the `exonum` crate - `get_exonum_protobuf_files_path()`:

```rust
let exonum_protos = get_exonum_protobuf_files_path();
protobuf_generate(
    "src/proto",
    &["src/proto", &exonum_protos],
    "example_mod.rs",
    );
```

After calling the `get_exonum_protobuf_files_path()` function, users can
import protobuf descriptions from the `exonum` crate in their `.proto` files.
For example, `import "helpers.proto";` can be used to get access to protobuf
types `exonum.PublicKey`, `exonum.Hash`, etc. An example of such usage can be
found in our [cryptocurrency example service][cryptocurrency].

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

The [`exonum_derive`][derive]
crate provides the ability to use structures typical for Exonum with all
the required validations. So when using these structures users only need to
implement `#[derive(ProtobufConvert)]` for them. If required, users can
implement the [`ProtobufConvert`][convert] trait for any other structure they
need to add that cannot be sufficiently described by means of protobuf. An
example of such usage can be viewed in the [mod.rs][anchoring-rs] file of the 
Anchoring service and its corresponding [`.proto`][anchoring-proto] file.

For example, the protobuf description of the `TransactionRequest` message in
Exonum is as follows:

```protobuf
message TransactionsRequest {
  exonum.PublicKey to = 1;
  repeated exonum.Hash txs = 2;
}
```

The corresponding `TransactionRequest` structure with `ProtobufConvert` has
the following representation:

```rust
#[derive(Clone, PartialEq, Eq, Ord, PartialOrd, Debug, ProtobufConvert)]
#[exonum(pb = "proto::TransactionsRequest")]
pub struct TransactionsRequest {
    /// Public key of the recipient.
    to: PublicKey,
    /// The list of the transaction hashes.
    txs: Vec<Hash>,
}
```

Note that it is required to indicate the protobuf structure to which the
current structure refers, in the case above `proto::TransactionRequest`.

[protobuf]: https://developers.google.com/protocol-buffers/docs/overview
[proto-files]: https://github.com/exonum/exonum/tree/master/exonum/src/proto/schema/exonum
[language]: https://developers.google.com/protocol-buffers/docs/reference/proto3-spec
[cryptocurrency]: https://github.com/exonum/exonum/blob/master/examples/cryptocurrency/src/proto/cryptocurrency.proto
[convert]: https://github.com/exonum/exonum/blob/master/exonum/src/proto/mod.rs
[module]:https://github.com/exonum/exonum/tree/master/examples/cryptocurrency/src/proto
[derive]: https://github.com/exonum/exonum/tree/master/components/derive
[build]: https://github.com/exonum/exonum/tree/master/components/build/
[anchoring-rs]: https://github.com/exonum/exonum-btc-anchoring/blob/master/src/proto/mod.rs#L33
[anchoring-proto]: https://github.com/exonum/exonum-btc-anchoring/blob/master/src/proto/btc_anchoring.proto#L20
