# Glossary of Terms

Exonum documentation uses some specific terms to describe key Exonum
concepts.
Here, these terms are condensed to a single page.

!!! note
    All terms here are defined with Exonum in mind. For
    example, [*Transaction*](#transaction) describes how transactions work
    in Exonum. Generally speaking, *transaction* may have many other
    meanings, but they are not covered in this document.

## Auditor

**Aka** auditing node

A [full node](#full-node) in the blockchain network that does not participate
in creating new [blocks](#block), but rather performs continuous audit of all
transactions
in the network. Auditors are identified by a [public key](#public-key)
within the blockchain network.
Unlike [validators](#validator),
adding auditors does not create an overhead in transaction latency and
throughput,
so there can be hundreds of auditors in the same blockchain network.

!!! note "Example"
    Consider an Exonum blockchain that implements public registry in a
    particular
    country. In this case, auditing nodes may belong to non-government agencies
    which are interested in monitoring the operation of the registry.

## Authenticated Consensus

The type of [consensus](#consensus), in which the participants are known in advance
and are authenticated, usually with the help of public-key cryptography
(such as [digital signatures](#digital-signature)).
Exonum uses authenticated consensus algorithm slightly similar to [PBFT][pbft],
in order to keep the system [decentralized](#decentralization)
and withstand attacks by [Byzantine](#byzantine-node) [validators](#validator).

## Binary Serialization

Serialization of [data stored in the blockchain](#stored-datatype) and
[messages](#message) into a platform-independent sequence of bytes
according to the set of rules defined by the Exonum framework.
Binary serialization is used in Exonum for cryptographic operations, such as
computing
[hashes](#hash) and [digital signing](#digital-signature).
It is implemented both in [the core](#core)
and in [the light client library](#light-client).

Exonum serialization format is optimized to provide almost zero-cost
deserialization in low-level programming environments (such as Rust).

!!! tip
    See [*Serialization*](architecture/serialization.md) for more details.

## Block

An ordered list of [transactions](#transaction) in a blockchain, together
with the
authentication by at least 2/3 of the [validators set](#validator), and some
additional
information (such as the [hash](#hash) of the previous block and the hash
of [the blockchain state](#blockchain-state) after applying the transactions
in the block). The compact block form, in which transactions are replaced
by the root of their [Merkle tree](#merkle-tree),
is used for communication with [light clients](#light-client).

## Blockchain

A [distributed ledger](#distributed-ledger), which uses
[hash linking][wiki:linked-ts]
to achieve immutability of the transactions log, and other cryptographic
tools to improve accountability. Transactions in a blockchain are grouped in
[blocks](#block)
to improve auditing by [light clients](#light-client).

Whereas the design goal
of a distributed ledger is [decentralized](#decentralization) data management,
one of the design goals of a blockchain is achieving accountability of the
[blockchain maintainers](#maintainer) and auditability of the system by third
parties
(e.g., internal and external auditors, regulators and end users of the system).

## Blockchain State

The persistent state maintained by each [full node](#full-node) in the
blockchain
network, to which [transactions](#transaction) are applied.
[The consensus algorithm](#consensus) ensures that the blockchain state (not
only
the transactions log) is identical for all full nodes.

In Exonum, the blockchain state is implemented as a key-value storage. It is
persisted using [RocksDB][rocksdb]. The parts of the
storage correspond to
[tables](#table) used by [the core](#core) and [services](#service).

## Byzantine Node

A node in a distributed network that acts outside of behavior prescribed
by [the consensus algorithm](#consensus) in the network. Byzantine behavior
may be caused by a malicious intent, malfunctioning software/hardware, or
network connectivity problems.

Consensus algorithms that are able to withstand Byzantine behavior are called
Byzantine fault-tolerant (BFT). Exonum uses BFT consensus inspired by
[PBFT][pbft].
Exonum is able to tolerate up to 1/3 of [validators](#validator) acting
Byzantine,
which is the best possible number under the security model that Exonum uses.

## Configuration

A set of configurable parameters that determine the behavior of a
[full node](#full-node).
Configuration consists of 2 parts: [global configuration](#global-configuration)
and [local configuration](#local-configuration). Certain configuration
parameters
are defined by [the core](#core), e.g., the maximum number of transactions
in a [block](#block). [Services](#service) can define and manage additional
configuration parameters too.

!!! tip
    See [*Configuration*](architecture/configuration.md) for more details.

## Consensus

**Aka** consensus algorithm

A mechanism of reaching agreement among nodes in a network. In the
[blockchain](#blockchain)
context, consensus is required to withstand faults: nodes being non-responsive
and/or outright trying to compromise the operation of the blockchain.

There are 2 main types of consensus:

- [Authenticated consensus](#authenticated-consensus), in which the
  participating
  nodes are known in advance. This is the type of consensus implemented in
  Exonum;
- Anonymous consensus, in which the consensus participants are not known in
  advance.
  This type of consensus is commonly used in cryptocurrencies (e.g., Bitcoin).

## Consensus Message

A [message](#message) generated by a [full node](#full-node) as prescribed
by [the consensus algorithm](#consensus). Validators exchange consensus messages
to commit [transactions](#transaction) to the blockchain by creating new
[blocks](#block).

Consensus messages include:

- `Propose`, `Prevote` and `Precommit` messages that correspond to 3 phases
  of [the consensus algorithm](#authenticated-consensus) used in Exonum;
- Request messages used by full nodes to request missing data from peers;
- `Block` message used to transmit an entire block of transactions to a lagging
  full node;
- Auxiliary messages, such as `Status` and `Connect`.

!!! tip
    See [*Consensus*](architecture/consensus.md) and
    [*Requests*](advanced/consensus/requests.md) for more details.

## Core

In Exonum: the functionality present in any Exonum blockchain, regardless of
the deployed [services](#service), encapsulated in the [**exonum**][exonum]
repository.

For example, the core includes a collection of system [tables](#table) (such as
a set of all transactions ever committed to the blockchain).

## Decentralization

Absence of a single point of failure in the system. For example, absence of a
single
administrator having privileges to perform arbitrary actions.

## Digital Signature

**Aka** signature

A public-key digital signature in the [Ed25519][Ed25519] elliptic curve
cryptosystem.
The signature over a message proves that the signer knows
a specific [private key](#private-key) corresponding to a publicly known
[public key](#public-key). A signature can be verified
against this public key and the signed message, thus providing message
*authenticity*
(i.e., the message comes from a specific source) and *integrity*
(the message is not modified after being signed). Ed25519 signatures are
universally
verifiable, meaning that a verifier does not need to know any additional
information
to verify a signature.

!!! summary "Implementation details"
    Ed25519 digital signatures occupy 64 bytes in the binary form. Exonum
    uses the [`sodiumoxide`][sodiumoxide] Rust crate (a [`libsodium`][libsodium]
    binding for Rust) to create and verify digital signatures
    on [full nodes](#full-node), and [TweetNaCl.js][tweetnacl] to perform
    similar operations on [light clients](#light-client).

## Distributed Ledger

A distributed system that maintains a full [transactions](#transaction) log
for all operations
in the system, so that any piece of data in the system has a verifiable audit
trail.
All transactions are authenticated, usually via
[public key cryptography][wiki:pkc]
used together with some form of timestamping to provide
[non-repudiation][wiki:non-rep].

!!! note
    In a generic distributed ledger, the audit trail may be dispersed across
    the system participants. Thus, it may be difficult to argue about
    consistency
    of the whole system.

[Blockchains](#blockchain) are a particular kind of distributed ledgers with
focus
on auditability and accountability of the [system maintainers](#maintainer).

## Full Node

**Aka** peer

A node in the blockchain network that replicates all transactions in the
blockchain
and thus has a local copy of the entire [blockchain state](#blockchain-state).
There are 2 categories of full nodes in Exonum: [validators](#validator)
and [auditors](#auditor).

## Genesis Block

The very first [block](#block) in the blockchain. The genesis block does not
link to the hash of the previous block in the blockchain; instead, this link
is filled with a placeholder (32 bytes of zeros). The genesis block contains
an initial [global configuration](#global-configuration) and no other
transactions.

## Global Configuration

Part of the [configuration](#configuration) common for all [full nodes](#full-node).
The global configuration is a part of [the blockchain state](#blockchain-state).
[The core](#core) defines several global configuration parameters,
which are mostly related to [consensus](#consensus) and networking
(e.g., a set of [validators’](#validator) public keys).

## Hash

**Aka** cryptographic hash

[SHA-256][sha-256] [cryptographic hash][wiki:hash] digest of certain data.
Exonum uses hashes as unique identifiers for [transactions](#transaction).
Hashes are also used to create [Merkle trees](#merkle-tree) and their variants.

!!! summary "Implementation details"
    SHA-256 hashes occupy 32 bytes in the binary form. Exonum uses
    [`sodiumoxide`][sodiumoxide]
    to calculate hashes on [full nodes](#full-node) and [sha.js][sha.js] to do
    the same on [light clients](#light-client).

## JSON Serialization

Serialization of [data stored in the blockchain](#stored-datatype) and
[messages](#message) into JSON.
JSON serialization is used in Exonum for [service endpoints](#service-endpoint).
It is implemented both in [the core](#core)
and in [the light client library](#light-client).

## Light Client

**Aka** lightweight client, thin client

A node in the blockchain network that does not replicate all transactions in the
blockchain, but rather only a small subset that the client is interested in
and/or has access to. Light clients can communicate with
[full nodes](#full-node)
to [retrieve information from the blockchain](#read-request)
and initiate [transactions](#transaction). The [proofs mechanism](#merkle-proof)
allows to minimize the trust factor during this communication and protect the client
against
a range of attacks.

## Local Configuration

A part of [configuration](#configuration) local to every
[full node](#full-node). The local configuration is not a part of
[the blockchain state](#blockchain-state);
instead, it is maintained as a local TOML file, which is read during the node
startup.
[The core](#core) defines several local configuration parameters,
such as [the private key](#private-key) used to sign
[consensus and network messages](#consensus-message) created by the node.

## Maintainer

An entity participating in creating [blocks](#block) and setting the rules
in a blockchain.

In [permissioned blockchains](#permissioned-blockchain), maintainers
have known real-world identities, which are reflected in the blockchain protocol.
The maintainers set up and administer
[validator nodes](#validator) in the network, and agree on the changes in
the transaction processing rules.

!!! note "Example"
    Consider an Exonum blockchain that implements a public registry in a
    particular
    country. In this case, the maintainer of the blockchain is a government
    agency
    or agencies, which are tasked with maintaining public registries by law.

In contrast, in permissionless blockchains (e.g., Bitcoin), maintainers are not
reflected within the blockchain protocol. Validators in such networks are
usually
pseudonymous.

## Merkle Proof

A cryptographic proof that certain data is a part of
[the cryptographic commitment][wiki:commitment]
based on [Merkle trees](#merkle-tree) or their variants. A Merkle proof allows compactly proving that certain data is stored at the specified key
in [the blockchain state](#blockchain-state).
At the same time, the proof does not reveal
other information about the state and does not require replication of all
[transactions](#transaction)
in the blockchain network.

Merkle proofs are used in Exonum in the responses to
[read requests](#read-request)
by [light clients](#light-client). Using proofs, a client can verify the
authenticity
of a response without needing to communicate with multiple full nodes or
replicating all transactions in the blockchain.

## Merkle Tree

**Aka** hash tree

A data structure based on a binary tree that allows calculating an aggregate
[hash](#hash)
from a list of elements in such a way that any particular element of the list
is tied to the overall hash via a short link.
(This link is called a *Merkle path* or [*Merkle proof*](#merkle-proof).)

Exonum uses Merkle trees and a similar data structure for maps
(Merkle [Patricia tree][wiki:p-tree])
to collect the entire [blockchain state](#blockchain-state) into a single
*state hash* recorded in [blocks](#block),
and to provide [proofs](#merkle-proof) to [light clients](#light-client).

!!! note
    In cryptographic terms, a Merkle tree applies a
    [commitment scheme][wiki:commitment]
    to the list of elements in such a way that the size of any opening of the
    commitment
    is logarithmic with respect to the number of elements in the list.

## Message

A [digitally signed](#digital-signature) piece of data transmitted
through an Exonum network. There are 2 major kinds of messages:

- [Consensus messages](#consensus-message) are used among full nodes in the
  course
  of [the consensus algorithm](#consensus);
- [Transactions](#transaction) are used to invoke
  [blockchain state](#blockchain-state)
  changes and usually come from [external clients](#light-client).

## Permissioned Blockchain

A blockchain in which [maintainers](#maintainer) are a limited set of
entities
with established real-world identities. Accordingly,
[validator nodes](#validator)
in a permissioned blockchain
are few in number and are authenticated with the help of public-key
cryptography.

Permissioned blockchains usually use variations of
[authenticated consensus](#authenticated-consensus).

## Private API

A [service endpoint](#service-endpoint) that can be used to administer a local
instance of the service. As an example, private API can be used to change the
local configuration of a service.

## Private Key

Private key as per the [Ed25519][ed25519] specification. Each private key
corresponds
to a specific [public key](#public-key). The knowledge of a private key
is necessary to create [digital signatures](#digital-signature) over
[messages](#message),
which could be later verified against the message and the corresponding public
key.

!!! summary "Implementation details"
    As per [`libsodium`][libsodium], private keys occupy 64 bytes in the binary
    form: 32 bytes for the cryptographic seed used to generate the key,
    and 32 bytes for the pre-calculated corresponding public key. The latter
    32 bytes are redundant, but help speed up computations.

## Public Key

A public key as per the [Ed25519][ed25519] specification. Public keys are used
to verify [digital signatures](#digital-signature) over [messages](#message).
A public key can be linked with a real-world identity. For example,
public keys used in [consensus](#consensus) are tied to specific
[validators](#validator),
as only a specific validator is assumed to know
the corresponding [private key](#private-key).

!!! summary "Implementation details"
    As per [`libsodium`][libsodium], public keys occupy 32 bytes in the binary
    form.

## Read Request

A [service endpoint](#service-endpoint) that can be used to retrieve data from
[the blockchain state](#blockchain-state). The data is usually returned with
a [proof](#merkle-proof) that the data is indeed a part of the blockchain state
and has been authorized by a supermajority of [validators](#validator).

## Serialization

A process of converting Exonum data structures to a language-independent
representation.
Exonum defines (de)serialization rules for [stored datatypes](#stored-datatype)
and [messages](#message). Each of these can be converted from/to 2
representations:
[binary](#binary-serialization) and [JSON](#json-serialization).

## Service

The main extension point of the Exonum framework, similar in its design
to a web service. Services define all [transaction](#transaction) processing
logic
in any Exonum blockchain.

Externally, a service is essentially a collection of
[endpoints](#service-endpoint)
that allow to manipulate data in [the blockchain state](#blockchain-state)
and retrieve it, possibly with [proofs](#merkle-proof). Internally, a service
may define various entities, including [table](#table) schema,
[configurable parameters](#configuration), etc.

!!! tip
    See [*Services*](architecture/services.md) for more details.

## Service Endpoint

A point of communication with [a service](#service). There are three kinds of
endpoints:

- [Transactions](#transaction) allow to atomically change the blockchain state;
- [Read requests](#read-request) allow to read data from the blockchain state,
  usually together with [a proof](#merkle-proof);
- [Private APIs](#private-api) allow configuring the service locally.

External entities such as [light clients](#light-client) can access endpoints
via REST API. The configuration for REST API is specified in the service.

## Stored Datatype

A datatype capable of being stored as a value in
[the Exonum key-value storage](#blockchain-state).
Stored datatypes use [binary serialization](#binary-serialization)
logic to convert data to a platform-independent representation.

!!! tip
    See [*Storage*](architecture/storage.md) for more details.

## Table

A structured collection of data (e.g., a map, set or a list) that provides a
high-level
abstraction on top of [the blockchain state](#blockchain-state). Tables are used
by [services](#service) to simplify data management. Additionally, some types
of tables allow computing [Merkle proofs](#merkle-proof) efficiently for
table items.

## Transaction

An atomic patch to [the blockchain state](#blockchain-state)
satisfying [ACID][wiki:acid] criteria. Transactions are
authenticated with the help of
[public-key digital signatures](#digital-signature);
i.e., the authorship
of each transaction is known and cannot be easily repudiated. Transactions may
be generated by various entities in the blockchain network, such as
[light clients](#light-client).

Transactions are ordered and grouped into [blocks](#block) in the course of
[the consensus algorithm](#consensus). Thus, transactions are applied in the
same
order on all [full nodes](#full-node) in the blockchain network.

In Exonum, transactions are a subtype of [service endpoints](#service-endpoint).
All transactions are templated and defined within [services](#service),
acting similarly to [stored procedures][mysql-stored] in database management
systems.
Transaction endpoints of a service usually specify certain verification rules,
such
as the validity of a digital signature in the transaction. If the rules do not
hold
for a particular transaction,
it does not change the blockchain state, but may still be recorded in
the transaction log.

!!! tip
    See [*Transactions*](architecture/transactions.md) for more details.

## Validator

A [full node](#full-node) in the blockchain network with the right to
participate
in [the consensus algorithm](#consensus) to create [blocks](#block). In Exonum,
validators are identified with the help of
[the global configuration](#global-configuration),
which contains public keys of all validators in the network. The set of
validators
can be changed by changing the global configuration. Usually, the set of
validators
is reasonably small, consisting of 4–15 nodes.

[wiki:linked-ts]: https://en.wikipedia.org/wiki/Linked_timestamping
[wiki:pkc]: https://en.wikipedia.org/wiki/Public-key_cryptography
[wiki:non-rep]: https://en.wikipedia.org/wiki/Non-repudiation
[wiki:acid]: https://en.wikipedia.org/wiki/ACID
[rocksdb]: http://rocksdb.org
[exonum]: https://github.com/exonum/exonum/
[wiki:mt]: https://en.wikipedia.org/wiki/Merkle_tree
[wiki:p-tree]: https://en.wikipedia.org/wiki/Radix_tree
[wiki:commitment]: https://en.wikipedia.org/wiki/Commitment_scheme
[pbft]: http://pmg.csail.mit.edu/papers/osdi99.pdf
[mysql-stored]: https://dev.mysql.com/doc/refman/5.6/en/stored-routines.html
[sodiumoxide]: https://dnaq.github.io/sodiumoxide/sodiumoxide/index.html
[libsodium]: https://download.libsodium.org/doc/
[tweetnacl]: https://github.com/dchest/tweetnacl-js
[ed25519]: https://ed25519.cr.yp.to/
[wiki:hash]: https://en.wikipedia.org/wiki/Cryptographic_hash_function
[sha-256]: http://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf
[sha.js]: https://www.npmjs.com/package/sha.js
