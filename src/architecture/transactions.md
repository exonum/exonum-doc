# Transactions

A transaction in a blockchain
([as in usual databases](https://en.wikipedia.org/wiki/Database_transaction))
is a group of sequential operations with the database and is a logical unit of
work with data. So any business logic of the project with Exomum should be
formulated using different types of transactions in different types of
services. A transaction must be executed entirely, respecting the integrity of
the data (the correct transaction execution workflow should be implemented by
this transaction type developer). If the transaction execution is unsuccessful,
then the transaction must be not performed at all, so that it shall not have any
effect. And it is guaranteed by Exonum core. A transaction could be created by
the allowed entities and sent for the distributed system of validators for the
consideration.

!!! note "Example"
    A private key owner could initialize his coins transfer for
    [cryptocurrency](https://github.com/exonum/cryptocurrency).

If the transaction is correct, it would be included in a block of the
blockchain through the validators voting process via the
[consensus algorithm](../advanced/consensus/consensus.md) work. All
transactions are executed one by one in the order in which they are placed into
the blockchain.

## Serialization

All transaction messages are serialized in a uniform format. There are 2
serialization formats - binary and [JSON](https://en.wikipedia.org/wiki/JSON);
the first one is used in communication among nodes and
[storage](./storage.md), the second one is used to communicate with
[light clients](./clients.md). All fields to serialize and deserialize
transactions are listed in the table below.

| Field              | Binary format     | Binary offset | JSON       |
|--------------------|:-----------------:|--------------:|:----------:|
| `network_id`       | `u8`              | 0             | number     |
| `protocol_version` | `u8`              | 1             | number     |
| `service_id`       | `u16`             | 4..6          | number     |
| `message_id`       | `u16`             | 2..4          | number     |
| `payload_length`   | `usize`           | 6..10         | -          |
| `body`             | `&[u8]`           | 10..-64       | object     |
| `signature`        | Ed25519 signature | -64..         | hex string |

### Network ID

This field would be used to send inter-blockchain messages in the future
releases. `Network_id` is useless right now.

**Binary presentation:** `u8` (unsigned 1 byte).
**JSON presentation:** number

### Protocol Version

The major version of the Exonum serialization protocol. Currently, `0`.

**Binary presentation:** `u8` (unsigned 1 byte).
**JSON presentation:** number.

### Service ID

Sets the [service](services.md) to make a deal with (for example,
*configuration* or *cryptocurrency*). The pair (`service_id`, `message_id`) is
a key to process transaction (to find such methods as `verify` and `execute`).

**Binary presentation:** `u16` (unsigned 2 bytes).
**JSON presentation:** number.

### Message ID

The `message_id` defines the type of message in the service.

!!! note "Example"
    The service *cryptocurrency* could include different types of transactions:
    `AddFundsTransaction` for coins emission and `TransferTransaction` for
    money transfer et. al.

**Binary presentation:** `usize` (the same as `u32` in this case, unsigned 4
bytes).
**JSON presentation:** isn't present.

### Payload length

The length of the message body after the header. It does not include the
signature length.

**Binary presentation:** `u16` (unsigned 2 bytes).
**JSON presentation:** number.

### Body

The body of the transaction, which includes specific for a given transaction
(`service_id`, `message_id`) type data and a format of which is specified by
service with `service_id`.

!!! note "Example"
    the body of `TransferTransaction` should include field `from` for coins
    sender, `to` for coins recipient, `amount` for the sending amount and
    `seed` to distinct different transactions with the same previous three
    fields.

The message body is serialized according to the
[binary serialization](../advanced/serializtion.md) specification from its type
specification in the service.

**Binary presentation:** binary sequence with `payload_length` bytes.
**JSON presentation:** JSON.

### Signature

[Ed25519 digital signature](https://ed25519.cr.yp.to/) over the binary
serialization of the message with a transaction (excluding the signature bytes,
i.e., the last 64 bytes of the serialization). Any author of the transaction
(as any other message) should have the private and public keys which allow him
to generate a correct transaction. He shouldn't provide any other person his
private key but should use it to sign messages. The signature of a particular
person could be verified by anyone using the public key and
`Exonum.verifySignature` function. See
[Exonum client](https://github.com/exonum/exonum-client) for details.

**Binary presentation:** Ed25519 signature.
**JSON presentation:** hex string.

## Interface

All transactions have at least three methods: `verify`, `execute` and `info`
(see `src/blockchain/service.rs` from
[Exonum core](https://github.com/exonum/exonum-core)).

### Verify

The `verify` method verifies the transaction, which includes the message
signature verification and other specific for a given transaction type checks.
`Verify` checks internal consistency of a transaction and has no access to the
blockchain state. If a transaction fails `verify` it is incorrect and couldn't
be included into any correct block proposal. So it couldn't ever be included
into the blockchain. Each transaction which reached any validator and passed
`verify` have to be included into the blockchain in a finite time. See
[consensus algorithm](../advanced/consensus/consensus.md) for more details.

!!! note "Example"
    In the [cryptocurrency](https://github.com/exonum/cryptocurrency)) service
    a `TransactionSend` also checks if the sender is not same as the receiver.

### Execute

The `execute` method given the blockchain state and can modify it (but can
choose not to if certain conditions are not met). Technically `execute`
operates on a fork of the blockchain state, which is merged to the persistent
storage ([under certain conditions](../advanced/consensus/consensus.md)).

!!! note "Example"
    In the [cryptocurrency](https://github.com/exonum/cryptocurrency)) service
    an `execute` method of `TransactionSend` executes the transaction which
    means: set the result of executing equal to `true` and change `from` and
    `to` wallets balances with `amount` if
    - `to` is not the same as `from`
    - `from` were presented in committed blocks (necessary condition of
      positive balance of `from` for a considered cryptocurrency
      implementation)
    - balance of `from` is greater or equal to `amount`,
    else the result of execution is `false` and it doesn't change any balances.

!!! note.
    `Verify` and `execute` are triggered at different times. `Verify` checks
    internal consistency of a transaction before the transaction is included
    into the [proposal block](../advanced/consensus/consensus.md). `Execute`
    performs [almost at the same time](../advanced/consensus/consensus.md) as
    the block with the given transaction is committed into the blockchain.

### Info

The `info` method returns the useful information (from service developers point
of view) about the transaction and has no access to the blockchain state as the
`verify`.

!!! note "Example"
    In the [cryptocurrency](https://github.com/exonum/cryptocurrency)) service
    an `info` method of `TransactionSend` returns JSON with fields `from`, `to`,
    `amount` and `seed`.

## Transaction lifecycle

1. A transaction is created by an external entity (e.g., a
  [thin client](clients.md)) and is signed with a private key
2. The transaction is broadcast to the network
3. The transaction is verified on each full node including validator nodes
  which it reaches (by transaction's method `verify` which includes at least
  signature verification) and is added to the pool of unconfirmed transactions
4. The transaction is included into a block proposal (or multiple proposals)
5. The transaction is executed (by transaction's method `execute`) during the
  lock step of the consensus algorithm, when a validator node has collected all
  transactions for a block proposal and under certain conditions which imply
  that the considered proposal is going to be accepted in nearly future
6. Finally, when a certain *precommit* gathers necessary approval among
  validators, the block is committed to the blockchain. This means that
  transactions from the committed block change the blockchain state, are
  executed sequentially and in the same exact order on every node

## Blockchain transaction properties

### Purity

[The purity of the function](https://en.wikipedia.org/wiki/Pure_function) means
that

- the function always evaluates the same result value given the same argument
  value
- evaluation of the result does not cause any semantically observable side
  effect or output the `verify` method of transactions does not depend on.

The purity for `verify` means that its result doesn't depend on the
the blockchain's state and full node's hardware. So the `verify` could be
parallelized over transactions and `verify` could be performed only once for
any transaction.

### Sequential consistency

[Sequential consistency](https://en.wikipedia.org/wiki/Sequential_consistency)
essentially means that the blockchain looks like a centralized system for an
external observer (e.g., a thin client). All transactions in the blockchain
affect the blockchain state as if they were executed one by one in the order
specified by their ordering in blocks. Such a property is guaranteed by the
[consensus algorithm](../advanced/consensus/consensus.md).

### Non-replayability

Non-replayability means that an attacker cannot take an old legitimate
transaction from the blockchain and apply it to the blockchain state again.
Assume Alice pays Bob 10 coins using the Exonum
[cryptocurrency service](https://github.com/exonum/cryptocurrency).
Non-replayability prevents Bob from taking Alice's transaction and submitting
it to the network again to get extra coins. Naturally, non-replayability is
also a measure against DoS attacks; it prevents an attacker from spamming the
network with his own or others' transactions. The `seed` field inside the
transaction and ignoring the transactions, already included into the
blockchain, for the new blocks guarantees this property.
