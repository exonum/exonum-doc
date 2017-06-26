# Exonum Serialization Format

**Binary serialization format** is used in Exonum for communication
among full nodes, cryptographic operations on light clients and storage of data.
The format design provides several important properties,
including resilience to maliciously crafted messages, [zero-copy][zero_copy]
deserialization and canonicity.

Serialization in Exonum differs from serialization in the usual sense, since
there is no process of transforming the structure into binary data. The data is
created already "serialized" and Exonum works directly with the serialized data
"deserializing" the fields to which it refers, if necessary.

## Usage

### Communication Among Full Nodes

Full nodes can both serialize messages for sending and deserialize messages
when they are received. All the information that passes in the network between
nodes turns into messages (the [`message!` macro][message_macro]). Data
received as a message is validated against [serialization rules](#serialization-principles).

### Communication with light clients

Light clients can only serialize messages due to the complexity of the checks
necessary for the deserialization process. Transactions are created on the
client side and sent to the validators in order to be committed into the
blockchain. The client sends the transaction in the JSON format along with a
signature over the binary serialization of the transaction. Similarly, when the
client receives data from a full node, the client serializes the data received
in the JSON format and verifies the signature against the binary serialization
of the data.

### Storage of data

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
  It should be possible to set the data scheme and check the message for
  compliance with the scheme (this allows to [check](#validation-rules) the
  received message before reading its content). The scheme should not allow the
  presence of optional fields. In the Exonum serialization format the scheme is
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
  [segment pointers](#structures) are not necessary but used for quick access to
  fields.

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

The serialization format uses *segment pointers* to serialize data which size is
unknown in compile time (i.e., doesn't follow from the type specification).
The segment pointer mechanism is slightly similar to the concept of heap in
[memory management](https://en.wikipedia.org/wiki/Memory_management).

### Validation Rules

- Sizes of the segments must correspond to the data schema

- Segments must not overlap

- There must be no gaps between the segments

- Segment pointers must not refer to the memory before themselves (this
  guarantees the absence of loops)

- The segment pointers must not point outside the buffer

### Fixed-length and var-length types

The way a particular data type is serialized within a complex type (e.g.,
sequence) depends on whether the instances of this type may exhibit variable
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

## Primitive types

- `u8`, `i8`, `u16`, `i16`, `u32`, `i32`, `u64`, `i64`  
  Correspond to the same [Rust language primitive types][rust_primitive_types].
  Their size is the same as for correspond Rust types and they are stored in
  little endian.

- `bool`  
  `0x01` for true, `0x00` for false. A message with other value stored in place
  of `bool` will not pass validation. Size: 1 byte.

## Aggregate types

### Byte buffers

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
with 1 to 4 bytes.

### Structures

A sequence is representation of [`struct` in Rust][rust_structs]. It is data
structure with a fixed number of possibly heterogeneous fields.

In binary representation sequence is split into two main parts (which are
adjacent to each other for each serialized sequence):

- **Header** is a fixed sized part.

- **Body** is a dynamic sized part, it can be read only after parsing header.

Data of fixed-length types is stored completely in the header.

!!! note "Example"
    Consider a sequence containing `PublicKey`, `u64` and `bool` fields. In the
    binary format all fields of such sequence are placed in the header, its body
    is empty. So such a sequence is fixed-length.

Var-length types take 8 bytes in header of sequence: 4 for
position in the body (counted from the beginning of the whole serialization
buffer), and 4 for data size. So the header points to the data in the body. Data
segments are placed in the correspondence with [the validation rules](#validation-rules).

### Slices

A slice is a data structure consisting of an arbitrary number of same type elements.
A slice is stored so that the position of each element can be computed from its
index. Slice elements are located in memory without gaps in the order of
increasing their indexes.

Slices like structures have header and body. If slice consists of fixed-length
elements, then its body contain elements themselves. If slice consists of
var-length elements, the body of such a slice contains
pointers to the elements of the slice, and elements themselves are located
further in memory.

!!! note
    In the current implementation, a slice of borrowed type elements can not be
    used for serialization/deserialization because of missing deserialize
    implementation for borrowed types.
    For example slice of `&str` can not be serialized/deserialized.
    This is planned to be fixed in future.

## Types to be supported in future

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

let pub_key_hex = HexValue::from_hex(pub_key_str.as_bytes());
let my_wallet = Wallet::new(pub_key_hex, "Andrew", 1234);

// check structure content

assert_eq!(my_wallet.pub_key().to_hex(), pub_key_str);
assert_eq!(my_wallet.owner(), "Andrew");
assert_eq!(my_wallet.balance(), 1234);

let expected_buffer = HexValue::from_hex((pub_key_str + // Public key
                                          "10000000" +  // Segment pointer position
                                          "06000000" +  // Segment size
                                          "d204000000000000" + // Balance
                                          "416e64726577"       // Name
                                         ).as_bytes()
                                        );
assert_eq!(my_wallet.serialize(), expected_buffer);
```

Serialized representation of `my_wallet`:

| Position | Stored data  | Hexadecimal form | Comment |
|:--------|:------:|:---------------------|:--------------------------------------------------|
`0 => 32`  |       | `99 ac e6 c7 21 db 29 3b 0e d5 b4 87 e6 d6 11 1f 22 a8 c5 5d 2a 1b 76 06 b6 fa 6e 6c 29 67 1a a1` | Public key |
`32  => 36`  | 16    | `10 00 00 00`            | Little endian stored segment pointer, refer to position in data where real string is located |
`36  => 40`  | 6     | `06 00 00 00`            | Little endian stored segment size |
`40  => 48` | 1234   | `d2 04 00 00 00 00 00 00`| Number in little endian |
`48 => 54` | Andrew| `41 6e 64 72 65 77`       | Real text bytes|

[message_macro]: https://github.com/exonum/exonum-core/blob/master/exonum/src/messages/spec.rs
[encoding_struct_macro]: https://github.com/exonum/exonum-core/blob/master/exonum/src/encoding/spec.rs
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
