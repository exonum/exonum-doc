# Exonum Data Model

This page describes Exonum **data storage** principles, from the database engine
used (RocksDB), to the abstractions that are used in client
applications.

1. [Exonum table types](#table-types) lists supported types of
   data storage collections. Tables represent the highest abstraction level
   for data storage
2. [Low-level storage](#low-level-storage) explains how tables are persisted
   using RocksDB
3. [View layer](#view-layer) describes the wrapper over the DB engine
   that ensures atomicity of blocks and transactions
4. [List of system tables](#system-tables) contains tables
   used directly by the Exonum core
5. [Indexing](#indexing) gives an insight how indices over structured data
   can be built in Exonum

## Table Types

Tables (aka indices) perform the same role as in relational database
management systems (RDBMSs). Every
table stores records of a specific type. However, unlike RDBMS tables,
all Exonum tables internally are implemented
[as wrappers around key-value stores](#baseindex).
Both keys and values in the wrapped stores are persisted as byte sequences.
Exonum does not natively support operations (matching, grouping, sorting, etc.)
over separate value fields, as it is the case with other key-value storages.

### Key Sorting and Iterators

Exonum tables implement iterators over stored items (or keys, values, and
key-value
pairs in the case of maps). Such
iterators use key ordering of the underlying key-value storage to determine
the iteration order.
Namely, keys are lexicographically ordered over their binary serializations;
this ordering coincides with that used in
[RocksDB](#low-level-storage).

### BaseIndex

[`BaseIndex`][base-index] represents the most basic table type. Other
table types wrap `BaseIndex`, enhancing its functionality for specific use
cases.
`BaseIndex` implements a map interface:

- Get, set and remove value by key
- Check if a specific key is present
- Iterate over the key-value pairs in the lexicographic key order
- Clear the table (i.e., remove all stored key-value pairs)

!!! warning
    `BaseIndex` should not be used directly. Rather, you should use a built-in
    table type that wraps `BaseIndex`, or write your own one.

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
    indices as keys, serialized in big-endian form (to support proper
    iteration).
    The list length is saved in this map with a
    zero-length byte sequence as a key.

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
- `KeySetIndex` should not be used when set elements are relatively big;
  only small elements should be stored in it (such as integers, small strings,
  small
  tuples). On the other hand, the `ValueSetIndex` more easily handles
  storing big and complex elements.
- The `KeySetIndex` introduces a lexicographical order over stored
  elements, while the `ValueSetIndex` orders elements arbitrarily due to hash
  function properties.

### Merkelized Indices

Merkelized indices represent a list and a map with additional
features. Such indices can create the proofs of existence or absence for
stored data items.

When a light client requests data from an Exonum full node, the proof can be
built and sent along with the actual data. Having block headers
and this proof, the client may check that received data was really
authorized by the validators without having to replicate the entire blockchain
contents.

#### ProofListIndex

[`ProofListIndex`][proof-list-index] implements a Merkle
tree, which is a Merkelized version of an
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

[`ProofMapIndex`][proof-map-index] is a Merkelized version of a map
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

- Get a value by a [column family][col-family] name and a key
- Put a new value at the specified column family / key (insert or update
  the saved one)
- Delete a key-value pair by column family name / key

All the tables functionality is reduced to these atomic call types.

As of Exonum 0.3, the main database engine is [RocksDB][rocks-db].
In versions 0.1 and 0.2, [LevelDB][level-db] was supported as well, but
since 0.3 its support has been dropped.

Values from different tables are stored in column families in the low-level
storage,
wherein the keys are represented as
a byte sequence, and values are serialized according to Exonum binary
serialization format. A single column family may store data for
more than one table (see table groups below).
Keys of the wrapped `BaseIndex` of a specific table
are mapped to the low-level storage keys
in a deterministic manner using [table identifiers](#table-identifiers).

### Table Identifiers

Every table is uniquely identified by a compound identifier, which is used
to map table keys into a column family and its keys in the underlying
low-level storage. A table identifier consists of 2 parts:

- **String name,** which is mapped 1-to-1 to a column family.
  The name may contain uppercase and lowercase Latin letters, digits,
  underscores `_`, and periods `.`. By convention, table names in services
  should
  start with [the service name][service-name] and a period. For example,
  the only table in the Cryptocurrency Tutorial is named
  `cryptocurrency.wallets`,
  where `cryptocurrency` is the service name, and `wallets` is the own name
  of the table.
- **Optional prefix** presented as a sequence of bytes (`Vec<u8>` in Rust terms).

If the prefix is present, the column family identified by the table name
stores a *group* of tables, rather than a single table.
In this case, prefixes are used to distinguish tables within the group.

!!! note "Example"
    Key `key` at the table with name `exchange.crypto` and prefix `BTC`
    (`0x42 0x54 0x43` in ASCII) matches key
    `0x42 0x54 0x43 | key` in the column family in RocksDB named
    `exchange.crypto`.

!!! warning
    It is strongly advised not to admit
    a situation when a table prefix in a table group starts with
    another table prefix in the same group. Such cases may cause unpredictable
    collisions between logically different keys and elements.
    As a possible way to avoid this, prefixes within the group may have
    a fixed byte size.

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
to each transaction in the block to accumulate changes produced by the
transactions,
in a [patch](#patches).
If one of transactions in the block quits with an unhandled exception (i.e.,
raises `panic`) during
execution, its changes are promptly rolled back, so that execution of the
following
transactions continues normally.

## System Tables

The core [maintains tables][blockchain-schema] that are used
for core blockchain functionality:

- `transactions: MapIndex`  
  Represents a map from transaction hash into raw transaction structure.
- `transactions_locations: MapIndex`  
  Keeps the block height and tx position inside block for every
  transaction hash.
- `blocks: MapIndex`  
  Stores block object for every block height.
- `block_hashes_by_height: ListIndex`  
  Saves a block hash that has the requested height.
- `block_transactions: ProofListIndex`  
  Group of tables keyed by the block height. Each table keeps
  a list of transactions for the specific block.
- `precommits: ListIndex`  
  Group of tables keyed by the block hash. Each table stores a list of
  validators’ precommits for the specific block.
- `configs: ProofMapIndex`  
  Stores the configurations content in JSON format, using its hash as a key.
- `configs_actual_from: ListIndex`  
  Builds an index to quickly get a configuration activating at a specific
  height.

## Indexing

Unlike relational databases, Exonum does not support indices over fields
of table elements as a first-class entity. However, it is
possible to create additional tables with indexing semantics and update their
content together with the tables being indexed.

!!! note "Example"
    The system table `block_transactions` stores a list of transactions
    for every block. `transactions_locations` is an auxiliary table that
    provides
    an index to quickly lookup `block_transactions` by a transaction hash.

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
[col-family]: https://github.com/facebook/rocksdb/wiki/Column-Families
[blockchain-schema]: https://github.com/exonum/exonum/blob/master/exonum/src/blockchain/schema.rs
[service-name]: services.md#service-identifiers
