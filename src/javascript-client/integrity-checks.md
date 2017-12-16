# Integrity checks

## Verify block

```javascript
Exonum.verifyBlock(data, validators, networkId);
```

Each new block in Exonum blockchain is signed by [validators](../glossary/#validator).
To prove the integrity and reliability of the block, it is necessary to verify their signatures.
The signature of each validator are stored in the precommits.

The `merkleProof` method is used to validate block and its precommits.

Returns `true` if verification is succeeded or `false` if it is failed.

| Argument | Description | Type |
|---|---|---|
| **data** | Structure with block and precommits. | `Object` |
| **validators** | An array of validators public keys as a hexadecimal strings. | `Array` |
| **networkId** | This field will be used to send inter-blockchain messages in future releases. For now, it is not used and must be equal to `0`. | `Number` |

Example of block verification:

```javascript
var data = {
    block: {
        height: '4',
        prev_hash: '2e933eba2887a1d9bb38c396577be23db58ea5f414761f6dda939d660b323140',
        proposer_id: 0,
        schema_version: 0,
        state_hash: 'da5ae8362137d3e4acae0917e30388959b6d2a91760d25bb5eca832b449550ce',
        tx_count: 1,
        tx_hash: '759de4b2df16488e1c13c20cb9a356487204abcedd97177f2fe773c187beb29e'
    },
    precommits: [
        {
            body: {
                block_hash: '1a1b6bf4c9f7543809e1011b1d5e4ad0b76eab14924d8ff00ba1a79f0466ce6b',
                height: '4',
                propose_hash: '878165361bb6b207ca75cac83e2817b34564a9b5115128b21f4f89f729d60769',
                round: 4,
                time: {
                    nanos: 804000000,
                    secs: '1486720350'
                },
                validator: 0
            },
            message_id: 4,
            network_id: 0,
            protocol_version: 0,
            service_id: 0,
            signature: 'f69f1cd9bd8dfd822a923f427556842b2cb194b75fc437248a6260f218e0d188911c1ef4616db3edcda78176d8d56273417439a1824a90e5df16775edb8dd608'
        },
        {
            body: {
                block_hash: '1a1b6bf4c9f7543809e1011b1d5e4ad0b76eab14924d8ff00ba1a79f0466ce6b',
                height: '4',
                propose_hash: '878165361bb6b207ca75cac83e2817b34564a9b5115128b21f4f89f729d60769',
                round: 4,
                time: {
                    nanos: 804000000,
                    secs: '1486720350'
                },
                validator: 1
            },
            message_id: 4,
            network_id: 0,
            protocol_version: 0,
            service_id: 0,
            signature: '0660b18a35e6e9ee2a9f9447a2362a1e498314843aa8ddb838a81112dd2b290ff54cdd089a1877a82c3505b7376dc91e7e0d0f9a1150064ce1199a12845d560b'
        },
        {
            body: {
                block_hash: '1a1b6bf4c9f7543809e1011b1d5e4ad0b76eab14924d8ff00ba1a79f0466ce6b',
                height: '4',
                propose_hash: '878165361bb6b207ca75cac83e2817b34564a9b5115128b21f4f89f729d60769',
                round: 4,
                time: {
                    nanos: 804000000,
                    secs: '1486720350'
                },
                validator: 2
            },
            message_id: 4,
            network_id: 0,
            protocol_version: 0,
            service_id: 0,
            signature: '02e26fac66f7e6fd9013f34832d53f7bbf928bd5824900594f8a247d4f4ec5f84c77420dd2bb98ebbf0910e48539d3abd9b57be70f15ca5ceccb85a92d41270a'
        }
    ]
};
var validators = [
    '0b513ad9b4924015ca0902ed079044d3ac5dbec2306f06948c10da8eb6e39f2d',
    '91a28a0b74381593a4d9469579208926afc8ad82c8839b7644359b9eba9a4b3a',
    '5c9c6df261c9cb840475776aaefcd944b405328fab28f9b3a95ef40490d3de84',
    '66cd608b928b88e50e0efeaa33faf1c43cefe07294b0b87e9fe0aba6a3cf7633'
];
var networkId = 0;

Exonum.verifyBlock(data, validators, networkId); // true
```

## An example of checking the existence of data

In a real-world application, it is recommended to verify the entire path from the data
to the block in which this data is written.
Only such a verification can guarantee the integrity and reliability of the data.

The generalized scheme for proving the existence of data in the blockchain:

![Proof Schema](../images/proof.png)

In this schema, the data is in the Merkle tree or its variants with the rest of the data of the corresponding type.

The root hash of this Merkle tree is called **state hash**,
which means that it is a hash of all data in the blockchain.
This hash is written in the block, which is signed by the validators.

To prove the existence of data in the blockchain, it is enough to first check the Merkle tree,
and then check the block with precommits.

If there are *several different types of data* in the blockchain, the state hash is calculated in another way.
Generally, only data of the same type is stored in the Merkle tree or its variants.
Thus, the number of Merkle trees in the system is equal to the number of data types.
All existing Merkle trees are grouping into the Merkle tree or its variants,
in the leaves of which lie the root hashes of the Merkle trees.
The root hash of the grouping Merkle tree is the state hash of the blockchain.

An example of proof of the existence of some data of `Wallet` type:

```javascript
// Proof from blockchaun
var data = {
    block_info: {
        block: {
            height: '66399',
            prev_hash: 'd71582601dd20fbfe7175890fa2816a97f76c0fbd6397edb5c51a8573886a4df',
            proposer_id: 4,
            schema_version: 0,
            state_hash: '2cf4f5fec47b570f33b6c9b40e3fd271b1cf3d8ff5c24809df1cbaa41c0e8473',
            tx_count: 0,
            tx_hash: '0000000000000000000000000000000000000000000000000000000000000000'
        },
        precommits: [
            {
                body: {
                    block_hash: '53045347468bdea6bcc6d9c7ecb7abb732467993a8b0c7a51537707fa12213a4',
                    height: '66399',
                    propose_hash: 'fcab47b83984c123abed22833ddc2f5bc21987a1e3104793de100f6b4e3c22f9',
                    round: 1,
                    time: {
                        nanos: 278466000,
                        secs: '1512916094'
                    },
                    validator: 0
                },
                message_id: 4,
                network_id: 0,
                protocol_version: 0,
                service_id: 0,
                signature: '59a120495197181f083abbfb48da224b80ac7f3adaf2afcb9d82edd5344669e1c985b8ca3e365b38506d314a95150c5f3a41dd1e06217ca68c3f17f2d3562d01'
            },
            {
                body: {
                    block_hash: '53045347468bdea6bcc6d9c7ecb7abb732467993a8b0c7a51537707fa12213a4',
                    height: '66399',
                    propose_hash: 'fcab47b83984c123abed22833ddc2f5bc21987a1e3104793de100f6b4e3c22f9',
                    round: 1,
                    time: {
                        nanos: 279146000,
                        secs: '1512916094'
                    },
                    validator: 5
                },
                message_id: 4,
                network_id: 0,
                protocol_version: 0,
                service_id: 0,
                signature: '027d006a929d787d52174b13a52203a754d71554097cdc224a44a592f1d3f9e71eab146b4786cba50705d47be1171b8edf9f15a5dd0438c588a76372a74b0706'
            },
            {
                body: {
                    block_hash: '53045347468bdea6bcc6d9c7ecb7abb732467993a8b0c7a51537707fa12213a4',
                    height: '66399',
                    propose_hash: 'fcab47b83984c123abed22833ddc2f5bc21987a1e3104793de100f6b4e3c22f9',
                    round: 1,
                    time: {
                        nanos: 278995000,
                        secs: '1512916094'
                    },
                    validator: 1
                },
                message_id: 4,
                network_id: 0,
                protocol_version: 0,
                service_id: 0,
                signature: 'c92a3e4089e4b8df8777b11d91607f4bba54f526d717b18a3432689325bb6438fbbb9384217591a6bd425a08e68d18231c06aaa3f451875139bd9d6ee2eb4901'
            },
            {
                body: {
                    block_hash: '53045347468bdea6bcc6d9c7ecb7abb732467993a8b0c7a51537707fa12213a4',
                    height: '66399',
                    propose_hash: 'fcab47b83984c123abed22833ddc2f5bc21987a1e3104793de100f6b4e3c22f9',
                    round: 1,
                    time: {
                        nanos: 280718000,
                        secs: '1512916094'
                    },
                    validator: 3
                },
                message_id: 4,
                network_id: 0,
                protocol_version: 0,
                service_id: 0,
                signature: 'fb870e5801b2b8f79feccd39a39297823aa288c48c8abd434a22ed7c22e02145ac5975e87d35793140314ffec9c9b9d5b51681efefbabcd8d7410ccd0425090a'
            },
            {
                body: {
                    block_hash: '53045347468bdea6bcc6d9c7ecb7abb732467993a8b0c7a51537707fa12213a4',
                    height: '66399',
                    propose_hash: 'fcab47b83984c123abed22833ddc2f5bc21987a1e3104793de100f6b4e3c22f9',
                    round: 1,
                    time: {
                        nanos: 283417000,
                        secs: '1512916094'
                    },
                    validator: 4
                },
                message_id: 4,
                network_id: 0,
                protocol_version: 0,
                service_id: 0,
                signature: 'ac1fd97ec1cf8240c34bd0fa2a525ba0c5379ecf4c1ebc856ff57279a7752de8dffcb11b2f78b477f2351e65d4e4c20694ecb2c59dbaa12f77dc51e1066d3a09'
            }
        ]
    },
    wallet: {
        mpt_proof: {
            '01': {
                '010000': {
                    '01110101000000111011010100011001011000001100110011101101101010001101100100100100100100000100111110111000010100110111011111111110011111010001011101111111101110001101111111001111010101101011001001001110010001010101011101100100010011101101010010000110': '0000000000000000000000000000000000000000000000000000000000000000',
                    '11001000101110100011101001100001011100001111000010100010111110110110011100110110111011001110100010100110000000110101011101101110111101100011000010011010001101011110100000010000100100010001010110011001101111000110001000010001101101010101010010101001': {
                        val: '2b5f9e4e334726521cee78e2a225fc9ea603d11ebe8697e620ae25c17b32b3a1'
                    }
                },
                '10011110101011110111010111001000010000001001001111000011111111010011100000101100111111010011000010111111000001001110111100010110111010110101000010110100001011011110000101000111010100010101101101100010001101001000000011110100010101101010101010010001010000': '0000000000000000000000000000000000000000000000000000000000000000'
            },
            '1101111100111111011000011001100000000100101010010010111111011011010000000101011100011001001011011100010000111101110101110100100011101010011101111000101011011100010100101011110001001001100011001110100000000101001001001100000000010100101110000001000100011001': '91aaafd909d2fac5933637184a2ae1e0ffcdfdff937c178109fc73d9073ee121'
        },
        value: {
            '10': '0e00067cce34974b5e0e347b71ffe0fdb907f381f9af87954cd57e91b37b0701',
            '001': {
                '0111111000100110000101001011101010101100100111000011110010010110100110110001110000010101011011011111000101000010100000000001001101110001001100110111010110010010101101011000100100101110001110101011011100111100001001110101011101100001010010001011101001111': {
                    val: {
                        balance: '40',
                        history_hash: '1818a63b9eca2d82829ddb709b08ee23be0edc30d09a0ad1c09016b09018ea9f',
                        history_len: '3',
                        login: 'abcd',
                        pub_key: '2fc4c29755938792d36382adbe2850026e266eb256b125c756e784eaec29174f'
                    }
                },
                '1010111111110000001000101011100010101111000011000010001101101100001001001000001001001100010111111101101111001111000100010101110010000010101000101001111011111001010100101010100000000110000000010011001011011000000110111011000001000010000100011000011011001': '8cf3341862dc27711b0032c891f56e0f925cf509b1acecab215c5c7b567fd9fd'
            }
        }
    }
};
```

Verification of the proof:

```javascript
// Define the public key of the requested wallet
var publicKey = '2fc4c29755938792d36382adbe2850026e266eb256b125c756e784eaec29174f';

// Define the list of public keys of validators
var validators = [
    '5b0a4bf32646a6f4f584236ba1389c74228c4e3cbe902b20a722335db96a4857',
    'fec6893b6e50a2346df08a5cd8f60afc5dac3abf9dffb8f6b53cc14d280f0e7a',
    '845b698d397574ada768ef3ec9b78b4da2d9548b079915f762dacae9ba9580f8',
    '4f378928c2ab45a0c58f1bbddc2a137e8185d612bde27beb2e482fb631340a1e',
    '586a1a1f8c5d717190606334774b60fcec925fc9413f8a1fe53a0d1cea93b9ea',
    'dfed2af27372b86107413d0ce621e98b01adfdc0e91f5d4362ac1fc2bd8d9d18'
];

// Define Exonum service configuration
var serviceId = 0;
var networkId = 0;

// Verify block with precommits
if (!Exonum.verifyBlock(data.block_info, validators, networkId)) {
    return;
}

// Calculate the key of the Merkle Patricia tree with the wallets in the Merkle Patricia tree with all the trees
var TableKey = Exonum.newType({
    size: 4,
    fields: {
        service_id: {type: Exonum.Uint16, size: 2, from: 0, to: 2},
        table_index: {type: Exonum.Uint16, size: 2, from: 2, to: 4}
    }
});
var tableKeyData = {
    service_id: serviceId,
    table_index: 0
};
var tableKey = TableKey.hash(tableKeyData);

// Verify the Merkle Patricia tree with all the trees and extract the root hash of the Merkle Patricia tree with the wallets
var walletsTreeRootHash = Exonum.merklePatriciaProof(data.block_info.block.state_hash, data.wallet.mpt_proof, tableKey);

// Define the structure of the wallet
var Wallet = Exonum.newType({
    size: 88,
    fields: {
        pub_key: {type: Exonum.PublicKey, size: 32, from: 0, to: 32},
        login: {type: Exonum.String, size: 8, from: 32, to: 40},
        balance: {type: Exonum.Uint64, size: 8, from: 40, to: 48},
        history_len: {type: Exonum.Uint64, size: 8, from: 48, to: 56},
        history_hash: {type: Exonum.Hash, size: 32, from: 56, to: 88}
    }
});
 
// Verify the Merkle Patricia tree of all wallets and extract the requested wallet 
var wallet = Exonum.merklePatriciaProof(walletsTreeRootHash, data.wallet.value, publicKey, Wallet);
```
