# Exonum Serialization Format

Serialization in Exonum differs from serialization in the usual sense, since
there is no process of transforming the structure into binary data. The data is
created already "serialized" and Exonum works directly with the serialized data
"deserializing" the fields to which it refers, if necessary.

In Exonum, the binary format is used for two purposes:

- **Message serialization**: everything that passes in the network between nodes
  turns into messages (the [`message!` macro][message_macro]). Data received as
  a message is validated.

- **Serialization of data stored in the blockchain** (the [`storage_value!`
  macro][storage_value_macro]). Data obtained from the blockchain is not
  validated, since it is assumed to be validated earlier.

## Motivation of Own Serialization Format

Due to the fact that the messages do not need to be serialized/deserialized
between the wire format and the in-memory representation, it is possible to work
with the signed messages, and later, if necessary, transfer them to other
nodes. This is necessary for the consensus algorithm. Also, "deserialization" of
unused fields does not occur without the need, which minimizes the overhead.
Moreover, this format allows to achieve [zero-copy][zero_copy] because the data
itself is a kind of non-mutable buffer that can be safely transmitted, and there
will be no copying until there is no access to the fields.

## Serialization Principles

### Primitive types

- `u8`, `i8`, `u16`, `i16`, `u32`, `i32`, `u64`, `i64`  
  Correspond to the same [Rust language primitive types][rust_primitive_types].
  Their size is the same as for correspond Rust types and they are stored in
  little endian.

- `bool`  
  `0x01` for true, `0x00` for false. A message with other value stored in place
  of `bool` will not pass validation. Size: 1 byte.

### Arrays

An array is a data structure consisting of a collection of same type elements.
An array is stored so that the position of each element can be computed from its
index. Array elements are located in memory without gaps in the order of
increasing their indexes. String is array of bytes example.

### Sequences

A sequence is representation of [`struct` in Rust][rust_structs]. It is data
structure with a fixed number of possibly heterogeneous fields.

In binary representation sequence is splitted into two main parts:

- **Header** is a fixed sized part.

- **Body** is a dynamic sized part, it can be read only after parsing header.

Data of primitive types as well as arrays of fixed length (for example
`PublicKey`) are stored completely in the header.

Other types take 8 bytes in header of sequence: 4 for position in the body, and 4
for data size. So the header points to the data in the body. Data segments are
placed in the body without gaps or overlaps, and in the same order as the
corresponding fields in the header.

## Example

Consider the structure with two fields:

- Name: `String`  
  Andrew

- Age: `u64`  
  23

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
[rust_primitive_types]: https://doc.rust-lang.org/book/primitive-types.html
[rust_structs]: https://doc.rust-lang.org/book/structs.html
