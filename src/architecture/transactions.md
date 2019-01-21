# Transactions

A **transaction** in Exonum,
[as in usual databases](https://en.wikipedia.org/wiki/Database_transaction),
is a group of sequential operations with the data (i.e., the Exonum
[key-value storage](storage.md)).
Transaction processing rules are defined in [services](services.md);
these rules determine business logic of any Exonum-powered blockchain.

Exonum transactions are an entity within messages. Except for the
transaction, a messages also contains the public key of the message author, the
type and class of the message and the message signature.

Transactions are executed
[atomically, consistently, in isolation and durably][wiki:acid].
If the transaction execution violates certain data invariants,
the transaction is completely rolled back, so that it does not have any
effect on the persistent storage.

If the transaction is correct, it can be committed, i.e., included into a block
via the [consensus algorithm](consensus.md)
among the blockchain validators. Consensus provides [total ordering][wiki:order]
among all transactions; between any two transactions in the blockchain,
it is possible to determine which one comes first.
Transactions are applied to the Exonum key-value storage sequentially
in the same order transactions are placed into the blockchain.

!!! note
    The order of transaction issuance at the client side does not necessarily
    correspond to the order of their processing. To maintain the logical order
    of processing, it is useful to
    adhere to the following pattern: send the next transaction only after
    the previous one was processed. This behavior is already
    implemented in the [light client library](https://github.com/exonum/exonum-client#send-multiple-transactions).

All transactions are authenticated with the help of public-key digital
signatures. A transaction contains the signature verification key (aka public
key) among its parameters. Thus, authorization (verifying whether the
transaction author actually has the right to perform the transaction) can be
accomplished with the help of building a [public key infrastructure][wiki:pki]
and/or various constraints based on this key.

!!! tip
    It is recommended for transaction signing to be decentralized in order
    to minimize security risks. Roughly speaking, there should not be a single
    server signing all transactions in the system; this could create a security
    chokepoint. One of the options to decentralize signing is to use
    the [light client library](https://github.com/exonum/exonum-client).

!!! note "Example"
    In a sample [cryptocurrency service][cryptocurrency],
    an owner of cryptocurrency may authorize transferring his coins by signing
    a transfer transaction with a key associated with coins. Authentication
    in this case means verifying that a transaction is digitally signed with
    a specific key, and authorization means that this key is associated with
    a sufficient amount of coins to make the transaction.

## Messages

Messages are digitally signed pieces of data transmitted through the Exonum
framework. The core of the framework validates the signature over the message.
All messages have a uniform structure with which they should comply:

| Position (bytes) | Stored data             |
| - - - - - | - - - - - - - - - - - - |
| `0..32`   | author's public key     |
| `32`      | message class           |
| `33`      | message type            |
| `34..N`   | payload                |
| `N..N+64` | signature               |

Exonum utilizes the following message classes and types:

| Class ID | Type ID | Message Class            | Message Type        |
|:---------|:--------|:-------------------------|:--------------------|
| 0        | 0       | Service message          | Transaction         |
| 0        | 1       | Service message          | Status message      |
| 0        | 2       | Service message          | Connect message     |
| 1        | 0       | Consensus message        | Precommit message   |
| 1        | 1       | Consensus message        | Propose message     |
| 1        | 2       | Consensus message        | Prevote message     |
| 2        | 0       | Request response message | TransactionsBatch   |
| 2        | 1       | Request response message | BlockResponse       |
| 3        | 0       | Request message          | TransactionsRequest |
| 3        | 1       | Request message          | PrevotesRequest     |
| 3        | 2       | Request message          | PeersRequest        |
| 3        | 3       | Request message          | BlockRequest        |

The payload varies for different messages, depending on their class and type.

A transaction is the payload of a message. The message payload constituing
a transaction has the following fields:

- ID of the service for which the transaction is intended
- ID of the transaction
- Service transaction payload

When defining a new transaction using the `Transaction` macro, users need to
define only the fields which are to constitute the message payload. All the
other fields (e.g. signature, public key, etc.) are automatically added and
handled by the Exonum Core. Transaction payload includes data specific for a
given transaction type. Format of the payload is specified by the
service identified by `service_id`.

## Serialization

All transactions in Exonum are serialized using protobuf. See the
[Serialization](serialization.md) article for more details).

!!! note
    Each unique transaction message serialization is hashed with
    [SHA-256 hash function](https://en.wikipedia.org/wiki/SHA-2).
    A transaction hash is taken over the entire transaction serialization.
    Hashes are used as unique identifiers for transactions where such an
    identifier is needed (e.g., when determining whether a specific transaction
    has been committed previously).

## Interface

Transaction interface currently defines a single method - [`execute`](#execute).

An extended version of the `verify` method, which was available previously, is
scheduled for implementation by our team. As of now, the verification of the
transaction signature is performed by the core of the framework. Additional
verifications you might need to implement for transactions can be added using
the `execute` method.

!!! tip
    From the Rust perspective, `Transaction` is a [trait][rust-trait].
    See [Exonum core code][core-tx] for more details.


### Execute

```rust
fn execute(&self, view: &mut Fork) -> ExecutionResult;
```

The `execute` method takes the current blockchain state and can modify it (but
can choose not to if certain conditions are not met). Technically `execute`
operates on a fork of the blockchain state, which is merged to the persistent
storage [under certain conditions](consensus.md). `execute` is performed during
the `Precommit` stage of consensus and when the block with the given
transaction is committed into the blockchain.

`execute` operates solely with the payload of the message, any additional
information besides the payload is included into the `TransactionContext` which
is passed into `execute`. `TransactionContext` includes a fork of the
blockchain, ID of the service for which the transaction is intended, the hash
of the message containing the transaction and the public key of the transaction
author. For an example of `execute` implementation, refer to our
[demo service][execute-demo].

!!! note "Example"
    In the sample cryptocurrency service, `TxTransfer.execute` verifies
    that the sender’s and recipient’s accounts exist and the sender has enough
    coins to complete the transfer. If these conditions hold, the sender’s
    balance of coins is decreased and the recipient’s one is increased by the
    amount specified in the transaction. Additionally, the transaction is
    logged in the sender’s and recipient’s history of transactions; the logging
    is performed even if the transaction execution is unsuccessful (e.g., the
    sender has insufficient number of coins). Logging helps to ensure that
    the account state is verifiable by light clients.

The `execute` method can signal that a transaction should be aborted
by returning an error. The error contains a transaction-specific error code
(an unsigned 1-byte integer), and an optional string description. If `execute`
returns an error, all changes made in the blockchain state by the transaction
are discarded; instead, the error code and description are saved to the
blockchain.

If the `execute` method of a transaction raises an unhandled exception (panics
in the Rust terms), the changes made by the transactions are similarly
discarded.

Erroneous and panicking transactions are still considered committed.
Such transactions can be and are included into the blockchain provided they
lead to the same result (panic or return an identical error code)
for at least 2/3 of the validators.

## Lifecycle

### 1. Creation

A transaction is created by an external entity (e.g., a
[light client](clients.md)) and is signed with a private key necessary to
authorize the transaction.

### 2. Submission to Network

After creation, the transaction is submitted to the blockchain network.
Usually, this is performed by a light client connecting to a full node
via [an appropriate transaction endpoint](services.md#transactions).

!!! note
    As transactions use universally verified cryptography (digital signatures)
    for authentication, a transaction theoretically can be submitted to the
    network by anyone aware of the transaction. There is no intrinsic upper
    bound on the transaction lifetime, either.

!!! tip
    From the point of view of a light client, transaction execution is
    asynchronous; full nodes do not return an execution status synchronously
    in a response to a client’s request. To determine transaction status,
    you may poll the transaction status using
    [read requests](services.md#read-requests) defined in the corresponding
    service or the blockchain explorer. If a transaction is valid, it’s
    expected to be committed in a matter of seconds.

### 3. Verification

After a transaction is received by a full node, it is looked up
among committed transactions, using the transaction hash as the unique
identifier. If a transaction has been committed previously, it is
discarded, and the following steps are skipped.

The transaction implementation is then looked up
using the `(service_id, message_id)` type identifier.

The `raw_from_buffer` method then checks that the byte array constituting the
transaction message contains the author’s public key and signature and that the
signature corresponds to the indicated public key.

Next, if `raw_from_buffer` is successful, the byte array is converted into a
`SignedMessage` structure. This structure contains all the fields of the
message in deserialized form, except for the message payload which is still
presented as a byte array. This structure helps us avoid verifying the
signature repeatedly during the next steps, as every `SignedMessage` is
guaranteed to contain the correct signature.

The `SignedMessage` is then passed to the `deserialize` method, which
deserializes the message body and converts the `SignedMessage` into the
`Message` structure. `Message` contains both the `SignedMessage` and the
deserialized payload.

Finally, the `Message` is passed to the `handle` method, which concludes
the transaction processing mechanism.

If the verification is successful, the transaction is added to the pool
of unconfirmed transactions; otherwise, it is discarded, and the following
steps are skipped.

### 4. Broadcasting

If a transaction included to the pool of unconfirmed transactions
is received by a node not from another full node,
then the transaction is broadcast to all full nodes that the node is connected
to. In particular, a node broadcasts transactions received from light clients
or generated internally by services, but does not rebroadcast
transactions that are broadcast by peer nodes or are received with the help
of [requests](../advanced/consensus/requests.md) during consensus.

### 5. Consensus

After a transaction reaches the pool of a validator, it can be included
into a block proposal (or multiple proposals).

!!! summary "Trivia"
    Presently, the order of inclusion of transactions into a proposal is
    determined by the transaction hash. An honest validator takes transactions
    with the smallest hashes when building a proposal. This behavior shouldn’t
    be relied upon; it is likely to change in the future.

The transaction `execute`s during the
lock step of the consensus algorithm. This happens when a validator
has collected all
transactions for a block proposal and certain conditions are met, which imply
that the proposal is going to be accepted in the near future.
The results of execution are reflected in `Precommit` consensus messages and
are agreed upon within the consensus algorithm. This allows ensuring that
transactions are executed in the same way on all nodes.

### 6. Commitment

When a certain block proposal and the result of its execution gather
sufficient approval among validators, a block with the transaction is committed
to the blockchain. All transactions from the committed block are sequentially
applied to the persistent blockchain state by invoking their `execute` method
in the same order the transactions appear in the block.
Hence, the order of application is the same for every node in the network.

## Transaction Properties

### Sequential Consistency

[Sequential consistency](https://en.wikipedia.org/wiki/Sequential_consistency)
essentially means that the blockchain looks like a centralized system for an
external observer (e.g., a light client). All transactions in the blockchain
affect the blockchain state as if they were executed one by one in the order
specified by their ordering in blocks. Sequential consistency is guaranteed
by the [consensus algorithm](consensus.md).

### Non-replayability

Non-replayability means that an attacker cannot take an old legitimate
transaction from the blockchain and apply it to the blockchain state again.

!!! note "Example"
    Assume Alice pays Bob 10 coins using
    [the sample cryptocurrency service][cryptocurrency].
    Non-replayability prevents Bob from taking Alice’s transaction and
    submitting it to the network again to get extra coins.

Non-replayability is
also a measure against DoS attacks; it prevents an attacker from spamming the
network with his own or others’ transactions.

Non-replayability in Exonum is guaranteed by discarding transactions already
included into the blockchain (which is determined by the transaction hash),
on the verification step.

!!! tip
    If a transaction is not [idempotent][wiki:idempotent], it needs to have
    an additional field to distinguish among transactions with the same
    set of parameters. This field needs to have a sufficient length
    (e.g., 8 bytes) and can be generated deterministically (e.g., via a
    counter) or (pseudo-)randomly. See `TxTransfer.seed` in the cryptocurrency
    service as an example.

[wiki:acid]: https://en.wikipedia.org/wiki/ACID
[wiki:order]: https://en.wikipedia.org/wiki/Total_order
[wiki:pki]: https://en.wikipedia.org/wiki/Public_key_infrastructure
[wiki:idempotent]: https://en.wikipedia.org/wiki/Idempotence
[cryptocurrency]: https://github.com/exonum/exonum/blob/master/examples/cryptocurrency
[core-tx]: https://github.com/exonum/exonum/blob/master/exonum/src/blockchain/service.rs
[rust-trait]: https://doc.rust-lang.org/book/first-edition/traits.html
[mdn:safe-int]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isSafeInteger
[wiki:currying]: https://en.wikipedia.org/wiki/Currying
[rust-result]: https://doc.rust-lang.org/book/first-edition/error-handling.html
[execute-demo]: https://github.com/exonum/exonum/blob/master/examples/cryptocurrency-advanced/backend/src/transactions.rs
