# Serialization in Exonum

<!-- cspell:ignore cap'n -->

Exonum uses [protobuf][protobuf] as its serialization format for communication
among full nodes, cryptographic operations on
[light clients](../architecture/clients.md)
and storage of data. Protobuf is the industry accepted language-neutral and
platform-neutral automated mechanism for serializing data.

## Usage

**Communication Among Full Nodes** Full nodes can both
serialize messages for sending and
deserialize messages when they are received. All the information that passes in
the network between nodes turns into messages.

**Communication with Light Clients** Light clients form messages which include
transactions serialized in protobuf, sign them and send to the network.

**Storage of Data** [The storage](../architecture/storage.md) is used to place
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

  // Represents seconds of UTC time since Unix epoch
  // 1970-01-01T00:00:00Z. Must be from 0001-01-01T00:00:00Z to
  // 9999-12-31T23:59:59Z inclusive.
  int64 seconds = 1;

  // Non-negative fractions of a second at nanosecond resolution. Negative
  // second values with fractions must still have non-negative nanos values
  // that count forward in time. Must be from 0 to 999,999,999
  // inclusive.
  int32 nanos = 2;
}
```

The same structure will have the following representation in an `.rs` protobuf
generated file:

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

Exonum includes the
[`exonum_build`](https://github.com/exonum/exonum/tree/master/exonum_build)
crate which lets users add the `protobuf_generate` function to their
`build.rs`. This function automatically generates the `.rs` files for all the
`.proto` files during the build process. To use `protobuf_generate`, add the
following code to `build.rs` indicating the folder which contains the `.proto`
files:

```rust
use exonum_build::protobuf_generate;

protobuf_generate("src/proto", &["src/proto"], "example_mod.rs")
```

To use protobuf generated Rust structures:

```rust
extern crate exonum;

include!(concat!(env!("OUT_DIR"), "/example_mod.rs"));

// If you use types from `exonum` .proto files.
use exonum::proto::schema::*;
```

## Additional Validation for Protobuf Generated Structures

Protobuf is a versatile and flexible tool, which presents not only
opportunities but also certain complications for the Exonum framework. For
example, fields in protobuf cannot be fixed size arrays, however, fixed size
arrays are required in Exonum (e.g. for hashes). It is possible to implement
additional validations using the `.rs` protobuf generated files. However, the
`.rs` files might seem large and complicated, so Exonum features the
tools that almost fully remove the need to work with the protobuf generated
files.

To somewhat limit the flexibility of protobuf generated structures, Exonum
provides the `ProtobufConvert` trait. This trait lets users automatically map
their structures and the structures generated from `.proto` descriptions,
providing a mechanism for validating protobuf generated data. The structures
for `ProtobufConvert` should have the same fields as the structures in
`.proto` files, but can contain additional validation.

The
[`exonum_derive`](https://github.com/exonum/exonum/tree/master/exonum_derive)
crate provides descriptions of the structures typically used in Exonum with all
the required validations. So when using these structure users only need to
implement `#[derive(ProtobufConvert)]` for them. If required, users can
implement the `ProtobufConvert` trait for any additional structures they need.

For example, the protobuf description of the `Connect` message in Exonum is as
follows:

```protobuf
message Connect {
  string pub_addr = 1;
  google.protobuf.Timestamp time = 2;
  string user_agent = 3;
}
```

The corresponding `Connect` structure with `ProtobufConvert` has the following
representation:

```rust
#[derive(Clone, PartialEq, Eq, Ord, PartialOrd, Debug, ProtobufConvert)]
#[exonum(pb = "proto::Connect", crate = "crate")]
pub struct Connect {
    /// The node's address.
    pub_addr: String,
    /// Time when the message was created.
    time: DateTime<Utc>,
    /// String containing information about this node.
    user_agent: String,
}
```

Note that it is required to indicate the protobuf structure to which the
current structure refers, in the case above `proto::Connect`.

[protobuf]: https://developers.google.com/protocol-buffers/docs/overview
[proto-files]: https://github.com/exonum/exonum/tree/master/exonum/src/proto/schema/exonum
[language]: https://developers.google.com/protocol-buffers/docs/reference/proto3-spec
