# Merkle Patricia Index

##### Merkle Patricia Tree db storage structure: *MerklePatriciaTable*

Operator __||__ below stands for concatenation. 
Function _hash(**arg**)_ below stands for SHA-256 hash of byte array **arg**.  

###### General description
- the minimum increment in key prefix while navigating the nodes is *1 bit*. 
- the retrieved tree is effectively binary. 
- it is not balanced when a node is inserted or removed by the corresponding algorithms.
- the structure supports only keys of fixed predetermined length - *KEY\_SIZE* (currently *32 bytes = 256 bit*).
- read-only queries to *(key;value)* pairs do not require navigating the tree and are performed in *single* **db read operation**. 
- insert, update and remove key require *O(log2(__n__))* **db read/write operations** on average for a table, populated by and queried for random keys, where **n** is the number of keys in the table. 
 
###### BitSlice
A helper structure to represent key prefixes and keys with bit precision. 
It contains:

- **data**: &[u8] - a reference to byte array with key data
- **from**: u16 - an integer index in **data** indicating the start of range (inclusive) of relevant bits of a key or key prefix. It differs from 0 only for in-memory *BitSlice* s, used by tree navigation methods. It's always set as 0 when a *BitSlice* is obtained from a *DB\_KEY*. 
- **to**: u16 - an integer index in **data** indicating the end of range (exclusive) of relevant bits of a key or key prefix. 

###### DB\_KEY
An array of *DB\_KEY\_SIZE* = [*KEY\_SIZE* + 2] bytes used to represent *BitSlice* s when persisted to db.
The *DB\_KEY*[1..KEY\_SIZE+1] bytes correspond to **data** portion of a *BitSlice*. All the bits starting from **to** index inclusive in **data** are set to *0* when a *BitSlice* is persisted. 
The first byte is a marker, indicating which kind of node this *DB\_KEY* addresses. The last byte is used to persist **to** of a *BitSlice*. The first byte can be either of two: 

