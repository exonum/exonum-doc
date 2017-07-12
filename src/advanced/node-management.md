# Node management

Exonum nodes can be controlled via RPC implemented as REST API. Managing
endpoints are handled by Exonum Core and mainly are purposed to receive
information about the current node and blockchain states.

## API endpoints

The managing endpoints URL is structured as follows:

`{base_path}/system/v1/{endpoint_name}`

Here, `base_path` should be replaced with `ip:port/api/`, where `ip:port` stands
for node address.

## Types

As per [Google Closure Compiler][closurec] conventions,
`?` before the type denotes a nullable type, and `=` after the type denotes
an optional type.

### Integer

`integer` type denotes a non-negative integer number.

### Bool

`bool` type denotes a simple boolean `true/false` value.

### Hash, PublicKey, Signature

`Hash`, `PublicKey`, `Signature` types are hexadecimal strings of the
appropriate length. The `Hash` and `PublicKey` consist of 32 bytes.
`Signature` consists of 64 bytes.

### PeerAddress

`PeerAddress` is a string containing address in format `IP:port`

### ReconnectInfo

`ReconnectInfo` is a JSON object with the following fields:

- **addr**: PeerAddress  
  Peer address
- **delay**: integer  
  Delay for reconnect (ms)

### ServiceInfo

`ServiceInfo` is a JSON object with the following fields:

- **id**: integer  
  Unique 2-byte service identifier
- **name**: string  
  Unique string service identifier

### BlockHeader

`BlockHeader` is a JSON object with the following fields:

- **height**: integer  
  The height of the block
- **prev_hash**: Hash  
  The hash of the previous block
- **proposer_id**: integer  
  ID of validator who created an approved block proposal
- **schema_version**: **TODO: ???**
- **tx_count**: integer  
  Number of transactions included into block
- **tx_hash**: Hash  
  the root hash of transactions Merkle tree

### Time

`Time` is a JSON object with the following fields:

- **seconds**: integer  
  Number of seconds in UNIX format
- **nanos**: integer  
  Number of nanoseconds

### Precommit

- **body**: JSON
  The content of precommit message
- **body.block_hash**: Hash  
  The hash of the current block (which precommit was created for)
- **body.height**: integer  
  The height of the current block
- **body.round**: integer  
  The round when block proposal was created
- **body.time**: Time  
  Local clocks time of validator who created block proposal
- **body.validator**: integer  
  ID of the validator who created this precommit
- **message_id**: integer  
  **TODO: ???**
- **network_id**: integer  
  **TODO: ???**
- **protocol_version**: integer  
  **TODO: ???**
- **service_id**: integer  
  **TODO: ???**
- **signature**: Signature  
  precommit's creator signature

## SerializedTransaction

