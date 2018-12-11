# Exonum Serialization Format

<!-- cspell:ignore cap'n -->

Exonum uses [protobuf][protobuf] as its serialization format for communication
among full nodes, cryptographic operations on [light clients](../architecture/clients.md)
and storage of data. Protobuf is the industry accepted language-neutral,
platform-neutral automated mechanism for serializing data.

## Usage

**Communication Among Full Nodes** Full nodes can both [serialize messages](#message-serialization) for sending and
deserialize messages when they are received. All the information that passes in
the network between nodes turns into messages.

**Communication with Light Clients** Light clients form messages which include
transactions serialized in protobuf, sign them and send to the network.

**Storage of Data** [The storage](../architecture/storage.md) is used to place blocks,
configurations, data specific for services. Data obtained from the storage
is not validated, since it is assumed to be validated earlier.

## Principles of Using Protobuf Serialization

To apply protobuf serialization to structures in Exonum, users are required to describe the required structures in a file with `.proto` extension using the protobuf interface description language. This file is then used by the system to generate a file with `.rs` extension, which handles the serialization of structures described in it. The `.rs` file might seem huge and complicated, but Exonum already features the tools almost fully remove the need to work with the protobuf generated file.



## Message Serialization

A message is a [digitally signed](../glossary.md#digital-signature) piece of data
transmitted through an Exonum network. Exonum operates with with messages and transaction, which transaction being a definite part of the message.

- **Consensus messages** are used among full
  nodes in the course of [the consensus algorithm](../glossary.md#consensus)
- **Transactions** are used to invoke [blockchain state](../glossary.md#blockchain-state)
  changes and usually come from [external clients](../glossary.md#light-client)

The message serialization consists of 3 main parts: header (the public address of the message author),
payload, and signature.

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
    types of transactions: `TxCreateWallet` for creating a wallet with an initial
    coins balance,
    and `TxTransfer` for coin transfer.

**Binary presentation:** `u16` (unsigned 2-byte integer).  
**JSON presentation:** number.

### Payload length

The length of the entire message serialization (including its header and signature).

**Binary presentation:** `u32` (unsigned 4-byte integer).  
**JSON presentation:** (not serialized).

### Body

Serialized [structure](#structures) (including its header and body) described on
`transactions!` macro call.

### Signature

[Ed25519 digital signature](https://ed25519.cr.yp.to/) over the binary
serialization of the message (excluding the signature bytes,
i.e., the last 64 bytes of the serialization).

**Binary presentation:** Ed25519 signature (64 bytes).  
**JSON presentation:** hex string.

### Example of `transactions!` Usage

```rust
const MY_SERVICE_ID: u16 = 777;

transactions! {
    Transactions {
        const SERVICE_ID = MY_SERVICE_ID;

        struct MessageTwoIntegers {
            first: u64,
            second: u64,
        }
    }
}
```

Here the message body is serialized as a `struct` with fields `first` and `second`
having type `u64`.

## Types to Be Supported in Future

The current version does not support the serialization of the following types,
but it is planned to be implemented in future:

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

```rust
#[macro_use] extern crate exonum;
extern crate hex;
use exonum::crypto::PublicKey;
use exonum::storage::StorageValue;
use hex::FromHex;

encoding_struct! {
    struct Wallet {
        pub_key: &PublicKey,
        owner: &str,
        balance: u64,
    }
}
// `encoding_struct` macro defines a constructor (`new`)
// and field access methods (`pub_key`, `owner`, `balance`) automatically.

let pub_key_str = "99ace6c721db293b0ed5b487e6d6111f\
                   22a8c55d2a1b7606b6fa6e6c29671aa1";
let pub_key: PublicKey = pub_key_str.parse().unwrap();
let my_wallet = Wallet::new(&pub_key, "Andrew", 1234);

// Check structure content
assert_eq!(*my_wallet.pub_key(), pub_key);
assert_eq!(my_wallet.owner(), "Andrew");
assert_eq!(my_wallet.balance(), 1234);

let expected_buffer_str = pub_key_str.to_owned() + // Public key
                          "30000000" +             // Segment start
                          "06000000" +             // Segment size
                          "d204000000000000" +     // Balance
                          "416e64726577";          // Name
let expected_buffer = Vec::<u8>::from_hex(&expected_buffer_str)
    .unwrap();
assert_eq!(my_wallet.into_bytes(), expected_buffer);
```

Serialized representation of `my_wallet`:

| Position | Stored data | Hexadecimal form                                                                                  | Comment                                                                                        |
|:---------|:-----------:|:--------------------------------------------------------------------------------------------------|:-----------------------------------------------------------------------------------------------|
| 0..32    |             | `99 ac e6 c7 21 db 29 3b 0e d5 b4 87 e6 d6 11 1f 22 a8 c5 5d 2a 1b 76 06 b6 fa 6e 6c 29 67 1a a1` | Public key                                                                                     |
| 32..36   |     48      | `30 00 00 00`                                                                                     | A little endian segment pointer that refers to the string position in the serialization buffer |
| 36..40   |      6      | `06 00 00 00`                                                                                     | A little endian segment size                                                                   |
| 40..48   |    1234     | `d2 04 00 00 00 00 00 00`                                                                         | A number in little endian format                                                               |
| 48..54   |   Andrew    | `41 6e 64 72 65 77`                                                                               | UTF-8 string converted into a byte array                                                       |

[transactions_macro]: https://docs.rs/exonum/*/exonum/macro.transactions.html
[encoding_struct_macro]: https://docs.rs/exonum/*/exonum/macro.encoding_struct.html
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
[cryptocurrency]: https://github.com/exonum/exonum/blob/master/examples/cryptocurrency
[rust-slice]: https://doc.rust-lang.org/book/first-edition/primitive-types.html#slicing-syntax
[rust]: http://rust-lang.org/
[cargo_features]: https://doc.rust-lang.org/cargo/reference/manifest.html#the-features-section
[subnormal_fp]: https://en.wikipedia.org/wiki/Denormal_number
[protobuf]: https://developers.google.com/protocol-buffers/docs/overview
