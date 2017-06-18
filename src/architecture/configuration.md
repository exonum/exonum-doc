# System Configuration

**System configuration** is a set of parameters that determine the access
network parameters of a node and the behavior of the node while operating in the
network.

The configuration is stored in the [TOML][toml] format. A path to the
configuration file should be specified on the node start up.

The configuration may be changed using [the global variables updater service](../advanced/configuration-updater.md)
or [by editing the configuration file](#changing-configuration).

Services may have their own configuration settings. Initialization on the node
start up passes the configuration to all services deployed on the blockchain.
The configuration for a service is stored in the overall configuration
under a separate key equal to [the name of the service](services.md#service-identifiers).

!!! note "Example"
    [The anchoring service](../advanced/bitcoin-anchoring.md)
    stores in the configuration parameters of the RPC connection to
    a Bitcoin Core node, as well as the Bitcoin address used for anchoring.

## Configuration Parameters

System configuration contains 2 types of configuration parameters:

- **Global parameters** must be identical for all full nodes in the network. The
  global parameters are saved in the blockchain when the genesis block is
  created
- **Local parameters** may differ for each node

This categorization holds both for core and service parameters.

!!! note "Example"
    The following table shows all 4 possible parameter categories.

    | Scope   | Core | Anchoring service |
    |---------|------|-------------------|
    | Global  | Validators’ public keys | Anchoring address |
    | Local   | Validator’s private key | RPC params for Bitcoin Core |

### Global Parameters

#### [genesis]

The configuration used to create a genesis block.

- **validators**  
  List of validators’ public keys as hex strings

#### [genesis.consensus]

[Consensus algorithm](consensus.md) parameters.

- **peers_timeout**  
  Peer exchange timeout (in ms).
- **propose_timeout**  
  Proposal timeout (ms) after the new height beginning.
- **round_timeout**  
  Interval (ms) between rounds.
- **status_timeout**  
  Period (ms) of sending a `Status` message.
- **txs_block_limit**  
  Maximum number of transactions per block.

### Local Parameters

- **listen_address**  
  Address to be listened by this node.
- **peers**  
  List of known peers.
- **public_key**  
  Node's public key (hex) for the current configuration.
- **secret_key**  
  Node's private key (hex) for the current configuration.

#### [network]

[Local connection](../advanced/network.md) parameters.

- **max_incoming_connections**  
  Maximum number of incoming connections.
- **max_outgoing_connections**  
  Maximum number of outgoing connections.
- **tcp_nodelay**  
  Activation of the NODELAY algorithm from the TCP stack (see [RFC2126][rfc2126]).
- **tcp_reconnect_timeout**  
  Timeout (ms) for the first attempt to reconnect.
- **tcp_reconnect_timeout_max**  
  Maximum timeout (ms) for reconnect attempt.

#### [node.api]

API configuration parameters.

- **enable_blockchain_explorer**  
  Enable api endpoints for the blockchain explorer on the public API address.
- **public_api_address**  
  Listen address for public API endpoints.
- **private_api_address**  
  Listen address for private API endpoints.

## Changing Configuration

Global parameters should be changed by using the global variables updater
service. The service ensures that the configuration updates are synchronized
among nodes in the network. Global parameters should not be changed
by editing the configuration file because this may cause improper behavior of
node. Global parameters can be influenced by the configuration file editing only
before the genesis block is created.

Local parameters may be changed by editing the configuration file
and restarting the node to apply changes. In certain cases, additional actions
may be required to keep the system operational.

!!! note "Example"
    To keep a node operating when changing its validator key,
    you also need to update the corresponding global variable (the list of
    validator keys) using the global variables updater service.

## Sample Configuration File

```toml
listen_address = "127.0.0.1:2000"
peers = ["127.0.0.1:2000", "127.0.0.1:2001", "127.0.0.1:2002", "127.0.0.1:2003"]
public_key = "99ace6c721db293b0ed5b487e6d6111f22a8c55d2a1b7606b6fa6e6c29671aa1"
secret_key = """e319e88128e4e3588ae3c01d80de95a40082f5bc4fa899cf5401fee033a9b\
78399ace6c721db293b0ed5b487e6d6111f22a8c55d2a1b7606b6fa6e6c29671aa1"""

[genesis]
validators = ["99ace6c721db293b0ed5b487e6d6111f22a8c55d2a1b7606b6fa6e6c29671aa1",
"a32464be9bef16a6186a7f29d5ebc3223346faab91ea10cc00e68ba26322a1b0",
"c3f5730d81402e7453df97df2895884e0c49b5cf5ff54737c3dd28dc6537b3fd",
"f542cdc91f73747ecc20076962a2ed91749b8e0af66693ba6f67dd92f99b1533"]

[genesis.consensus]
peers_timeout = 10000
propose_timeout = 500
round_timeout = 3000
status_timeout = 5000
txs_block_limit = 1000

[network]
max_incoming_connections = 128
max_outgoing_connections = 128
tcp_nodelay = false
tcp_reconnect_timeout = 500
tcp_reconnect_timeout_max = 600000

[node.api]
enable_blockchain_explorer = true
public_api_address = "127.0.0.1:1024"
private_api_address = "127.0.0.1:1025"
```

[toml]: https://en.wikipedia.org/wiki/TOML
[rfc2126]: https://tools.ietf.org/html/rfc2126
