# System Configuration

<!-- cspell:ignore nodelay -->

**System configuration** is a set of parameters that determine the network
access parameters of a node and behavior of the node while operating in the
network.

The configuration is stored in the [TOML][toml] format. A path to the
configuration file should be specified on the node start up.

The configuration may be changed using [the global variables updater service](../advanced/configuration-updater.md)
or [by editing the configuration file](#changing-configuration).

Services may have their own configuration settings. On node initialization the
configuration is passed to all services deployed in the blockchain.
The configuration for a service is stored in the `services_configs` subtree
of the overall configuration
under a separate key equal to [the name of the service](services.md#service-identifiers).

!!! note "Example"
    The configuration settings of [the anchoring service](../advanced/bitcoin-anchoring.md)
    include the parameters of the RPC connection to
    a Bitcoin Core node as well as a Bitcoin address used for anchoring.
    These parameters are stored in the `services_configs.btc_anchoring`
    section of the overall configuration.

## Configuration Parameters

System configuration contains 2 types of configuration parameters:

- **Global parameters** must be identical for all full nodes in the network. The
  global parameters are saved in the blockchain when the genesis block is
  created
- **Local parameters** may differ for each node

This categorization holds for both core and service parameters.

!!! note "Example"
    The following table shows all 4 possible parameter categories.

    | Scope   | Core | Anchoring service |
    |---------|------|-------------------|
    | Global  | Validators’ public keys | Anchoring address |
    | Local   | Validator’s private key | RPC params for Bitcoin Core |

!!! tip
    See [sample configuration file][github_config_file]
    for reference.

### Global Parameters

#### [genesis]

The configuration used to create a genesis block.

#### [genesis.validator_keys]

List of validators’ public keys as hex strings. Each list element consists of
two parts:

- **consensus_key**  
  Validator’s public key (hex) for use with consensus messages
- **service_key**  
  Validator’s public key (hex) for use with service transactions

#### [genesis.consensus]

[Consensus algorithm](consensus.md) parameters.

- **peers_timeout**  
  Peers exchange timeout (in ms)
- **timeout_adjuster**  
  [Settings][ta-config] for the proposal timeout adjuster
- **round_timeout**  
  Timeout interval (ms) between rounds
- **status_timeout**  
  Timeout interval (ms) for sending a `Status` message
- **txs_block_limit**  
  Maximum number of transactions per block
- **max_message_len**
  Maximum message length (in bytes)

### Local Parameters

- **external_address**  
  The node address broadcasted to other peers using `Connect` messages
- **listen_address**  
  Listen address of the current node
- **peers**  
  List of [full node](../glossary.md#full-node) addresses
- **consensus_public_key**  
  Node’s public key (hex) for use with consensus messages
- **consensus_secret_key**  
  Node’s private key (hex) for signing consensus messages
- **service_public_key**  
  Node’s public key (hex) for use with service transactions
- **service_secret_key**  
  Node’s private key (hex) for signing service transactions

#### [network]

[Local connection](../advanced/network.md) parameters.

- **max_incoming_connections**  
  Maximum number of incoming connections
- **max_outgoing_connections**  
  Maximum number of outgoing connections
- **tcp_nodelay**  
  Activation of the `NODELAY` algorithm from the TCP stack (see [RFC2126][rfc2126])
- **tcp_reconnect_timeout**  
  Timeout interval (ms) before the first reconnect attempt
- **tcp_reconnect_timeout_max**  
  Maximum timeout interval (ms) for reconnect attempt

#### [api]

API configuration parameters.

- **enable_blockchain_explorer**  
  Enables API endpoints for the blockchain explorer at the public API address
- **state_update_timeout**  
  Timeout interval (ms) to update info about connected peers
- **public_api_address**  
  Listen address for public API endpoints
- **private_api_address**  
  Listen address for private API endpoints
- **allow_origin**  
  Sets up the [CORS][cors] headers for public API endpoints. The parameter
  can take any of the three forms:

    - `"*"` enables requests from all origins
    - [Origin string][origin-header] (e.g., `"http://example.com"`)
      enables requests from a single specific origin
    - An array of origin strings (e.g., `["http://a.example.com", "http://b.example.com"]`)
      enables requests from any of the specified origins

!!! note
    If the `allow_origin` parameter is not specified, CORS headers are not added
    to any requests, which can lead to requests from external origins
    being improperly processed by user agents with the CORS support
    (such as web browsers). However, you can easily avoid this by passing the
    public API of an Exonum node through the web server
    delivering web assets  (for example, Nginx). In this case, the requests to API
    would be same-origin, so CORS restrictions would not apply.

#### [whitelist]

[Network whitelisting](../advanced/network.md#whitelist) parameters.

- **whitelist_enabled**  
  Enables whitelisting
- **whitelisted_peers**  
  List of consensus public keys for trusted peers

#### [mempool]

Message processing parameters.

- **events_pool_capacity**  
  Maximum number of events in the [event queue](../advanced/consensus/specification.md#message-processing)
- **tx_pool_capacity**  
  Maximum number of transactions in the [pool of unconfirmed transactions](../advanced/consensus/specification.md#pool-of-unconfirmed-transactions)

#### [services_configs]

Service-specific parameters under the keys corresponding to [`service_name`s](services.md#service-identifiers)
of the blockchain services.

## Changing Configuration

Global parameters should be changed by using the global variables updater
service. The service ensures that the configuration updates are synchronized
among nodes in the network. Changing global parameters by editing the
configuration file is inadmissible as this may cause improper behavior of
the node. Modifying global parameters by the configuration file editing is
admissible only before the genesis block is created.

Local parameters may be changed by editing the configuration file and restarting
the node to apply changes. In certain cases additional actions may be required
to keep the system operational.

!!! note "Example"
    To keep a node operating when changing its validator key,
    you also need to update the corresponding global variable (the list of
    validator keys) using the global variables updater service.

[toml]: https://en.wikipedia.org/wiki/TOML
[github_config_file]: https://github.com/exonum/exonum/blob/v0.1/exonum/tests/testdata/config/config02.toml
[rfc2126]: https://tools.ietf.org/html/rfc2126
[cors]: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
[origin-header]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Origin
[ta-config]: https://docs.rs/exonum/0.4.0/exonum/blockchain/config/enum.TimeoutAdjusterConfig.html
