# Exonum Data Model

This page provides an overview of how Exonum works with the persistent data.

Exonum uses MerkleDB as a storage framework. MerkleDB is an object database. It
represents a high-level wrapper over the key-value store.

Currently [RocksDB][rocks-db] is used for low-level key-value storage engine in
Exonum.

The objects of MerkleDB are convenient abstractions for work with
blockchain-specific data. For example, such abstraction can be a list that
provides cryptographic proofs for its stored items.

Currently, the objects in MerkleDB fall into two types:

- **blobs**, which represent sequences of bytes, and
- **root objects**, that do not have parents. These objects have UTF-8
  identifiers, for example, "block", "state". Root objects can contain blob
  items inside them.

The basic root objects of the framework are:

- **list**, where either keys or values are stored
- **map**, where key-value pairs are stored
- **set** of unique items
- **entry**, which represents a set containing only one item.

and also merkelized versions of lists and maps.

Read more about MerkleDB [here][merkledb].

1. [System Root Objects](#system-root-objects) lists the types of data
   stores supported by Exonum. Objects represent the highest abstraction level
   for the data storage.
2. [Low-level storage](#low-level-storage) explains how objects are persisted
   using RocksDB.
3. [View layer](#view-layer) describes the wrapper over the DB engine
   that ensures atomicity of blocks and transactions.
4. [Indexing](#indexing) explains how indices over structured data
   can be built in Exonum.

## System Root Objects

All [root objects][blockchain-schema] in Exonum have `core.*` prefix. Below is a
list of available objects that are used in client applications.

- `transactions: MapIndex`  
  Represents a map from the transaction hash into a raw transaction structure.
- `transaction_results: ProofMapIndex`  
  Keeps execution results for all accepted transactions,
  indexed by transaction hashes.
- `transactions_pool: KeySetIndex`  
  Stores the set of hashes of the known transactions that have not been
  committed yet.
- `transactions_pool_len: Entry`  
  Caches the number of entries in `transactions_pool`.
- `transactions_locations: MapIndex`  
  For every transaction hash keeps the position of said transaction inside the
  block and the block height.
- `blocks: MapIndex`  
  Stores the block object for every block height.
- `block_hashes_by_height: ListIndex`  
  Saves block hashes indexed by block heights.
- `block_transactions: ProofListIndex`  
  Stores a list of transactions of the specific block indexed by the block
  height.
- `precommits: ListIndex`  
  Stores a list of precommits of the validators for the specific block, indexed
  by the block hash.
- `configs: ProofMapIndex`  
  Stores the configuration content in JSON format using its hash as a key.
- `configs_actual_from: ListIndex`  
  Stores the hashes of the upcoming configurations indexed by the heights, where
  each configuration should become active. The list allows a simple search for
  the upcoming configuration hash by its height. The discovered hash allows a
  simple search of the corresponding configuration in the
  `configs: ProofMapIndex`.
- `state_hash_aggregator: ProofMapIndex`  
  An accessory store for summing up the state hash of the whole blockchain.

## Low-level Storage

Exonum uses a third-party database engine to persist blockchain state
locally. Currently the main database engine is [RocksDB][rocks-db]. It is also
possible to plug in other engines.

To use a particular database, a minimal [`Database`][database]
interface should be implemented for it:

- Get a value by a [column family][col-family] name and a key
- Put a new value at the specified column family / key (insert or update
  the saved one)
- Delete a key-value pair by a column family name / key.

All the objects functionality is reduced to these atomic call types.

Values of different objects and their items are stored in a single column
family in the
low-level storage. Keys are represented as byte sequences. Values are
serialized according to the Protobuf serialization format. All keys are mapped
to the low-level storage keys in a deterministic manner
using [object identifiers](#object-identifiers).

### Object Identifiers

Each object in the database has its own unique identifier and metadata. The
metadata can store various information about the internal state of the object.
For example, for [`ListIndex`], its length is stored in the metadata.
Metadata is represented by the [`IndexMetadata`][index-metadata] structure,
which stores the object identifier and the metadata state.

To obtain object identifiers [object pool][indexes-pool] is used. The pool
stores identifiers of all available objects. The pool assigns identifiers to
the objects incrementally as soon as new objects appear. The pool is
stored in a separate column family. Key in this
column family is the object identifier, value is the object metadata.

On user level every object is uniquely identified by an address. This address
maps the object to the identifier from the object pool mentioned before.
An object address consists of 2 parts:

- **String name,** that may contain uppercase and lowercase Latin letters,
  digits,
  underscores `_`, and periods `.`. By convention, object names in services
  should
  start with [the service name][service-name] and a period. For example,
  the only object in the Cryptocurrency Tutorial is named
  `cryptocurrency.wallets`,
  where `cryptocurrency` is the service name, and `wallets` is the own name
  of the object.
- **Optional prefix** presented as a sequence of bytes (`Vec<u8>` in Rust
  terms).

An object key in RocksDB is a 32-elements byte array. The first 16 bytes are an
object identifier
obtained using the object pool. The second 16 bytes are the key of an item
stored inside the object. In the database, it looks like this:
`(identifier | key)` - 0x00000000000000100000000000000002

!!! note "Example"
    Suppose we have a list with the address `(" exchange.crypto "," BTC ")` in
    which we put one value, for example `0.00019`. The pool assigns
    0x0000000000000003 identifier to this list, when we create it.
    Since `0.00019` is
    a single value in the list, its key is 0x0000000000000000. Thus, in the
    database it will look like this (in HEX):
    0x00000000000000030000000000000000 : 0x302E3030303139.

Optional prefix is used for backwards compatibility with older versions of the
Exonum storage and for grouping objects with similar data.

## View Layer

Exonum introduces additional layer over the database to handle transaction
and block atomicity.

### Patches

[Patch][patch] is a set of serial changes that should be applied to
the low-level storage atomically. A patch may include two types of
operations: put a value addressed by a key, or delete a value by a key.

### Snapshots

[Snapshot][snapshot] fixes the storage state at the moment of snapshot
creation and provides a read-only API to it. Even if the storage state
is updated, the snapshot still refers to the old object content.

### Forks

[Forks][fork] implement the same interfaces as the database underneath,
transparently wrapping the real data storage state, and some
additional changes. Every fork is based on the storage snapshot. From
the outer point of view, the changes are eagerly applied to the data
storage; however, these changes are stored directly in the fork and may
be easily rolled back. You can create multiple mutable objects from one
immutable reference to the fork. Moreover, there may be different forks of
the same database snapshot.

Forks are used during transaction and block processing.
A fork [is successively passed](transactions.md#execute)
to each transaction in the block to accumulate changes produced by the
transactions, in a [patch](#patches).
If one of the transactions in the block quits with an unhandled exception (i.e.,
raises `panic`) during execution, its changes are promptly rolled back, so
that execution of the following transactions continues normally.

## Indexing

Unlike relational databases, Exonum does not support indices over fields
of object items as a first-class entity. However, it is
possible to create auxiliary objects with indexing semantics. Content of the
auxiliary objects should be updated according to the content of the original
objects that they index.

!!! note "Example"
    The system object `block_transactions` stores a list of transactions
    for every block. `transactions_locations` is an auxiliary object that
    provides
    an index to quickly look up `block_transactions` by a transaction hash.

[rocks-db]: http://rocksdb.org/
[merkledb]: merkledb.md
[blockchain-schema]: https://github.com/exonum/exonum/blob/master/exonum/src/blockchain/schema.rs
[database]: https://github.com/exonum/exonum/blob/b88171f8efa12e92cc1f1b958d53139a5f0e0ae6/components/merkledb/src/db.rs#L452
[patch]: https://github.com/exonum/exonum/blob/b88171f8efa12e92cc1f1b958d53139a5f0e0ae6/components/merkledb/src/db.rs#L146
[snapshot]: https://github.com/exonum/exonum/blob/b88171f8efa12e92cc1f1b958d53139a5f0e0ae6/components/merkledb/src/db.rs#L500
[fork]: https://github.com/exonum/exonum/blob/b88171f8efa12e92cc1f1b958d53139a5f0e0ae6/components/merkledb/src/db.rs#L394
[col-family]: https://github.com/facebook/rocksdb/wiki/Column-Families
[service-name]: services.md#service-identifiers
[index-metadata]: https://github.com/exonum/exonum/blob/c6ccae1ab43584b67110cbf95146cedfe4b7ea02/components/merkledb/src/views/metadata.rs#L94
[indexes-pool]: https://github.com/exonum/exonum/blob/8072b701aa7e0f639a4af2f3be55823fe2d1345b/components/merkledb/src/views/metadata.rs#L193
