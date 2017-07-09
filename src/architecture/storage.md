# Exonum Data Model

This page describes how Exonum persists data, from the lowest
(LevelDB) to the high abstract layers that are used in the client
applications.

Storage architecture can be overlooked from different points.

1. [Exonum table types](#exonum-table-types) lists supported types for
  data storage. These tables represent the highest level at the data
  storage architecture.
2. [Storage](#storage) explains how tables content is stored.
    2.1. [Low-level storage](#low-level-storage) shows, how Exonum keeps the
      data on the hard disk. Now LevelDB is used.
	2.2. [Table identifiers](#table-identifiers) elaborates how
      user tables are identified, and shows how the Exonum tables are
      matched into LevelDB.
3. [View layer](#view-layer) introduces the wrapper over DB engine.
  This layer implements a "sandbox" above the real data and provides block
  is applied atomically: either whole block is applied, or whole block is
  discarded.
4. [List of system tables](#list-of-system-tables) describes what tables
  are used directly by Exonum Core.
5. [Indexing](#indexing) reveals how indices can be built.
6. [Genesis block](#genesis-block) describes how tables are initialized.

## Exonum table types

Tables (aka `Indexes`) perform the same role as in usual RDBMS: every
table stores the records of fixed type. However, unlike RDBMS tables,
all Exonum tables actually are implemented as Key-Value storages. Both
keys and values are stored as byte sequences, and Exonum do not split
the stored item on a fields.

Multiple table types may be used in the Exonum applications.

### Keys sorting

The tables implement iterators over keys and/or stored items. Such
iterators uses a ordering by key to define next returned element. The
way keys are sorted depends on the selected low-level database engine;
Exonum uses a [LevelDB](#low-level-storage) where the keys are ordered
lexicographically over binary sequences.

### BaseIndex

[`BaseIndex`][base-index] represents the most basic table type. Other
table types inherit from it directly. In the matter, `BaseIndex`
[implements][base-procedures] a map interface:

- get, set and remove value by key
- check if the specific key presents
- iterate over the key-value pairs
- clear the table (removing all stored values)

!!! warning
    It should not be used directly; the better approach is to use other
    implemented table types, or write your own table type wrapping
    `BaseIndex`.

### MapIndex

[`MapIndex`][map-index] is implementation of Key-Value storage. It wraps
around the `BaseIndex` field.

It creates a usable Map, which [extends][map-procedures] the Base functionality:

- get, set and remove value by key
- check if the specific key presents
- iterate over the key-value pairs
- iterate only over keys
- iterate only over values
- clear the table (removing all stored values)

### ListIndex

[`ListIndex`][list-index] represents an array list. It wraps around the
`BaseIndex` field.

The following actions are [supported][list-procedures]:

- get and set an item by index. No removing by index allowed
- append list, pop the last item (with or without removal)
- get the list length, check if the list is empty
- iterate over key-value pairs
- insert the sequence of values from other iterator
- truncate the list to the specific length
- clear the table (removing all stored values)

`ListIndex` does not support inserting elements in the middle of the
list (although it is still possible to do so manually).

`ListIndex` saves its elements to the internal `base` map with element
indices as keys. The list length also is saved at `base` with a
zero-length tuple `&()` as a key.

### ValueSetIndex

[`ValueSetIndex`][value-set-index] implements a hashmap, storing the
element using its hash as a key. It wraps around the `BaseIndex` field.
The following procedures are [implemented][valueset-procedures]:

- add and remove values
- check if value already presents - using value itself, or just its hash
- iterate over stored values
- iterate over hashes of stored values
- clear the table (removing all stored values)

The used hash is calculated as `hash()` method of `StorageValue` trait.
It is supposed to return cryptographic hash, specifically, SHA-256 hash.
Also, generally, it is reasonable to calculate the hash of the binary
serialization for specific hashing object.

### KeySetIndex

[`KeySetIndex`][key-set-index] implements a set. Any unique value can be
stored just once. It wraps `BaseIndex`; the stored elements are inserted
to the `BaseIndex` storage as `(key: item, value: null)`. As the keys
are ordered in the underlying storage engine, `KeySetIndex` iterates
over set items in the sorting order.

The following procedures are [implemented][keyset-procedures]:

- add and remove items
- check if the specific item presents in the table
- iterate over items
- clear the table (removing all stored values)

#### KeySetIndex vs ValueSetIndex

While `ValueSetIndex` uses a hash as a key, the `KeySetIndex` put an
entire binary object's serialization into a key.

- The `KeySetIndex` does not have an additional overhead on hashing each
  incoming object.
- The `KeySetIndex` may not be used when the items are relatively big,
  only small objects can be stored (such as integers, small strings, small
  tuples). In contrary, the `ValueSetIndex` more easily handles
  with storing big and complex objects.
- The `KeySetIndex` introduces a lexicographical order over stored
  items, while the `ValueSetIndex` order elements arbitrary due to hash
  properties.

### Merklized indexes

The Merklized indexes represent a list and map with additional
features. Such indexes may create the proofs of existence or absence for
the stored data items.

#### ProofListIndex

[`ProofListIndex`][proof-list-index] implements a [Merkle
Tree](../advanced/merkle-index.md) which is an extended version for
array list. It implements the same methods as `ListIndex`, however adds
additional feature. Basing on Merkle Trees, such table allows creating a
proofs of existence for its values. The table cells are divided into
leafs and intermediate nodes. Leafs store the data itself; inner nodes
values are calculated as `hash(concatenate(left_child_value,
right_child_value)`. The following additional procedures are
[implemented][prooflist-procedures]:

- get the height of the tree. As the tree is balanced (though may be not
  fully filled), the height is near to `log2` of the list length.
- get the value of the tree root (i.e., the hash of the entire Merkle Tree)
- build a proof tree for data value at `index` position, consisting of
  [`ListProof`][list-proof] objects
- build a proof tree for data values at specific index range, consisting
of [`ListProof`][list-proof] objects

When thin client asks Exonum full-node about some data, the proof is
built and sent along with the actual data values. Having block headers
and such proof, thin client may check that received data was really
authorized by the validators.

!!! note
    The `ProofListIndex` do not allow deleting specific values. The only
    way to delete something is a clearing table entirely.

#### ProofMapIndex

[`ProofMapIndex`][proof-map-index] is an extended version for a map
based on [Merkle Patricia Tree](../advanced/merkle-patricia-index.md).
It implements the same methods as the `MapIndex`, adding the ability to
create proofs of existence for its key-value pairs, or proofs of absence
if requested key do not exist in this table. The following additional
procedures are [supported][proofmap-procedures]:

- get the root node's value
- build a proof tree for the requested key. Tree proves either key
  presence (and its according value), or key absence. The proof tree is
  used in the same way as in the `ProofListIndex`: it is sent to the client
  along with the requested data

## Storage

### Low-level storage

Exonum uses third-party database engines to save blockchain data
locally. To use the particular database, a minimal map interface should
be implemented for it. It means that database should support the
following procedures:

- Get value by key;
- Put new value at the key (insert or update already saved one);
- Delete key-value pair by key.

All the tables functionality is reduced to these atomic call types.

To add a new storage, [Database][database] interface should be
implemented for it. The implementation example can be found at [LevelDB
wrapper][leveldb-wrapper]. At this moment, key-value storage
[LevelDB][level-db] is used. Also [RocksDB][rocks-db] support is
[planned](../roadmap.md).

All the values from different tables are stored in one big key-value
table at the low-level storage, wherein the keys are represented as
bytes sequence, and values are serialized objects, in fact, byte
sequences too. The keys are transformed in a predetermined way using
[table identifiers](#table-identifiers).

### Table identifiers

Exonum tables are divided into two groups.

- System tables are used directly by the Core and provide Exonum
  operation.
- Services tables are created, maintained and used by the appropriate service.

Such differentiation corresponds to schemas in the relational database
world. There may be different tables with the same name, located in the
different schemas. Actually, system tables may be considered as tables
for the especial Consensus "service". The Core creates and use its
tables in the same way as usual services do.

Every table is uniquely identified by the complex prefix used when
mapping table keys into keys of the underlying low-level storage. The
keys are prepended with this prefix which is unique to each table, thus
allows to distinguish values from different tables.

The prefix consist of service ID and internal identifier inside the
service. As well as tables represent just a handy API for access to data
(no data items are really stored at the table class instance; all values
are saved in leveldb storage), all tables created with the same prefix
will be the views of the same data.

Services are enumerated with `u16`, starting from `0x00 0x01`.`0x00
0x00` ID is reserved to the Core. Tables inside services are identified
with a `u8` integers and an optional suffixes.

Thus, key `key` at the table `3` with suffix _BTC_ (`0x42 0x54 0x43` in
ASCII) for the service with ID `1` matches with the following key in the
LevelDB map:

`0x00 0x01 | 0x03 | 0x42 0x54 0x43 | key`

Here, `|` separates logical components of the low-level key.

It is advised to use a `gen_prefix(service_id, table_id, table_suffix)`
for creating table prefixes. Example of such prefixes generation can be found
[here][blockchain-schema].

!!! warning ""
    Table identifiers can also be created manually though it is risky. If
    you refuse from using `gen_prefix`, it is strongly advised not to admit
    situation when one table identifier inside the service is a prefix for
    the other table in the same service. Such cases may cause the ineligible
    coincidences between the different keys and elements.


## View layer

Exonum introduces additional layer over database to handle transaction
and block atomicity.

### Patches

The [patch][patch] is a set of serial changes that should be applied to
the low-level storage atomically. Such patch may include two types of
operations: put a value by key, or delete a value by key.

### Snapshots

The [snapshot][snapshot] fixes the storage state on the moment of
creation and provides a read-only API to it. Even if the storage state
is updated, the snapshot still refers to the old table content.

### Forks

[Forks][fork] implement the same interfaces as the database underneath,
transparently wrapping the real data storage state, and add some
additional changes. Every fork is based on the storage snapshot. From
the outer point of view, the changes are eagerly applied to the data
storage; however, these changes are stored directly in the fork and may
be easily rolled back. Moreover, there may be different forks of
the same database snapshot.

Forks are used during block creation: validator node apply some
transactions, check its correctness, apply other ones, and finally
decides which transactions should be applied to the data and which
should not. If one of the transactions falls with `panic` during
execution, its changes are promptly reverted.

During the block execution, fork allows to create the [list of
changes](#patches) and apply all changes to the
data storage atomically.

## List of system tables

The Core owns its own tables that are used for maintaining blockchain
functioning. These tables are created [here][blockchain-schema].

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
  The set of tables for every `block_height`. Keeps
  a list of transactions for the specific block.
- `precommits`, `ListIndex`. 
  The set of tables for every `block_hash`. Stores the list of
  validators' precommits for the specific block.
- `configs`, `ProofMapIndex`. 
  Stores the configurations content in `JSON` format, using its hash as a key.
- `configs_actual_from`, `ListIndex`. 
  Builds an index to get config starting height quickly.
- `state_hash_aggregator`, `ProofMapIndex`. 
  Calculates the final state hash based on the
  aggregate hashes of other tables.

## Indexing

Exonum does not support indices as the individual entity. However, you
can always create additional table with an index meaning. For example,
there is the system table `block_txs` that stores a list of transactions
for every block. In the Exonum, we create a
`tx_location_by_hash` map table that provides with the necessary index.

## Genesis block

At the node start, services should initialize its tables, by creating
the table instances with a specific prefixes. It should be done during
`Genesis block creation` procedure. To set up its data tables, service
should handle `genesis_block` [event][genesis-block-creation].

!!! note Notice
    Genesis Block creation procedure is called every time Exonum
    node starts.

[level-db]: http://leveldb.org/
[rocks-db]: http://rocksdb.org/
[base-index]: https://github.com/exonum/exonum-core/blob/master/exonum/src/storage/base_index.rs
[base-procedures]:
[map-index]: https://github.com/exonum/exonum-core/blob/master/exonum/src/storage/map_index.rs
[map-procedures]:
[list-index]: https://github.com/exonum/exonum-core/blob/master/exonum/src/storage/list_index.rs
[list-procedures]:
[proof-list-index]: https://github.com/exonum/exonum-core/blob/master/exonum/src/storage/proof_list_index/mod.rs
[prooflist-procedures]:
[list-proof]: https://github.com/exonum/exonum-core/blob/master/exonum/src/storage/proof_list_index/proof.rs
[proof-map-index]: https://github.com/exonum/exonum-core/blob/master/exonum/src/storage/merkle_patricia_table/mod.rs
[proofmap-procedures]:
[value-set-index]: https://github.com/exonum/exonum-core/blob/master/exonum/src/storage/value_set_index.rs
[valueset-procedures]:
[key-set-index]: https://github.com/exonum/exonum-core/blob/master/exonum/src/storage/key_set_index.rs
[keyset-procedures]:
[database]: https://github.com/exonum/exonum-core/blob/d9e2fdc3d5a1d4e36078a7fbf1a9198d1b83cd5d/exonum/src/storage/db.rs#L43
[patch]: https://github.com/exonum/exonum-core/blob/d9e2fdc3d5a1d4e36078a7fbf1a9198d1b83cd5d/exonum/src/storage/db.rs#L11
[snapshot]: https://github.com/exonum/exonum-core/blob/d9e2fdc3d5a1d4e36078a7fbf1a9198d1b83cd5d/exonum/src/storage/db.rs#L57
[fork]: https://github.com/exonum/exonum-core/blob/d9e2fdc3d5a1d4e36078a7fbf1a9198d1b83cd5d/exonum/src/storage/db.rs#L104
[leveldb-wrapper]: https://github.com/exonum/exonum-core/blob/master/exonum/src/storage/leveldb.rs
[blockchain-schema]: https://github.com/exonum/exonum-core/blob/master/exonum/src/blockchain/schema.rs
[genesis-block-creation]: services.md#genesis-block-handler
