# Node management

Exonum nodes can be controlled via RPC implemented as REST API. Managing endpoints are handled by Exonum Core and mainly are purposed to receive information about the current node and blockchain states.

## API endpoints

The managing endpoints URL is structured as follows:

`{base_path}/system/v1/{endpoint_name}`

Here, `base_path` should be replaced with `ip:port/api/`, where `ip:port` stands for node address.

## Add new peer

`POST {base_path}/system/v1/peeradd`

Adds new Exonum node to the list of peers for the current node.

### Parameters

**ip** : peer address in format `ip:port`.

### Example:
```None
POST http://127.0.0.1:7780/api/system/v1/peeradd
body: "ip=127.0.0.1:8800"
```

### Response

```
"Ok"
```

**TODO: what if not an IP received? is there an error?**

## Get peers info

```None
GET {base_path}/system/v1/peers
```

Returns detailed list of peers.

### Parameters

None.

### Response

The example of the responded JSON:

```JSON
{
  "incoming_connections": [127.0.0.1:76638],
  "outgoing_connections": [127.0.0.1:6332],
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

- **incoming_connections**: list of peers connected to this node.
- **outgoing_connections**: list of peers node connected to.
- **reconnects**: list of peers node should reconnect.
- **reconnect.addr**: peer address.
- **reconnect.delay**: time in which we should reconnect (ms).

## Mempool size

```None
GET {base_path}/system/v1/mempool
```

Returns the number of transactions in node's mempool.

### Parameters

None.

### Response

The example of responded JSON:

```JSON
{
  "size": 0
}        
```

- **size**: amount of unconfirmed transactions.

## Get block by height

```
 http://127.0.0.1:7779/api/explorer/v1/blocks/20
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

## Get blocks in range

```None
GET{base_path}/explorer/v1/blocks\?count\=500\&skip_empty_blocks\=true\&from\=22
```

Returns the details about block

### Response

``` http://127.0.0.1:7779/api/explorer/v1/blocks\?count\=500\&skip_empty_blocks\=true\&from\=22
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
]```

## Get commited transaction by hash

### Response

```
➜  sandbox-timestamping git:(master) curl --get  http://127.0.0.1:7779/api/explorer/v1/transactions/388c6875077db80282af3c2915aa98b610b5192fe0367def57ef84cbab44ebc6
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
}%      
```

## Get transaction from mempool

`GET {base_path}/system/v1/mempool/:hash`

Returns transaction from mempool if it is not commited yet; otherwise, returns transaction from blockchain.

### Parameters

```{hash}`
### Unknown Transaction
If we trying to request unknown transaction.

``` http://127.0.0.1:7780/api/system/v1/mempool/d24e650f552bbb382f23d275630c1413d526d49a8a4c577cadf43a3363bf02cd

{
  "type": "Unknown"
}%
```

### Known uncommited transaction

```curl --get  http://127.0.0.1:7780/api/system/v1/mempool/f6415994136527a24d022595ec0d40f51e2a0c4230a34792a5203df779e3ffaf
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
}%   
```

### Known commited transaction

If we trying to request already commited transaction.

```curl --get  http://127.0.0.1:7780/api/system/v1/mempool/f6415994136527a24d022595ec0d40f51e2a0c4230a34792a5203df779e3ffaf
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
}%  
```

- **type** - type of transaction, could be:

1. Commited - commited transaction (in blockchain).
2. MemPool - uncommited transaction (in mempool).
3. Unknown - unknown transaction.


```sandbox-timestamping git:(master) curl --get  http://127.0.0.1:7778/api/system/v1/network
{
  "network_id": 0,
  "protocol_version": 0,
  "services": [
    {
      "id": 128,
      "name": "cryptocurrency"
    }
  ]
}%
```
