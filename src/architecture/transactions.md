# Transactions

A **transaction** in Exonum,
[as in usual databases](https://en.wikipedia.org/wiki/Database_transaction),
is a group of sequential operations with the data (i.e., the Exonum [key-value storage](storage.md)).
Transaction processing rules are defined in [services](services.md);
these rules determine business logic of any Exonum-powered blockchain.

Transactions are executed [atomically, consistently, in isolation and durably][wiki:acid].
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

All transactions are authenticated with the help of public-key digital signatures.
Generally, a transaction contains the signature verification key (aka public key)
among its parameters. Thus, authorization (verifying whether the transaction author
actually has the right to perform the transaction) can be accomplished
with the help of building a [public key infrastructure][wiki:pki] and/or
various constraints based on this key.

!!! tip
    It is recommended for transaction signing to be decentralized in order
    to minimize security risks. Roughly speaking, there should not be a single
    server signing all transactions in the system; this could create a security
    chokepoint. One of options to decentralize signing is to use
    the [light client library](https://github.com/exonum/exonum-client).

!!! note "Example"
    In a sample [cryptocurrency service][cryptocurrency],
    an owner of cryptocurrency may authorize transferring his coins by signing
    a transfer transaction with a key associated with coins. Authentication
    in this case means verifying that a transaction is digitally signed with
    a specific key, and authorization means that this key is associated with
    a sufficient amount of coins to make the transaction.

## Transaction Templates

All transactions in Exonum are *templated*. Every Exonum transaction
is defined by its template and a set of parameters, rather than by an overt
sequence of operations on the key-value storage. The sequence of operations
can be unambiguously restored given a template identifier and template parameters.
This design leads to a more safe and controlled environment for transactional
processing.

Transaction templates are defined in services and could be viewed as an analogue
to stored procedures in database management systems, or to POST/PUT endpoints
in web services. Similar to these cases, the goal of templating is to restrict
eligible transaction patterns (e.g., to preserve certain invariants) and to
separate implementation details from transaction invocation.

!!! summary "Trivia"
    From the computer science perspective, an arbitrary Exonum transaction
    can be defined as `Tx: S -> S`, where `S` denotes the key-value storage type.
    Templating corresponds to defining parameterized families of transactions
    `TxTemplate(i: I): P(i) -> S -> S`,
    where `I` is the set of defined transaction families and `P(i)`
    is the parameter space for the `i`th family. Correspondingly, any transaction
    in Exonum is [a partially applied function][wiki:currying]
    with the transaction family and parameters fixed.

## Serialization

Transactions in Exonum are subtypes of messages and share the serialization logic
with [consensus messages](consensus.md#messages) (see the [Serialization](serialization.md)
article for more details).
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

!!! note
    Each unique transaction message serialization is hashed with
    [SHA-256 hash function](https://en.wikipedia.org/wiki/SHA-2).
    A transaction hash is taken over the entire transaction serialization
    (including its signature). Hashes are used as
    unique identifiers for transactions where such an identifier is needed
    (e.g., when determining whether a specific transaction has been committed
    previously).

### Transaction Body

Transaction body includes data specific for a given
transaction type. Format of the body is specified by the
service identified by `service_id`.
Binary serialization of the body is performed using
[the Exonum serialization format](serialization.md)
according to the transaction specification in the service.

!!! note "Example"
    The body of `TxTransfer` transaction type in the sample cryptocurrency service
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

## Interface

Transaction interface defines 2 methods: [`verify`](#verify) and
[`execute`](#execute).

!!! tip
    From the Rust perspective, `Transaction` is a [trait][rust-trait].
    See [Exonum core code][core-tx] for more details.

### Verify

```rust
fn verify(&self) -> bool;
```

The `verify` method verifies the transaction, which includes the message
signature verification and other specific internal constraints.
`verify` is intended to check the internal consistency of a transaction;
it has no access to the blockchain state.

If a transaction fails `verify`, it is considered incorrect and cannot
be included into any correct block proposal. Incorrect transactions are never
included into the blockchain.

!!! note "Example"
    In [the cryptocurrency service][cryptocurrency],
    `TxTransfer.verify` checks the digital signature and ensures that
    the sender of coins is not the same as the receiver.

### Execute

```rust
fn execute(&self, view: &mut Fork) -> ExecutionResult;
```

The `execute` method takes the current blockchain state and can modify it (but can
choose not to if certain conditions are not met). Technically `execute`
operates on a fork of the blockchain state, which is merged to the persistent
storage [under certain conditions](consensus.md).

!!! note
    `verify` and `execute` are triggered at different times. `verify` checks
    internal consistency of a transaction before the transaction is included
    into a [pool of unconfirmed transactions](consensus.md).
    `execute` is performed during the `Precommit` stage of consensus and when
    the block with the given transaction is committed into the blockchain.

!!! note "Example"
    In the sample cryptocurrency service, `TxTransfer.execute` verifies
    that the sender’s and recipient’s accounts exist and the sender has enough
    coins to complete the transfer. If these conditions hold, the sender’s
    balance of coins is decreased and the recipient’s one is increased by the amount
    specified in the transaction. Additionally, the transaction is logged in the
    sender’s and recipient’s history of transactions; the logging is performed even
    if the transaction execution is unsuccessful (e.g., the sender has insufficient
    number of coins). Logging helps to ensure that
    the account state is verifiable by light clients.

The `execute` method can signal that a transaction should be aborted
by returning an error. The error contains a transaction-specific error code
(an unsigned 1-byte integer), and an optional string description. If `execute`
returns an error, all changes made in the blockchain state by the transaction
are discarded; instead, the error code and description are saved to the blockchain.

If the `execute` method of a transaction raises an unhandled exception (panics
in the Rust terms), the changes made by the transactions are similarly discarded.

Erroneous and panicking transactions are still considered committed.
Such transactions can be and are included into the blockchain provided they
lead to the same result (panic or return an identical error code)
for at least 2/3 of the validators.

## Lifecycle

### 1. Creation

A transaction is created by an external entity (e.g., a
[light client](clients.md)) and is signed with a private key necessary to authorize
the transaction.

### 2. Submission to Network

After creation, the transaction is submitted to the blockchain network.
Usually, this is performed by a light client connecting to a full node
via [an appropriate transaction endpoint](services.md#transactions).

!!! note
    As transactions use universally verified cryptography (digital signatures)
    for authentication, a transaction theoretically can be submitted to the network
    by anyone aware of the transaction. There is no intrinsic upper bound on
    the transaction lifetime, either.

!!! tip
    From the point of view of a light client, transaction execution is
    asynchronous; full nodes do not return an execution status synchronously
    in a response to a client’s request. To determine transaction status,
    you may poll the transaction status using [read requests](services.md#read-requests)
    defined in the corresponding service or the blockchain explorer.
    If a transaction is valid (i.e., its `verify` returns `true`), it’s expected
    to be committed in a matter of seconds.

### 3. Verification

After a transaction is received by a full node, it is looked up
among committed transactions, using the transaction hash as the unique
identifier. If a transaction has been committed previously, it is
discarded, and the following steps are skipped.

The transaction implementation is then looked up
using the `(service_id, message_id)` type identifier.
The `verify` method of the implementation is invoked to check the internal
consistency of the transaction.
If the verification is successful, the transaction is added to the pool
of unconfirmed transactions; otherwise, it is discarded, and the following
steps are skipped.

### 4. Broadcasting

If a transaction included to the pool of unconfirmed transactions
is received by a node not from another full node,
then the transaction is broadcast to all full nodes that the node is connected to.
In particular, a node broadcasts transactions received from light clients
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
are agreed upon within the consensus algorithm. This allows to ensure that transactions
are executed in the same way on all nodes.

### 6. Commitment

When a certain block proposal and the result of its execution gather
sufficient approval among validators, a block with the transaction is committed
to the blockchain. All transactions from the committed block are sequentially applied
to the persistent blockchain state by invoking their `execute` method
in the same order the transactions appear in the block.
Hence, the order of application is the same for every node in the network.

## Transaction Properties

### Purity

`verify` in transactions is [pure](https://en.wikipedia.org/wiki/Pure_function),
which means that the verification result doesn’t depend on the
blockchain state and the local environment of the verifier. Thus, transaction
verification could easily be
parallelized over transactions. Moreover, it’s sufficient to verify any transaction
only once – when it’s submitted to the pool of unconfirmed transactions.

!!! note
    As a downside, `verify` cannot perform any checks that depend on the blockchain
    state. For example, in the cryptocurrency service, `TxTransfer.verify`
    cannot check whether the sender has sufficient amount of coins to transfer.

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
    Non-replayability prevents Bob from taking Alice’s transaction and submitting
    it to the network again to get extra coins.

Non-replayability is
also a measure against DoS attacks; it prevents an attacker from spamming the
network with his own or others’ transactions.

Non-replayability in Exonum is guaranteed by discarding transactions already
included into the blockchain (which is determined by the transaction hash),
on the verify step.

!!! tip
    If a transaction is not [idempotent][wiki:idempotent], it needs to have
    an additional field to distinguish among transactions with the same
    set of parameters. This field needs to have a sufficient length (e.g., 8 bytes)
    and can be generated deterministically (e.g., via a counter) or
    (pseudo-)randomly. See `TxTransfer.seed` in the cryptocurrency service
    as an example.

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
