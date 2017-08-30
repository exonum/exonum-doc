# Exonum Data Model

This page describes Exonum **data storage** principles, from the database engine
used (LevelDB), to the abstractions that are used in client
applications.

1. [Exonum table types](#table-types) lists supported types of
  data storage collections. Tables represent the highest abstraction level
  for data storage
2. [Low-level storage](#low-level-storage) explains how tables are persisted
  using LevelDB
3. [View layer](#view-layer) describes the wrapper over the DB engine
  that ensures atomicity of blocks and transactions
4. [List of system tables](#system-tables) contains tables
  used directly by the Exonum core
5. [Indexing](#indexing) gives an insight how indexes over structured data
  can be built in Exonum

## Table Types

Tables (aka indexes) perform the same role as in relational database
management systems (RDBMSs). Every
table stores records of a specific type. However, unlike RDBMS tables,
all Exonum tables internally are implemented [as wrappers around key-value stores](#baseindex).
Both keys and values in the wrapped stores are persisted as byte sequences.
Exonum does not natively support operations (matching, grouping, sorting, etc.)
over separate value fields, as it is the case with other key-value storages.

### Key Sorting and Iterators

Exonum tables implement iterators over stored items (or keys, values, and key-value
pairs in the case of maps). Such
iterators use key ordering of the underlying key-value storage to determine
the iteration order.
Namely, keys are lexicographically ordered over their binary serializations;
this ordering coincides with that used in [LevelDB](#low-level-storage).

### BaseIndex

[`BaseIndex`][base-index] represents the most basic table type. Other
table types wrap `BaseIndex`, enhancing its functionality for specific use cases.
`BaseIndex` implements a map interface:

- Get, set and remove value by key
- Check if the specific key presents
- Iterate over the key-value pairs in the lexicographic key order
- Clear the table (i.e., remove all stored key-value pairs)

!!! warning
    `BaseIndex` should not be used directly. Rather, you should use a built-in
    table type that wraps `BaseIndex`, or write your own.

### MapIndex

[`MapIndex`][map-index] implements a key-value store aka a map. It has
the following functionality:

- Get, set and remove value by key
- Check if a specific key is present in the map
- Iterate over the key-value pairs in the lexicographic key order
- Iterate over keys in the lexicographic key order
- Iterate over values in the lexicographic key order
- Clear the map (i.e., remove all stored key-value pairs)

### ListIndex

[`ListIndex`][list-index] represents an array list.
The following operations are supported:

- Get and set a list item by index
- Append an item to the list
- Pop or poll the last item from the list
- Get the list length
- Check if the list is empty
- Iterate over index-item pairs ordered by index
- Insert a sequence of items from an iterator
- Truncate the list to the specified length
- Clear the list (i.e., remove all stored items from the list)

`ListIndex` does not support inserting items in the middle of the
list or removing items by index
(although it is still possible to implement these operations manually).

!!! summary "Implementation Details"
    `ListIndex` saves its items to the internal `BaseIndex` map
    with 8-byte unsigned item
    indexes as keys, serialized in big-endian form (to support proper iteration).
    The list length is saved in this map with a
    zero-length byte sequence as the key.

### ValueSetIndex

[`ValueSetIndex`][value-set-index] implements a hash set.
The following operations are implemented:

- Add and remove set elements
- Check if an element is already present using the element itself or its hash
- Iterate over stored elements in the lexicographic order of their hashes
- Iterate over hashes of elements in the lexicographic order
- Clear the set (i.e., remove all elements)

The hash used in `ValueSetIndex` is calculated using the `hash()` method
of the `StorageValue` trait.
All built-in types implementing `StorageValue` compute this hash as SHA-256
of the binary serialization of a type instance.

!!! summary "Implementation Details"
    Internally, `ValueSetIndex` uses `BaseIndex` with element hashes as keys,
    and elements themselves as corresponding values.

### KeySetIndex

[`KeySetIndex`][key-set-index] implements a set.
The following procedures are implemented:

- Add and remove set elements
- Check if a specific element is in the set
- Iterate over elements in the lexicographic order
- Clear the set (i.e., remove all stored elements)

!!! summary "Implementation Details"
    Internally, set elements
    are inserted to the underlying `BaseIndex` as `(&element, ())`
    (i.e., the element is used as a key, and the value is always empty).

#### KeySetIndex vs ValueSetIndex

While `ValueSetIndex` uses a hash as a key for the underlying `BaseIndex`,
`KeySetIndex` puts an entire binary serialization of an element into the key.

- `KeySetIndex` does not have an additional overhead on hashing
  set elements.
- `KeySetIndex` should not be used when the set elements are relatively big;
  only small elements should be stored in it (such as integers, small strings, small
  tuples). On the other hand, the `ValueSetIndex` more easily handles
  storing big and complex elements.
- The `KeySetIndex` introduces a lexicographical order over stored
  elements, while the `ValueSetIndex` order elements arbitrarily due to hash
  function properties.

### Merklized Indexes

Merklized indexes represent a list and map with additional
features. Such indexes can create the proofs of existence or absence for
stored data items.

When a light client requests data from an Exonum full node, the proof can be
built and sent along with the actual data. Having block headers
and this proof, the client may check that received data was really
authorized by the validators without having to replicate the entire blockchain
contents.

#### ProofListIndex

[`ProofListIndex`][proof-list-index] implements a Merkle
tree, which is a Merklized version of an
array list. It implements the same methods as `ListIndex`, and adds an
additional feature: based on Merkle trees, `ProofListIndex` allows efficiently
creating compact proofs of existence for the list items.
The following additional procedures are implemented:

- Get the height of the Merkle tree. As the tree is balanced (though may be not
  full), its height is close to `log2` of the list length
- Get the value of the tree root (i.e., the hash of the entire Merkle tree)
- Build a proof of existence for an item at a specific position
- Build a proof of existence for items at a specific contiguous index range

!!! note
    `ProofListIndex` is *append-only*; it does not allow deleting list items.
    The only way to delete an item from a `ProofListIndex` is clearing it.

!!! summary "Implementation Details"
    As with `ListIndex`, list items are stored with 8-byte keys. However,
    `ProofListIndex` also persists all intermediate nodes of the Merkle tree
    built on top of the list, in order to quickly build proofs and recalculate
    the Merkle tree after operations on the list.

#### ProofMapIndex

[`ProofMapIndex`][proof-map-index] is a Merklized version of a map
based on Merkle Patricia tree.
It implements the same methods as the `MapIndex`, adding the ability to
create proofs of existence for its key-value pairs, or proofs of absence
if a key is absent in the map. The following additional
procedures are supported:

- Get the root node’s value
- Build a proof for the requested key. Tree proves either key
  existence (and its value), or key absence

## Low-level Storage

Exonum uses third-party database engines to persist blockchain state
locally. To use the particular database, a minimal [`Database`][database]
interface should be implemented for it:

- Get value by key
- Put new value at the key (insert or update the saved one)
- Delete key-value pair by key

All the tables functionality is reduced to these atomic call types.

As of Exonum 0.1, [LevelDB][level-db] is used as the database engine.
[RocksDB][rocks-db] support is [planned](../roadmap.md).

All the values from different tables are stored in one big key-value
table at the low-level storage, wherein the keys are represented as
a byte sequence, and values are serialized according to Exonum binary serialization
format. Keys of the wrapped `BaseIndex` of a specific table
are mapped to the low-level storage keys
in a deterministic manner using [table identifiers](#table-identifiers).

### Table Identifiers

Every table is uniquely identified by the compound prefix, which is used
to map table keys into keys of the underlying low-level storage. The
keys are prepended with this prefix which is unique to each table, thus
allows to distinguish values from different tables.

The table prefix consists of [the service ID](services.md#service-identifiers)
and an internal identifier inside the
service.
All tables created with the same prefix will be the views of the same data.

Services identifier is a 2-byte unsigned integer, `u16`.
[System tables](#system-tables) have service ID equal to `0`.
Tables inside services are identified
with `u8` integers and an optional suffix. If the suffix is present,
the `u8` integer denotes a *group* of tables, rather than a single table,
and suffixes are used to distinguish tables within the group.

!!! note "Example"
    Key `key` at the table named `BTC` (`0x42 0x54 0x43` in ASCII) at
    the table group `0x03` for the service with ID `0x00 0x01` matches the
    following key in the LevelDB map:

    ```none
    0x00 0x01 | 0x03 | 0x42 0x54 0x43 | key
    ```

    Here, `|` separates logical components of the low-level key.

It is advised to use a `gen_prefix` function
for creating table prefixes. See the [schema of Exonum core][blockchain-schema]
for an example.

!!! warning
    Table identifiers can also be created manually, but it could be risky.
    It is strongly advised not to admit
    a situation when one table identifier inside the service is a prefix for
    another table in the same service. Such cases may cause unpredictable
    collisions between logically different keys and elements.

## View Layer

Exonum introduces additional layer over database to handle transaction
and block atomicity.

### Patches

[Patch][patch] is a set of serial changes that should be applied to
the low-level storage atomically. A patch may include two types of
operations: put a value addressed by a key, or delete a value by a key.

### Snapshots

[Snapshot][snapshot] fixes the storage state at the moment of snapshot
creation and provides a read-only API to it. Even if the storage state
is updated, the snapshot still refers to the old table content.

### Forks

[Forks][fork] implement the same interfaces as the database underneath,
transparently wrapping the real data storage state, and some
additional changes. Every fork is based on the storage snapshot. From
the outer point of view, the changes are eagerly applied to the data
storage; however, these changes are stored directly in the fork and may
be easily rolled back. Moreover, there may be different forks of
the same database snapshot.

Forks are used during transaction and block processing.
A fork [is successively passed](transactions.md#execute)
to each transaction in the block to accumulate changes produced by the transactions,
in a [patch](#patches).
If one of transactions in the block quits with an unhandled exception (i.e.,
raises `panic`) during
execution, its changes are promptly rolled back, so that execution of the following
transactions continues normally.

## System Tables

The core [maintains tables][blockchain-schema] that are used
for core blockchain functionality:

- `transactions: MapIndex`  
  Represents a map from transaction hash into raw transaction structure.
- `tx_location_by_hash: MapIndex`  
  Keeps the block height and tx position inside block for every
  transaction hash.
- `blocks: MapIndex`  
  Stores block object for every block height.
- `block_hashes_by_height: ListIndex`  
  Saves a block hash that has the requested height.
- `block_txs: ProofListIndex`  
  Group of tables keyed by the block height. Each table keeps
  a list of transactions for the specific block.
- `precommits: ListIndex`  
  Group of tables keyed by the block hash. Each table stores a list of
  validators’ precommits for the specific block.
- `configs: ProofMapIndex`  
  Stores the configurations content in JSON format, using its hash as a key.
- `configs_actual_from: ListIndex`  
  Builds an index to get a configuration activating at a specific height quickly.

## Indexing

Unlike relational databases, Exonum does not support indices over fields
of table elements as an first-class entity. However, it is
possible to create additional tables with indexing semantics and update their
content together with the tables being indexed.

!!! note "Example"
    The system table `block_txs` stores a list of transactions
    for every block. `tx_location_by_hash` is an auxiliary table that provides
    an index to quickly lookup `block_txs` by a transaction hash.

[level-db]: http://leveldb.org/
[rocks-db]: http://rocksdb.org/
[base-index]: https://github.com/exonum/exonum/blob/master/exonum/src/storage/base_index.rs
[map-index]: https://github.com/exonum/exonum/blob/master/exonum/src/storage/map_index.rs
[list-index]: https://github.com/exonum/exonum/blob/master/exonum/src/storage/list_index.rs
[proof-list-index]: https://github.com/exonum/exonum/blob/master/exonum/src/storage/proof_list_index/mod.rs
[list-proof]: https://github.com/exonum/exonum/blob/master/exonum/src/storage/proof_list_index/proof.rs
[proof-map-index]: https://github.com/exonum/exonum/blob/master/exonum/src/storage/proof_map_index/mod.rs
[value-set-index]: https://github.com/exonum/exonum/blob/master/exonum/src/storage/value_set_index.rs
[key-set-index]: https://github.com/exonum/exonum/blob/master/exonum/src/storage/key_set_index.rs
[database]: https://github.com/exonum/exonum/blob/d9e2fdc3d5a1d4e36078a7fbf1a9198d1b83cd5d/exonum/src/storage/db.rs#L43
[patch]: https://github.com/exonum/exonum/blob/d9e2fdc3d5a1d4e36078a7fbf1a9198d1b83cd5d/exonum/src/storage/db.rs#L11
[snapshot]: https://github.com/exonum/exonum/blob/d9e2fdc3d5a1d4e36078a7fbf1a9198d1b83cd5d/exonum/src/storage/db.rs#L57
[fork]: https://github.com/exonum/exonum/blob/d9e2fdc3d5a1d4e36078a7fbf1a9198d1b83cd5d/exonum/src/storage/db.rs#L104
[leveldb-wrapper]: https://github.com/exonum/exonum/blob/master/exonum/src/storage/leveldb.rs
[blockchain-schema]: https://github.com/exonum/exonum/blob/master/exonum/src/blockchain/schema.rs
