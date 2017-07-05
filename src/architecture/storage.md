# Exonum Data Model

This page describes how Exonum stores different data, from the lowest
(LevelDB) to the high abstract layers that are used in the client
applications. Storage architecture can be overlooked from different
points.

1. [Exonum table types](#exonum-table-types) lists supported types for
  data storage. These tables represent the highest level at the data
  storage architecture.
2. [Low-level storage](#low-level-storage) shows, how Exonum keeps the
  data on the hard disk. Now LevelDB is used.
3. [View layer](#view-layer) introduces the wrapper over DB engine.
  This layer implements a "sandbox" above the real data and provides block
  is applied atomically: either whole block is applied, or whole block is
  discarded.
4. [Table identifiers convention](#table-identifiers-convention) elaborates how
  user tables are identified, and shows how the Exonum tables are
  matched into LevelDB.
5. [List of system tables](#list-of-system-tables) describes what tables
  are used directly by Exonum Core.
6. [Indexing](#indexing) reveals how indices can be built.
7. [Genesis block](#genesis-block) describes how tables are initialized.

## Exonum table types

Multiple table types may be used in the Exonum applications.

In the table descriptions the following parameters types are used:

- `K`: key type at the map definitions. Exonum uses byte sequences for
  the keys.
- `V`: value type at the map definitions. Map stores the objects of
  particular class defined by user in the table initialization. At the
  bottom level objects are serialized and are stored as byte sequences.
- `u64`: unsigned 64-bit int type.
- `Iter`: an Iterator object.
- `Hash`: `sha-256` hash object
- `ListProof`: a custom class representing nodes from `ProofListIndex`
  proof trees.
- `MapProof`: a custom class representing nodes from  `ProofMapIndex`
  proof trees.

### BaseIndex

[`BaseIndex`][base-index] represents the most basic table type. Other
table types inherit from it directly. In the matter, `BaseIndex`
implements a map interface:

- `get(key: &K): V` receives a value by key. If key is not found, error
  is returned.
- `contains(key: &K): bool` checks if the specific key presents in the
  table.
- `iter(subprefix: &K): Iter<(K,V)>` returns an iterator through the
  key-value pairs, where keys starts with `subprefix`. **TODO: what is
  subprefix for? why is it not enough `self.prefix`?**
- `iter_from(subprefix: &K, from: &K): Iter<(K,V)>` iterates through the
  key-values pairs, starting from `from` key.
- `put(key: &K, value: V)` inserts new value by key. If such key is
  already exists, old value is overwritten with new one.
- `remove(key: &K)` removes appropriate key-value pair. If key is not
  found, error is returned.
- `clear()` deletes all the key-value pairs referring to the
  `self.prefix` table. **TODO: may be `new` proc should be also described
  here, otherwise `self.prefix` is unclear**

!!! warning
    It should not be used directly; the better approach is to use other
    implemented table types, or write your own table type wrapping
    `BaseIndex`.

### MapIndex

[`MapIndex`][map-index] is implementation of Key-Value storage. It wraps
around the `BaseIndex` field.

The following actions are supported:

- `get(key: &K): V` receives a value by key. If key is not found, error
  is returned.
- `contains(key: &K): bool` checks if the specific key presents in the
  table.
- `iter(): Iter<(K,V)>` returns an iterator through the key-value pairs.
- `iter_from(from: &K): Iter<(K,V)>` iterates through the key-values pairs,
  starting from `from` key.
- `put(key: &K, value: V)` inserts new value by key. If such key is
  already exists, old value is overwritten with new one.
- `remove(key: &K)` removes appropriate key-value pair. If key is not
  found, error is returned.
- `clear()` deletes all the records stored in this table.
- `keys(): Iter<K>` returns an iterator through table keys. **TODO: how are
  keys ordered? asc / desc / FIFO / LIFO**
- `keys_from(from: &K): I<K>` iterates through table keys, starting from
  `from` key.
- `values(): Iter<V>` returns an iterator through table values.
- `values_from(from: &K): Iter<V>` iterates through table values,
  starting from `from` key.

### ListIndex

[`ListIndex`][list-index] represesnts an array list. It wraps around the
`BaseIndex` field.

The following actions are supported:

- `get( index: u64): V` returns a value already saved in the list. If
  index is bigger then the list size, error is returned.
- `iter(): Iter<(u64,V)>` returns an iterator through the index-value pairs.
- `iter_from(from: u64): Iter<(u64,V)>` iterates through the index-values
  pairs, starting from `from` position.
- `clear()` deletes all the records stored in this table.
- `last(): V` returns the latest value in the list.
- `is_empty(): bool` returns `true` if the table has no values; else,
  `false`.
- `len(): u64` returns the number of elements stored in the list.
- `push(value: V)` adds new value to the end of the list.
- `pop(): V` returns the value from the end of the list; returned
  element is deleted from table. The length of the list decreases on 1.
- `extend(iter: Iter)` appends values from the iterator to the list
  one-by-one.
- `truncate(len: u64)` deletes all the elements starting from `len`
  position. Only `len` elements are saved.
- `set(index: u64, value: V)` updates a value already saved in the list.

List value does not support inserting in the middle (although it
is still possible to do manually).

`ListIndex` saves its elements to the internal `base` map with element
indices as keys. The list length also is saved at `base` with `&()` key.
**TODO: what does this key mean? an empty (0-length) byte sequence?**

### ValueSetIndex

[`ValueSetIndex`][value-set-index] implements a hashmap, storing the
element using its hash as a key. It wraps around the `BaseIndex` field.
The following procedures are implemented:

- `contains(item: &V): bool` checks if the specific item presents in the
  table.
- `contains_by_hash(hash: &Hash): bool` checks if there is an item with
  specific hash.
- `iter(): Iter<V>` returns an iterator through the stored items.
- `iter_from(from: &Hash): Iter<V>` iterates through the stored items,
  starting from the value with `from` hash.
- `hashes(): Iter<Hash>` returns an iterator through the hashes of stored
  items.
- `hashes_from(from: &Hash): Iter<Hash>` iterates through the hashes of
  stored items, starting from `from` position.
- `insert(item: V)` adds the item to the hashmap.
- `remove(item: &V)` removes the item if exists. Otherwise, the error is
  returned.
- `remove_by_hash(hash: &Hash)` removes the item with specified hash, if
  such one exists. Otherwise, the error is returned.
- `clear()` removes all the items stored in the hashmap.

### KeySetIndex

[`KeySetIndex`][key-set-index] implements a set. Any unique value can be
stored just once. It wraps `BaseIndex`; the stored elements are inserted
to the `BaseIndex` storage as `(key: item, value: null)`. While
`ValueSetIndex` uses a hash as a key (which may coincide for different
objects), the `KeySetIndex` put an entire binary object's serialization
into a key.

The following procedures are implemented:

- `contains(item: &K)` checks if the specified item presents in the set.
- `iter(): Iter<K>` returns an iterator through the stored items.
- `iter_from(from: &K): Iter<K>` iterates through the stored items,
  starting from the `from` value.
- `insert(item: K)` adds the item to the set.
- `remove(item: &K)` removes the item if exists. Otherwise, the error is returned.
- `clear()` removes all the items stored in the set.

### Merklized indexes

The Merklized indexes represent an List and Map with additional
features. Such indexes may create the proofs of existence or absence for
the stored data items.

#### ProofListIndex

[`ProofListIndex`][proof-list-index] implements a Merkle Tree which is
an extended version for array list. It implements the same methods as
`ListIndex`, however adds additional feature. Basing on Merkle Trees,
such table allows creating a proofs of existence for its values. The
table cells are divided into leafs and intermediate nodes. Leafs store
the data itself; inner nodes values are calculated as
`hash(concatenate(left_child_value, right_child_value)`. You may read
more detailed specification at [Merkle
Trees](../advanced/merkle-index.md). The following procedures are
implemented: **TODO: it is strange that ProofList do not implement some
operations from the usual list (pop, truncate). Why?**

- `get( index: u64): V` returns a value already saved in the list. If
  index is bigger then the list size, error is returned.
- `iter(): Iter<(u64,V)>` returns an iterator through the index-value pairs.
- `iter_from(from: u64): Iter<(u64,V)>` iterates through the index-values
  pairs, starting from `from` position.
- `clear()` deletes all the records stored in this table.
- `last(): V` returns the latest value in the list.
- `is_empty(): bool` returns `true` if the table has no values; else,
  `false`.
- `len(): u64` returns the number of elements stored in the list.
- `push(value: V)` adds new value to the end of the list.
- `extend(iter: Iter)` appends values from the iterator to the list
  one-by-one.
- `set(index: u64, value: V)` updates a value already saved in the list.
- `height(): u8` returns the height of the tree. As the tree is balanced
  (though may be not fully filled), the height is near to `log2(list
  length)`
- `root_hash(): Hash` returns the value of root element (that contains
  the hash of root node's children).
- `get_proof(index: u64): ListProof` builds a proof tree for data value
  at `index` position. The tree consists of [`ListProof`][list-proof]
  objects.
- `get_range_proof(from: u64, to: u64): ListProof` builds a proof tree
  for data values at indices since `from` until `to - 1` inclusively. 
  The tree consists of [`ListProof`][list-proof] objects.

When thin client asks Exonum full-node about some data, the proof is
built and sent along with the actual data values. Having block headers
and such proof, thin client may check that received data was really
authorized by the validators.

!!! note
    The `ProofListIndex` do not allow deleting specific values. The only
    way to delete something is a clearing table entirely.

#### ProofMapIndex

[`ProofMapIndex`][proof-map-index] is an extended version for a map
based on Merkle Patricia Tree. It implements the same methods as the
`MapIndex`, adding the ability to create proofs of existence for its
key-value pairs, or proofs of absense if requested key do not exist in
this table. For a more detailed description, see [Merkle Patricia
Trees](../advanced/merkle-patricia-index.md). The following procedures
are supported:

- `get(key: &K): V` receives a value by key. If key is not found, error
  is returned.
- `contains(key: &K): bool` checks if the specific key presents in the
  table.
- `iter(): Iter<(K,V)>` returns an iterator through the key-value pairs.
- `iter_from(from: &K): Iter<(K,V)>` iterates through the key-values pairs,
  starting from `from` key.
- `put(key: &K, value: V)` inserts new value by key. If such key is
  already exists, old value is overwritten with new one.
- `remove(key: &K)` removes appropriate key-value pair. If key is not
  found, error is returned.
- `clear()` deletes all the records stored in this table.
- `keys(): Iter<K>` returns an iterator through table keys.
- `keys_from(from: &K): Iter<K>` iterates through table keys, starting from
  `from` key.
- `values(): Iter<V>` returns an iterator through table values.
- `values_from(from: &K): Iter<V>` iterates through table values,
  starting from `from` key.
- `root_hash(): Hash` returns the root node's value.
- `get_proof(key: K): MapProof` builds a proof tree for the requested
  key. Tree proves either key presence (and its according value), or key
  absence. The proof tree is used in the same way as in the Merkle Table:
  it is sent to the client along with the requested data.

## Low-level storage

Exonum uses third-party database engines to save blockchain data
locally. To use the particular database, a minimal map interface should
be implemented for it. It means that database should support the
following procedures:

- Get value by key;
- Put new value at the key (insert or update already saved one);
- Delete pair by key.

To add a new storage, [Database][database] interface should be
implemented for it. The implementation example can be found at [LevelDB
wrapper][leveldb-wrapper].

Actually, all the values from different tables are stored in one big
key-value table at the low-level storage. Thus, the high-level tables
really just implements a handy API for accessing to the values with
specific sense. All the tables functionality is reduced to these atomic
call types.

At this moment, key-value storage [LevelDB][level-db] v1.20 is used.
Also [RocksDB][rocks-db] support is [planned](../roadmap.md).

## View layer

Exonum introduces additional layer over database to handle with
unapplied changes. That layer consist of multiple classes.

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
additional changes. Every fork is basen on the storage snapshot. From 
the outer point of view, the changes are already applied to the data 
storage; however, these changes are stored directly in the fork and may 
be easily rolled back. Moreover, there may be different forks of 
database state. 

Forks are used during block creation: validator node apply some
transactions, check its correctness, apply other ones, and finally
decides which transactions should be applied to the data and which
should not. If one of the transactions falls with error during
validation, its changes are promptly reverted.

During the block execution, fork allows to create the [list of 
changes](#patches) and, if all changes are accurate, apply it to the 
data storage atomically.

## Table identifiers convention

Exonum tables are divided into two groups.

- System tables are used directly by the Core and provide Exonum
  operation.
- Services tables are created, maintained and used by the appropriate service.

Such differentiation corresponds to schemas in the relational database
world. There may be different tables with the same name, located in the
different schemas. Actually, system tables may be considered as tables
for the especial Consensus "service". The Core creates and use its
tables in the same way as usual services do.

As it was said, at the LevelDB scale, all values from all Exonum tables
are saved into one big LevelDB map, wherein the keys are represented as
bytes sequence, and values are serialized objects, in fact, byte
sequences too.

Every table is uniquely identified by the complex prefix. Such prefix is 
added to the every key of the specific table, thus allows to distinguish 
values from different tables. 

The prefix consist of service ID and internal identifier inside the 
service. As well as tables represent just a handy API for access to data 
(no data items are really stored at the table class instance; all values 
are saved in leveldb storage), all tables created with the same prefix 
will share the data. 

Services are enumerated with `u16`, starting from `0x00 0x01`.`0x00
0x00` ID is reserved to the Core. Tables inside services are named
with a integers and an optional suffixes.

Thus, key `key` at the table `3` with suffix _BTC_ (`0x42 0x54 0x43` in
ASCII) for the `0x00 0x01` service matches with the following key in the
LevelDB map:

`0x00 0x01 | 0x03 } 0x42 0x54 0x43 | key`

Here, `|` stands for bytes sequences concatenation.

It is advised to use a `gen_prefix(service_id, table_id, table_suffix)`
for creating table prefixes. Example of such prefixes generation can be found
[here][blockchain-schema].

!!! warning ""
    Table identifiers can also be created manually. If you refuse from
    using `gen_prefix`, it is strongly advised not to admit situation when
    one table identifier inside the service is a prefix for the other table
    in the same service. Such cases may cause the ineligible coincidences
    between the different keys and elements.


## List of system tables

The Core owns its own tables that are used for providing the service.
These tables are created [here][blockchain-schema]

There are the following system tables:

- `transactions`, `MapIndex`.
  Represents a map from transaction hash into raw transaction structure
- `tx_location_by_hash`, `MapIndex`.
  Keeps the block height and tx position inside block for every 
  transaction hash.
- `blocks`, `MapIndex`.
  Stores block object for every block height.
- `block_hashes_by_height`, `ListIndex`.
  Saves a block hash that has the requested height.
- `block_txs`, `ProofListIndex`.
  The set of tables with different `block_height`. Every table keeps
  a list of transactions for the specific block.
- `precommits`, `ListIndex`. 
  The set of tables with different `block_hash`. Stores the list of
  validators' precommits for the specific block.
- `configs`, `ProofMapIndex`.
  Stores the actual configuration in the JSON format for block heights.
- `configs_actual_from`, `ListIndex`.
  Builds an index to get config starting height quickly.
- `state_hash_aggregator`, `ProofMapIndex`.
  The table is used to calculate the final state hash based on the 
  aggregate hashes of other tables.

## Indexing

Exonum does not support indices as the individual entity. However, you
can always create additional table with an index meaning. For example,
there are system table `block_txs` that stores a list of transactions
for every block. In relational databases, we may want to create a
backward index over tx, to quickly get a block height at which
transaction was approved. In the Exonum, we create a
`tx_location_by_hash` map table that provides with this operation.

## Genesis block

At the node start, services should initialize its tables. It should be
done during Genesis block creation. To set up its data tables, service
should handle `genesis_block` [event][genesis-block-creation].

!!! note Notice
    Genesis Block creation procedure is called every time Exonum
    node starts.

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
