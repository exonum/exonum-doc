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
The configuration for a service is stored in the `services` subtree
of the overall configuration
under a separate key equal to [the name of the service](services.md#service-identifiers).

!!! note "Example"
    [The anchoring service](../advanced/bitcoin-anchoring.md)
    stores in the configuration parameters of the RPC connection to
    a Bitcoin Core node, as well as the Bitcoin address used for anchoring.
    These parameters are stored in the `services.btc_anchoring`
    section of the overall configuration.

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

!!! tip
    See [sample configuration file](https://github.com/exonum/exonum/blob/master/exonum/tests/testdata/config/config02.toml)
    for reference.

### Global Parameters

#### [genesis]

The configuration used to create a genesis block.

#### [genesis.validator_keys]

List of validators’ public keys as hex strings. Each list element consists of
two parts:

- **consensus_key**  
  Validator's public key (hex) for dealing with consensus messages.
- **service_key**  
  Validator's public key (hex) for dealing with service transactions.

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
- **consensus_public_key**  
  Node's public key (hex) for dealing with consensus messages.
- **consensus_secret_key**  
  Node's private key (hex) for dealing with consensus messages.
- **service_public_key**  
  Node's public key (hex) for dealing with service transactions.
- **service_secret_key**  
  Node's private key (hex) for dealing with service transactions.

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

#### [api]

API configuration parameters.

- **enable_blockchain_explorer**  
  Enable api endpoints for the blockchain explorer on the public API address.
- **public_api_address**  
  Listen address for public API endpoints.
- **private_api_address**  
  Listen address for private API endpoints.

#### [whitelist]

Whitelist parameters.

- **whitelist_enabled**  
  Enable whitelisting.
- **whitelisted_peers**  
  List containing consensus public keys of trusted peers.

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

[toml]: https://en.wikipedia.org/wiki/TOML
[rfc2126]: https://tools.ietf.org/html/rfc2126
