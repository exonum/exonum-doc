# Exonum Serialization Format

**Binary serialization format** is used in Exonum for communication
among full nodes, cryptographic operations on [light clients](../architecture/clients.md)
and storage of data. The format design provides several important properties,
including resilience to maliciously crafted messages, [zero-copy][zero_copy]
deserialization and canonicity.

Serialization in Exonum differs from serialization in the usual sense, since
there is no process of transforming the structure into binary data. The data is
created already "serialized" and Exonum works directly with the serialized data
"deserializing" the fields to which it refers, if necessary.

## Usage

### Communication Among Full Nodes

Full nodes can both [serialize messages](#message-serialization) for sending and
deserialize messages when they are received. All the information that passes in
the network between nodes turns into messages (the [`message!` macro][message_macro]).
Data received as a message is validated against [serialization rules](#serialization-principles).

### Communication with Light Clients

Light clients can only serialize messages due to the complexity of the checks
necessary for the deserialization process. Transactions are created on the
client side and sent to the validators in order to be committed into the
blockchain. The client sends the transaction in the JSON format along with a
signature over the binary serialization of the transaction. Similarly, when the
client receives data from a full node, the client serializes the data received
in the JSON format and verifies the signature against the binary serialization
of the data.

### Storage of Data

[The storage](../architecture/storage.md) is used to place blocks,
configurations, data specific for services. Serialization is implemented by
[`encoding_struct!` macro][encoding_struct_macro]). Data obtained from the storage
is not validated, since it is assumed to be validated earlier.

## Motivation

### Data Representation Requirements in Exonum

- **Unambiguity** (one can uniquely restore the original data based on serialized
  data)  
  It is required that the verification of the transaction structure on all nodes
  is identical, hence the format should be binary.

- **Canonicity**  
  The data set must be presented in only one way. Required for uniqueness of the
  hash of data.

- **Schema-based verification**  
  It should be possible to set the data schema and check the message for
  compliance with the schema (this allows to [check](#validation-rules) the
  received message before reading its content). The schema should not allow the
  presence of optional fields. In the Exonum serialization format the schema is
  stored separately from the serializable data.

- **All-or-nothing approach to correctness**  
  Reading the fields does not happen until the validation is complete.
  Validation on message reading can not be lazy: first [check](#validation-rules)
  the entire message to the end, then read completely without checking.

- **Tolerance to malicious messages**  
  The node must not fail on receiving a message violating the serialization
  rules.

- **Single format for storage and wire transfer**  
  Nodes forward almost all received messages unchanged. Storage of data in the
  same form allows node not to waste time on the  message re-creating. In this
  case, deserialization from the wire format after receiving a message consists
  in verifying the correctness of all fields.
  This requirement allows to achieve [zero-copy][zero_copy].

- **Unambiguity of conversion to JSON and back**  
  The binary format and JSON (used to communicate with light clients) must have
  the same data schema. This requirement provides the ability of light clients
  to verify cryptographically signed messages.

- **Balance between access speed and data compactness**  
  The Exonum serialization format contains a trade-off with the speed of work:
  [segment pointers](#segment-pointers) are not necessary but used for quick
  access to fields.

- **Identity of serialization on all architectures / platforms**  
  The little-endian is always used in the Exonum so that reading and writing on
  modern platforms are direct.

### Alternative Serialization Formats

The existing serialization formats do not satisfy requirements on serialization,
that's why Exonum uses a custom format.

- [ASN.1 DER][asn_der]  
  Provides canonicity but poorly extensible.

- [Protocol Buffers][wiki_protobuf]  
  Does not provide canonicity, has problems with tolerance to malicious messages.

- [Cap'n Proto][cap_n_proto]  
  Meets all requirements since version 0.5 ([canonicalization][cap_n_proto_canonicalization]
  was introduced).

- [Simple Binary Encoding (SBE)][sbe]  
  Problems with tolerance to malicious messages.

- [FlatBuffers][wiki_flatbuf]  
  Problems with tolerance to malicious messages.

## Serialization Principles

Serialization in Exonum is based on the datatype specifications. Each
serializable datatype has its (de)serialization rules, which govern how the
instances of this type are (de)serialized from/to a binary buffer. In most cases,
these rules are implicitly inferred from the datatype declaration (e.g., via the
aforementioned `encoding_struct!` macro).

The serialization format uses _segments_ and _segment pointers_ to serialize
data which size is unknown in compile time (i.e., doesn't follow from the type
specification):

- **Segment** is a continuous subarray of the serialization buffer, which
  stores serialization of a certain serializable type instance
- **Segment pointer** is a pair of two unsigned integers: a 0-based
  starting position of a segment relative to the beginning of the entire
  serialization buffer, and the byte size of the segment (or the number of
  elements in [the slice](#slices) in the case a slice is being serialized
  within the segment)

The segment pointer mechanism is slightly similar to the concept of heap in
[memory management](https://en.wikipedia.org/wiki/Memory_management). Similarly
to dynamically allocated memory, datatype serialization procedures may use
segments to allocate space for variable-length data, and point to these segments
using segment pointers.

### Segment Validation Rules

- Segments must not overlap
- There must be no gaps between the segments allocated within the same datatype
- There must be no space in the serialization buffer that does not correspond to
  any data of the serialized object. In particular, there must be no gaps before
  or after segments allocated for a certain datatype
- Segment pointers must not refer to the memory before themselves (this
  guarantees the absence of loops)
- The segment pointers must not point outside the buffer
- Segments must be placed in a specific order determined by the datatype
  performing segment allocation

### Fixed-length and Var-length Types

The way a particular data type is serialized within a complex type (e.g.,
a [structure](#structures)) depends on whether the instances of this type
may exhibit variable
byte length of their serialization. These kinds of types are referred to as
_fixed-length_ and _var-length_, respectively.

- Integer types and booleans are fixed-length. For example, all `u32` instances
  take 4 bytes to serialize.
- Strings are var-length. `"Hello world!"` takes 12 bytes to serialize, and `"👍"`
  takes 4 bytes.
- The rules determining whether an aggregate type is fixed-length are described in
  the corresponding sections below.
- Custom type can be fixed-length if its data size is known in advance (can be
  computed at the compilation stage), or var-length otherwise.

## Primitive Types

### Integer Types

`u8`, `i8`, `u16`, `i16`, `u32`, `i32`, `u64`, `i64`  
Correspond to the same [Rust language primitive types][rust_primitive_types].
Their size is the same as for correspond Rust types and they are stored in
little endian.

### Boolean

`bool`  
`0x01` for true, `0x00` for false. A message with other value stored in place
of `bool` will not pass validation. Size: 1 byte.

## Aggregate Types

### Byte Buffers

The data of the following fixed-length types is stored in the same way as
defined by the underlying byte buffer, without any modifications.

- `Hash`  
  SHA-256 hash. Size: 32 bytes.

- `PublicKey`  
  Ed25519 public key. Size: 32 bytes.

- `Signature`  
  Ed25519 signature. Size: 64 bytes.

### Strings

Strings are stored in [UTF-8 encoding][utf8], which may represent a single char
with 1 to 4 bytes. String is a var-length type.

### Segment Pointers

Segment pointers take 8 bytes:

- 4 bytes for the position of the corresponding segment
  (counted from the beginning of the entire serialization buffer)
- 4 bytes for the number of elements

Both the position and byte size are serialized as little-endian unsigned integers
(i.e., in the same way as `u32`). Hence, segment pointer can be viewed
as a [structure](#structures) with two `u32` fields.

### Structures

A structure is representation of [`struct` in Rust][rust_structs]. It is data
structure with a fixed number of possibly heterogeneous, ordered, named fields.

In binary representation structure is split into two main parts (which are
adjacent to each other for each serialized structure):

- **Header** is a fixed sized part.
- **Body** is a dynamic sized part; it can be read only after parsing the header.

Fixed-length fields are stored completely in the header.
Var-length fields are allocated as segments in the body,
plus take 8 bytes for the serialized segment pointer, as described [above](#segment-pointers).

Thus, a segment pointer in the header (the position of which is known in compile
time) points to the segment in the body,
which contains the actual serialization of the field. Segments are placed
in the correspondence with [the validation rules](#validation-rules).

A structure type is fixed-length if and only if all its fields are fixed-length
(i.e., the body of the binary representation is always empty).

!!! note "Example"
    Consider a structure containing `PublicKey`, `u64` and `bool` fields. In the
    binary format all fields of such structure are placed in the header, its body
    is empty. So such a structure is fixed-length.

### Slices

A slice is a data structure consisting of an arbitrary number of same type elements.
A slice is stored so that the position of each element can be computed from its
index. Slice elements are located in memory without gaps in the order of
increasing their indexes.

Slices like structures have header and body. Each element takes 8 bytes in the
header for a corresponding segment pointer. If slice consists of fixed-length
elements, then its body contain elements themselves. If slice consists of
var-length elements, the body of such a slice contains segment
pointers to the elements of the slice, and elements themselves are located
further in memory as segments as per the validation rules.

Number of the slice elements is specified in the header of structure containing
the slice.

All slices are var-length datatypes.

!!! note
    In the current implementation, a slice of borrowed type elements can not be
    used for serialization/deserialization because of missing deserialize
    implementation for borrowed types.
    For example slice of `&str` can not be serialized/deserialized.
    This is planned to be fixed in future.

## Message Serialization

A message is a [digitally signed](../glossary.md#digital-signature) piece of data
transmitted through an Exonum network. There are 2 major kinds of messages:

- **Consensus messages** are used among full
  nodes in the course of [the consensus algorithm](../glossary.md#consensus)
- **Transactions** are used to invoke [blockchain state](../glossary.md#blockchain-state)
  changes and usually come from [external clients](../glossary.md#light-client)

The message serialization consists of 3 main parts: header (includes `network_id`,
`protocol_version`, `service_id`, `message_id`, and `payload_length` fields),
body, and signature.

Fields used in message serialization are listed below.
Serialized [structure](#structures) (including its header and body) described on
`message!` macro call.

### Signature

[Ed25519 digital signature](https://ed25519.cr.yp.to/) over the binary
serialization of the message (excluding the signature bytes,
i.e., the last 64 bytes of the serialization).

**Binary presentation:** Ed25519 signature (64 bytes).  
**JSON presentation:** hex string.

### Example of `message!` Usage

```Rust
const MY_SERVICE_ID: u16 = 777;
const MY_NEW_MESSAGE_ID: u16 = 1;

message! {
    struct MessageTwoIntegers {
        const TYPE = MY_NEW_MESSAGE_ID;
        const ID   = MY_SERVICE_ID;
        const SIZE = 16;

        field first: u64 [0 => 8]
        field second: u64 [8 => 16]
    }
}
```

Here the message body is serialized as a `struct` with fields `first` and `second`
having type `u64`.
=======
Serialized message consists of the following parts:
=======

| Field              | Binary format     | Binary offset | JSON       |
|--------------------|:-----------------:|--------------:|:----------:|
| `network_id`       | `u8`              | 0             | number     |
| `protocol_version` | `u8`              | 1             | number     |
| `service_id`       | `u16`             | 4..6          | number     |
| `message_id`       | `u16`             | 2..4          | number     |
| `payload_length`   | `u32`             | 6..10         | -          |
| `body`             | `&[u8]`           | 10..-64       | object     |
| `signature`        | Ed25519 signature | -64..         | hex string |

!!! tip
    For the binary format, the table uses the type notation taken
    from [Rust][rust]. Offsets also correspond to [the slicing syntax][rust-slice],
    with the exception that Rust does not support negative offsets,
    which denote an offset relative to the end of the byte buffer.

### Network ID

This field will be used to send inter-blockchain messages in the future
releases. Not used currently.

**Binary presentation:** `u8` (unsigned 1-byte integer).  
**JSON presentation:** number.

### Protocol Version

The major version of the Exonum serialization protocol. Currently, `0`.

**Binary presentation:** `u8` (unsigned 1-byte integer).  
**JSON presentation:** number.

### Service ID

Used when the message is a transaction.
Sets the [service](services.md) that a transaction belongs to.
The pair `(service_id, message_id)` is
used to look up the implementation of [the transaction interface](transactions.md#interface)
(e.g., `verify` and `execute` methods).

**Binary presentation:** `u16` (unsigned 2-byte integer).  
**JSON presentation:** number.

### Message ID

`message_id` defines the type of message within the service.

!!! note "Example"
    [The sample cryptocurrency service][cryptocurrency] includes 2 main
    types of transactions: `TxIssue` for coins issuance
    and `TxTransfer` for coin transfer.

**Binary presentation:** `u16` (unsigned 2-byte integer).  
**JSON presentation:** number.

### Payload length

The length of the message body after the header. Does not include the
signature length.

**Binary presentation:** `u32` (unsigned 4-byte integer).  
**JSON presentation:** (not serialized).

### Body

Serialized [structure](#structures) (including its header and body) described on
`message!` macro call.

### Signature

[Ed25519 digital signature](https://ed25519.cr.yp.to/) over the binary
serialization of the message (excluding the signature bytes,
i.e., the last 64 bytes of the serialization).

**Binary presentation:** Ed25519 signature (64 bytes).  
**JSON presentation:** hex string.

### Example of `message!` Usage

```Rust
const MY_SERVICE_ID: u16 = 777;
const MY_NEW_MESSAGE_ID: u16 = 1;

message! {
    struct MessageTwoIntegers {
        const TYPE = MY_NEW_MESSAGE_ID;
        const ID   = MY_SERVICE_ID;
        const SIZE = 16;

        field first: u64 [0 => 8]
        field second: u64 [8 => 16]
    }
}
```

Here the message body is serialized as a `struct` with fields `first` and `second`
having type `u64`.

## Types to Be Supported in Future

The current version does not support the serialization of the following types,
but it is planned to be implemented in future:

- Floating point types: `f32`, `f64`
- [Enums][rust_enums]

## Example

Consider the structure with three fields:

- pub_key: `PublicKey`  
  99ace6c721db293b0ed5b487e6d6111f22a8c55d2a1b7606b6fa6e6c29671aa1

- Owner: `String`  
  Andrew

- Balance: `u64`  
  1234

To serialize the structure, one may use macros like this:

```Rust
encoding_struct! {
    struct Wallet {
        const SIZE = 48;

        field pub_key:            &PublicKey  [00 => 32]
        field owner:              &str        [32 => 40]
        field balance:            u64         [40 => 48]
    }
}

// `encoding_struct` macro defines a constructor (`new`) and field access methods
// (`pub_key`, `owner`, `balance`) automatically.

let pub_key_str = "99ace6c721db293b0ed5b487e6d6111f\
                   22a8c55d2a1b7606b6fa6e6c29671aa1";

let pub_key_hex = HexValue::from_hex(pub_key_str).unwrap();
let my_wallet = Wallet::new(&pub_key_hex, "Andrew", 1234);

// check structure content

assert_eq!(my_wallet.pub_key().to_hex(), pub_key_str);
assert_eq!(my_wallet.owner(), "Andrew");
assert_eq!(my_wallet.balance(), 1234);

let expected_buffer_str = pub_key_str.to_owned() + // Public key
                          "30000000" +             // Segment start
                          "06000000" +             // Segment size
                          "d204000000000000" +     // Balance
                          "416e64726577";          // Name

let expected_buffer: Vec<u8> = HexValue::from_hex(&expected_buffer_str)
                                       .unwrap();

assert_eq!(my_wallet.serialize(), expected_buffer);
```

Serialized representation of `my_wallet`:

| Position | Stored data  | Hexadecimal form | Comment |
|:--------|:------:|:---------------------|:--------------------------------------------------|
`0 => 32`  |       | `99 ac e6 c7 21 db 29 3b 0e d5 b4 87 e6 d6 11 1f 22 a8 c5 5d 2a 1b 76 06 b6 fa 6e 6c 29 67 1a a1` | Public key |
`32  => 36`  | 48    | `30 00 00 00`            | Little endian stored segment pointer, refer to position in data where real string is located |
`36  => 40`  | 6     | `06 00 00 00`            | Little endian stored segment size |
`40  => 48` | 1234   | `d2 04 00 00 00 00 00 00`| Number in little endian |
`48 => 54` | Andrew| `41 6e 64 72 65 77`       | Text bytes in UTF-8 encoding |

[message_macro]: https://github.com/exonum/exonum/blob/master/exonum/src/messages/spec.rs
[encoding_struct_macro]: https://github.com/exonum/exonum/blob/master/exonum/src/encoding/spec.rs
[zero_copy]: https://en.wikipedia.org/wiki/Zero-copy
[asn_der]: https://en.wikipedia.org/wiki/X.690#DER_encoding
[wiki_protobuf]: https://en.wikipedia.org/wiki/Protocol_Buffers
[cap_n_proto]: https://capnproto.org/
[cap_n_proto_canonicalization]: https://capnproto.org/encoding.html#canonicalization
[sbe]: https://github.com/real-logic/simple-binary-encoding
[wiki_flatbuf]: https://en.wikipedia.org/wiki/FlatBuffers
[rust_primitive_types]: https://doc.rust-lang.org/book/first-edition/primitive-types.html
[utf8]: https://en.wikipedia.org/wiki/UTF-8
[rust_structs]: https://doc.rust-lang.org/book/first-edition/structs.html
[rust_enums]: https://doc.rust-lang.org/book/first-edition/enums.html
[cryptocurrency]: https://github.com/exonum/cryptocurrency
[rust-slice]: https://doc.rust-lang.org/book/first-edition/primitive-types.html#slicing-syntax
[rust]: http://rust-lang.org/
