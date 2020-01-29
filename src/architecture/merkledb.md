# Exonum MerkleDB

**Exonum MerkleDB** is a persistent storage implementation based on
[RocksDB][rocks-db]. MerkleDB provides APIs to work with merkelized data
structures.

MerkleDB is an object database. Objects represent
the highest abstraction level for the [data storage](merkledb.md).
All objects fall into the following groups:

- **Blobs** which represent sequences of bytes
- **Indexes** have a unique identifier consisting of a UTF-8 string
  and an optional byte *prefix*. Indexes store blobs within them.

The rest of the article describes the following:

1. [Index types](#index-types) lists the types of data
   stores supported by MerkleDB.
2. [Low-level storage](#low-level-storage) explains how objects are persisted
   using RocksDB.
3. [View layer](#view-layer) describes the wrapper over the DB engine
   that ensures atomicity of database changes.
4. [Indexing](#indexing) explains how indices over structured data can be
   built in MerkleDB.
5. [State aggregation](#state-aggregation) describes how entire database state
   is represented by an automatically updated single hash digest.
6. [Migrations](#migrations) explains tooling for atomic, fault-tolerant
   migrations within the database.

## Index Types

Indexes perform the same role as tables in relational database
management systems (RDBMSs). All MerkleDB indexes internally are
implemented as wrappers around key-value stores.

Indexes in MerkleDB fall into several types:

- **list** of items
- **map**, where key-value pairs are stored
- **set** of unique items
- **entry**, which represents an optional single item.

Both keys and values in the wrapped stores are persisted as byte sequences.
MerkleDB does not natively support operations (matching, grouping, sorting,
etc.) over separate value fields, as it is the case with other key-value
storages.

### MapIndex

`MapIndex` implements a key-value store aka a map. It has
the following functionality:

- Get, set and remove value by key
- Check if a specific key is present in the map
- Iterate over the key-value pairs in the lexicographic key order
- Iterate over keys or values in the lexicographic key order
- Clear the map (i.e., remove all stored key-value pairs)
- Get the total number of items in the index.

### ListIndex

`ListIndex` represents an array list. The following operations are supported:

- Get and set a list item by an index
- Append an item to the list
- Pop or poll the last item from the list
- Get the list length
- Check if the list is empty
- Iterate over index-item pairs ordered by indices
- Extend the list by adding a sequence of items from an iterator to the end of
  the list
- Truncate the list to the specified length
- Clear the list (i.e., remove all stored items from the list)
- Get the total number of items in the list.

`ListIndex` does not support inserting items in the middle of the
list or removing items by the index
(although it is still possible to implement these operations manually).

!!! summary "Implementation Details"
    To support proper iteration, 8-byte unsigned indices precede `ListIndex`
    items. Indices are implicitly defined by the items order. Indices are
    serialized in the big-endian form.

### SparseListIndex

`SparseListIndex` represents a `ListIndex` that may
contain "gaps". It provides the possibility to delete items not only from
the end of the list, but from any part thereof. Such deletions do not break
the order of the indices inside the list.

The remaining functionality of the `SparseListIndex` is the same as for
[`ListIndex`](#ListIndex). As in `ListIndex`, extension of the list is
possible only by adding a sequence of items from an iterator to the end of the
list.

### ValueSetIndex

`ValueSetIndex` represents a hash set. The following operations are implemented:

- Add and remove set items
- Check if an item is already present using the item itself or its hash
- Iterate over stored items in the lexicographic order of their hashes
- Iterate over hashes of items in the lexicographic order
- Clear the set (i.e., remove all items)
- Get the total number of items in the index.

Hashes used in `ValueSetIndex` are calculated with the `object_hash()` method
of the `ObjectHash` trait.

!!! summary "Implementation Details"
    Internally, `ValueSetIndex` uses hashes of items as keys,
    and items themselves as corresponding values.

### KeySetIndex

`KeySetIndex` represents a set. The following procedures are implemented:

- Add and remove set items
- Check if a specific item is in the set
- Iterate over items in the lexicographic order of their binary representation
- Clear the set (i.e., remove all stored items)
- Get the total number of items in the index.

!!! summary "Implementation Details"
    Internally, the item is used as a key, and its value is always empty.

#### KeySetIndex vs ValueSetIndex

While `ValueSetIndex` uses a hash as a key, `KeySetIndex` puts an entire binary
serialization of an item into the key.

- `KeySetIndex` does not have an additional overhead on hashing
  set items.
- `KeySetIndex` should not be used when set items are relatively big;
  only small items should be stored in it (such as integers, small strings,
  small tuples). On the other hand, `ValueSetIndex` handles storing big and
  complex items more easily.
- `KeySetIndex` introduces a lexicographical order over stored
  items. In `ValueSetIndex` items are ordered according to their hash
  function properties.

### Entry

`Entry` represents an optional single item (i.e., `Option<T>` in Rust terms).

The following operations are implemented:

- Get, set and remove the value
- Check if the value is present.

### Merkelized Indexes

Merkelized indexes represent a list and a map with additional
features. Such indexes can create proofs of existence or absence for
stored data items.

When a [light client](clients.md) requests data from a full node,
the proof can be built and sent along with the actual data. Having block
headers and this proof, the client may check that the received data was really
authorized by the validators without having to replicate the entire blockchain
contents.

#### ProofListIndex

!!! tip
    See [*Merkelized List*](../advanced/merkelized-list.md) for more technical
    details on `ProofListIndex` and related proofs.

`ProofListIndex` implements a Merkle tree, which is a merkelized version of an
array list. It implements the same methods as `ListIndex` except for
truncation of the list. `ProofListIndex` adds an
additional feature: based on Merkle trees, `ProofListIndex` allows efficiently
creating compact proofs of existence for the list items.
The following additional procedures are implemented:

- Get the height of the Merkle tree. As the tree is balanced (though may be not
  full), its height is close to `log2` of the list length
- Get the value of the tree root (i.e., the hash of the entire Merkle tree)
- Build a proof of existence/absence for an item at a specific position
- Build a proof of existence/absence for items at a specific contiguous list
  range.

!!! summary "Implementation Details"
    As with `ListIndex`, list items are stored with 8-byte keys. However,
    `ProofListIndex` also persists all intermediate nodes of the Merkle tree
    built on top of the list, in order to quickly build proofs and recalculate
    the Merkle tree after operations on the list.

#### ProofMapIndex

!!! tip
    See [*Merkelized Map*](../advanced/merkelized-map.md) for more technical
    details on `ProofMapIndex` and related proofs.

`ProofMapIndex` is a merkelized version of a map based on a binary
Merkle Patricia tree.
It implements the same methods as `MapIndex`. It is also able to
create proofs of existence for its key-value pairs, or proofs of absence
if a key is absent in the map. The following additional
procedures are supported:

- Get the value of the root node
- Build a proof for the requested key. The tree proves either key
  existence (and its value), or key absence.

#### ProofEntry

`ProofEntry` is a merkelized version of [`Entry`](#entry).
It has the same functionality as its ordinary counterpart.

## Low-level Storage

MerkleDB uses a third-party database engine to persist blockchain state
locally. Currently the main database engine is [RocksDB][rocks-db]. It is also
possible to plug in other engines.

To use a particular database, a minimal `Database`
interface should be implemented for it:

- Get a value by a [column family][col-family] name and a key
- Put a new value at the specified column family / key (insert or update
  the saved one)
- Delete a key-value pair by a column family name / key.

All the index functionality is reduced to these atomic call types.
Values of items of different indexes may be stored in a single column family in
the low-level storage. Their keys are mapped to the low-level storage keys in a
deterministic manner using [index addresses](#index-addresses).

### Index Addresses

On user level every index is uniquely identified by its full *address*. An index
address consists of 2 parts:

- **String name** that may contain uppercase and lowercase Latin letters,
  digits, underscores `_`, hyphens `-` and periods `.`. Index
  names in services start with [the service name][service-name] and a
  period. For example, the only index in the Cryptocurrency Tutorial is named
  `cryptocurrency.wallets`, where `cryptocurrency` is the service name, and
  `wallets` is the own name of the index
- **Optional prefix** presented as a sequence of bytes (`Vec<u8>` in Rust
  terms). Prefixes allow to group logically related indexes.

### Index Groups

**Index groups** – indexes with the same string name but different
address prefixes – can be used to store collections keyed by an identifier.
For example, a group of list indexes may be used to store transaction histories
for wallets; in this case, an identifier could be the public key of the wallet.

Any index in the group can be accessed using a usual API. It is also possible
to iterate over prefixes in a group.

### Key Sorting and Iterators

MerkleDB indexes support iterating over index contents:

- items for lists and sets
- keys, values or key-value pairs in case of map indexes.

Such iterators use key ordering of the low-level key-value storage to
determine the iteration order. Namely, keys are lexicographically ordered
according to their binary serializations.

## View Layer

Exonum introduces additional layer over the database to handle transaction
and block atomicity.

### Patches

Patch is a set of serial changes that should be applied to
the low-level storage atomically. A patch may include two types of
operations: put a value addressed by a key, or delete a value by a key.

### Snapshots

Snapshot fixes the storage state at the moment of snapshot
creation and provides a read-only API to it. Even if the storage state
is updated, the snapshot still refers to the old content of the stored indexes.

### Forks

Forks implement the same interfaces as the database underneath,
transparently wrapping the real data storage state, and some
additional changes. Every fork is based on the storage snapshot. From
the outer point of view, the changes are eagerly applied to the data
storage; however, these changes are stored directly in the fork and may
be easily rolled back. You can create multiple mutable indexes from one
shared reference to the fork. Moreover, there may be different forks of
the same database snapshot.

Forks are used during transaction and block processing. A fork
[is successively passed](transactions.md#interface)
to each transaction in the block to accumulate changes produced by the
transactions. If one of the transactions in the block
quits with an unhandled exception during execution, its
changes are promptly rolled back, so that execution of the following
transactions continues normally.

### Accesses

Snapshots, forks and patches are *raw*; they provide access to the entire database.
On top of these objects, MerkleDB provides tools for fine-grained access control:

- `Prefixed` access is used to restrict the user to a single namespace.
  The namespace is a UTF-8 string, which is prepended to the user-provided
  address name together with a dot `.`. For example, an index with the address
  `"bar"` in the namespace `"foo"` is mapped to the index with the full
  address `"foo.bar"`.
- `Migration` represents data created during a [migration](#migrations).
  `Migration`s have a namespace, but unlike `Prefixed`, their data cannot
  be accessed in any other way.
- `Scratchpad` hosts temporary data during a migration. Like other accesses,
  scratchpads are namespace-separated and like `Migration`, the access from
  a scratchpad is unique.

!!! example
    Namespace `test` concerns indexes with an address starting with
    `test.`, such as `test.foo` or `(test.bar, 1_u32)`, but not `test`
    or `test_.foo`.

## Indexing

Unlike relational databases, Exonum does not support indexes over fields
of blobs as a first-class entity. However, it is
possible to create auxiliary indexes with indexing semantics. Content of the
auxiliary indexes should be updated according to the content of the original
objects that they index.

## State Aggregation

MerkleDB automatically aggregates its contents into a single *state hash*,
which commits to the entire Merkelized database contents.
This is used in Exonum to achieve consensus as to the database state
without requiring a single line of code from the service developers.

The state hash of the database is the hash of the *state aggregator*,
a `ProofMapIndex` with keys being UTF-8 names of aggregated indexes,
and values their hashes. An index is aggregated if and only if it satisfies
the following constraints:

- Index has a matching type (`ProofListIndex`, `ProofMapIndex`, or `ProofEntry`)
- Index is not a part of a group, i.e., its address has an empty prefix

Snapshot and patches are always consistent with respect to the aggregated state;
the index hashes in the state aggregator match their actual values.
This is **not** the case for forks, in which the state aggregator may be stale.

Migration accesses have their separate aggregators that can be obtained via
corresponding API.

## Migrations

**Migration** refers to the ability to update data in indexes, remove indexes,
change index type, create new indexes, and package these changes in a way that they
can be atomically committed or rolled back. Accumulating changes in the migration,
on the other hand, can be performed iteratively, including after a process shutdown.

Each migration is confined to a *namespace*, defined in a similar way as
namespaces for [fine-grained accesses](#accesses).

Migration is non-destructive, i.e., does not remove the old versions
of migrated indexes. Instead, new indexes are created in a separate namespace,
which can be accessed via `Migration`.
For example, index `foo` in the migration namespace `test` and the original
`test.foo` index can peacefully coexist and have separate data and even
different types. The movement of data is performed only when the migration
is flushed. A migration can also store temporary data in a `Scratchpad`.

Indexes created within a migration are not [aggregated](#state-aggregation)
in the default state hash. Instead, they are placed in a separate namespace,
the aggregator and state hash for which can be obtained via `Migration` APIs.
In Exonum, this is used to ensure that data migration has the same outcome for
all nodes in the blockchain network.

Once a migration logic has completed, the migration can be either *flushed* or
*rolled back*. Flushing will replace old index data with new, remove indexes
marked with tombstones, and return migrated indexes to the default state aggregator.
Rolling back will simply remove all data in a `Migration`. Both flushing and
rolling back also clear the scratchpad associated with the migration.

[rocks-db]: http://rocksdb.org/
[col-family]: https://github.com/facebook/rocksdb/wiki/Column-Families
[service-name]: services.md#service-identifiers
