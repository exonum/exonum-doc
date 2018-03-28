# Node management

<!-- cspell:ignore nanos -->

Exonum nodes can be controlled using RPC implemented via REST API. Managing
endpoints are handled by Exonum core and are mainly purposed to receive
information about the current node and blockchain states as well as to change
node [local configuration](../architecture/configuration.md#local-parameters).

Endpoints are divided into two types: private and public endpoints. Each
endpoint type is hosted at a separate address, which is specified in the
[`api` section](../architecture/configuration.md#api) of the local
configuration.

## Types

As per [Google Closure Compiler][closure] conventions,
`?` before the type denotes a nullable type, and `=` after the type denotes
an optional type.

### Integer

`integer` type denotes a non-negative integer number.

### Bool

`bool` type denotes a simple boolean `true/false` value.

### Hash, PublicKey, Signature

`Hash`, `PublicKey`, `Signature` types are hexadecimal strings of the
appropriate length. `Hash` and `PublicKey` consist of 32 bytes.
`Signature` consists of 64 bytes.

### PeerAddress

`PeerAddress` is a string containing address in `IP:port` format. `IP` is IPv4
address formatted as 4 octets separated by points.

### OutgoingConnectionState

`OutgoingConnectionState` is a JSON object with the following fields:

- **type**: string  
  Connection type, can be:

    - `Active` for established connections
    - `Reconnect` for yet unestablished connections

- **delay**: integer=  
  Interval between reconnect attempts (ms). Is present only if `type` is
  `Reconnect`

### OutgoingConnectionInfo

`OutgoingConnectionInfo` is a JSON object with the following fields:

- **public_key**: ?PublicKey  
  The public key of the peer or `null` if the public key is unknown
- **state**: OutgoingConnectionState  
  Current connection state

### ServiceInfo

`ServiceInfo` is a JSON object with the following fields:

- **id**: integer  
  Unique service identifier
- **name**: string  
  Unique string service identifier

### BlockHeader

`BlockHeader` is a JSON object with the following fields:

- **height**: integer  
  The height of the block
- **prev_hash**: Hash  
  The hash of the previous block
- **proposer_id**: integer  
  ID of the validator that created an approved block proposal
- **schema_version**: integer  
  Information schema version. Currently, `0`
- **tx_count**: integer  
  Number of transactions included into the block
- **tx_hash**: Hash  
  The root hash of the transactions Merkle tree

### Time

`Time` is a JSON object with the following fields:

- **seconds**: integer  
  The UNIX timestamp
- **nanos**: integer  
  Number of nanoseconds

### Precommit

`Precommit` is a message, serialized according to [message serialization rules](../architecture/serialization.md#message-serialization).

- **body**: Object  
  The content of the `Precommit` message
- **body.block_hash**: Hash  
  The hash of the current block (the `Precommit` message was created for)
- **body.height**: integer  
  The height of the current block
- **body.round**: integer  
  The round when the block proposal was created
- **body.time**: Time  
  UTC time of the validator that created the block proposal
- **body.validator**: integer  
  ID of the validator that created this `Precommit` message
- **message_id**: integer  
  ID of the `Precommit` message. Equals `4`
- **network_id**: integer  
  Network ID. Is not used currently
- **protocol_version**: integer  
  The major version of the Exonum serialization protocol. Currently, `0`
- **service_id**: integer  
  Unique service identifier. Equals `0`
- **signature**: Signature  
  `Precommit` message creator's signature

### SerializedTransaction

`SerializedTransaction` is a JSON object corresponding to
[transaction serialization format](../architecture/serialization.md#message-serialization).

### TransactionLocation

`TransactionLocation` is a JSON object with the following fields:

- **block_height**: integer  
  The height of the block including this transaction
- **position_in_block**: integer  
  Position of the transaction in the block

## System API endpoints

All system API endpoints share the same base path, denoted **{system_base_path}**,
equal to `/api/system/v1`.

## Public endpoints

### Number of unconfirmed transactions

```none
GET {system_base_path}/mempool
```

Returns the number of transactions in the node pool of unconfirmed transactions.

#### Parameters

None.

#### Response

A JSON object with the following fields:

- **size**: integer  
  Amount of unconfirmed transactions

#### Response example

```JSON
{
  "size": 0
}
```

### Healthcheck

```none
GET {system_base_path}/healthcheck
```

Returns a boolean value representing if the node is connected to other peers.

#### Parameters

None.

#### Response

A JSON object with the following fields:

- **connectivity**: bool  
  Indicates whether the node is connected to the other peers.

#### Response example

```JSON
{
  "connectivity": true
}
```

### User agent info

```None
GET {system_base_path}/user_agent
```

#### Parameters

None.

#### Example

```none
curl http://127.0.0.1:7780/api/system/v1/user_agent
```

#### Response

Returns string containing information about Exonum, Rust and OS version.

#### Response example

```None
"exonum 0.6.0/rustc 1.26.0-nightly (2789b067d 2018-03-06)\n\n/Mac OS10.13.3"
```

## Private endpoints

### Add new peer

```none
POST {system_base_path}/peers
```

Adds new Exonum node to the list of peers for the current node.
The latter will attempt to connect to the new node asynchronously. If the public
key of the new node is not in the whitelist, the connection between said nodes
will not be established.

#### Parameters

- **ip**: PeerAddress

#### Example

```None
curl --data "ip=127.0.0.1:8800" http://127.0.0.1:7780/api/system/v1/peers
```

#### Response

```None
"Ok"
```

### Peers info

```none
GET {system_base_path}/peers
```

Returns list of peers.

#### Parameters

None.

#### Response

A JSON object with the following fields:

- **incoming_connections**: Array<PeerAddress\>  
  List of addresses of peers connected to this node
- **outgoing_connections**: Map  
  The keys of the map are addresses of peers this node is connected to,
  corresponding values of type `OutgoingConnectionInfo` contain info about
  public keys and current connection status of peers.

??? example "Response Example"
    ```json
    {
      "incoming_connections": [
        "127.0.0.1:58635",
        "127.0.0.1:58656"
      ],
      "outgoing_connections": {
        "127.0.0.1:6334": {
          "public_key": "dcb46dceaeb7d0eab7b6ed000f317f2ab9f7c8423ec9a6a602d81c0979e1333a",
          "state": {
            "type": "Active"
          }
        },
        "127.0.0.1:6335": {
          "public_key": "dcb46dceaeb7d0eab7b6ed000f317f2ab9f7c8423ec9a6a602d81c0979e1333a",
          "state": {
            "delay": 4000,
            "type": "Reconnect"
          }
        },
        "127.0.0.1:6336": {
          "public_key": null,
          "state": {
            "type": "Active"
          }
        },
        "127.0.0.1:6337": {
          "public_key": null,
          "state": {
            "delay": 4000,
            "type": "Reconnect"
          }
        }
      }
    }
    ```

### Consensus Enabled Info

```none
GET {system_base_path}/consensus_enabled
```

Returns a boolean value representing if the node participates in consensus.

#### Parameters

None.

#### Response

A JSON boolean.

#### Response Example

```JSON
true
```

### Enabled/Disable Consensus Interaction

```none
POST {system_base_path}/consensus_enabled
```

Switches consensus interaction of the node on or off.

#### Parameters

- **enabled**: `bool`

#### Example

```None
curl -H "Content-Type: application/json" --data '{"enabled":false}' http://127.0.0.1:7780/api/system/v1/consensus_enabled
```

#### Response

```None
"Ok"
```

### Network info

```none
GET {system_base_path}/network
```

Gets info about the serialization protocol and the services functioning
in the network.

#### Parameters

None.

#### Response

A JSON object with the following fields:

- **network_id**: integer  
  Network ID. Is not used currently
- **protocol_version**: integer  
  The major version of the Exonum serialization protocol. Currently, `0`
- **services**: Array<ServiceInfo\>  
  Info about services functioning in the network

#### Response Example

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

### Shutdown

```none
POST {system_base_path}/shutdown
```

After receiving a shutdown message, the node stops processing
transactions, participating in consensus and terminates after
all messages in the event queue are processed.

#### Parameters

None.

#### Example

```none
curl -X POST http://127.0.0.1:7780/api/system/v1/shutdown
```

#### Response

```none
"Ok"
```

## Explorer API endpoints

All explorer API endpoints share the same base path, denoted
**{explorer_base_path}**, equal to `/api/explorer/v1`.

All explorer endpoints are public. `enable_blockchain_explorer` local
configuration parameter allows to turn explorer endpoints on/off.

### Transaction

```none
GET {explorer_base_path}/transactions/{transaction_hash}
```

Searches for a transaction, either committed or uncommitted, by the hash.

#### Parameters

- **transaction_hash**: Hash  
  The hash of the transaction to be searched

#### Response

Returns a transaction from the pool of unconfirmed transactions if it is not
committed yet, otherwise, returns a transaction from the blockchain.

Response is a JSON object with one required field:

- **type**: string  
  Transaction type, can be:

    - `committed`: committed transaction (in blockchain)
    - `in-pool`: uncommitted transaction (in the pool of unconfirmed
      transactions)
    - `unknown`: unknown transaction

##### Unknown Transaction

Response JSON contains only `type` field. Its value is `unknown`. Additionally,
returns HTTP status `404`.

??? example "Response Example"
    ```json
    {
      "type": "unknown"
    }
    ```

##### Known Uncommitted Transaction

Response JSON has same fields as [`SerializedTransaction`](#serializedtransaction)
plus `type` field with value equal to `"in-pool"`.

??? example "Response Example"
    ```json
    {
      "type": "in-pool",
      "body": {
        "amount": "152",
        "from": "b0d6af8bbe45c574c5f9dd8876b5b037b38d1bf861fd7b90744957aa608ed0c2",
        "seed": "2953135335240383704",
        "to": "99e396355cb2146aba0457a954ebdae36e09e3abe152693cfd1b9a0975850789"
      },
      "network_id": 0,
      "protocol_version": 0,
      "service_id": 128,
      "message_id": 128,
      "signature": "7d3c503d6dc02ca24faaeb37af227f060d0bcf5f40399fae7831eb68921fd00407f7845affbd234f352d9f1541d7e4c17b4cd47ec3f3208f166ec9392abd4d00"
    }
    ```

##### Known Committed Transaction

Response is a JSON object with the following fields:

- **content**: SerializedTransaction  
  Transaction with the specified hash
- **location**: TransactionLocation  
  Transaction position in the blockchain
- **location_proof**: ListProof  
  [Merkle proof](merkelized-list.md#merkle-tree-proofs) tying transaction
  to the `tx_hash` of the containing block
- **type**: `"committed"`  
  Always equals to `committed`
- **status**: Object  
  [Transaction execution](../architecture/transactions.md#execute) status
- **status.type**: `"success"` | `"error"` | `"panic"`  
  Execution status kind:

    - `"success"` denotes a successfully completed transaction
    - `"error"` denotes a transaction that has returned an error (for example,
      because of transaction parameters not satisfying context-dependent checks)
    - `"panic"` denotes a transaction that has raised a runtime exception
      (for example, attempted to divide by zero)

- **status.code**: integer  
  Error code supplied by the service developer. Only present for erroneous
  transactions. Has service-specific meaning
- **status.description**: string=  
  Optional human-readable error description. Only relevant for erroneous and
  panicking transactions

??? example "Response Example"
    ```json
    {
      "type": "committed",
      "content": {
        "body": {
          "amount": "152",
          "from": "b0d6af8bbe45c574c5f9dd8876b5b037b38d1bf861fd7b90744957aa608ed0c2",
          "seed": "2953135335240383704",
          "to": "99e396355cb2146aba0457a954ebdae36e09e3abe152693cfd1b9a0975850789"
        },
        "network_id": 0,
        "protocol_version": 0,
        "service_id": 128,
        "message_id": 128,
        "signature": "7d3c503d6dc02ca24faaeb37af227f060d0bcf5f40399fae7831eb68921fd00407f7845affbd234f352d9f1541d7e4c17b4cd47ec3f3208f166ec9392abd4d00"
      },
      "location": {
        "block_height": "18",
        "position_in_block": "261"
      },
      "location_proof": {
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
      "status": {
        "type": "success"
      }
    }
    ```

### Block by height

```none
GET {explorer_base_path}/blocks/{height}
```

Returns the content for a block of a specific height.

#### Parameters

- **height**: integer  
  The height of the desired block

#### Response

A JSON object with the following fields:

- **block**: BlockHeader  
  The header of the specified block
- **precommits**: Array<Precommit\>  
  The list of 'Precommit' messages supporting the block.
- **txs**: Array<SerializedTransaction\>  
  The list of the transactions included into the block

??? example "Response Example"
    ```json
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

### Blocks in range

```none
GET {explorer_base_path}/blocks?count={count}&skip_empty_blocks={skip}&latest={latest}
```

Returns the headers of the consecutive `count` blocks up to the `latest` height.

#### Parameters

- **count**: integer  
  The number of blocks to return. Should not be greater than
  [`MAX_BLOCKS_PER_REQUEST`][github_explorer]
- **skip_empty_blocks**: bool=  
  If `true`, then only non-empty blocks are returned. The default value is `false`
- **latest**: integer=  
  The maximum height of the returned blocks. The blocks are returned
  in reverse order, starting from the `latest` and at least up to the `latest -
  count + 1`. The default value is the height of the latest block in the blockchain

#### Response

The JSON array of the `BlockHeader` objects. Blocks in the array are sorted in
descending order according to their heights.

??? example "Response Example"
    ```json
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

[closure]: https://github.com/google/closure-compiler/wiki/Annotating-JavaScript-for-the-Closure-Compiler
[github_explorer]: https://github.com/exonum/exonum/blob/master/exonum/src/api/public/blockchain_explorer.rs