* *01* - leaf prefix. It's used to address leaf nodes, wherein all *KEY\_SIZE* * 8 bits are relevant to the key contained in the bitslice represented. 
    * The last byte is set to 00 (it's implied that **to** is set to *KEY\_SIZE* * 8 = 256).  
* *00* - branch prefix. It's used to address branch nodes, which contain *Left* and *Right* childs.
    * The last byte is set to **to** of the corresponding *BitSlice*.  
    * The **[0, to)** *BitSlice* of a branchnode is always a common prefix to *Left* and *Right* *BitSlice* s. *Left* contains *0* bit at **to** position of parent *BitSlice* and *Right* contains *1* bit at that position. 

###### BranchNode
An array of *BRANCH_NODE_SIZE = 2 * (HASH_SIZE + DB\_KEY\_SIZE)* bytes, which contains the following 4 values in succession: 

1. Left child hash (of *HASH_SIZE*). 
2. Right child hash (of *HASH_SIZE*).
3. Left child *DB\_KEY* (of *DB\_KEY\_SIZE*).
4. Right child *DB\_KEY* (of *DB\_KEY\_SIZE*).

###### DB storage structure
Key (DB\_KEY) | Value
------------ | -------------
[__01__*KEY\_SIZE*__00__] LEAF 01 | serialized value [..]
[__00__*KEY\_SIZE*__to__] BRANCH 00 | BranchNode [hash**hash**DB\_KEY**DB\_KEY**]

###### Hashing rules
1. Hash of empty tree is defined as **[0\*HASH_SIZE]**.
2. Hash of leaf node  is defined as *hash( __[serialized\_value]__ )*.
3. Hash of a branch node is defined as *hash( __[BranchNode]__ )*, which is effectively the same as *hash(* __[left child hash]__ || __[right child hash]__ || __[left child DB\_KEY]__ || __[right child DB\_KEY]__ *)*
4. Hash of a leaf root  is defined as *hash(*  **[root DB\_KEY]** || *hash(* **[root serialized\_value]** *)* *)*  
    - Edge case when only a single *(key;value)* pair was inserted into tree and there's a single leaf node.

###### Illustration
The picture below illustrates the merkle patricia tree structure. 
- *(001)* stands for a *DB\_KEY* having BRANCH-00 prefix, with __to__ set to 3 and 3 first bits of **data** set to *001*.  
- *(010...)* stands for *DB\_KEY* with LEAF-01 prefix where all *KEY\_SIZE * 8* of **data** are relevant to the key represented, which starts with *010* bits. 
![Merkle Patricia Tree Structure](patricia_tree_example.png) 

##### Merkle Patricia Tree key inclusion/exclusion proofs structure. 

###### General description
*ProofPathToKey* is a recursively defined structure that's designed to provide evidence to client that either: 
1. a *(serched_key; value)* pair is contained in the tree for a given *searched_key* or
2. the tree doesn't contain *searched_key*. 

For a given *searched_key* the proof contains binary-tree-like structure, containing a *value* bound to the requested key, hashes and *DB\_KEY* s of all neighbour leaves/nodes on the way up to the root of tree (which is included too). 
Inclusion is proved by providing a path from root that ends in a leaf node with a *BitSlice* that corresponds to the *searched_key* with intermediate nodes being prefixes of *searched_key* of growing length. 
Exclusion is proved by providing a path from root that ends in a branch node, both child *BitSlice* s of which aren't prefixes of *searched_key* with intermediate nodes being prefixes of *searched_key* of growing length. 

###### Format
A *ProofPathToKey<Value>* is defined to be one of the following (in terms of json values):

Variant | Hashing rule | Description
------------ | ------------- | -------------
{ "left\_hash": *ProofPathToKey*, "right\_hash": "**Hash**", "left\_key": "**DB\_KEY**", "right\_key": "**DB\_KEY**"} | [3](#hashing-rules) | Contains a nested proof path. Represents a proof path element. 
{ "left\_hash": "**Hash**", "right\_hash": *ProofPathToKey*, "left\_key": "**DB\_KEY**", "right\_key": "**DB\_KEY**"} | [3](#hashing-rules) |  Contains a nested proof path. Represents a proof path element.
{ "left\_hash": "**Hash**", "right\_hash": "**Hash**", "left\_key": "**DB\_KEY**", "right\_key": "**DB\_KEY**"} | [3](#hashing-rules) | Proves exclusion by providing a branchnode with both "left\_key" and "right\_key" NOT being prefixes to the *searched_key*.
{ "val": *ValueJson* } | [2](#hashing-rules) | Proves inclusion of a value under "left\_key" or "right\_key" of the parent *ProofPathToKey*.

or : 

Variant | Hashing rule | Description
------------ | ------------- | -------------
{ "root\_key": "**DB\_KEY**", "hash": "**Hash**"} | Rule [4](#hashing-rules). Only a single hash operation. **[root serialized\_value]** is already hashed here. | It serves to prove exclusion for a leaf root when *root\_db\_key* != *searched db\_key*

or : 

Variant | Hashing rule | Description
------------ | ------------- | -------------
{ "root\_key": "**DB\_KEY**", "val": *ValueJson* } | Rule [4](#hashing-rules). Two hash operations. | It serves to match a leaf root with found key (*root\_db\_key*== *searched\_db\_key*, value). 

1. **Hash** and **DB\_KEY** are hex encoded strings, representing the arrays of bytes of a hash or a *DB\_KEY*. 
2. Custom functions to compute "val" hash for each individual entity type are required on client. Each function should construct a byte array from *ValueJson* fields (same as that used in *serialized value [..]* on backend) and compute "val" hash according to [2](#hashing-rules).

###### Proof verification
While validating the proof a client has to verify following conditions:

1. 
4. The root hash of the proof evaluates to the root hash of the *MerkleTable* in question. 

###### Examples
Below is an example of what data is contained in an inclusion proof for *searched_key (001101...)*. The data are highlighted in yellow. 
![Inclusion proof example](patricia_path_example.png)
And an example of what data is contained in an exclusion proof for *searched_key (001111...)*. 
![Exclusion proof example](patricia_exclusion_path_example.png)

An example of json representation of *ProofPathToKey* (inclusive) on random data. It proves inclusion of bytearray value __[ 244, 84, 106, 52, 86, 174, 4, 193 ]__ under 32-byte key __5e0a5a39c46bed6824ccf0bbb247196b6879037a1ff081231f870591f8a9d64a__:  
```javascript
{
    "left_hash": {
        "left_hash": "7e6c08992978e7d06f6640be4f85c558deabcb6f9484c858d912ec66cb36a486",
        "right_hash": {
            "left_hash": {
                "left_hash": "4fb8ca6dcc19858e6f31e8259262f3d52126ce84fd5b74aa457d6a7e5c9ebf88",
                "right_hash": {
                    "val": [ 244, 84, 106, 52, 86, 174, 4, 193 ]
                },
                "left_key": "0147c07cb1d2a4268daff02985656a7a1218eb28f4f1549079092467b6a29ab8e700",
                "right_key": "015e0a5a39c46bed6824ccf0bbb247196b6879037a1ff081231f870591f8a9d64a00"
            },
            "right_hash": "3943371d7313d7d74f7e9c719f1fdb6991c6b34d2bc7201bcf5f0b2ca35d6b00",
            "left_key": "00400000000000000000000000000000000000000000000000000000000000000003",
            "right_key": "00600000000000000000000000000000000000000000000000000000000000000003"
        },
        "left_key": "00000000000000000000000000000000000000000000000000000000000000000002",
        "right_key": "00400000000000000000000000000000000000000000000000000000000000000002"
    },
    "right_hash": "9517d0d26cfd2434ae4cdf294cff1dbde8d48f7d65766c552cc8eac35d31c5f3",
    "left_key": "00000000000000000000000000000000000000000000000000000000000000000001",
    "right_key": "00800000000000000000000000000000000000000000000000000000000000000001"
}
```
An example of json representation of *ProofPathToKey* (exclusive) on random data. It proves exclusion of a 32-byte key __4a51d03407b6a95d006a953caf0860f86c8f999d88d11d811b91510ea9b9c68f__:
```javascript
{
    "left_hash": {
        "left_hash": "6696754798944ffeb764a1ea27a04d089e5ea28529ae8c37e873cf576e08e26f",
        "right_hash": {
            "left_hash": {
                "left_hash": "403bfea0ae420fa2c895c859a6f9dce8009de01df52a8b78859f11db27883ccf",
                "right_hash": "9c224923a59ab2c52de11078851ffa864ad4c19231a038e3ca65f22cb5ed2e51",
                "left_key": "014d0977e7ee0c3eb4a57e0051a26888b25eba5db4e9d0cfa8c8597147d859bf2b00",
                "right_key": "00500000000000000000000000000000000000000000000000000000000000000004"
            },
            "right_hash": "11073b48987fa2513c7bfb052163d5ef41a766d6f42229f04bd37c7008017e08",
            "left_key": "00400000000000000000000000000000000000000000000000000000000000000003",
            "right_key": "00600000000000000000000000000000000000000000000000000000000000000003"
        },
        "left_key": "00000000000000000000000000000000000000000000000000000000000000000002",
        "right_key": "00400000000000000000000000000000000000000000000000000000000000000002"
    },
    "right_hash": "a2276b3dafaa6017b7a2996f0655cc8a646d0697c5aa9018341cfe0badab490b",
    "left_key": "00000000000000000000000000000000000000000000000000000000000000000001",
    "right_key": "00800000000000000000000000000000000000000000000000000000000000000001"
}
```