`SerializedTransaction` is a JSON object corresponding to
[transaction serialization format](../architecture/transactions.md#serialization)

## TransactionLocation

`TransactionLocation` is a JSON object with the following fields:

- **block_height**: integer  
  Height of the block including this transaction
- **position_in_block**: integer  
  Position of the transaction in the block

## Add new peer

`POST {base_path}/system/v1/peeradd`

Adds new Exonum node to the list of peers for the current node.

### Parameters

**ip** : PeerAddress

### Example

```None
POST http://127.0.0.1:7780/api/system/v1/peeradd
body: "ip=127.0.0.1:8800"
```

### Response

```None
"Ok"
```

## Peers info

```None
GET {base_path}/system/v1/peers
```

Returns detailed list of peers.

### Parameters

None.

### Response

JSON object with the following fields:

- **incoming_connections**: Array\<PeerAddress\>  
  Address list of peers connected to this node
- **outgoing_connections**: Array\<PeerAddress\>  
  Address list of peers this node connected to
- **reconnects**: Array\<ReconnectInfo\>  
  List of peers (with the corresponding reconnect delays) this node should reconnect

### Response example

```JSON
{
  "incoming_connections": ["127.0.0.1:76638"],
  "outgoing_connections": ["127.0.0.1:6332"],
  "reconnects": [
    {
      "addr": "127.0.0.1:6335",
      "delay": 2000
    },
    {
      "addr": "127.0.0.1:6336",
      "delay": 2000
    },
    {
      "addr": "127.0.0.1:6334",
      "delay": 2000
    }
  ]
}
```

## Mempool size

```None
GET {base_path}/system/v1/mempool
```

Returns the number of transactions in node's mempool.

### Parameters

None.

### Response

JSON object with the following fields:

- **size**: integer  
  Amount of unconfirmed transactions.

### Response example

```JSON
{
  "size": 0
}
```

## Block by height

```None
GET {base_path}/api/explorer/v1/blocks/{height}
```

Returns the content for block with specific height.

### Parameters

**height**: integer  
  The height of desired block

### Response

JSON object with following fields:

- **block**: BlockHeader  
  The header of the specified block
- **precommits**: Array\<Precommit\>  
  The list of precommit transactions voted for this block
- **txs**: Array\<SerializedTransaction\>  
  The list of the transactions included into block

### Response example

```JSON
{
  "block": {
    "height": "20",
    "prev_hash": "a6d3d838e4edc29bd977eba3885a4ef30a020d166ac0e9c51737ae97b8fb3bce",
    "proposer_id": 2,
    "schema_version": 0,
    "state_hash": "8ad43ece286a45b6269183cc3fab215066c31054b06c9ef391697b88c03bb63c",
    "tx_count": 0,
    "tx_hash": "0000000000000000000000000000000000000000000000000000000000000000"
  },
  "precommits": [
    {
      "body": {
        "block_hash": "272913062630e0e6ec3f7db1db91811052b829f0fdf1f27a0aec212f1684cf76",
        "height": "20",
        "propose_hash": "8fcca116a080ccb0d2b31768f7c03408707d595ec9b48813a2e8aef2b95673cd",
        "round": 2,
        "time": {
          "nanos": 807015000,
          "secs": "1499869987"
        },
        "validator": 2
      },
      "message_id": 4,
      "network_id": 0,
      "protocol_version": 0,
      "service_id": 0,
      "signature": "6cc77069b1c23083159decf219772dc904dc974342b19e558ee8a8fb0ef0233adcc1050700311907d6e4ad27c3910e38cda9bb49fcd8ad35740a632cceda870d"
    },
    {
      "body": {
        "block_hash": "272913062630e0e6ec3f7db1db91811052b829f0fdf1f27a0aec212f1684cf76",
        "height": "20",
        "propose_hash": "8fcca116a080ccb0d2b31768f7c03408707d595ec9b48813a2e8aef2b95673cd",
        "round": 2,
        "time": {
          "nanos": 806850000,
          "secs": "1499869987"
        },
        "validator": 3
      },
      "message_id": 4,
      "network_id": 0,
      "protocol_version": 0,
      "service_id": 0,
      "signature": "e6cb64f5d7a80e10fd8367a8379342c32ecb164906002ada775643000f4cbde7e1735a068c17aa7de0ce491fdfa05b3de9519018e4370e13f48675857d4e0307"
    },
    {
      "body": {
        "block_hash": "272913062630e0e6ec3f7db1db91811052b829f0fdf1f27a0aec212f1684cf76",
        "height": "20",
        "propose_hash": "8fcca116a080ccb0d2b31768f7c03408707d595ec9b48813a2e8aef2b95673cd",
        "round": 2,
        "time": {
          "nanos": 7842000,
          "secs": "1499869988"
        },
        "validator": 0
      },
      "message_id": 4,
      "network_id": 0,
      "protocol_version": 0,
      "service_id": 0,
      "signature": "2eab829b3fc123025df6adac3f06bbafcd7882cee7601ad7791e5cc1171349c9f107b229543ee89cff2c323aafef228e850da36c4578c6c593fbb085a079d60e"
    }
  ],
  "txs": []
}
```

## Blocks in range

```None
GET {base_path}/explorer/v1/blocks?count={count}&skip_empty_blocks={skip}&from={height}
```

Returns the headers for the last `count` blocks up to `height`

### Parameters

- **count**: integer  
  The number of blocks to return. Should be not greater than `1000`.
- **skip_empty_blocks**: bool  
  If `true`, then only non-empty blocks are returned.
- **from**: integer  
  Block height, up to which blocks are returned. The blocks are returned
  in backward order, starting from `from` and at least up to `from - count`.

### Response

The `JSON` array of the BlockHeader objects.

### Response example

```JSON
[
  {
    "height": "18",
    "prev_hash": "ae24b1e0dca2df3c7565dc50e433d6d70bf5424a1ba40c221b0a7c27f7270a7e",
    "proposer_id": 3,
    "schema_version": 0,
    "state_hash": "8ad43ece286a45b6269183cc3fab215066c31054b06c9ef391697b88c03bb63c",
    "tx_count": 426,
    "tx_hash": "f8e0a4ef1ee41ce82206757620c3a5f2d661fe2b5c939ed438f6ac287320709e"
  },
  {
    "height": "14",
    "prev_hash": "87d3158f91ce3b3f8c8fab51ab15f0ddcb92a322b962c5a2b34299456c28f452",
    "proposer_id": 3,
    "schema_version": 0,
    "state_hash": "8ad43ece286a45b6269183cc3fab215066c31054b06c9ef391697b88c03bb63c",
    "tx_count": 1000,
    "tx_hash": "ad72304da7ded4039c54523c6e8372571df8851707e608c60f7a31d1e77515ad"
  },
  {
    "height": "10",
    "prev_hash": "f9b4f236d5ef96fe9b06e77ff5e6f9c9c6352e2822846e98d427147ee89d0aee",
    "proposer_id": 3,
    "schema_version": 0,
    "state_hash": "8ad43ece286a45b6269183cc3fab215066c31054b06c9ef391697b88c03bb63c",
    "tx_count": 1000,
    "tx_hash": "687d757b742a28110c40d9246586767a49b4c2521732b9ac23686481168d7e6c"
  },
  {
    "height": "6",
    "prev_hash": "f9ecccb5be51363744cffbb0b8241c2541c3aa7e53f1b9cca01d49d4991ae693",
    "proposer_id": 3,
    "schema_version": 0,
    "state_hash": "8ad43ece286a45b6269183cc3fab215066c31054b06c9ef391697b88c03bb63c",
    "tx_count": 1000,
    "tx_hash": "577b4d67d045d8aa08e1b63a08fe77f09ac2ae8b2f46a6c3294e4ef4efaceb6c"
  },
  {
    "height": "2",
    "prev_hash": "d8d583444b823db312be85dc5dfa6d41b658c2bfe8caf97cb4b7372f2154ad4b",
    "proposer_id": 3,
    "schema_version": 0,
    "state_hash": "8ad43ece286a45b6269183cc3fab215066c31054b06c9ef391697b88c03bb63c",
    "tx_count": 1000,
    "tx_hash": "94f251c0350c95024f46d26cbe0f9d2ea309e2817da4bab575fc4c571140291f"
  }
]
```

## Committed transaction

`GET {base_path}/explorer/v1/transactions/{transaction_hash}`

Looks up committed transaction by the hash.

### Parameters

- **transaction_hash**: Hash
  Hash of transaction to look up.

### Response

JSON object with the following fields:

- **content**: SerializedTransaction  
  Transaction with the specified hash
- **location**: TransactionLocation  
  Transaction position in the blockchain
- **proof_to_block_merkle_root**: MerkleRoot  
  Merkle root proving transaction existence

### Response example

```JSON
{
  "content": {
    "body": {
      "amount": "936",
      "from": "994aba30557b6eededf145b7e6b65c3851229b86f49d97a9e571b5af82a11aa3",
      "seed": "12048737414620495018",
      "to": "38ba56717b0047ca31fcc84cecbb79489ebd47844c7dda84bc5df05d48b753b3"
    },
    "message_id": 128,
    "network_id": 0,
    "protocol_version": 0,
    "service_id": 128,
    "signature": "27f27670cf2751b46fcb4ec2f470c1089bb011cec18513c7014f0e9e97556cd71be98eda83109f91bc5c24548ba15100a4ce954c5cc848c1a62efaf5434b350d"
  },
  "location": {
    "block_height": "2",
    "position_in_block": "979"
  },
  "proof_to_block_merkle_root": {
    "left": "e66a1459533e6542835afd972ca3a71a803770b5ede9779ee726180fcecea0a3",
    "right": {
      "left": "264513e3063a0b8052f6ec953434fc25dc24ade5eedca5ef27c3a39395ffafda",
      "right": {
        "left": "e0dd72846464db2fbde591922489413da1663489eb8b5a733a048a7ae43f79b3",
        "right": {
          "left": "99da5dfe04b944f1f656ea2b7ca78dab7d7c21134f762a313c6a80771f6bc3cf",
          "right": {
            "left": {
              "left": "2d038a5fbb501d5c274aa2fa74732e431406fd01c4675b2b9af2c669cf9d9e51",
              "right": {
                "left": {
                  "left": {
                    "left": "a3fec1be2088b1b14574447f18639d55ab00abf8c5ea3f9f697d6638d311ad86",
                    "right": {
                      "left": "3873dd22eca1dd6d221c03847564be7d20915059a8ccdb75187b0547ec9b449a",
                      "right": {
                        "val": "388c6875077db80282af3c2915aa98b610b5192fe0367def57ef84cbab44ebc6"
                      }
                    }
                  },
                  "right": "50671bcaf8a1b737aaeace7820bac2479416748575efff8a002712672ceea8d9"
                },
                "right": "41d0baf6ca0a111a1fdef91ea67afc5c73154c4145e1e470708fcd4568789bdd"
              }
            },
            "right": "11eb62d8f94c87bd3e3c447d856b5d0d4c72681bf0f078f084ce27ee13b8d7f1"
          }
        }
      }
    }
  }
}
```

## Transaction from the pool of unconfirmed transactions

`GET {base_path}/system/v1/mempool/{transaction_hash}`

Looks up transaction (possibly uncommitted) by the hash.

### Parameters

- **transaction_hash**: Hash
  Hash of transaction to look up.

### Response

Returns transaction from the pool of unconfirmed transactions if it is not
committed yet; otherwise, returns transaction from the blockchain.

Response is a JSON object with one necessary field:

- **type**: string  
  Type of transaction, could be:

    - "Commited": committed transaction (in blockchain)
    - "MemPool": uncommitted transaction (in the pool of unconfirmed
    transactions)
    - "Unknown": unknown transaction

### Unknown Transaction Response Example

Response JSON contains only `type` field. Its value is "Unknown":

```JSON
{
  "type": "Unknown"
}
```

### Known Uncommitted Transaction Response Example

Response JSON has same fields as `SerializedTransaction` plus `type` field with
value equal to "MemPool":

```JSON
{
  "body": {
    "amount": "152",
    "from": "b0d6af8bbe45c574c5f9dd8876b5b037b38d1bf861fd7b90744957aa608ed0c2",
    "seed": "2953135335240383704",
    "to": "99e396355cb2146aba0457a954ebdae36e09e3abe152693cfd1b9a0975850789"
  },
  "message_id": 128,
  "network_id": 0,
  "protocol_version": 0,
  "service_id": 128,
  "signature": "7d3c503d6dc02ca24faaeb37af227f060d0bcf5f40399fae7831eb68921fd00407f7845affbd234f352d9f1541d7e4c17b4cd47ec3f3208f166ec9392abd4d00",
  "type": "MemPool"
}
```

### Known Committed Transaction Response Example

Response JSON has same fields as response to committed transaction request plus
`type` field with value equal to "Commited":

```JSON
{
  "content": {
    "body": {
      "amount": "152",
      "from": "b0d6af8bbe45c574c5f9dd8876b5b037b38d1bf861fd7b90744957aa608ed0c2",
      "seed": "2953135335240383704",
      "to": "99e396355cb2146aba0457a954ebdae36e09e3abe152693cfd1b9a0975850789"
    },
    "message_id": 128,
    "network_id": 0,
    "protocol_version": 0,
    "service_id": 128,
    "signature": "7d3c503d6dc02ca24faaeb37af227f060d0bcf5f40399fae7831eb68921fd00407f7845affbd234f352d9f1541d7e4c17b4cd47ec3f3208f166ec9392abd4d00"
  },
  "location": {
    "block_height": "18",
    "position_in_block": "261"
  },
  "proof_to_block_merkle_root": {
    "left": "07e641264ac4646495c54a379a5943bf88785bcf30a0b4c13f47d1e2e62b343d",
    "right": {
      "left": {
        "left": {
          "left": {
            "left": {
              "left": {
                "left": "78044db9c2713a11c2fe7bb66f27665b6ca0ecbb9e61e09381534d449c4c24c4",
                "right": {
                  "left": {
                    "left": "f62e6a4d8b9c2c0cfb31ea599e08e6e3fe2337169ce07008d91390958e0613d4",
                    "right": {
                      "val": "f6415994136527a24d022595ec0d40f51e2a0c4230a34792a5203df779e3ffaf"
                    }
                  },
                  "right": "daee36b5b7c24a831a62539d534c56e4f234a83ce83876fee48193d8eefabfb2"
                }
              },
              "right": "df8bb7e697e6eb7828975b67f64a77af06379435f4330f0cb0b7a21d18b616db"
            },
            "right": "59ab567cf0d1c09c5050680ea4ed4650238023666b0e5d90855d82dc83d1f982"
          },
          "right": "cf5fa45701ba6ae795da58a504eb1608075d7bbedf05c8f6f448aad4dbd03968"
        },
        "right": "eb583ba724a3b371c243f1268dfca2929c704fe0546875e5dfeb90860ac3533f"
      },
      "right": "bea1bae302dbf975cafa064ecfbc39f2cdcba5fe7ffddb2208c060cd9778c483"
    }
  },
  "type": "Commited"
}
```

## Network info

`GET {base_path}/system/v1/network`

Gets info about the serialization protocol and the services functioning
in the network.

### Parameters

None.

### Response

JSON object with the following fields:

- **network_id**: integer  
  Network ID. Is not used currently
- **protocol_version**: integer  
  The major version of the Exonum serialization protocol. Currently, `0`
- **services**: Array\<ServiceInfo\>  
  Info about services functioning in the network

### Response Example

```JSON
{
  "network_id": 0,
  "protocol_version": 0,
  "services": [
    {
      "id": 128,
      "name": "cryptocurrency"
    }
  ]
}
```
