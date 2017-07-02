# Exonum Data Model

This page reveals how Exonum stores different data, from the lowest
(LevelDB) to the high abstract layers that are used in the client
applications. Storage architecture can be overlooked from different
points.

1. [Exonum table types](#exonum-table-types) lists supported types for
  data storage. These tables represent the highest level at the data
  storage architecture.
2. [Low-level storage](#low-level-storage) shows, how Exonum keeps the
  data on the hard disk. Now LevelDB is used.
3. [DBView layer](#dbview-layer) introduces the wrapper over DB engine.
  This layer implements a "sandbox" above the real data and provides block
  is applied atomically: either whole block is applied, or whole block is
  discarded.
4. [Table naming convention](#table-naming-convention) elaborates how
  user tables should be called, and shows how the Exonum tables are
  matched into LevelDB.
5. [List of system tables](#list-of-system-tables) describes what tables
  are used directly by Exonum Core.
6. [Indices](#indices) reveals how indices can be built.
7. [Genesis block](#genesis-block) describes how tables are initialized.

## Exonum table types

Multiple table types may be used in the Exonum applications.

!!! note "Used parameter types"
    In the table descriptions the following parameters types are used:

    - `K`: key type at the map definitions. Exonum uses byte sequences for
      the keys.
    - `V`: value type at the map definitions. Map stores the objects of
      particular class defined by user in the table initialization. At the
      bottom level objects are serialized and are stored as byte sequences.
    - `u64`: unsigned 64-bit int type.
    - `I`: an Iterator object.
    - `Hash`: `sha-256` hash object
    - `Proofnode`: a custom class representing nodes from `ProofListIndex`
      proof trees.
    - `RootProofNode`: a custom class representing nodes from
      `ProofMapIndex` proof trees.

### BaseIndex

[`BaseIndex`][base-index] represents the most basic table type. Other table types inherit from it directly.
In the matter, `BaseIndex` implements a map interface:

- `get(key: &K): V` receives a value by key. If Key is not found, error
  is returned.
- `contains(key: &K): bool`
- `iter(subprefix: &K): I`
- `iter_from(subprefix: &K, from: &K): I` **TODO: what is a subpefix?**
- `put(key: &K, value: V)` inserts new value by key. If such key is
  already exists, old value is overwritten with new one.
- `remove(key: &K)` removes appropriate key-value pair. If Key is not
- `clear()`

!!! warning
    It should not be used directly; the better approach is to use other implemented table types, or write your own table type wrapping `BaseIndex`.

### MapIndex

[`MapIndex`][map-index] is implementation of Key-Value storage. It wraps around the `BaseIndex` field.

The following actions are supported:

- `get(key: &K): V` receives a value by key. If Key is not found, error
  is returned.
- `contains(key: &K): bool`
- `iter(): I`
- `iter_from(from: &K): I` **TODO: what is a subpefix?**
- `put(key: &K, value: V)` inserts new value by key. If such key is
  already exists, old value is overwritten with new one.
- `remove(key: &K)` removes appropriate key-value pair. If Key is not
- `clear()`
- `keys(): I`
- `keys_from(from: &K): I`
- `values(): I`
- `values_from(from: &K): I`

### ListIndex

[`ListIndex`][list-index] represesnts an array list. It wraps around the `BaseIndex` field. 

The following actions are supported:

- `get( index: u64): V` returns a value already saved in the list. If
  index is bigger then the list size, error is returned.
- `last(): V` returns the latest value in the list.
- `is_empty(): bool` returns True if nothing was written; else, False.
- `len(): u64` returns the number of elements stored in the list.
- `iter(): I`
- `iter_from(from: u64): I`
- `set_len(len: u64)`
- `push(value: V)` adds new value to the end of the list.
- `pop(): V`
- `extend(iter: I)` appends values from the iterator to the list
  one-by-one.
- `truncate(len: u64)`
- `set(index: u64, value: V)` updates a value already saved in the list.
- `clear()`

List value does not support inserting in the middle (although it
is still possible).

`ListIndex` saves its elements to the internal `base` map with element indices as
keys.

### ProofListIndex

[`ProofListIndex`][proof-list-index] implements a Merkle Tree which is an extended version for array list. 
It implements the same methods as `ListIndex`, however adds additional feature. Basing on Merkle Trees, such
table allows creating a proofs of existence for its values. The table
cells are divided into leafs and intermediate nodes. Leafs store the
data itself; inner nodes values are calculated as
`hash(concatenate(left_child_value, right_child_value)`. You may read
more detailed specification at [Merkle Trees](../advanced/merkle-index).
The following procedures are implemented:

- `root_hash(): Hash` returns the value of root element (that contains the hash
  of root node's children).
- `construct_path_for_range(range_start: u64, range_end: u64): Proofnode`
  builds a proof tree for data values at indices
  `[range_start..range_end - 1]`. The tree consists of
  [`Proofnode`](https://github.com/exonum/exonum-core/blob/master/exonum/src/storage/merkle_table/proofnode.rs)
  objects.

When thin client asks Exonum full-node about some data, the proof is
built and sent along with the actual data values. Having block headers
and such proof, thin client may check that received data was really
authorized by the validators.

### MerklePatriciaTable

[`MerklePatriciaTable`](https://github.com/exonum/exonum-core/blob/master/exonum/src/storage/merkle_patricia_table/mod.rs)
is an extended version for a map. It implements the `Map` interface,
adding the ability to create proofs of existence for its key-value
pairs, or proofs of absense if requested key do not exist in this table.
For a more detailed description, see [Merkle Patricia
Trees](../advanced/merkle-patricia-index). The following procedures are
supported:

- `root_hash(): Hash` returns the root node's value.
- `construct_path_to_key(searched_key: K): RootProofNode` builds a proof
  tree for the requested key. Tree proves either key presence (and its
  according value), or key absence. The proof tree is used in the same way
  as in the Merkle Table: it is sent to the client along with the
  requested data.

## Low-level storage

Exonum uses third-party database engines to save blockchain data
locally. To use the particular database, [`Map`](https://github.com/exonum/exonum-core/blob/master/exonum/src/storage/mod.rs#L55)
interface should be implemented for it. It means that database should support
the following procedures:

- Get value by key;
- Put new value at the key (insert or update already saved one);
- Delete pair by key;
- Find the nearest key to the requested one.

At this moment, key-value storage [LevelDB][level-db] v1.20 is used.
Also we plan to add [RocksDB][rocks-db] support in the
[future](../dev/roadmap).

## DBView layer

Exonum introduces additional layer over database to handle with
unapplied changes. [`View`](https://github.com/exonum/exonum-core/blob/master/exonum/src/storage/leveldb.rs#L30)
implements the same interfaces as the database underneath, transparently
wrapping the real data storage state, and add some additional changes.
From the outer point of view, the changes are already applied to the data
storage; however, these changes may be easily rolled back. Moreover, there
may be different forks of database state.

This technology is used during block creation: validator node apply some
transactions, check its correctness, apply other ones, and finally
decides which transactions should be applied to the data and which
should not. If one of the transactions falls with error during
validation, its changes are promptly reverted.

During the block execution, View layer allows to create the list of
changes and, if all changes are accurate, apply it to the data storage
atomically.

## Table naming convention

Exonum tables are divided into two groups.

- System tables are used directly by the Core and provide Exonum
  operation.
- Services tables belong to the appropriate service.

Such differentiation corresponds to schemas in the relational database
world. There may be different tables with the same name, located in the
different schemas.

At the LevelDB scale, all values from all Exonum tables are saved into
one big LevelDB map, wherein the keys are represented as bytes sequence,
and values are serialized objects, in fact, byte sequences too.

To distinguish values from different tables, additional prefix is used
for every key. Such prefix consist of service name and table name.

Services are named with a byte arrays, starting from `0x01`. Name length
is not limited. `0x00 0x00` name is reserved to the Core. Tables inside
services are named with a byte sequences.

Thus, key `key` at the table `0x00` for the `0x00 0x01` service matches
with the following key in the LevelDB map:

`0x00 0x01 | 0x00 | key`

Here, `|` stands for bytes sequences concatenation.

!!! warning ""
    It is strongly advised not to admit situation when one table name inside
    the service is a prefix for the other table in the same service. Such
    cases may cause the ineligible coincidences between the different keys
    and elements.

## List of system tables

The Core owns its own tables that are used for providing the service.
These tables are created here: [src](https://github.com/exonum/exonum-core/blob/master/exonum/src/blockchain/schema.rs#L47)

There are the following system tables:

- `transactions`, `MapTable`. It represents a map from transaction hash
  into raw transaction structure
- `tx_location_by_hash`, `MapTable`. It keeps the block height and tx
  position inside block for every transaction hash.
- `blocks`, `MapTable`. It stores block object for every block height.
- `block_hashes_by_height`, `ListTable`. It saves a list of block hashes
  that had the requested height.
- `block_txs`, `MerkleTable`. It keeps a list of transactions for the
  each block.
- `precommits`, `ListTable`. The list of validators' precommits is
  stored here.
- `configs`, `MerklePatriciaTable`. It stores the actual configuration
  in the JSON format for block heights.
- `configs_actual_from`, `ListTable`. It builds an index to get config
  starting height quickly.
- `state_hash_aggregator`, `MerklePatriciaTable`. It is the accessory
  table for calculating patches in the DBView layer.

## Indices

Exonum does not support indices as the individual entity. However, you
can always create additional table with an index meaning. For example,
there are system table `block_txs` that stores a list of transactions
for every block. In relational databases, we may want to create a
backward index over tx, to quickly get a block height at which
transaction was approved. In the Exonum, we just create a
`tx_location_by_hash` map table that provides with this operation.

## Genesis block

At the very start of the blockchain, services should initialize its
tables. It should be done during Genesis block creation. To set up its
data tables, service should handle `genesis_block` event:
[src](https://github.com/exonum/exonum-core/blob/master/exonum/src/blockchain/mod.rs#L92).
!!! note Notice
    Genesis Block creation procedure is called every time Exonum
    node starts.

You may find implementation examples in the our tutorial:
[cryptocurrency-service-genesis-block]() **TODO: fill the link**

[level-db]: http://leveldb.org/
[rocks-db]: http://rocksdb.org/
[base-index]: https://github.com/exonum/exonum-core/blob/master/exonum/src/storage/base_index.rs
[map-index]: https://github.com/exonum/exonum-core/blob/master/exonum/src/storage/map_index.rs
[list-index]: https://github.com/exonum/exonum-core/blob/master/exonum/src/storage/list_table.rs
[proof-list-index]: https://github.com/exonum/exonum-core/blob/master/exonum/src/storage/merkle_table/mod.rs
