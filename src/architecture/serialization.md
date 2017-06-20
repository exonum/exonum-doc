# Exonum Serialization Format

Serialization in Exonum differs from serialization in the usual sense, since
there is no process of transforming the structure into binary data. The data is
created already "serialized" and Exonum works directly with the serialized data
"deserializing" the fields to which it refers, if necessary.

In Exonum, the binary format is used for three purposes:

- **Communication of full nodes using consensus messages**  
  Full nodes can both serialize messages for sending and deserialize messages
  when they are received. All the information that passes in the network between
  nodes turns into messages (the [`message!` macro][message_macro]). Data
  received as a message is validated.

- **Communication with light clients**  
  Light clients can only serialize messages due to the complexity of the checks
  necessary for the deserialization process. Transactions are created on the
  client side and sent to the validators in order to be committed into the
  blockchain. The client serializes the transaction and sends it in JSON format
  along with a signature to the data in a binary format. Similarly, when the
  client receives data from a full node, the client serializes the data received
  in the JSON format to verify the signature.

- **Storage of data**  
  The storage is used to place blocks, configurations, data specific for services
  (for example, wallet). Serialization is implemented by [`storage_value!`
  macro][storage_value_macro]). Data obtained from the storage is not validated,
  since it is assumed to be validated earlier.

## Motivation of Own Serialization Format

### Data Representation Requirements in Exonum

- **Unambiguity** (one can uniquely restore the original data based on serialized
  data)  
  It is required that the verification of the transaction structure on all nodes
  is identical, hence the format should be binary.

- **Canonicity**  
  The data set must be presented in only one way. Required for uniqueness of the
  hash of data.

- Serialized data can not be partially correct  
  Reading the fields does not happen until the validation is complete.

- **Byzantine fault tolerance (BFT)**  
  The node must be ready to receive the Byzantine message.

- Storage of the data in the same form as it is sent  
  Nodes forward almost all received messages unchanged. Storage of data in the
  same form allows node not to waste time on the  message re-creating. In this
  case, deserialization consists in verifying the correctness of all fields.
  This requirement allows to achieve [zero-copy][zero_copy].

- Conversion to JSON and back (used to communicate with light clients) must be
  unambiguous. The binary format and JSON must have the same data schema.

- It should be possible to set the data scheme and check the message for
  compliance with the scheme. The scheme should not allow the presence of
  optional fields.

- Validation on message reading can not be lazy: first check the entire message
  to the end, then read completely without checking.

- The format should be effective in terms of data compression. The Exonum
  serialization format contains a trade-off with the speed of work: pointers for
  quick access to fields are not necessary.

- Serialization should work on all architectures / platforms identically. The
  little-endian is always used in the Exonum so that reading and writing on
  modern platforms are direct.

### Alternative Serialization Formats

- [ASN.1 DER][asn_der]  
  Provides canonicity but poorly extensible.

- [Protocol Buffers][wiki_protobuf]  
  Does not provide canonicity, has problems with BFT.

- [Cap'n Proto][cap_n_proto]  
  Meets all requirements since version 0.5 ([canonicalization][cap_n_proto_canonicalization]
  was introduced).

- [Simple Binary Encoding (SBE)][sbe]  
  BFT problem.

- [FlatBuffers][wiki_flatbuf]  
  Poor documentation, BFT problem.

## Serialization Principles

### Primitive types

- `u8`, `i8`, `u16`, `i16`, `u32`, `i32`, `u64`, `i64`  
  Correspond to the same [Rust language primitive types][rust_primitive_types].
  Their size is the same as for correspond Rust types and they are stored in
  little endian.

- `bool`  
  `0x01` for true, `0x00` for false. A message with other value stored in place
  of `bool` will not pass validation. Size: 1 byte.

### Other types that have fixed-length serialization

`Hash` and `PublicKey` types represent SHA-256 hashes and Ed25519 public keys
and take 32 bytes.

### Slices

A slice is a data structure consisting of a collection of same type elements.
A slice is stored so that the position of each element can be computed from its
index. Slice elements are located in memory without gaps in the order of
increasing their indexes.

### Sequences

A sequence is representation of [`struct` in Rust][rust_structs]. It is data
structure with a fixed number of possibly heterogeneous fields.

In binary representation sequence is splitted into two main parts:

- **Header** is a fixed sized part.

- **Body** is a dynamic sized part, it can be read only after parsing header.

Data of primitive types as well as other types that have fixed-length
serialization are stored completely in the header.

Other types take 8 bytes in header of sequence: 4 for position in the body
(counted from the beginning of the whole serialization buffer), and 4
for data size. So the header points to the data in the body. Data segments are
placed in the body without gaps or overlaps, and in the same order as the
corresponding fields in the header.

## Example

Consider the structure with two fields:

- Name: `String`  
  Andrew

- Age: `u64`  
  23

To serialize the structure, one may use macros like this:

```Rust
storage_value! {
    struct MyAwesomeStructure {
        const SIZE = 16;

        field name: &str [0 => 8]
        field age:  u64  [8 => 16]
    }
}

// create serialized structure in memory

    let student = MyAwesomeStructure::new("Andrew", 23);
```

Its serialized representation:

### Header

| Position | Stored data  | Hexadecimal form | Comment |
|:--------|:------:|:---------------------|:--------------------------------------------------|
`0  => 4`  | 16    | `10 00 00 00`            | Little endian stored segment pointer, refer to position in data where real string is located |
`4  => 8`  | 6     | `06 00 00 00`            | Little endian stored segment size |
`8  => 16` | 23    | `17 00 00 00 00 00 00 00`| Number in little endian |

### Body

| Position | Stored data  | Hexadecimal form | Comment |
|:--------|:------:|:---------------------|:--------------------------------------------------|
`16 => 24` | Andrew| `41 6e 64 72 65 77`       | Real text bytes|

[message_macro]: https://github.com/exonum/exonum-core/blob/master/exonum/src/messages/spec.rs
[storage_value_macro]: https://github.com/exonum/exonum-core/blob/master/exonum/src/blockchain/spec.rs
[zero_copy]: https://en.wikipedia.org/wiki/Zero-copy
[asn_der]: https://en.wikipedia.org/wiki/X.690#DER_encoding
[wiki_protobuf]: https://en.wikipedia.org/wiki/Protocol_Buffers
[cap_n_proto]: https://capnproto.org/
[cap_n_proto_canonicalization]: https://capnproto.org/encoding.html#canonicalization
[sbe]: https://github.com/real-logic/simple-binary-encoding
[wiki_flatbuf]: https://en.wikipedia.org/wiki/FlatBuffers
[rust_primitive_types]: https://doc.rust-lang.org/book/primitive-types.html
[rust_structs]: https://doc.rust-lang.org/book/structs.html
