# What Is Exonum

Exonum is a blockchain framework that allows building secure permissioned blockchain
applications. Like all software, Exonum comes with its own set of features and capabilities.
This page outlines the cases in which Exonum could be useful and points out the
main differences between Exonum and other distributed ledger solutions.

## Why Blockchain

In terms of data management, blockchains provide [OLTP][wiki:oltp] capabilities.
A blockchain processes transactions, which are quite similar to [transactions][wiki:tx]
in ordinary database management systems, and changes the stored values correspondingly.

Compared to commonplace OLTP solutions, the use of blockchain brings several distinctive
advantages.

### Distribution

Like distributed databases, such as Cassandra, MongoDB or MySQL Cluster, blockchains
are replicated on multiple nodes. However, compared to ordinary distributed DBs,
blockchains are resistant against a much wider range of attacks:

- Blockchains are resistant against failures of any single node (or even multiple
  nodes at the same time). The threat model includes nodes being switched off,
  isolated from the rest of the network, or even completely compromised (say, by
  a hacker)
- Blockchains can be deployed in a decentralized network, where there is no single
  administrator managing all the nodes. This significantly reduces risks of data
  corruption and the bias in the system (e.g., preferential treatment of some
  participants)

### Reliable Audit Trail

A core component of a blockchain is a tamper-resistant transaction log.
(Tamper-resistance here means that the log entries cannot be modified retroactively.)
Blockchains use [the same methods][wiki:linked-ts] to ensure the immutability
of the log as [evidence records][rfc-er] used by [certificate authorities][wiki:ca]
and other security-critical applications.

The reliable audit trail is needed in many regulated industries (e.g., finance
and public registries), but it could be useful in other areas as well. The immutability
of the transaction log provides *provenance* for any data piece in the blockchain,
allowing to reliably trace its history.

### Cryptography

Blockchain extensively uses cryptography in places where traditional systems
rely on trust and informal relationships among participants of the system.
The most prominent example of this is transaction authentication. Blockchains
use [public-key cryptography][wiki:pkc] to ensure authenticity and integrity
of transactions (instead of, say, password-based authentication). This corresponds
to the best practices in security-critical industries and also
ensures that the transaction log is completely verifiable.

## Exonum Design Goals

Exonum is a [framework][wiki:framework]; it's not a ready-made blockchain
(like, say, Bitcoin). Instead, Exonum can be used to *create* blockchains,
just like [MVC][wiki:mvc] frameworks (e.g., Django or Express)
can be used to create web applications.

### Permissioned Control

Exonum is geared towards *permissioned* blockchains. This means that only
a limited list of nodes can commit transactions to the blockchain.
Such approach is reasonable if there is a certain *maintainer* (or several maintainers)
that should retain some control over the network (e.g., define and update transaction
processing rules). Compared to permissionless blockchains (such as Bitcoin),
Exonum applications are more local, but at the same time provide greater flexibility
and a more controllable environment.

Controllability of Exonum *does not* mean that the control of maintainers
is unrestricted; there are well-defined rules of transaction processing that even
all the network maintainers together cannot bend. Indeed, Exonum allows to
easily convey the compliance to transaction processing rules for external parties
(be it the regulator, auditors, or users of a platform).

!!! note "Example"
    In most reasonable blockchain setups, there is a requirement
    for all transactions to be digitally signed. If the blockchain maintainers
    do not have control over private keys in the system,
    they cannot forge transactions in the name of the key owners.

### Transparency

The Exonum framework codifies the ever-increasing role of transparency in the
modern world. Exonum provides a rich set of tools to define the correct system operation,
and allows external parties (e.g., regulators, auditors and end clients of the system)
to continuously verify the system operation against these definitions.

!!! note "Example"
    In a [sample cryptocurrency implementation](create-service.md),
    users can monitor the state of their wallet in real time.
    The state returned to a user by network nodes is supplied with an unforgeable
    cryptographic proof.

### Flexibility

One of the reasons for permissioned blockchain setup is a greater degree of flexibility.
Exonum ensures flexibility by providing a rich environment for transaction execution.

!!! note "Example"
    Document timestamping, cryptocurrency and property rights registries
    are three vastly different domains in which the Exonum framework can be used
    effectively.

### Safety

