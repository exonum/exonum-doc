# Merkle Index

A [Merkle tree][wiki-merkle-index] (hash tree or Tiger tree hash)
is a [tree][wiki-tree] in which every non-leaf node is labelled with the hash
of the labels or values (in case of leaves) of its child nodes. Hash trees are
a generalization of hash lists and chains. Merkle trees include both benefits of

1. **trees**: operations on elements (appending a new element, getting an
  element) take `O(log N)` operations, where `N` is number of elements
  (for example, transactions)
2. **hashes**: verification of the (blockchain) copes.

Merkle trees are *trees* by design inside the Exonum core but they also are
*tables* with verifiable content from the light client point of view and
*key-value store* which supports only simple types of queries for Exonum
application developers.

## Motivation and Usage

In the blockchain as in various other distributed and [peer-to-peer][wiki:p2p]
systems, data verification is very important. This is because the same data
exists in multiple locations. So, if a piece of data is changed in one
location, it's important that the same data changes are processed everywhere.

However, it is time consuming and computationally expensive to check the
entirety of each part whenever a system wants to verify data. So, this why
Merkle trees are used. Basically, we want to limit the amount of data being
sent over a network as much as possible. So, instead of sending an entire file
over the network, we just send a hash of the file to see if it matches.

Currently, their main uses of Merkle indexes are in peer-to-peer networks such
as [Tor][tor] and [Bitcoin][bitcoin]. The usage of Merkle index for blockchains
(including Bitcoin and Exonum) is twofold

1. minimization of the data transfer during the
  [consensus algorithm](consensus/consensus.md)
2. the possibility of [lightweight clients](../architecture/clients.md)
  implementation.

## *MerkleTable* database storage structure

Operator `||` below stands for concatenation. Function `hash(arg)` below
stands for [SHA-256][sha-256] hash of byte array `arg`.

### Representation in persistent storage

The internal representation of tree is organized by utilizing 2 integer
parameters as `key` for each element: `height` and `index`.

!!! note
  To distinguish values from different tables in Exomum, additional prefix is
  used for every key. Such prefix consist of service name and table name. See
  [storage section](../architecture/storage.md) for more details.

1. Each Merkle tree element is addressed by a 8-byte `key = height || index`,
  where:
  - `height < 58` is height of element in the tree, where `0` is bottom
    element, and is represented as `6` bits
  - `index` is index of element at the given height consisting of `58` bits
  - `height` and `index` are serialized within `key` as
    [BigEndian][wiki:big-endian]
2. The elements of the underlying list are stored in `(height = 0, index)`
  cells, where `index` is in interval `[0, len(merkle_table))`, where
  `table.len()` is the number of leaves in the tree (or, equivalently, the
  number of elements in the underlying list)
3. Hash of an individual value is stored in `(height = 1, index)`.
  It corresponds to the value, stored in `(height = 0, index)` cell.
4. Some of the rightmost values on different heights may be absent, it's not
  required that the obtained tree is full binary. Appending an element to the
  list corresponds to writing it to the cell `(0, table.len())` and updating
  `O(log table.len())` nodes of the tree with `height > 0`.
5. On all of `(height > 1, index)` hashes of 2 or 1 child are
  stored.
  - If both `(height - 1, index * 2)` and `(height - 1, index * 2 + 1)`
    nodes are present, the node `(height, index)` has 2 children hashes.
  - If only `(height - 1, index * 2)` node is present, the
    node at `(height, index)` has single child hash.
6. `max_height` is the height where only a single hash is stored at
  `index = 0`.
  - `max_height = pow + 1`, where `pow` is the smallest integer such that
    `2^pow >= len(merkle_table)`
  - `(max_height, 0)` is the root hash of the Merkle tree.

An example of `key -> value` mappings in database.

Key (`key`) | Value
------------ | -------------
[_0000_**00FF**]  **height** = **0**, **index** = **255**   | serialized value [..]
[_4000_**0005**]  **height** = **1**, **index** = **5**   | hash [..]
[_C000_**000A**]  **height** = **3**, **index** = **10**   | hash [..]

### Logical representation

Below is an illustration of the logical representation of a Merkle tree,
containing `6` values `v0...v5`.
![Tree Structure](../images/merkle-tree-example.png)

### Hashing rules

Let `T(height, index)` be a value at tree node for element `index` at height
`height`. Elements `T(0, index)` contains arbitrary binary data. Elements
`T(height, index)` for `height > 0` are hashes corresponding the following
rules

#### Rule 1. Empty tree

Hash of empty tree is defined as `32` zero bytes.

#### Rule 2. `height=1`

Hash of a value, contained in `(height = 0, index)`, is defined as:

- `T(1, index) = hash((0, index))`.

#### Rule 3. `height > 1` and both children

If `height > 1` and both nodes `T(height - 1, index * 2)` and
`T(height - 1, index * 2 + 1)` exist then :

`T(height , index) = hash(T(height - 1, index * 2) || T(height - 1, index * 2 + 1))`

#### Rule 4. `height > 1` and the only child

If `height > 1` and node `T(height - 1, index * 2)` exists and
node for `(height - 1, index * 2 + 1)` is absent in the table, then:

`T(height > 1, index) = hash(T(height - 1, index * 2))`

## Merkle Tree range proofs structure: `Proofnode`

### General description

`Proofnode` is a recursively defined structure that's designed to provide
evidence to client that a certain set of values is contained in a contiguous
range of indices. One could use several `proofnodes` to get proof for
discontiguous set of indexes.

For a given range of indices `[start_index, end_index)` the proof
contains binary-tree-like structure, containing `values` of elements from
the leaves with requested indices and `hashes` of all neighbor leaves/nodes
on the way up to the root of tree (excluding the root itself). It doesn't
contain the `indices` themselves, as they can be deduced from the structure's
form.

### Format

A `Proofnode<Value>` is defined to be one of the following (in terms of JSON values):

Variant | Child `Proofnode`(s) indices | Hashing rule
------------ | ------------- | -------------
{ "left": `Proofnode`, "right": `Proofnode` } | `left_i = 2*i`, `right_i = 2*i + 1` | [3](#hashing-rules)
{ "left": `Proofnode`, "right": `Hash` } | `left_i = 2*i`, `right_i = 2*i + 1` | [3](#hashing-rules)
{ "left": `Proofnode` } | `left_i = 2*i` | [4](#hashing-rules)
{ "left": `Hash`, "right": `Proofnode` } | `left_i = 2*i`, `right_i = 2*i + 1` | [3](#hashing-rules)
{ "val": `ValueJson` } | `val_i = i` | [2](#hashing-rules)

1. `Hash` is a hexadecimal encoded string, representing the array of bytes of a
  hash.
2. An option without the right hash \{"left": `Proofnode`\} is present due to how
  trees, which are not full binary, are handled in this implementation.
3. `i` is the index of a `Proofnode` itself. `left_i`, `right_i` and
  `val_i` are the indices of the nested (child) `Proofnode`(s).
4. `i` for the outmost proofnode is `0`.
5. Custom functions to compute "val" hash for each individual entity type are
  required on client. Each function should construct a byte array from
  `ValueJson` fields using specific [Exonum serialization](serialization.md)
  and compute "val" hash according to [2](#hashing-rules).

### Proof verification

While validating the proof a client has to verify following conditions:

1. All of the {"val": ...} variants are located at the same depth in the
  retrieved JSON.
2. If a node contains a right child (i.e., matches either of
  `{"left": ..., "right": ...}` variants), then its left child, nor any of its
  children may have a single child (i.e., match the `{"left": ...}` variant).
  This means that the left child must be a result of pruning a full binary
  tree.
3. Collected indices of `ValueJson` (s) in proof correspond to the requested
  range of indices `[start_index, end_index)`.
4. The root hash of the proof evaluates to the root hash of the `MerkleTable`
  in question.

If either of these verifications fails, the proof is deemed invalid.

!!! note
  One could think of proofs as of Merkle trees pruning. That is, a proof is
  produced by "collapsing" some intermediate nodes in the Merkle tree. Another
  point of view - from the light client perspective - is that a proof is
  essentially a limited view of a list, for which the Merkle tree is
  constructed. This view allows to calculate the hash of the whole list and
  contains some of its elements.

#### Example

Below is depicted a Merkle tree with `6` elements (*not full binary*) with
elements, that are a saved inside a proof for range `[3, 5)` in
__**bold and underscored**__ on the bottom. Elements are `3`-byte arrays
(`[u8; 3]`).

![Proof_Structure](../images/merkle-tree-example-2.png)

Which corresponds to the following JSON representation of `Proofnode`.

```javascript
{
    "left": {
        "left": "fcb40354a7aff5ad066b19ae2f1818a78a77f93715f493881c7d57cbcaeb25c9",
        "right": {
            "left": "1e6175315920374caa0a86b45d862dee3ddaa28257652189fc1dfbe07479436a",
            "right": {
                "val": [
                    3,
                    4,
                    5
                ]
            }
        }
    },
    "right": {
        "left": {
            "left": {
                "val": [
                    4,
                    5,
                    6
                ]
            },
            "right": "b7e6094605808a34fc79c72986555c84db28a8be33a7ff20ac35745eaddd683a"
        }
    }
}
```

## See Also

1. Merkle, R. C. — A Digital Signature Based on a Conventional Encryption
  Function // Advances in Cryptology — CRYPTO '87. Lecture Notes in Computer
  Science, Vol. 293, pp. 369-378, 1988.
2. Szydlo, M. — Merkle Tree Traversal in Log Space and Time // Lecture Notes in
  Computer Science, Vol. 3027, pp. 541-554, 2004.
3. [Merkle tree on Brilliant](https://brilliant.org/wiki/merkle-tree/).

[wiki-merkle-index]: https://en.wikipedia.org/wiki/Merkle_tree
[wiki-tree]: https://en.wikipedia.org/wiki/Tree_(data_structure)
[wiki:p2p]: https://en.wikipedia.org/wiki/Peer-to-peer
[bitcoin]: https://bitcoin.org/bitcoin.pdf
[tor]: https://www.torproject.org/
[wiki:git]: https://en.wikipedia.org/wiki/Git
[wiki:big-endian]: https://en.wikipedia.org/wiki/Endianness
[sha-256]: http://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf
