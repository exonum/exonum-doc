# Transactions

A transaction in Exonum
([as in usual databases](https://en.wikipedia.org/wiki/Database_transaction))
is a group of sequential operations with the data (i.e., the Exonum [key-value storage](storage.md)).
Transactions are defined in [services](services.md) and determine all business logic
of any Exonum-powered blockchain.

Transactions are executed [atomically, consistently, in isolation and durably][wiki:acid].
If the transaction execution violates certain data invariants,
the transaction is completely rolled back, so that it does not have any
effect on the persistent storage.

If the transaction is correct, it can be committed, i.e., included into a block
via the [consensus algorithm](../advanced/consensus/consensus.md)
among the blockchain validators. Consensus provides [total ordering][wiki:order]
among all transactions; between any two transactions in the blockchain, 
it is possible to determine which one comes first.
Transactions are applied to the Exonum key-value storage sequentially
in the same order transactions are placed into the blockchain.

All transactions are authenticated with the help of public-key digital signatures.
Generally, a transaction contains the signature verification key (aka public key)
among its parameters. Thus, authorization (verifying whether the transaction author
actually has the right to perform the transaction) can be accomplished
with the help of building a [public key infrastructure][wiki:pki] and/or
various constraints based on this key.

!!! note "Example"
    In a sample [cryptocurrency service][cryptocurrency],
    an owner of cryptocurrency may authorize transferring his coins by signing
    a transfer transaction with a key associated with coins. Authentication
    in this case means verifying that a transaction is digitally signed with
    a specific key, and authorization means that this key is associated with
    a sufficient amount of coins to make the transaction.

## Serialization

Transactions in Exonum are subtypes of messages and share the serialization logic
with [consensus messages](../advanced/consensus/consensus.md#messages).
All transaction messages are serialized in a uniform
fashion. There are 2 serialization formats:

- **Binary serialization** is used in communication among nodes and
  to persist transactions in the [storage](./storage.md)
- **JSON** is used to receive and send transactions when communicating
  with [light clients](./clients.md)

!!! note
    Although light clients communicate with full nodes using the JSON format,
    they implement serialization internally in order to sign transactions
    and calculate their hashes.

Fields used in transaction serialization are listed below.

| Field              | Binary format     | Binary offset | JSON       |
|--------------------|:-----------------:|--------------:|:----------:|
| `network_id`       | `u8`              | 0             | number     |
| `protocol_version` | `u8`              | 1             | number     |
| `service_id`       | `u16`             | 4..6          | number     |
| `message_id`       | `u16`             | 2..4          | number     |
| `payload_length`   | `u32  `           | 6..10         | -          |
| `body`             | `&[u8]`           | 10..-64       | object     |
| `signature`        | Ed25519 signature | -64..         | hex string |

!!! tip
    For the binary format, the table uses the type notation taken
    from [Rust][rust]. Offsets also correspond to [the slicing syntax][rust-slice],
    with the exception that Rust does not support negative offsets,
    which denote an offset relative to the end of the byte buffer.

### Network ID

This field will be used to send inter-blockchain messages in the future
releases. For now, it is not used.

**Binary presentation:** `u8` (unsigned 1-byte integer).  
**JSON presentation:** number

### Protocol Version

The major version of the Exonum serialization protocol. Currently, `0`.

**Binary presentation:** `u8` (unsigned 1-byte integer).  
**JSON presentation:** number.

### Service ID

Sets the [service](services.md) that a transaction belongs to.
The pair (`service_id`, `message_id`) is
a key used to lookup implementation of [the transaction interface](#interface)
(e.g., `verify` and `execute` methods).

**Binary presentation:** `u16` (unsigned 2-byte integer).  
**JSON presentation:** number.

### Message ID

`message_id` defines the type of message within the service.

!!! note "Example"
    [The sample cryptocurrency service][cryptocurrency] includes 2 main 
    types of transactions: `AddFundsTransaction` for coins emission
    and `TransferTransaction` for coin transfer.

**Binary presentation:** `u32` (unsigned 4-byte integer).  
**JSON presentation:** isn't present.

### Payload length

The length of the message body after the header. Does not include the
signature length.

**Binary presentation:** `u16` (unsigned 2-byte integer).  
**JSON presentation:** (not serialized).

### Body

The body of the transaction, which includes data specific for a given
transaction type. Format of the body is specified by the
service identified by `service_id`.
Binary serialization of the body is performed using
[the Exonum serialization format](../advanced/serialization.md)
according to the transaction specification in the service.

!!! note "Example"
    The body of `TransferTransaction` in the sample cryptocurrency service
    is structured as follows:

    | Field      | Binary format | Binary offset | JSON       |
    |------------|:-------------:|--------------:|:----------:|
    | `from`     | `PublicKey`   | 0..32         | hex string |
    | `to`       | `PublicKey`   | 32..64        | hex string |
    | `amount`   | `u64`         | 64..72        | number string |
    | `seed`     | `u64`         | 72..80        | number string |
    
    `from` is the coins sender, `to` is the coins recipient,
    `amount` is the amount being transferred, and
    `seed` is a randomly generated field to distinct among transactions
    with the same previous three fields.
    
    (`u64` values are serialized as strings in JSON, as they may be
    [unsafe][mdn:safe-int].)

**Binary presentation:** binary sequence with `payload_length` bytes.  
**JSON presentation:** JSON.

### Signature

[Ed25519 digital signature](https://ed25519.cr.yp.to/) over the binary
serialization of the message (excluding the signature bytes,
i.e., the last 64 bytes of the serialization).

!!! tip
    It is recommended for transaction signing to be decentralized in order
    to minimize security risks. Roughly speaking, there should not be a single
    server signing all transactions in the system; this could create a security
    chokepoint. One of options to decentralize signing is to use
    the [light client library](https://github.com/exonum/exonum-client).

**Binary presentation:** Ed25519 signature (64 bytes).  
**JSON presentation:** hex string.

## Interface

Transaction interface defines 3 methods: `verify`, `execute` and `info`
(see `src/blockchain/service.rs` from
[Exonum core](https://github.com/exonum/exonum-core)).

### Verify

The `verify` method verifies the transaction, which includes the message
signature verification and other specific internal constraints.
`verify` is intended to check the internal consistency of a transaction;
it has no access to the blockchain state.

If a transaction fails `verify`, it is considered incorrect and cannot
be included into any correct block proposal. Incorrect transactions are never
included into the blockchain.

Each transaction which reached any validator and passed
`verify` have to be included into the blockchain in a finite time. See
[consensus algorithm](../advanced/consensus/consensus.md) for more details.

!!! note "Example"
    In [the cryptocurrency service][cryptocurrency]
    a `TransactionSend` verifies the digital signature and checks that
    the sender of coins is not the same as the receiver.

### Execute

The `execute` method takes the current blockchain state and can modify it (but can
choose not to if certain conditions are not met). Technically `execute`
operates on a fork of the blockchain state, which is merged to the persistent
storage ([under certain conditions](../advanced/consensus/consensus.md)).

!!! note "Example"
    In [the cryptocurrency service][cryptocurrency]
    an `execute` method of `TransactionSend` executes the transaction which
    means: add this transaction to the data storage with a Boolean `status`
    metadata for changing any wallets founds. The `status` is `true`, the
    balance of the `from` wallet is decreased by `amount` and the balance of
    the `to` wallet is increased by `amount` if

    - `from` were presented in committed blocks (necessary condition of
      positive balance of `from` for a considered cryptocurrency
      implementation)
    - balance of `from` is greater or equal to `amount`,
      else the tag in the data storage is `false` and it doesn't change any
      balances.

!!! note
    `Verify` and `execute` are triggered at different times. `Verify` checks
    internal consistency of a transaction before the transaction is included
    into the [proposal block](../advanced/consensus/consensus.md). `Execute`
    performs [almost at the same time](../advanced/consensus/consensus.md) as
    the block with the given transaction is committed into the blockchain.

### Info

The `info` method returns the useful information (from service developers point
of view) about the transaction. The method has no access to the blockchain state,
same as `verify`.

!!! note "Example"
    In [the cryptocurrency service][cryptocurrency]
    an `info` method of `TransactionSend` returns JSON with fields `from`, `to`,
    `amount` and `seed`.

## Transaction Lifecycle

1. A transaction is created by an external entity (e.g., a
  [thin client](clients.md)) and is signed with a private key
2. The transaction is broadcast to the network
3. The transaction is verified on each full node including validator nodes
  which it reaches using the `verify` method.
  If the verification is successful, the transaction is added to the pool
  of unconfirmed transactions; otherwise, it is discarded, and the following
  steps are skipped
4. The transaction is included into a block proposal (or multiple proposals)
5. The transaction is executed (by transaction's method `execute`) during the
  lock step of the consensus algorithm, when a validator node has collected all
  transactions for a block proposal and under certain conditions which imply
  that the considered proposal is going to be accepted in the near future
6. When a certain *precommit* gathers necessary approval among
  validators, a block with the transaction is committed to the blockchain.
  All transactions from the committed block are sequentially applied
  to the persistent blockchain state in the order they appear in the block
  (i.e., the order of application is the same for every node in the network)

## Blockchain Transaction Properties

### Purity

[The purity of the function](https://en.wikipedia.org/wiki/Pure_function) means
that

- the function always evaluates the same result value given the same argument
  value
- evaluation of the result does not cause any semantically observable side
  effect or output the `verify` method of transactions does not depend on.

The purity for `verify` means that its result doesn't depend on the
blockchain's state and full node's hardware. So the `verify` could be
parallelized over transactions and `verify` could be performed only once for
any transaction.

### Sequential Consistency

[Sequential consistency](https://en.wikipedia.org/wiki/Sequential_consistency)
essentially means that the blockchain looks like a centralized system for an
external observer (e.g., a thin client). All transactions in the blockchain
affect the blockchain state as if they were executed one by one in the order
specified by their ordering in blocks. Such a property is guaranteed by the
[consensus algorithm](../advanced/consensus/consensus.md).

### Non-replayability

Non-replayability means that an attacker cannot take an old legitimate
transaction from the blockchain and apply it to the blockchain state again.

!!! note "Example"
    Assume Alice pays Bob 10 coins using
    [the sample cryptocurrency service][cryptocurrency].
    Non-replayability prevents Bob from taking Alice's transaction and submitting
    it to the network again to get extra coins.

Naturally, non-replayability is
also a measure against DoS attacks; it prevents an attacker from spamming the
network with his own or others' transactions. The `seed` field inside the
transaction and ignoring the transactions, already included into the
blockchain, for the new blocks guarantees this property.

[wiki:acid]: https://en.wikipedia.org/wiki/ACID
[wiki:order]: https://en.wikipedia.org/wiki/Total_order
[wiki:pki]: https://en.wikipedia.org/wiki/Public_key_infrastructure
[cryptocurrency]: https://github.com/exonum/cryptocurrency
[rust]: http://rust-lang.org/
[rust-slice]: https://doc.rust-lang.org/book/first-edition/primitive-types.html#slicing-syntax
[mdn:safe-int]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isSafeInteger