As several high-profile blockchain heists have shown, transaction processing
on blockchains may be vulnerable to logic bombs and difficult-to-detect marginal
cases. Exonum uses [the Rust programming language](https://www.rust-lang.org/),
which guarantees the highest degree of memory safety.

!!! note "Example"
    [Mutability][rust-mut], [references and borrowing][rust-ref] in Rust
    help enforce access restrictions. For example, if a variable is passed
    to an external component in a non-mutable reference, it **cannot** be changed
    no matter what the component does. Strict static typing and absence of null pointers
    in Rust help to prevent undefined behavior and memory access violations.

### Performance

Exonum is geared towards peak throughput of thousands of transactions per second
(tps). During test benchmarks, Exonum handles up to 7,000 tps, with a 2.5 sec. clearing delay
(the interval between transaction generation and its inclusion into a block).

## Main Components

### Services

[Services](../architecture/services.md) allow specifying the business logic for
Exonum applications. It is the main extension point of the framework, which
plays the same role as smart contracts in some other blockchains.

Developing Exonum services is similar to service development in Web or
in enterprise platforms; they have the same principal components.

#### Endpoints

A service has a set of endpoints (realized as REST APIs) using which
the service can communicate with the outside world. The Exonum framework acts
as middleware, dispatching requests among services and abstracting the intricacies
of data (de)serialization, access control, and other typical middleware tasks
away from service developers.

There are 3 types of service endpoints:

- **Transactions** correspond to `PUT` or `POST` requests in REST
- **Read requests** correspond to `GET` requests in REST
- **Private APIs** represent administrative and maintenance endpoints,
  generally not accessible to the outside world

#### Persistence

Exonum provides means for services to persist their data as scalars, or as
data collections (maps and lists). The Exonum data storage engine provides
powerful abstractions for *Merkelized* collections. In such a collection,
any element can be supplied with an unforgeable cryptographic proof
that it belongs to the collection (without disclosing any other elements
of the collection).

With the help of Merkelized collections, a service can provide strict proofs
of data authenticity in response to read requests. This requires minimal involvement
from the service developers – all heavy lifting is performed by the Exonum core.

### Byzantine Consensus

Exonum uses [a custom Byzantine fault tolerant consensus algorithm](../architecture/consensus.md)
to synchronize data among the nodes in the network.
The Exonum network will continue to operate even if up to 1/3 of validators are
hacked, compromised or switched off. Hence, there is no single point of failure
in the network; the whole process of transaction processing is fully
decentralized.

### Light Clients

Exonum supports [light clients](../architecture/clients.md),
network nodes that replicate only a very small part of the blockchain,
which the client is interested in. Light clients allow providing access to a blockchain
through web or mobile apps. A light client communicates with one or
more services on a full node with the help of [public APIs](#endpoints).

!!! note "Example"
    [In the cryptocurrency tutorial](create-service.md),
    a client corresponds to an owner of currency; it is only interested in transactions
    that involve the owner.

Exonum pays much attention to the security of light clients. Light clients do not
unconditionally trust the responses from full nodes, but rather verify them
against formally encoded rules. The verification uses cryptographic techniques,
such as [Merkle trees][wiki:mt] and [linked timestamping][wiki:linked-ts],
to ensure that the full nodes cannot misguide the client, even if there is a collusion
among the blockchain maintainers.

### Bitcoin Anchoring

Exonum provides [an anchoring service](../advanced/bitcoin-anchoring.md)
to achieve the highest level of security for light clients. The anchoring service
periodically publishes a hash digest of the entire blockchain state
to the Bitcoin Blockchain. This makes it impossible to revise the transaction
history or to supply different clients with differing versions of the blockchain,
even if all the blockchain maintainers collude. Moreover, anchoring is a fallback
mechanism: even if the Exonum blockchain stops working, the authenticity of data
stored in light clients could still be verified.

## What’s Next

- [Read about the Exonum design](design-overview.md)
- [Build your first Exonum application](create-service.md)
- [Find out about Exonum planned features and milestones](../roadmap.md)
- [Learn how to contribute to Exonum development](../contributing.md)

[wiki:linked-ts]: https://en.wikipedia.org/wiki/Linked_timestamping
[wiki:ca]: https://en.wikipedia.org/wiki/Certificate_authority
[rfc-er]: https://tools.ietf.org/html/rfc4998
[wiki:pkc]: https://en.wikipedia.org/wiki/Public-key_cryptography
[wiki:framework]: https://en.wikipedia.org/wiki/Software_framework
[wiki:mvc]: https://en.wikipedia.org/wiki/Model%E2%80%93view%E2%80%93controller
[wiki:mt]: https://en.wikipedia.org/wiki/Merkle_tree
[wiki:oltp]: https://en.wikipedia.org/wiki/Online_transaction_processing
[wiki:tx]: https://en.wikipedia.org/wiki/Database_transaction
[rust-mut]: https://doc.rust-lang.org/book/mutability.html
[rust-ref]: https://doc.rust-lang.org/book/references-and-borrowing.html
