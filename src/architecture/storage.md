# Exonum Data Model

This page describes how Exonum persists data, from the lowest
(LevelDB) to the high abstract layers that are used in the client
applications.

Storage architecture can be viewed from different points:

1. [Exonum table types](#exonum-table-types) lists supported types of
  data storage collections. These tables represent the highest level
  at the data storage architecture.
2. [Storage](#storage) explains how tables content is stored.

    - [Low-level storage](#low-level-storage) shows how Exonum keeps the
      data on the hard disk using LevelDB
    - [Table identifiers](#table-identifiers) elaborates how
      user tables are identified, and shows how the Exonum tables are
      mapped into LevelDB global keyspace

3. [View layer](#view-layer) describes the wrapper over the DB engine.
  This layer implements a “sandbox” above the real data and ensures atomicity
  of block commitment
4. [List of system tables](#list-of-system-tables) describes tables
  used directly by Exonum Core
5. [Indexing](#indexing) reveals how indices can be built
6. [Genesis block](#genesis-block) describes how tables are initialized

## Exonum table types

Tables (aka indexes) perform the same role as in relational database
management systems (RDBMSs). Every
table stores records of a specific type. However, unlike RDBMS tables,
all Exonum tables internally are implemented as key-value stores. Both
keys and values are stored as byte sequences, and Exonum does not support
operations (matching, grouping, etc.) over separate value fields.

### Keys sorting

The tables implement iterators over keys and/or stored items. Such
iterators use ordering by keys to define the iteration order. The
way keys are sorted depends on the selected low-level database engine;
Exonum uses a [LevelDB](#low-level-storage) where the keys are ordered
lexicographically over binary sequences.

### BaseIndex

[`BaseIndex`][base-index] represents the most basic table type. Other
table types wrap `BaseIndex`, enhancing its functionality for specific use cases.
`BaseIndex` implements a map interface:

- Get, set and remove value by key
- Check if the specific key presents
- Iterate over the key-value pairs
- Clear the table (i.e., remove all stored values)

!!! warning
    `BaseIndex` should not be used directly. Rather, you should use a built-in
    table type that wraps `BaseIndex`, or write your own.

### MapIndex

[`MapIndex`][map-index] implements a key-value store aka a map. It has
the following functionality:

- Get, set and remove value by key
- Check if the specific key presents
- Iterate over the key-value pairs
- Iterate only over keys
- Iterate only over values
- Clear the map (i.e., remove all stored values)

### ListIndex

[`ListIndex`][list-index] represents an array list.
The following operations are supported:

- Get and set an item by index
- Append an item
- Pop the last item from the list (with or without removal)
- Get the list length
- Check if the list is empty
- Iterate over key-value pairs
- Insert a sequence of values from an iterator
- Truncate the list to the specified length
- Clear the list (i.e., remove all stored values)

`ListIndex` does not support inserting elements in the middle of the
list or removing elements by index
(although it is still possible to implement these operations manually).

`ListIndex` saves its elements to the internal `base` map with element
indices as keys. The list length also is saved at `base` with a
zero-length tuple `&()` as a key.

### ValueSetIndex

[`ValueSetIndex`][value-set-index] implements a hash set. Internally,
`ValueSetIndex` uses `BaseIndex` with element hashes as keys,
and elements themselves as corresponding values.
The following operations are implemented:

- Add and remove values
- Check if a value already present using the value itself or its hash
- Iterate over stored values
- Iterate over hashes of stored values
- Clear the set (i.e., remove all stored values)

The used hash is calculated as `hash()` method of `StorageValue` trait.
All built-in types implementing `StorageValue` compute this hash as SHA-256
of the binary serialization of a type instance.

### KeySetIndex

[`KeySetIndex`][key-set-index] implements a set. Internally, stored set elements
are inserted to the underlying `BaseIndex` as `(&element, ())`
(i.e., the element is used as key, and the value is always empty). As the keys
are ordered in the underlying storage engine, `KeySetIndex` iterates
over set items in the sorting order.

The following procedures are implemented:

- Add and remove items
- Check if a specific item is in the set
- Iterate over items
- Clear the set (i.e., remove all stored values)

#### KeySetIndex vs ValueSetIndex

While `ValueSetIndex` uses a hash as a key for the underlying `BaseIndex`,
`KeySetIndex` puts an entire binary serialization of an element into the key.

- `KeySetIndex` does not have an additional overhead on hashing each
  incoming set element.
- `KeySetIndex` should not be used when the items are relatively big;
  only small items can be stored (such as integers, small strings, small
  tuples). In contrary, the `ValueSetIndex` more easily handles
  with storing big and complex items.
- The `KeySetIndex` introduces a lexicographical order over stored
  items, while the `ValueSetIndex` order elements arbitrary due to hash
  properties.

### Merklized indexes

Merklized indexes represent a list and map with additional
features. Such indexes may create the proofs of existence or absence for
the stored data items.

When a light client requests data from an Exonum full node, the proof can be
built and sent along with the actual data values. Having block headers
and such proof, the client may check that received data was really
authorized by the validators without having to replicate the entire blockchain
contents.

#### ProofListIndex

[`ProofListIndex`][proof-list-index] implements a [Merkle
tree](../advanced/merkle-index.md), which is a Merklized version of an
array list. It implements the same methods as `ListIndex`, and adds an
additional feature. Basing on Merkle trees, `ProofListIndex` allows creating a
proofs of existence for its values. Tree leafs store the data itself;
inner nodes values are calculated as `hash(concatenate(left_child_value,
right_child_value)`. The following additional procedures are
implemented:

- Get the height of the Merkle tree. As the tree is balanced (though may be not
  full), its height is close to `log2` of the list length
- Get the value of the tree root (i.e., the hash of the entire Merkle tree)
- Build a proof of existence for an item at a specific position
- Build a proof of existence for items at a specific contiguous index range

!!! note
    The `ProofListIndex` is *append-only*; it does not allow deleting specific values.
    The only way to delete an item from the table is clearing the table.

#### ProofMapIndex

[`ProofMapIndex`][proof-map-index] is a Merklized version of a map
based on [Merkle Patricia tree](../advanced/merkle-patricia-index.md).
It implements the same methods as the `MapIndex`, adding the ability to
create proofs of existence for its key-value pairs, or proofs of absence
if a key is absent in the map. The following additional
procedures are supported:

- Get the root node’s value
- Build a proof for the requested key. Tree proves either key
  existence (and its value), or key absence

## Storage

### Low-level storage

Exonum uses third-party database engines to save blockchain data
locally. To use the particular database, a minimal map interface should
be implemented for it:

- Get value by key
- Put new value at the key (insert or update the saved one)
- Delete key-value pair by key

All the tables functionality is reduced to these atomic call types.

To add a new storage, [`Database`][database] interface should be
implemented for it. The implementation example can be found at [LevelDB
wrapper][leveldb-wrapper]. At this moment, key-value storage
[LevelDB][level-db] is used. Also [RocksDB][rocks-db] support is
[planned](../roadmap.md).

All the values from different tables are stored in one big key-value
table at the low-level storage, wherein the keys are represented as
a byte sequence, and values are serialized according to Exonum binary serialization
format. Keys of the `BaseIndex` of a specific table
are mapped to the low-level storage keys
in a deterministic manner using [table identifiers](#table-identifiers).

### Table identifiers

Exonum tables are divided into two groups.

- System tables are used directly by the Core and provide Exonum
  operation.
- Services tables are created, maintained and used by the appropriate service.

Such differentiation corresponds to schemas in the relational databases.
There may be different tables with the same name located in
different schemas. System tables may be considered as tables
for the especial consensus “service”; Exonum Core creates and uses these
tables using the same APIs as services do.

Every table is uniquely identified by the compound prefix, which is used
to map table keys into keys of the underlying low-level storage. The
keys are prepended with this prefix which is unique to each table, thus
allows to distinguish values from different tables.

The table prefix consists of the service ID and an internal identifier inside the
service. All tables created with the same prefix will be the views of the same data.

Services are enumerated with `u16`, starting from `0x00 0x01`.`0x00
0x00` ID is reserved to the Core. Tables inside services are identified
with `u8` integers and an optional suffix.

Thus, key `key` at the table named _BTC_ (`0x42 0x54 0x43` in ASCII) at
the table group `3` for the service with ID `1` matches with the
following key in the LevelDB map:

```none
0x00 0x01 | 0x03 | 0x42 0x54 0x43 | key
```

Here, `|` separates logical components of the low-level key.

It is advised to use a `gen_prefix` function
for creating table prefixes. Example of such prefixes generation can be found
[here][blockchain-schema].

!!! warning
    Table identifiers can also be created manually though it is risky.
    It is strongly advised not to admit
    a situation when one table identifier inside the service is a prefix for
    another table in the same service. Such cases may cause unpredictable
    collisions between logically different keys and elements.

## View layer

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

Forks are used during block creation: validator node applies
transactions, check its correctness, apply other ones, and finally
decides which transactions should be applied to the data and which
should not. If one of the transactions falls with `panic` during
execution, its changes are promptly reverted.

During the block execution, fork allows to create a [patch](#patches)
comprising changes made by all transactions in the block
and then apply the patch atomically.

## List of system tables

The Core owns its own tables that are used for maintaining blockchain
functioning. These tables are initialized [here][blockchain-schema].

There are the following system tables:

- `transactions`, `MapIndex`.  
  Represents a map from transaction hash into raw transaction structure.
- `tx_location_by_hash`, `MapIndex`.  
  Keeps the block height and tx position inside block for every
  transaction hash.
- `blocks`, `MapIndex`.  
  Stores block object for every block height.
- `block_hashes_by_height`, `ListIndex`.  
  Saves a block hash that has the requested height.
- `block_txs`, `ProofListIndex`.  
  Group of tables keyed by the block height. Each table keeps
  a list of transactions for the specific block.
- `precommits`, `ListIndex`.  
  Group of tables keyed by the block hash. Each table stores a list of
  validators’ precommits for the specific block.
- `configs`, `ProofMapIndex`.  
  Stores the configurations content in JSON format, using its hash as a key.
- `configs_actual_from`, `ListIndex`.  
  Builds an index to get a configuration activating at a specific height quickly.

## Indexing

Exonum does not support indices over fields of stored elements
as an individual entity. However, it is
possible to create additional table with indexing semantics. For example,
there is the system table `block_txs` that stores a list of transactions
for every block. `tx_location_by_hash` is an auxiliary table that provides
an index to quickly lookup `block_txs` by a transaction hash.

## Genesis block

At the node start, services should initialize its tables, by creating
the table instances with a specific prefixes. To set up its data tables,
service should handle `genesis_block` [event][genesis-block-creation].

!!! note
    `genesis_block` event is called every time an Exonum node starts.

[level-db]: http://leveldb.org/
[rocks-db]: http://rocksdb.org/
[base-index]: https://github.com/exonum/exonum-core/blob/master/exonum/src/storage/base_index.rs
[map-index]: https://github.com/exonum/exonum-core/blob/master/exonum/src/storage/map_index.rs
[list-index]: https://github.com/exonum/exonum-core/blob/master/exonum/src/storage/list_index.rs
[proof-list-index]: https://github.com/exonum/exonum-core/blob/master/exonum/src/storage/proof_list_index/mod.rs
[list-proof]: https://github.com/exonum/exonum-core/blob/master/exonum/src/storage/proof_list_index/proof.rs
[proof-map-index]: https://github.com/exonum/exonum-core/blob/master/exonum/src/storage/merkle_patricia_table/mod.rs
[value-set-index]: https://github.com/exonum/exonum-core/blob/master/exonum/src/storage/value_set_index.rs
[key-set-index]: https://github.com/exonum/exonum-core/blob/master/exonum/src/storage/key_set_index.rs
[database]: https://github.com/exonum/exonum-core/blob/d9e2fdc3d5a1d4e36078a7fbf1a9198d1b83cd5d/exonum/src/storage/db.rs#L43
[patch]: https://github.com/exonum/exonum-core/blob/d9e2fdc3d5a1d4e36078a7fbf1a9198d1b83cd5d/exonum/src/storage/db.rs#L11
[snapshot]: https://github.com/exonum/exonum-core/blob/d9e2fdc3d5a1d4e36078a7fbf1a9198d1b83cd5d/exonum/src/storage/db.rs#L57
[fork]: https://github.com/exonum/exonum-core/blob/d9e2fdc3d5a1d4e36078a7fbf1a9198d1b83cd5d/exonum/src/storage/db.rs#L104
[leveldb-wrapper]: https://github.com/exonum/exonum-core/blob/master/exonum/src/storage/leveldb.rs
[blockchain-schema]: https://github.com/exonum/exonum-core/blob/master/exonum/src/blockchain/schema.rs
[genesis-block-creation]: services.md#genesis-block-handler
